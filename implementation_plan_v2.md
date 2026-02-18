# Implementation Plan v2: Seamless Briefing Experience

> **Goal**: Fix email repetition, missing emails, stale counts, and make the voice agent fully aware of inbox state in real time — within and across sessions.

---

## The Core Problem

The voice agent has no **Live Inbox Model**. Individual components (Gmail fetch, scoring, clustering, navigation state, email actions) work in isolation but are never wired into a coherent, evolving picture of the user's inbox. The result:

- The agent doesn't know which email it's presenting (no cursor)
- Archived emails stay in the agent's context forever
- Navigation tools increment an index but nothing maps it to an actual email
- Every session fetches the exact same 50 unread emails
- 42 out of 50 fetched emails are silently dropped by topic truncation

This plan introduces a **Live Inbox Model** — a session-scoped state machine that tracks every email's lifecycle (pending → briefed → actioned) and persists across sessions via Redis.

---

## Architecture: Live Inbox Model

```
                    ┌─────────────────────────────────────┐
                    │       BriefingSessionTracker         │
                    │         (in-session state)           │
                    │                                     │
                    │  emailMap: Map<id, EmailState>      │
                    │    status: pending|briefed|actioned  │
                    │    topicIndex, itemIndex             │
                    │    ref: {id, subject, from, ...}     │
                    │                                     │
                    │  cursor: { topicIdx, itemIdx }      │
                    │  topics: BriefingTopicRef[]          │
                    │                                     │
                    │  getCurrentEmail() → ref             │
                    │  advance() → ref                    │
                    │  markActioned(id, action)            │
                    │  buildCursorContext() → string       │
                    │  getProgress() → progress            │
                    └──────────┬──────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
    │ ReasoningLoop│  │ BriefedEmail │  │ Gmail History API │
    │              │  │ Store (Redis)│  │ (real-time sync)  │
    │ injects      │  │              │  │                   │
    │ cursor into  │  │ persists     │  │ detects new mail  │
    │ GPT-4o       │  │ briefed IDs  │  │ mid-session       │
    │ context      │  │ across       │  │                   │
    │              │  │ sessions     │  │                   │
    └──────────────┘  └──────────────┘  └──────────────────┘
```

**How it makes the agent "fully aware":**

| Awareness Level | What it means | Implementation |
|---|---|---|
| **Action awareness** | Agent tracks every action it takes (archive, flag, read, skip) and immediately updates its model | BriefingSessionTracker.markActioned() |
| **Cursor awareness** | Agent always knows exactly which email it's presenting and what comes next | BriefingSessionTracker.getCurrentEmail() + cursor injection |
| **Cross-session memory** | Agent remembers what was briefed yesterday; only presents truly new emails | BriefedEmailStore (Redis) + pipeline filtering |
| **External change detection** | Agent detects if user read/archived emails outside the app (Gmail web, phone) | Gmail History API at session start + mid-session polling |
| **Live new-email alerts** | Agent detects new emails arriving during the session and alerts the user | Gmail History API periodic check |

---

## Existing Code Reference

| Component | File | Purpose |
|---|---|---|
| Gmail fetch | `packages/email-providers/src/adapters/gmail-adapter.ts` | `fetchUnread()`, `archiveEmails()`, `getProfileHistoryId()`, `fetchHistory()` |
| Outlook fetch | `packages/email-providers/src/adapters/outlook-adapter.ts` | `fetchUnread()`, `hasNewEmailsSince()` |
| Unified inbox | `packages/email-providers/src/services/unified-inbox.ts` | Merges providers, routes actions |
| Briefing pipeline | `packages/livekit-agent/src/briefing-pipeline.ts` | Fetch → Score → Cluster → BriefingData |
| Navigation tools | `packages/livekit-agent/src/tools/navigation-tools.ts` | `BriefingState`, `next_item`, `skip_topic`, etc. |
| Email tools | `packages/livekit-agent/src/tools/email-tools.ts` | `archive_email`, `mark_read`, `flag_followup`, etc. |
| Reasoning loop | `packages/livekit-agent/src/reasoning/reasoning-loop.ts` | GPT-4o orchestration, tool dispatch |
| System prompt | `packages/livekit-agent/src/prompts/system-prompt.ts` | Instructions for GPT-4o |
| Agent entry | `packages/livekit-agent/src/agent.ts` | Wires everything together |
| Email bootstrap | `packages/livekit-agent/src/email-bootstrap.ts` | Creates adapters from OAuth metadata |
| Knowledge store | `packages/livekit-agent/src/knowledge/user-knowledge-store.ts` | Redis + Supabase persistence (reference pattern) |

