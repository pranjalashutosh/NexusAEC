# Reasoning Architecture Analysis

> Date: 2026-02-21 Status: Analysis complete, hybrid proposal pending
> implementation

## Overview

NexusAEC has two parallel reasoning architectures that evolved independently.
This document captures a thorough analysis of both, their tradeoffs, and a
proposed hybrid architecture that combines their strengths.

---

## The Two Architectures

### Architecture A: Intelligence Package (Pre-computed Pipeline)

**Location:** `packages/intelligence/src/knowledge/`

**Philosophy:** Do the heavy lifting _before_ the voice session. Pre-compute
summaries, generate briefing scripts, explain red flags. The voice agent reads
from prepared material.

**Components:**

| File                       | Purpose                                                | LLM Used                | Used in Production?                                 |
| -------------------------- | ------------------------------------------------------ | ----------------------- | --------------------------------------------------- |
| `llm-client.ts`            | OpenAI wrapper with rate limiting + retries            | GPT-4o                  | Yes (by summarizer, narrative-gen, explanation-gen) |
| `email-summarizer.ts`      | Thread/email -> concise summaries (4 modes)            | GPT-4o via LLMClient    | **No**                                              |
| `narrative-generator.ts`   | Clusters + scores -> podcast-style briefing scripts    | GPT-4o via LLMClient    | **No**                                              |
| `explanation-generator.ts` | Red flag scores -> human-friendly explanations         | GPT-4o via LLMClient    | **No**                                              |
| `rag-retriever.ts`         | Semantic vector search over uploaded docs              | Supabase pgvector       | **No**                                              |
| `feedback-learner.ts`      | User feedback -> weight adjustments (gradient descent) | None (local filesystem) | **No**                                              |
| `preferences-store.ts`     | Encrypted VIP/keyword/topic storage                    | None (AES-256 local)    | **No**                                              |
| `shadow-processor.ts`      | Transcript -> command detection (regex patterns)       | None (regex)            | **No**                                              |

**What IS used from intelligence (via `briefing-pipeline.ts`):**

- `RedFlagScorer` -- scores emails for urgency
- `KeywordMatcher` -- detects urgent keywords
- `VipDetector` -- detects VIP senders
- `TopicClusterer` -- groups emails by topic

#### LLMClient Details

The `LLMClient` class provides production-grade OpenAI integration:

- **Rate limiting:** Token bucket algorithm (60 req/min, 90k tokens/min default)
- **Retries:** Exponential backoff (3 retries, 1s -> 2s -> 4s, max 60s)
- **Retryable errors:** 429, 500, 502, 503, 504, rate limit, timeout, network
  errors
- **Token estimation:** ~4 chars per token (rough but functional)
- **Streaming support:** Via `streamComplete()` with chunk callbacks

#### EmailSummarizer Modes

| Mode           | Max Tokens | Output                                      |
| -------------- | ---------- | ------------------------------------------- |
| `brief`        | 200        | 1-2 sentence core message                   |
| `detailed`     | 500        | Full context with decisions                 |
| `action-items` | 400        | Structured list: action, assignee, due date |
| `key-points`   | 400        | Bullet list of highlights                   |

#### NarrativeGenerator Styles

| Style            | Persona                                  |
| ---------------- | ---------------------------------------- |
| `formal`         | Professional, precise, respectful        |
| `conversational` | Warm, friendly, like a trusted colleague |
| `executive`      | Concise, direct, short sentences         |
| `concise`        | Extremely brief, minimal words           |

Each style has its own system prompt and transition phrases.

---

### Architecture B: LiveKit-Agent (Real-Time GPT-4o-in-the-loop)

**Location:** `packages/livekit-agent/src/`

**Philosophy:** GPT-4o reasons about each email live during the voice session.
User drives the conversation. Interactive tool calling enables actions.

**Components:**

