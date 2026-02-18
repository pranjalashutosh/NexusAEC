# NexusAEC Knowledge Layer — Implementation Plan

> **Goal**: Give the voice agent persistent memory so it learns from conversations, remembers user instructions across sessions, and can search uploaded domain files.
>
> **Constraint**: Zero latency impact on the live voice pipeline. No over-engineering.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     KNOWLEDGE LAYER                             │
│                                                                 │
│  HOT LAYER (per-user knowledge doc)                             │
│  ┌─────────┐    ┌──────────┐                                    │
│  │  Redis   │◄──│ Supabase │  (dual-write: Redis for speed,     │
│  │  (fast)  │    │ (backup) │   Supabase for permanence)        │
│  └────┬─────┘    └──────────┘                                   │
│       │                                                         │
│  COLD LAYER (uploaded files)                                    │
│  ┌────────────────────────┐                                     │
│  │ Supabase pgvector      │  (existing SupabaseVectorStore)     │
│  │ OpenAI embeddings      │  (existing AssetIngestion)          │
│  │ Semantic search (RAG)  │  (existing RAGRetriever)            │
│  └────────────────────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
```

**Hot Layer**: Small JSON doc per user. Loaded into system prompt. Rules, preferences, feedback. Stored in Redis + Supabase dual-write.

**Cold Layer**: Large uploaded files (CSV, PDF, Markdown). Embedded via OpenAI, stored in Supabase pgvector. Searched on-demand via `recall_knowledge` tool.

---

## Existing Code Reference

Before coding, understand these existing patterns:

| What | File | Pattern |
|------|------|---------|
| Tool definitions | `packages/livekit-agent/src/tools/email-tools.ts` | `ToolDefinition` interface, `EMAIL_TOOLS` array, `executeEmailTool()` dispatcher |
| Tool index | `packages/livekit-agent/src/tools/index.ts` | Re-exports all tools from each tool file |
| Tool dispatch | `packages/livekit-agent/src/reasoning/reasoning-loop.ts:488` | `allTools = [...EMAIL_TOOLS, ...NAVIGATION_TOOLS]` combined and passed to GPT-4o |
| Tool execution | `packages/livekit-agent/src/reasoning/reasoning-loop.ts:548-637` | `handleToolCalls()` checks tool name against each array, delegates to executor |
| System prompt | `packages/livekit-agent/src/prompts/system-prompt.ts` | `buildSystemPrompt(context)` assembles sections. `SystemPromptContext` interface. |
| Agent entry | `packages/livekit-agent/src/agent.ts:66-146` | `entry()`: connect → waitForParticipant → bootstrapFromMetadata → runBriefingPipeline → startVoiceAssistant |
| ReasoningLLM creation | `packages/livekit-agent/src/agent.ts:225` | `new ReasoningLLM(config.openai, topicItems, {...}, topicRefs)` |
| ReasoningLoop constructor | `packages/livekit-agent/src/reasoning/reasoning-loop.ts:312-316` | Accepts `topicItems, systemPromptContext, config, topicRefs` |
| API route registration | `apps/api/src/routes/index.ts` | `registerXxxRoutes(app)` pattern, imported and called in `registerRoutes()` |
| Redis client | `apps/api/src/lib/redis.ts` | Singleton, graceful fallback (returns null if unavailable) |
| Existing vector store | `packages/intelligence/src/knowledge/supabase-vector-store.ts` | `SupabaseVectorStore` class with `upsert()`, `search()` |
| Existing RAG retriever | `packages/intelligence/src/knowledge/rag-retriever.ts` | `RAGRetriever` class with `retrieve()`, `retrieveWithStats()` |
| Existing ingestion | `packages/intelligence/src/knowledge/asset-ingestion.ts` | `AssetIngestion` class handles CSV/JSON/PDF → validate → embed → store |
| PreferencesStore | `packages/intelligence/src/knowledge/preferences-store.ts` | File-based encrypted store (NOT connected to agent, NOT used here) |
| FeedbackLearner | `packages/intelligence/src/knowledge/feedback-learner.ts` | File-based feedback storage (NOT connected to agent, NOT used here) |

---

## Step-by-Step Implementation

### Step 1: Create UserKnowledgeStore

- [x] **Status**: Done

**File to CREATE**: `packages/livekit-agent/src/knowledge/user-knowledge-store.ts`

**What it does**: A class that manages a per-user knowledge document. Dual-writes to Redis (fast) and Supabase (permanent). Falls back to Supabase if Redis is empty on read.

**Data model**:
```typescript
interface KnowledgeEntry {
  id: string;                                    // Unique ID: `k_{timestamp}_{random}`
  content: string;                               // The knowledge text
  category: 'rule' | 'preference' | 'feedback' | 'context';  // What type of knowledge
  source: 'user' | 'agent';                      // Who created it (user asked vs agent observed)
  createdAt: string;                             // ISO timestamp
}