---

## Step-by-Step Implementation

---

### Step 1: BriefingSessionTracker — Central Briefing State

**Creates**: `packages/livekit-agent/src/briefing/briefing-session-tracker.ts`

**What it does**: Unifies `topicRefs`, `BriefingState`, and `emailContext` into a single state machine that tracks every email's lifecycle. This is the foundation for all other fixes.

**Fixes**: Bug 2 (email repetition), Bug 4 (no cursor) — foundation

**Data model**:
```typescript
interface EmailState {
  ref: BriefingEmailRef;      // id, subject, from, threadId, isFlagged
  topicIndex: number;
  itemIndex: number;
  status: 'pending' | 'briefed' | 'actioned' | 'skipped';
  actionTaken?: string;       // 'archived' | 'flagged' | 'read' | etc.
  briefedAt?: Date;
  actionedAt?: Date;
}

interface BriefingProgress {
  currentTopicIndex: number;
  currentItemIndex: number;
  currentEmail: BriefingEmailRef | null;
  currentTopicLabel: string;
  totalTopics: number;
  totalEmails: number;
  emailsBriefed: number;
  emailsActioned: number;
  emailsRemaining: number;
}

class BriefingSessionTracker {
  private emailMap: Map<string, EmailState>;
  private topics: BriefingTopicRef[];
  private cursor: { topicIndex: number; itemIndex: number };
  private history: Array<{ topicIndex: number; itemIndex: number }>;

  constructor(topics: BriefingTopicRef[]);

  // Core cursor operations
  getCurrentEmail(): BriefingEmailRef | null;
  advance(): BriefingEmailRef | null;      // Move cursor to next pending email
  skipTopic(): BriefingEmailRef | null;    // Jump to next topic's first pending email
  goBack(): BriefingEmailRef | null;       // Return to previous position

  // Status updates
  markBriefed(emailId: string): void;      // Cursor passed this email
  markActioned(emailId: string, action: string): void; // User took action
  markSkipped(emailId: string): void;      // User explicitly skipped

  // Query
  getProgress(): BriefingProgress;
  getActiveEmailsInCurrentTopic(): BriefingEmailRef[];
  isComplete(): boolean;

  // Context injection for GPT-4o
  buildCursorContext(): string;            // Dynamic per-turn context
  buildCompactEmailReference(): string;    // Condensed email list (active only)
}
```

**Key behaviors**:
- `advance()` skips over emails with status `actioned` or `skipped`
- `markActioned()` removes the email from active lists; if it was the current email, auto-advances cursor
- `buildCursorContext()` returns a string like:
  ```
  CURRENT BRIEFING POSITION:
  Topic 3 of 8: "Project Updates"
  Email 2 of 5 in this topic
  Current email: "Q4 Budget Review" from john@example.com (email_id: gmail:abc123)
  Progress: 12 of 50 emails briefed, 3 actioned, 35 remaining

  NEXT: Present THIS email to the user. Summarize its subject and sender, then ask what action to take.
  ```
- `buildCompactEmailReference()` returns only active (non-actioned) emails — replaces the static EMAIL REFERENCE block

**Status**: [x] Done

---

### Step 2: Wire Tracker into ReasoningLoop (Cursor + Navigation)

**Modifies**: `packages/livekit-agent/src/reasoning/reasoning-loop.ts`

**What it does**: Replaces the disconnected `BriefingState` + `emailContext` + static `topicRefs` with the unified `BriefingSessionTracker`. After every navigation tool call, the tracker advances the cursor and the new email context is injected into GPT-4o's conversation.

**Fixes**: Bug 2 (email repetition — navigation now advances email), Bug 4 (no cursor — dynamic injection each turn)

**Changes**:

1. **Constructor**: Accept `BriefingSessionTracker` instead of raw `topicRefs` + `topicItems`.
   ```typescript
   // BEFORE (line 313-317):
   constructor(
     topicItems: number[],
     systemPromptContext?: Partial<SystemPromptContext>,
     config?: OpenAIConfig,
     topicRefs?: BriefingTopicRef[],
   )

   // AFTER:
   constructor(
     systemPromptContext?: Partial<SystemPromptContext>,
     config?: OpenAIConfig,
     tracker?: BriefingSessionTracker,
   )
   ```