| File                          | Purpose                                                        | LLM Used                                             | Used in Production?      |
| ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- | ------------------------ |
| `reasoning-loop.ts`           | STT -> GPT-4o -> TTS orchestration, tool calling               | **GPT-4o direct** (`openai.chat.completions.create`) | Yes                      |
| `reasoning-llm.ts`            | LiveKit SDK adapter, sentence chunking for TTS                 | None (delegates)                                     | Yes                      |
| `briefing-pipeline.ts`        | Fetch -> Score -> Cluster emails                               | None (uses intelligence scorers)                     | Yes                      |
| `summarize-knowledge.ts`      | Compress user knowledge when over limit                        | **GPT-4o-mini direct**                               | Yes                      |
| `user-knowledge-store.ts`     | Dual-write Redis + Supabase for user memory                    | Redis + Supabase                                     | Yes                      |
| `knowledge-tools.ts`          | GPT-4o tools: save_to_memory, recall_knowledge (stub)          | None (calls store)                                   | Partial (recall is stub) |
| `email-tools.ts`              | GPT-4o tools: archive, flag, mute, draft, search...            | None (calls providers)                               | Yes                      |
| `navigation-tools.ts`         | GPT-4o tools: skip, next, go_back, go_deeper...                | None (state machine)                                 | Yes                      |
| `briefing-prompts.ts`         | Prompt templates for voice delivery                            | None (text templates)                                | Yes                      |
| `briefing-session-tracker.ts` | Email lifecycle state machine (pending -> briefed -> actioned) | None                                                 | Yes                      |
| `briefed-email-store.ts`      | Redis-backed store of previously briefed emails                | Redis                                                | Yes                      |

---

## System Prompt Architecture

### How the System Prompt is Formed

The system prompt is built in
`packages/livekit-agent/src/prompts/system-prompt.ts` via
`buildSystemPrompt(context)`:

```
PERSONA                    -- Identity as professional executive assistant
+-- Greeting               -- Time-aware ("Good morning/afternoon/evening")
+-- SAFETY_CONSTRAINTS     -- No sensitive data reading, confirmations required
+-- TOOL_INSTRUCTIONS      -- All available tools (email, navigation, knowledge)
+-- BRIEFING_INSTRUCTIONS  -- How to use CURRENT BRIEFING POSITION, navigate emails
+-- KNOWLEDGE_INSTRUCTIONS -- Memory tools: when to save/not save
+-- RESPONSE_FORMAT        -- Voice-specific (brevity for driving, pacing)
+-- CONFIRMATION_RULES     -- Risk-level confirmation verbosity
+-- DISAMBIGUATION_RULES   -- How to ask clarifying questions
+-- CURRENT CONTEXT:
    +-- VIP CONTACTS list
    +-- MUTED SENDERS list
    +-- USER MEMORY (knowledgeEntries from Redis/Supabase)
    +-- VERBOSITY NOTE (concise/standard/detailed)
    +-- MODE NOTE (driving/walking/desk)
```

### System Prompt Duplication

`buildSystemPrompt()` is called in **two places**:

|                         | Call #1 (`agent.ts:386`)           | Call #2 (`reasoning-loop.ts:335`)    |
| ----------------------- | ---------------------------------- | ------------------------------------ |
| **Context**             | userName, knowledgeEntries         | userName, knowledgeEntries (same)    |
| **Email refs appended** | None                               | Yes (all email IDs/subjects/senders) |
| **Goes to**             | `voice.Agent({ instructions })`    | `state.messages[0]` -> OpenAI        |
| **Sent to GPT-4o?**     | **No** (LiveKit SDK metadata only) | **Yes** (actual system prompt)       |

**Impact:** The `voice.Agent` prompt is dead code for LLM purposes. GPT-4o only
sees the ReasoningLoop version. The duplication is harmless but misleading.

### Dynamic Injections During Conversation

- **Every turn:** `tracker.buildCursorContext()` pushed as system message (which
  email to present)
- **On new email detection:** ALERT system message injected mid-conversation

### What GPT-4o Sees Each Turn

```
messages = [
  { role: 'system',    content: FULL_PROMPT + EMAIL_REFS },
  { role: 'system',    content: CURSOR_CONTEXT },          <-- injected each turn
  { role: 'user',      content: 'user speech' },
  { role: 'assistant', content: '...', tool_calls: [...] },
  { role: 'tool',      content: '{"success":true}' },
  { role: 'system',    content: 'ALERT: new emails...' },  <-- if detected
  ...
]
```

---

## Comparative Analysis

### Architecture A Strengths

1. **Production-grade LLM calls** -- `LLMClient` has rate limiting (60 req/min,
   90k tokens/min), exponential backoff retries (3 retries, 1s->2s->4s),
   retryable error detection (429, 5xx, timeouts, network errors). The reasoning
   loop has **none of this**.
2. **Predictable quality** -- summaries are generated once with tuned prompts
   per mode.
3. **Narrative style system** -- 4 distinct personas with style-specific
   transition phrases. No equivalent in livekit-agent.
4. **Structured extraction** -- EmailSummarizer extracts action items with
   assignees and due dates, key points as bullet lists. GPT-4o in the reasoning
   loop doesn't do this.