interface KnowledgeDocument {
  userId: string;
  entries: KnowledgeEntry[];
  version: number;
  lastUpdatedAt: string;
}
```

**Methods**:
```typescript
class UserKnowledgeStore {
  constructor(redisUrl: string, supabaseUrl?: string, supabaseKey?: string)

  // Read the full knowledge doc for a user
  async get(userId: string): Promise<KnowledgeDocument>

  // Add a new entry (dual-writes to Redis + Supabase)
  async append(userId: string, entry: Omit<KnowledgeEntry, 'id' | 'createdAt'>): Promise<KnowledgeEntry>

  // Check if the doc exceeds the configured limit
  isOverLimit(doc: KnowledgeDocument): boolean

  // Replace all entries (used after summarization)
  async replace(userId: string, entries: KnowledgeEntry[]): Promise<void>

  // Delete all knowledge for a user
  async clear(userId: string): Promise<void>
}
```

**Redis key**: `nexus:knowledge:{userId}` — stores JSON string, NO TTL (permanent).

**Supabase table**: `user_knowledge` — `user_id TEXT PRIMARY KEY`, `entries JSONB`, `updated_at TIMESTAMPTZ`.

**Size limit**: 30 entries OR ~3000 characters total content. Configurable via constructor.

**Fallback logic in `get()`**:
1. Try Redis first
2. If Redis returns null → try Supabase
3. If Supabase returns data → re-cache in Redis
4. If both empty → return empty document

**Dependencies to add**: `ioredis` (already used by the API package). Check if `packages/livekit-agent/package.json` has it. If not, add it. Also `@supabase/supabase-js` for Supabase writes.

**Important**: The livekit-agent runs as a separate process from the API. It does NOT share the Redis client from `apps/api/src/lib/redis.ts`. The store creates its own Redis connection using `REDIS_URL` from env.

---

### Step 2: Create Knowledge Tools

- [x] **Status**: Done

**File to CREATE**: `packages/livekit-agent/src/tools/knowledge-tools.ts`

**What it does**: Defines two GPT-4o function calling tools and their executors, following the exact same pattern as `email-tools.ts`.

**Tool 1: `save_to_memory`**

```typescript
export const saveToMemoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'save_to_memory',
    description: 'Save important information to your memory for future sessions. Use this when the user gives you a standing instruction, states a preference, provides feedback on your behavior, or when you observe something important about their work patterns. Do NOT save email content (subject, body, or sender details) — only save rules, preferences, and behavioral instructions.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The information to remember. Write it as a clear, actionable statement.',
        },
        category: {
          type: 'string',
          description: 'The type of knowledge being saved.',
          enum: ['rule', 'preference', 'feedback', 'context'],
        },
      },
      required: ['content', 'category'],
    },
  },
};
```

**Tool 2: `recall_knowledge`** (for searching uploaded files — Phase 2)

```typescript
export const recallKnowledgeTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'recall_knowledge',
    description: 'Search the knowledge base for information from uploaded documents (PDFs, CSVs, manuals). Use this when the user asks about domain-specific information that might be in their uploaded files.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query describing what information you need.',
        },
      },
      required: ['query'],
    },
  },
};
```

**Executors**:

```typescript
// Module-level store reference (set during agent bootstrap, like email services)
let knowledgeStore: UserKnowledgeStore | null = null;
let currentUserId: string | null = null;

export function setKnowledgeStore(store: UserKnowledgeStore, userId: string): void { ... }
export function clearKnowledgeStore(): void { ... }

export async function executeSaveToMemory(
  args: Record<string, unknown>
): Promise<ToolResult> {
  // Validate args, call knowledgeStore.append(), return success/failure
}