2. **System prompt**: Build with `tracker.buildCompactEmailReference()` instead of static `buildEmailReferenceBlock()`. Remove the old `buildEmailReferenceBlock()` method.

3. **`callLLM()` (line 487)**: Before calling `callChatCompletion()`, inject the cursor context as a system message:
   ```typescript
   private async callLLM(): Promise<ReasoningResult> {
     // Inject current briefing position before the LLM call
     if (this.tracker) {
       const cursorContext = this.tracker.buildCursorContext();
       // Add as a system message right before the last user message
       // so GPT-4o sees it fresh each turn
       this.state.messages.push({
         role: 'system',
         content: cursorContext,
       });
     }

     const allTools = [...EMAIL_TOOLS, ...NAVIGATION_TOOLS, ...KNOWLEDGE_TOOLS]...
     const response = await callChatCompletion(this.state.messages, allTools, this.config);
     ...
   }
   ```

4. **`handleToolCalls()` navigation section (line 610-634)**: After navigation tool executes, use tracker to advance:
   ```typescript
   // BEFORE (line 610-634):
   else if (NAVIGATION_TOOLS.some((t) => t.function.name === toolName)) {
     const result = executeNavigationTool(toolName, args, this.state.briefingState);
     if (result.success) {
       this.state.briefingState = updateBriefingState(this.state.briefingState, result);
     }
     // ... no emailContext update
   }

   // AFTER:
   else if (NAVIGATION_TOOLS.some((t) => t.function.name === toolName)) {
     const result = executeNavigationTool(toolName, args, this.state.briefingState);
     if (result.success) {
       this.state.briefingState = updateBriefingState(this.state.briefingState, result);

       // Mark current email as briefed before advancing
       const currentEmail = this.tracker?.getCurrentEmail();
       if (currentEmail) {
         this.tracker?.markBriefed(currentEmail.emailId);
       }

       // Advance tracker cursor to match navigation state
       let nextEmail: BriefingEmailRef | null = null;
       if (result.action === 'skip_topic') {
         nextEmail = this.tracker?.skipTopic() ?? null;
       } else if (result.action === 'next_item') {
         nextEmail = this.tracker?.advance() ?? null;
       } else if (result.action === 'go_back') {
         nextEmail = this.tracker?.goBack() ?? null;
       }

       // Update emailContext to the new current email
       if (nextEmail) {
         this.state.emailContext = buildEmailContext(nextEmail);
       }
     }

     // Enrich tool result message with next email details
     const progress = this.tracker?.getProgress();
     const enrichedMessage = result.message
       + (progress ? ` [${progress.emailsBriefed}/${progress.totalEmails} briefed]` : '');

     responseText += enrichedMessage + ' ';
     ...
   }
   ```

5. **Remove `briefingContext` from state**: The static `briefingContext` (line 345-352) is replaced by `tracker.getProgress()` which is always up-to-date.

**Status**: [x] Done

---

### Step 3: Handle Email Actions in Tracker

**Modifies**: `packages/livekit-agent/src/reasoning/reasoning-loop.ts`

**What it does**: When `archive_email`, `mark_read`, or `flag_followup` is called, the tracker removes that email from the active briefing and auto-advances the cursor if needed.

**Fixes**: Bug 2 (archived emails stop appearing immediately)

**Changes to `handleToolCalls()` email section (line 562-608)**:

```typescript
// After email tool executes successfully:
if (EMAIL_TOOLS.some((t) => t.function.name === toolName)) {
  ...
  const result = await executeEmailTool(toolName, args, emailCtx);

  // Track the action in the briefing session
  if (result.success && this.tracker) {
    const actionedEmailId = (args['email_id'] as string) ?? emailCtx.emailId;

    if (toolName === 'archive_email' || toolName === 'mark_read') {
      this.tracker.markActioned(actionedEmailId, toolName);

      // If the actioned email was the current one, advance cursor
      const currentEmail = this.tracker.getCurrentEmail();
      if (!currentEmail || currentEmail.emailId === actionedEmailId) {
        const nextEmail = this.tracker.advance();
        if (nextEmail) {
          this.state.emailContext = buildEmailContext(nextEmail);
        }
      }
    } else if (toolName === 'flag_followup') {
      // Flagging doesn't remove from briefing, but records the action
      this.tracker.markActioned(actionedEmailId, 'flagged');
    }
  }
  ...
}
```