5. **Testable** -- deterministic input -> output.
6. **Feedback learning** -- FeedbackLearner adjusts scoring weights via gradient
   descent (learning rate 0.1, min 10 samples, max 0.3 cap).

### Architecture A Weaknesses

1. **Not interactive** -- user says "tell me more" and the script has no answer.
   This is the fatal flaw for a voice assistant.
2. **No tool calling** -- can't archive, flag, reply during briefing.
3. **Stale** if new emails arrive mid-session.
4. **Higher upfront cost** -- summarizes every email even if user skips most.
5. **Monologue format** -- one-way script, not a conversation.
6. **Pre-session delay** -- summarizing 20 emails x ~1s each = 20s delay.

### Architecture B Strengths

1. **Fully interactive** -- user asks questions, takes actions anytime.
2. **Tool calling** -- 10 email + 8 navigation + 2 knowledge tools.
3. **Adaptive** -- responds to user's interests and follow-up questions.
4. **No pre-computation delay** -- session starts immediately.
5. **Cost-efficient for skips** -- only processes emails user engages with.
6. **Real-time awareness** -- Gmail History API polling every 60s.
7. **Context accumulation** -- references earlier discussion.

### Architecture B Weaknesses

1. **ZERO production resilience** -- `callChatCompletion()` does `throw error`
   with no retry, no rate limiting, no timeout. One 429 from OpenAI breaks the
   session.
2. **Per-turn latency** -- waiting for GPT-4o (~1-3s) per utterance.
3. **Cold start per email** -- GPT-4o sees only subject/sender metadata, no
   summary.
4. **No style system** -- system prompt is fixed, no
   formal/conversational/executive modes.
5. **No learning** -- can't learn from user corrections across sessions.
6. **In-memory VIP/mute** -- lost on process restart.
7. **No RAG** -- `recall_knowledge` is a Phase 2 stub.
8. **Context window pressure** -- email refs + history + cursor + tools
   accumulate unbounded.

---

## The Verdict

**Architecture B (real-time) is the correct foundation for a voice assistant.**
Interactivity is the core value proposition. But it has serious production gaps
that Architecture A already solved.

The intelligence package isn't wrong -- it was designed for a different use case
(batch analysis). The opportunity is **integrating its production-grade
components** into the real-time pipeline.

---

## Proposed Hybrid Architecture

**Principle:** Pre-compute context, reason in real-time, with production
reliability.

### Phase 1: Pre-Session Enrichment (2-5s)

```
briefing-pipeline.ts (existing)
+-- Fetch unread emails
+-- Score with RedFlagScorer           [already works]
+-- Cluster with TopicClusterer        [already works]
|
NEW: Pre-summarize top emails
+-- EmailSummarizer('brief') on top ~15 by score
+-- Only high-priority emails (score > 0.4)
+-- ~200 tokens each, ~15 emails = ~3s parallel
+-- Inject summaries into BriefingEmailRef
|
NEW: Pre-explain red flags
+-- ExplanationGenerator on emails with score >= 0.6
+-- Include explanation in email reference block
|
NEW: Load PreferencesStore
+-- Replace in-memory vipList/muteList with persisted encrypted storage
```

### Phase 2: Session Runtime (Enhanced)

```
reasoning-loop.ts (enhanced)
+-- REPLACE: bare OpenAI -> LLMClient wrapper
|   +-- Rate limiting, retries, backoff from intelligence
|
+-- ENHANCED: Email reference block now includes summaries
|   email_id: "msg123" | From: john@acme.com
|   Subject: Budget Approval
|   SUMMARY: Q4 budget increase request, awaiting CFO...
|   RED FLAG: Deadline tomorrow, requires VP approval
|
+-- KEEP: GPT-4o tool calling (interactive, adaptive)
+-- KEEP: Navigation tools, email tools
+-- KEEP: Real-time new email detection
|
+-- NEW: Wire RAGRetriever into recall_knowledge
|   +-- Replace Phase 2 stub with actual vector search
|
+-- NEW: Narrative style in system prompt
    +-- Use NarrativeGenerator's style prompts as persona modifiers
       (formal/conversational/executive/concise)
```

### Phase 3: Post-Session Learning

```
NEW: Feed actions to FeedbackLearner
+-- "archived without reading" -> false_positive signal
+-- "flagged for follow-up" -> correct signal
+-- "asked for more details" -> too_low signal
+-- Adjust RedFlagScorer weights for next session

NEW: Persist VIP/mute to PreferencesStore
+-- Survives process restarts
```

### What This Gains