export async function executeRecallKnowledge(
  args: Record<string, unknown>
): Promise<ToolResult> {
  // Call RAGRetriever.retrieve(query), format results, return
}
```

**Export pattern** (match email-tools.ts):
```typescript
export const KNOWLEDGE_TOOLS: ToolDefinition[] = [saveToMemoryTool, recallKnowledgeTool];

export async function executeKnowledgeTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  // Switch on toolName, delegate to executor
}
```

---

### Step 3: Update Tools Index

- [x] **Status**: Done

**File to MODIFY**: `packages/livekit-agent/src/tools/index.ts`

**What to do**: Add exports from the new `knowledge-tools.ts` file. Follow the exact pattern of the existing email-tools and navigation-tools exports.

**Add**:
```typescript
// Knowledge tools
export {
  KNOWLEDGE_TOOLS,
  executeKnowledgeTool,
  executeSaveToMemory,
  executeRecallKnowledge,
  saveToMemoryTool,
  recallKnowledgeTool,
  setKnowledgeStore,
  clearKnowledgeStore,
} from './knowledge-tools.js';
```

---

### Step 4: Register Knowledge Tools in ReasoningLoop

- [x] **Status**: Done

**File to MODIFY**: `packages/livekit-agent/src/reasoning/reasoning-loop.ts`

**Changes needed**:

1. **Add import** (near line 22-28):
   ```typescript
   import { KNOWLEDGE_TOOLS, executeKnowledgeTool } from '../tools/knowledge-tools.js';
   ```

2. **Add to allTools** (line 488):
   ```typescript
   // BEFORE:
   const allTools = [...EMAIL_TOOLS, ...NAVIGATION_TOOLS].map(...)

   // AFTER:
   const allTools = [...EMAIL_TOOLS, ...NAVIGATION_TOOLS, ...KNOWLEDGE_TOOLS].map(...)
   ```

3. **Add tool dispatch** in `handleToolCalls()` (after the navigation tools `else if` block, around line 609-634):
   ```typescript
   // Check if it's a knowledge tool
   else if (KNOWLEDGE_TOOLS.some((t) => t.function.name === toolName)) {
     const result = await executeKnowledgeTool(toolName, args);
     actionsTaken.push({ tool: toolName, result });
     responseText += result.message + ' ';

     // Add tool result to messages
     this.state.messages.push({
       role: 'tool',
       content: JSON.stringify(result),
       tool_call_id: toolCall.id,
     });
   }
   ```

---

### Step 5: Add Knowledge Section to System Prompt

- [x] **Status**: Done

**File to MODIFY**: `packages/livekit-agent/src/prompts/system-prompt.ts`

**Changes needed**:

1. **Add `knowledgeEntries` to `SystemPromptContext`** (near line 18-31):
   ```typescript
   export interface SystemPromptContext {
     // ... existing fields ...
     /** User's persistent knowledge entries */
     knowledgeEntries?: string[];
   }
   ```

2. **Add KNOWLEDGE_INSTRUCTIONS constant** (after DISAMBIGUATION_RULES, around line 119):
   ```typescript
   const KNOWLEDGE_INSTRUCTIONS = `MEMORY TOOLS:
   - save_to_memory(content, category): Save information for future sessions
     - "rule": Standing instructions ("always prioritize X", "when Y happens, do Z")
     - "preference": Communication style preferences ("be concise", "include details")
     - "feedback": Corrections to your behavior ("don't repeat subjects")
     - "context": Important background info about the user's work
   - recall_knowledge(query): Search uploaded documents for domain information

   WHEN TO SAVE:
   - User explicitly says "remember this" or "always do X" → save as rule
   - User corrects you → save as feedback
   - User states a preference → save as preference
   - You discover important work context → save as context

   WHEN NOT TO SAVE:
   - Do NOT save email content, subjects, senders, or body text (privacy rule)
   - Do NOT save things already in your memory
   - Do NOT save casual remarks or one-time instructions
   - Do NOT call save_to_memory more than twice per conversation`;
   ```

3. **Add USER MEMORY block to `buildSystemPrompt()`** (around line 140-160):
   ```typescript
   const knowledgeContext = context.knowledgeEntries?.length
     ? `\nUSER MEMORY (information this user has asked you to remember):\n${context.knowledgeEntries.map(e => `- ${e}`).join('\n')}`
     : '';
   ```

   Insert `${knowledgeContext}` and `${KNOWLEDGE_INSTRUCTIONS}` into the template string returned by `buildSystemPrompt()`.

---

### Step 6: Load Knowledge at Agent Startup & Wire Store

- [x] **Status**: Done

**File to MODIFY**: `packages/livekit-agent/src/agent.ts`

**Changes needed**:

1. **Add imports** (near line 22-27):
   ```typescript
   import { UserKnowledgeStore } from './knowledge/user-knowledge-store.js';
   import { setKnowledgeStore, clearKnowledgeStore } from './tools/knowledge-tools.js';
   ```

2. **In `entry()` function** (after `bootstrapFromMetadata`, before `startVoiceAssistant`, around line 108-138):
   ```typescript
   // Load user's knowledge document
   let knowledgeEntries: string[] = [];
   const knowledgeStore = new UserKnowledgeStore(
     process.env['REDIS_URL'] ?? 'redis://localhost:6379',
     process.env['SUPABASE_URL'],
     process.env['SUPABASE_SERVICE_ROLE_KEY'],
   );

   try {
     const userId = participant.identity;
     const knowledgeDoc = await knowledgeStore.get(userId);

     // If over limit, summarize before injecting
     if (knowledgeStore.isOverLimit(knowledgeDoc)) {
       await summarizeKnowledge(knowledgeStore, knowledgeDoc);
       const refreshed = await knowledgeStore.get(userId);
       knowledgeEntries = refreshed.entries.map(e => `[${e.category}] ${e.content}`);
     } else {
       knowledgeEntries = knowledgeDoc.entries.map(e => `[${e.category}] ${e.content}`);
     }

     // Register the store so knowledge tools can use it
     setKnowledgeStore(knowledgeStore, userId);

     logger.info('User knowledge loaded', {
       entryCount: knowledgeEntries.length,
       userId,
     });
   } catch (error) {
     logger.warn('Failed to load user knowledge, continuing without', {
       error: error instanceof Error ? error.message : String(error),
     });
   }
   ```

3. **Pass `knowledgeEntries` to `buildSystemPrompt()`** (around line 236-239):
   ```typescript
   const systemPrompt = buildSystemPrompt({
     ...DEFAULT_SYSTEM_PROMPT_CONTEXT,
     userName: session.userIdentity,
     knowledgeEntries,  // ADD THIS
   });
   ```

4. **Clean up in shutdown callback** (around line 141-144):
   ```typescript
   ctx.addShutdownCallback(async () => {
     teardownEmailServices();
     clearKnowledgeStore();   // ADD THIS
     handleDisconnect(session);
   });
   ```

---

### Step 7: Knowledge Summarization Helper

- [x] **Status**: Done

**File to CREATE**: `packages/livekit-agent/src/knowledge/summarize-knowledge.ts`

**What it does**: When the knowledge doc exceeds the size limit, this function:
1. Calls GPT-4o with the full entries list
2. Asks it to condense into fewer entries while preserving all rules and feedback verbatim
3. Writes the condensed entries back via `knowledgeStore.replace()`

```typescript
export async function summarizeKnowledge(
  store: UserKnowledgeStore,
  doc: KnowledgeDocument,
): Promise<void> {
  // 1. Separate rules/feedback (preserve) from context (compress)
  // 2. Call GPT-4o: "Condense these knowledge entries. Preserve all rules and feedback exactly. Summarize context entries."
  // 3. Parse response into KnowledgeEntry[] format
  // 4. Call store.replace(doc.userId, condensedEntries)
}
```

**When called**: ONLY at session start (in `agent.ts entry()`), NEVER during live conversation. This ensures zero latency impact on voice.

**GPT-4o call**: Uses the same `OpenAIConfig` from `loadAgentConfig()`. Single non-streaming call with ~500 token response. Expected latency: 1-2 seconds, happens before the user hears anything.

---

### Step 8: File Upload API Endpoint (Phase 2)

- [x] **Status**: Done

**File to CREATE**: `apps/api/src/routes/knowledge-upload.ts`

**What it does**: Accepts file uploads (CSV, PDF, Markdown), validates them, and triggers the existing `AssetIngestion` pipeline to embed and store in Supabase pgvector.

**Route**: `POST /knowledge/upload`

**Request**: Multipart form data with:
- `file`: The uploaded file
- `userId`: User identifier
- `sourceType`: Optional label (e.g., "safety_manual", "asset_data")

**Response**: `{ success: true, documentCount: N, message: "..." }`

**Implementation**:
```typescript
import { AssetIngestion } from '@nexus-aec/intelligence';