**Key behavior**: After archiving, the EMAIL REFERENCE (built by `tracker.buildCompactEmailReference()`) will no longer include the archived email. On the next `callLLM()`, GPT-4o's cursor context will point to the next email. The agent cannot repeat the archived email because it's no longer in its context.

**Status**: [x] Done

---

### Step 4: BriefedEmailStore — Cross-Session Persistence

**Creates**: `packages/livekit-agent/src/briefing/briefed-email-store.ts`

**What it does**: Redis-backed store that persists which emails have been briefed/actioned across sessions. On the next session, these emails are excluded from the fetch, giving accurate "new email" counts.

**Fixes**: Bug 3 (same 50 emails every session, stale counts)

**Data model**:
```
Redis key: nexus:briefed:{userId}
Type: Hash
Fields: emailId → JSON { status, action, timestamp }
TTL: 7 days (briefings older than a week are forgotten)
```

```typescript
interface BriefedEmailRecord {
  status: 'briefed' | 'actioned' | 'skipped';
  action?: string;  // 'archived' | 'flagged' | 'read'
  timestamp: number; // epoch ms
}

class BriefedEmailStore {
  constructor(options: { redisUrl: string });

  // Write
  markBriefed(userId: string, emailId: string): Promise<void>;
  markActioned(userId: string, emailId: string, action: string): Promise<void>;
  markBatch(userId: string, records: Array<{ emailId: string; record: BriefedEmailRecord }>): Promise<void>;

  // Read
  getBriefedIds(userId: string): Promise<Set<string>>;
  getActionedIds(userId: string): Promise<Set<string>>;
  getAll(userId: string): Promise<Map<string, BriefedEmailRecord>>;

  // Cleanup
  disconnect(): Promise<void>;
}
```

**Integration with BriefingSessionTracker**:
- When `tracker.markBriefed()` is called, it also writes to `BriefedEmailStore`
- When `tracker.markActioned()` is called, it also writes to `BriefedEmailStore`
- The tracker receives the store in its constructor

**Pattern**: Follows the same Redis pattern as `UserKnowledgeStore` (singleton Redis client, graceful fallback if Redis unavailable).

**Status**: [x] Done

---

### Step 5: Filter Briefed Emails from Pipeline

**Modifies**: `packages/livekit-agent/src/briefing-pipeline.ts`, `packages/livekit-agent/src/agent.ts`

**What it does**: Before scoring emails, remove any that were already briefed in previous sessions. This gives the user accurate "new email" counts and prevents repetition across sessions.

**Fixes**: Bug 3 (same emails every session, inflated counts)

**Changes to `briefing-pipeline.ts`**:

1. Add `excludeEmailIds` to `BriefingPipelineOptions`:
   ```typescript
   export interface BriefingPipelineOptions {
     maxEmails?: number;
     maxTopics?: number;
     vipEmails?: string[];
     customKeywords?: string[];
     excludeEmailIds?: Set<string>;  // NEW — emails to exclude (already briefed)
   }
   ```

2. After fetching emails (line 119-122), filter out briefed ones:
   ```typescript
   const { items: rawEmails } = await inboxService.fetchUnread({}, { pageSize: maxEmails });

   // Exclude already-briefed emails from previous sessions
   const excludeIds = options.excludeEmailIds ?? new Set();
   const emails = excludeIds.size > 0
     ? rawEmails.filter(e => !excludeIds.has(e.id))
     : rawEmails;

   logger.info('Fetched emails for briefing', {
     fetched: rawEmails.length,
     excluded: rawEmails.length - emails.length,
     remaining: emails.length,
   });
   ```

**Changes to `agent.ts`** (in `entry()`, before `runBriefingPipeline`):

```typescript
// Load previously briefed email IDs
const briefedStore = new BriefedEmailStore({ redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
const briefedIds = await briefedStore.getBriefedIds(userId);

logger.info('Loaded briefed email history', { briefedCount: briefedIds.size, userId });

// Run pipeline, excluding already-briefed emails
briefingData = await runBriefingPipeline(emailResult.inboxService, {
  excludeEmailIds: briefedIds,
});
```

**What the user sees**: Instead of "50 new emails" every session, they see "12 new emails since your last briefing." Only truly unseen emails are presented.

**Status**: [x] Done

---

### Step 6: Fix Topic Coverage — All Emails Reachable

**Modifies**: `packages/livekit-agent/src/briefing-pipeline.ts`