| Gap in Current Design           | How Hybrid Fixes It                                   |
| ------------------------------- | ----------------------------------------------------- |
| No retries on OpenAI calls      | LLMClient wrapper adds retries + rate limiting        |
| GPT-4o sees only subject/sender | Pre-computed summaries give rich context              |
| No narrative styles             | Style system from NarrativeGenerator modifies persona |
| No learning across sessions     | FeedbackLearner adjusts scorer weights                |
| VIP/mute lost on restart        | PreferencesStore persists encrypted                   |
| recall_knowledge is a stub      | RAGRetriever provides real vector search              |
| Cold-start per email            | Pre-summaries let GPT-4o deliver instantly            |
| No red flag explanations        | ExplanationGenerator pre-computes them                |

### What We Explicitly Don't Do

- **Don't generate full briefing scripts** -- NarrativeGenerator's monologue
  format is incompatible with interactive voice. We take its _style system_ but
  not its _script generation_.
- **Don't replace GPT-4o tool calling with ShadowProcessor** -- regex command
  detection is a downgrade from LLM understanding. ShadowProcessor could serve
  as a fallback if GPT-4o is slow, but not the primary path.
- **Don't pre-summarize all emails** -- only top ~15 by score. Low-priority
  emails get summarized on-demand if user reaches them.

---

## File Dependency Graph (Current)

```
agent.ts (entry point)
+-- briefing-pipeline.ts -> @nexus-aec/intelligence (RedFlagScorer, TopicClusterer, etc.)
+-- email-bootstrap.ts -> @nexus-aec/email-providers (GmailAdapter, OutlookAdapter)
+-- llm/reasoning-llm.ts
|   +-- reasoning/reasoning-loop.ts -> OpenAI (chat.completions.create) [NO RETRIES]
|       +-- tools/email-tools.ts
|       +-- tools/navigation-tools.ts
|       +-- tools/knowledge-tools.ts
+-- knowledge/user-knowledge-store.ts -> Redis, Supabase
+-- knowledge/summarize-knowledge.ts -> OpenAI (gpt-4o-mini) [NO RETRIES]
+-- prompts/system-prompt.ts
+-- prompts/briefing-prompts.ts
```

## File Dependency Graph (Proposed Hybrid)

```
agent.ts (entry point)
+-- briefing-pipeline.ts -> @nexus-aec/intelligence
|   +-- RedFlagScorer, TopicClusterer     [existing]
|   +-- EmailSummarizer('brief')          [NEW: pre-compute summaries]
|   +-- ExplanationGenerator              [NEW: pre-compute red flag explanations]
+-- email-bootstrap.ts -> @nexus-aec/email-providers
+-- llm/reasoning-llm.ts
|   +-- reasoning/reasoning-loop.ts -> LLMClient [NEW: wrapped with retries]
|       +-- tools/email-tools.ts -> PreferencesStore [NEW: persistent VIP/mute]
|       +-- tools/navigation-tools.ts
|       +-- tools/knowledge-tools.ts -> RAGRetriever [NEW: real vector search]
+-- knowledge/user-knowledge-store.ts -> Redis, Supabase
+-- knowledge/summarize-knowledge.ts -> LLMClient [NEW: wrapped with retries]
+-- prompts/system-prompt.ts [ENHANCED: narrative styles]
+-- prompts/briefing-prompts.ts
+-- feedback/session-feedback.ts [NEW: post-session learning]
    +-- FeedbackLearner
```

---

## Memory Tier Architecture

- **Tier 1 (Ephemeral):** In-memory only (ReasoningState, conversation history)
- **Tier 2 (Session):** Redis
  - `nexus:knowledge:{userId}` -- User knowledge entries
  - `nexus:briefed:{userId}` -- Briefed email IDs (7-day TTL)
- **Tier 3 (Knowledge):** Supabase + local encrypted
  - `user_knowledge` table -- Persistent user knowledge with vector search
  - PreferencesStore -- Encrypted VIPs, keywords, topics, muted senders
  - FeedbackLearner -- Weight adjustment history

---

## PRD Rule 60 Compliance

Email content must NOT persist beyond active session. Only metadata may be
cached.

- Pre-computed summaries live only in `BriefingEmailRef` (ephemeral, Tier 1)
- Red flag explanations live only in email reference block (ephemeral, Tier 1)
- Conversation history with email bodies lives only in `state.messages`
  (ephemeral, Tier 1)
- BriefedEmailStore only tracks IDs + status metadata (no content)
- Knowledge store explicitly rejects email content