export function registerKnowledgeUploadRoutes(app: FastifyInstance): void {
  app.post('/knowledge/upload', async (request, reply) => {
    // 1. Parse multipart file
    // 2. Validate file type (csv, pdf, md) and size (max 10MB)
    // 3. Create AssetIngestion instance
    // 4. Run ingestion (this embeds via OpenAI and stores in Supabase)
    // 5. Return result
  });
}
```

**Register in**: `apps/api/src/routes/index.ts` — add `registerKnowledgeUploadRoutes(app)`.

**Dependency**: `@fastify/multipart` for file upload parsing. Check if already in `apps/api/package.json`.

---

### Step 9: Register Upload Route

- [x] **Status**: Done

**File to MODIFY**: `apps/api/src/routes/index.ts`

**What to do**: Import and register the new knowledge upload route.

```typescript
import { registerKnowledgeUploadRoutes } from './knowledge-upload';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ... existing routes ...
  registerKnowledgeUploadRoutes(app);
}
```

---

### Step 10: Supabase Migration for user_knowledge Table

- [x] **Status**: Done

**File to CREATE**: `infra/supabase/migrations/001_user_knowledge.sql`

```sql
-- User knowledge documents (hot layer backup)
CREATE TABLE IF NOT EXISTS user_knowledge (
  user_id TEXT PRIMARY KEY,
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_user_knowledge_updated
  ON user_knowledge (updated_at DESC);
```

**Note**: The `documents` table for the vector store (cold layer) should already be defined in the existing Supabase setup. If not, a migration for that is also needed — check existing migrations first.

---

## Implementation Sequence

```
Step 1  →  Step 2  →  Step 3  →  Step 4  →  Step 5  →  Step 6  →  Step 7
(Store)    (Tools)    (Index)    (Loop)     (Prompt)    (Agent)    (Summarize)
                                                            │
                                                            ▼
                                               Step 8  →  Step 9  →  Step 10
                                              (Upload)    (Route)    (Migration)
```

**Steps 1-7**: Core on-the-fly learning. Can be built and tested together.
**Steps 8-10**: File upload. Independent, can be built after 1-7 are working.

---

## Testing Checklist

After implementation, verify these scenarios manually:

1. **Save & retrieve**: Tell agent "always prioritize emails about invoices" → disconnect → reconnect → check agent remembers
2. **Category handling**: Give feedback ("you're being too verbose") → check it's saved as `feedback`
3. **Over-save prevention**: System prompt tells GPT-4o max 2 saves per conversation → verify it doesn't spam saves
4. **Size limit**: Fill up 30+ entries → reconnect → verify summarization runs at session start
5. **Redis fallback**: Stop Redis → reconnect → verify Supabase fallback works
6. **PRD Rule 60**: Ask agent to "remember this email from John" → verify it does NOT save email content
7. **Latency**: Verify voice pipeline response time is unchanged (save_to_memory is async Redis write)

---

## Files Summary

### New Files (4)
| File | Purpose |
|------|---------|
| `packages/livekit-agent/src/knowledge/user-knowledge-store.ts` | Redis + Supabase dual-write store |
| `packages/livekit-agent/src/knowledge/summarize-knowledge.ts` | GPT-4o summarization at session start |
| `packages/livekit-agent/src/tools/knowledge-tools.ts` | `save_to_memory` + `recall_knowledge` tools |
| `apps/api/src/routes/knowledge-upload.ts` | File upload endpoint (Phase 2) |

### Modified Files (5)
| File | Change |
|------|--------|
| `packages/livekit-agent/src/tools/index.ts` | Export knowledge tools |
| `packages/livekit-agent/src/reasoning/reasoning-loop.ts` | Register KNOWLEDGE_TOOLS, add dispatch |
| `packages/livekit-agent/src/prompts/system-prompt.ts` | Add USER MEMORY section + KNOWLEDGE_INSTRUCTIONS |
| `packages/livekit-agent/src/agent.ts` | Load knowledge at startup, pass to prompt, cleanup |
| `apps/api/src/routes/index.ts` | Register upload route (Phase 2) |

### Infrastructure (1)
| File | Purpose |
|------|---------|
| `infra/supabase/migrations/001_user_knowledge.sql` | user_knowledge table DDL |