**What it does**: Ensures all fetched emails make it into the briefing, not just the top 8 topics. Currently `minClusterSize: 1` creates ~50 single-email topics, and `maxTopics: 8` silently drops 42.

**Fixes**: Bug 1 (emails missed entirely)

**Changes**:

1. **Increase `maxTopics` default** from 8 to 50 (effectively unlimited for typical inbox sizes):
   ```typescript
   // Line 112:
   const maxTopics = options.maxTopics ?? 50;
   ```

2. **Change clustering to `minClusterSize: 2`** so emails actually cluster by thread/subject:
   ```typescript
   // Line 166:
   const clusterer = new TopicClusterer({ minClusterSize: 2 });
   ```
   This means only emails sharing a thread or similar subjects will cluster. Single emails go to "Other Messages."

3. **Ensure the "Other Messages" bucket captures everything**:
   The existing code (lines 207-228) already handles unclustered emails. With `minClusterSize: 2`, more emails will land here, which is correct — they'll be presented individually.

4. **Add email count to BriefingData**:
   ```typescript
   // Verify no emails are lost
   const totalInTopics = topics.reduce((sum, t) => sum + t.emails.length, 0);
   if (totalInTopics < emails.length) {
     logger.warn('Emails lost during topic building', {
       fetched: emails.length,
       inTopics: totalInTopics,
       lost: emails.length - totalInTopics,
     });
   }
   ```

**Result**: If 35 new emails are fetched, all 35 are in topics. Related emails cluster together (e.g., 3 emails about "Q4 Budget" → 1 topic with 3 items). Unrelated emails go to "Other Messages."

**Status**: [x] Done

---

### Step 7: System Prompt & Greeting Updates

**Modifies**: `packages/livekit-agent/src/prompts/system-prompt.ts`, `packages/livekit-agent/src/agent.ts`

**What it does**: Updates GPT-4o's instructions to work with the cursor system, iterate through emails sequentially, and understand the briefing state.

**Fixes**: Bug 4 (GPT-4o doesn't know how to iterate)

**Changes to `system-prompt.ts`**:

1. **Replace the static TOOL_INSTRUCTIONS navigation section** with cursor-aware instructions:
   ```typescript
   const BRIEFING_INSTRUCTIONS = `BRIEFING FLOW:
   You will receive a CURRENT BRIEFING POSITION context before each response.
   It tells you exactly which email to present. Follow these rules:

   1. Present the email shown in CURRENT BRIEFING POSITION — summarize its subject and sender
   2. After presenting, ask the user what to do: "Should I flag it, archive it, or move on?"
   3. When the user says "next" or "move on", call next_item — the system will advance the cursor
   4. When the user says "skip this topic", call skip_topic
   5. NEVER present an email that is not in the current position — the system manages the order
   6. After an action (archive, flag, etc.), the system auto-advances — present the next email
   7. When all emails are done, summarize: "That's your briefing. X emails briefed, Y archived, Z flagged."

   IMPORTANT: The CURRENT BRIEFING POSITION updates every turn. Always read it before responding.
   Do NOT re-present emails you have already briefed. The system tracks this for you.`;
   ```

2. **Update greeting context in `agent.ts`** to reflect accurate counts:
   ```typescript
   // BEFORE (line 387-392):
   const greetingContext = `You have ${briefingData.totalEmails} new emails...`

   // AFTER:
   const progress = tracker.getProgress();
   const greetingContext = `You have ${progress.totalEmails} new emails across ${progress.totalTopics} topics. `
     + `${briefingData.totalFlagged} are flagged as important. `
     + `Start with the first email shown in your CURRENT BRIEFING POSITION.`;
   ```

**Status**: [x] Done

---

### Step 8: Real-Time Inbox Awareness — Gmail History API

**Modifies**: `packages/livekit-agent/src/agent.ts`, `packages/livekit-agent/src/reasoning/reasoning-loop.ts`

**What it does**: Makes the agent aware of inbox changes that happen OUTSIDE the app (user reads emails on Gmail web, new emails arrive during session). Uses Gmail's History API which the adapter already supports.

**Fixes**: Makes agent "completely aware" — no blind spots

**Implementation**:

1. **Capture historyId at session start** (in `agent.ts` after email fetch):
   ```typescript
   // After briefing pipeline completes, capture the inbox snapshot point
   let sessionHistoryId: string | null = null;
   if (emailResult.inboxService) {
     const gmailAdapter = emailResult.inboxService.getProvider('GMAIL');
     if (gmailAdapter && 'getProfileHistoryId' in gmailAdapter) {
       sessionHistoryId = await (gmailAdapter as GmailAdapter).getProfileHistoryId();
       logger.info('Captured session historyId', { historyId: sessionHistoryId });
     }
   }
   ```

2. **Periodic new-email check** — add a method to ReasoningLoop that the agent can call between briefing items or on a timer:
   ```typescript
   // In reasoning-loop.ts:
   async checkForNewEmails(): Promise<{ hasNew: boolean; count?: number }> {
     if (!this.gmailAdapter || !this.sessionHistoryId) return { hasNew: false };

     const { hasChanges, currentHistoryId } =
       await this.gmailAdapter.fetchHistory(this.sessionHistoryId);

     if (hasChanges) {
       this.sessionHistoryId = currentHistoryId;
       return { hasNew: true };
     }
     return { hasNew: false };
   }
   ```

3. **Inject new-email alert**: When new emails are detected, add a system message to the conversation:
   ```
   ALERT: New emails have arrived since this briefing started.
   After finishing the current topic, ask the user: "New emails have come in. Want to hear them?"
   ```

4. **Detect externally-read emails**: At session start, compare expected unread count with actual. If user read 10 emails since last session, the agent knows and says: "Looks like you've already gone through some emails. I'll focus on the ones you haven't seen."

**Why this matters**: Without this, the agent operates in a snapshot bubble. With it, the agent is a live participant in the user's email workflow.

**Status**: [x] Done

---

### Step 9: Internal-Only Briefing Tracking (No Auto-Mark-Read)

**Modifies**: `packages/livekit-agent/src/briefing/briefing-session-tracker.ts`

**What it does**: When the cursor advances past an email, the tracker marks it as `briefed` or `skipped` **only in our internal system** (BriefingSessionTracker + BriefedEmailStore in Redis). The email's read/unread status in Gmail/Outlook is **never** touched automatically. Emails are only marked as read when the user explicitly says "mark as read."

**Fixes**: Bug 3 (cross-session exclusion via internal tracking, not inbox mutation)

**Design principle**: The user's inbox is theirs. We track what we've briefed internally and use that to filter future sessions — we never silently change the read/unread state of their emails.

**Implementation**:

```typescript
// In BriefingSessionTracker.advance():
advance(): BriefingEmailRef | null {
  const current = this.getCurrentEmail();
  if (current) {
    // Mark as briefed ONLY in our internal system
    this.markBriefed(current.emailId);

    // Persist to Redis so next session excludes this email
    if (this.briefedStore) {
      this.briefedStore.markBriefed(this.userId, current.emailId).catch(err => {
        logger.warn('Failed to persist briefed status', { emailId: current.emailId, error: err.message });
      });
    }

    // DO NOT call inbox.markRead() — email stays unread in Gmail/Outlook
    // Only the user saying "mark as read" triggers the actual mark_read tool
  }

  // Advance cursor to next pending email (skipping actioned/skipped)
  ...
}
```

**How cross-session exclusion works without mark-read**:
1. Session 1: User is briefed on 30 emails → BriefedEmailStore stores 30 email IDs in Redis
2. Session 2: `fetchUnread()` returns 50 unread emails (same as before — inbox untouched)
3. Step 5 filters: `rawEmails.filter(e => !briefedIds.has(e.id))` → 20 truly new emails
4. Agent says "20 new emails" — the 30 already-briefed ones are excluded by our system, not by Gmail

**Email status flow**:
- User hears email summary, says "next" → internal status: `briefed`, Gmail status: unchanged (still unread)
- User says "archive this" → internal status: `actioned`, Gmail status: archived (removed from inbox)
- User says "mark as read" → internal status: `actioned`, Gmail status: read (via `mark_read` tool)
- User says "skip" → internal status: `skipped`, Gmail status: unchanged

**Status**: [x] Done

---

## Dependency Graph

```
Step 1 (Tracker)
  ├── Step 2 (Wire into ReasoningLoop) ← depends on Step 1
  │     └── Step 3 (Email actions in tracker) ← depends on Step 2
  ├── Step 4 (BriefedEmailStore) ← depends on Step 1
  │     └── Step 5 (Filter pipeline) ← depends on Step 4
  ├── Step 7 (System prompt) ← depends on Step 2
  └── Step 9 (Auto-mark-read) ← depends on Step 1

Step 6 (Topic coverage) ← independent, can be done anytime
Step 8 (Gmail History) ← independent, can be done after Step 2
```

**Recommended order**: 1 → 2 → 3 → 7 → 4 → 5 → 6 → 9 → 8

---

## How Each Bug is Fixed

### Bug 1: Only 8 of 50 emails reach the briefing
- **Step 6**: Increase `maxTopics` from 8 → 50, change `minClusterSize` to 2 for real clustering
- **Result**: All fetched emails are in topics. No silent drops.

### Bug 2: Agent repeats same email over and over (EXTRA FOCUS)
- **Step 1**: `BriefingSessionTracker` tracks every email's lifecycle status
- **Step 2**: Navigation tools (`next_item`, `skip_topic`) now advance the tracker cursor → `emailContext` updates to the correct email automatically
- **Step 3**: `archive_email`/`mark_read` → `tracker.markActioned()` → email removed from active list → cursor auto-advances to next pending email → archived email CANNOT appear in GPT-4o's context again because `buildCompactEmailReference()` excludes actioned emails
- **Step 7**: System prompt tells GPT-4o "NEVER present an email not in current position"
- **Chain of custody**: User says "archive" → email-tools executes → tracker.markActioned() removes from active list → tracker.advance() moves cursor → buildCursorContext() points to next email → GPT-4o's next turn sees only the new email

### Bug 3: "50 new emails" every session (EXTRA FOCUS)
- **Step 4**: `BriefedEmailStore` persists briefed/actioned email IDs to Redis across sessions
- **Step 5**: `runBriefingPipeline()` receives `excludeEmailIds` set → filters out already-briefed emails BEFORE scoring → `totalEmails` count reflects only truly new emails
- **Step 9**: Internal-only tracking — emails marked as `briefed`/`skipped` in our system but Gmail read/unread status is NEVER touched automatically. Only explicit user commands ("mark as read") change inbox state.
- **Combined effect**: Session 1 briefs 30 of 50 emails → stored in Redis. Session 2 fetches 50 unread from Gmail (inbox untouched) → Step 5 filters out 30 already-briefed → agent shows "20 new emails." Gmail still shows 50 unread (user's choice to mark read), but the agent never repeats them.

### Bug 4: Agent doesn't iterate through all emails (EXTRA FOCUS)
- **Step 1**: `buildCursorContext()` generates a per-turn context with exactly which email to present
- **Step 2**: Before every `callChatCompletion()`, cursor context is injected as a system message → GPT-4o always sees: "You are on Topic X, Email Y. Present: [subject] from [sender]"
- **Step 7**: System prompt has explicit `BRIEFING FLOW` instructions: "Present the email in CURRENT BRIEFING POSITION, ask what to do, then call next_item"
- **Key design**: GPT-4o doesn't need to figure out which email to present — the system tells it. GPT-4o's job is to summarize and interact, not to navigate.

### Bug 5: Weak scoring
- **Step 6** (partial): Better clustering reduces noise
- **Future**: Connect VIP list from knowledge store to scoring pipeline, enable threadVelocity signal

---

## Testing Checklist

After all steps are implemented:

- [ ] First session: Agent iterates through ALL emails in order, not just the first one
- [ ] Archive email → agent immediately moves to next email, never mentions archived one again
- [ ] "Next" → agent presents the NEXT email (not the same one)
- [ ] "Skip topic" → agent jumps to first email of next topic
- [ ] "Go back" → agent returns to previous email
- [ ] Close session, reopen → only truly new emails appear
- [ ] Count shown matches actual new (non-briefed) emails
- [ ] Mid-session: new email arrives → agent alerts user (Step 8)
- [ ] All 50 fetched emails are accessible (no topic truncation drops)
- [ ] After briefing 10 emails and disconnecting, next session shows 40 remaining

---

## Completion Tracking

- [x] Step 1: BriefingSessionTracker
- [x] Step 2: Wire Tracker into ReasoningLoop
- [x] Step 3: Email Actions in Tracker
- [x] Step 4: BriefedEmailStore (Redis)
- [x] Step 5: Filter Briefed Emails from Pipeline
- [x] Step 6: Fix Topic Coverage
- [x] Step 7: System Prompt & Greeting Updates
- [x] Step 8: Real-Time Inbox Awareness
- [x] Step 9: Internal-Only Briefing Tracking
