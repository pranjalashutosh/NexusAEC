# LangGraph Migration Plan — Master Document

> Date: 2026-07-02 · Status: **Approved plan, pre-implementation** · Supersedes:
> `reasoning-architecture-analysis.md` (stale — references components removed in
> `ebc2478`)

Replaces the linear GPT-4o pipeline (`ReasoningLoop`) with an asynchronous
agentic architecture: a thin **Voice Node** (instant TTS acknowledgment via
LiveKit) decoupled from **background LangGraph graphs** (RAG-driven inbox
sorting + a Plan → Act → Observe ReAct worker). All heavy LLM reasoning leaves
the voice turn path.

---

## 1. Locked Decisions

These are agreed and **not** open for re-litigation during implementation.

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Latency budget:** 800 ms measured from `transcript-final` → first TTS audio of the acknowledgment. Do **not** retune `maxEndpointingDelay` / VAD — users may pause mid-sentence to think.                                                                                                                                                                                                                    |
| D2  | **Worker lifespan:** Graph B runs MUST outlive the voice session. If the user hangs up, the graph finishes its task natively via the Gmail/Outlook APIs. There is no push channel; the result existing in the user's real inbox **is** the delivery fallback.                                                                                                                                                  |
| D3  | **Host sizing:** upgrade the agent EC2 host to **t3.medium** (graph state, ReAct memory footprint, and the sorting fan-out will choke a t3.small).                                                                                                                                                                                                                                                             |
| D4  | **Approval expiry:** `interrupt()` approvals time out after **60 seconds** → auto-reject the pending action, clear the interrupt, return the Voice Node to idle listening. Drafts are staged natively _before_ the approval prompt, so nothing is lost.                                                                                                                                                        |
| D5  | **Freeze & Resume + Universal Lock on Interruption** (UX protocol) — see §4.2. Applies to ALL user-initiated commands and questions, not just search/draft.                                                                                                                                                                                                                                                    |
| D6  | **Stack:** LangGraph.js (`@langchain/langgraph`) in-monorepo. GPT-4o stays the reasoning model (via `@langchain/openai`); gpt-4o-mini for Voice Node conversational turns.                                                                                                                                                                                                                                     |
| D7  | **No topic clustering.** `InboxQueueItem` carries no `clusterLabel` and the Voice Node does not reconstruct topic grouping. Ordering and narration rely EXCLUSIVELY on `priority` — the briefing reads the high bucket, then medium, then low. Parallel `Send()` batches cannot deterministically coordinate dynamic topic strings; the legacy `addTopics()` path already produced fractured/duplicate topics. |

Consequence of D2: Graph B can never run inside the LiveKit per-job child
process (it dies with the room). The standalone `apps/worker` container is a
**correctness requirement shipped with Graph B**, not a later scale-out step.

Consequence of D5: today's auto-advance-after-action behavior
(`generateTransition` firing after `archive_email` / `mark_read`) is retired.
The cursor moves **only** on explicit progression intent.

Consequence of D7: `classify_sort` emits a flat per-email
`{ emailId, priority, summary }` (no clusters JSON — simpler output, fewer parse
failures), and `QueueCursor` anchors on a stable `emailId` within priority
buckets instead of topic/item indexes.

---

## 2. Current State (What This Replaces)

- **The linear pipeline** is
  `packages/livekit-agent/src/reasoning/reasoning-loop.ts` (1,413 lines):
  non-streaming GPT-4o call with ~14 tools → tool execution awaited inline
  (provider API calls, `batch_action` bulk ops) → sometimes a second GPT-4o call
  (`recall_knowledge` re-entry, `summarizeEmailForVoice` for `go_deeper`) → only
  then the first TTS chunk. Worst-case turn latency 3–6 s, all blocking.
- **"Ack & Act" was designed but never wired:** `ShadowProcessor` (regex intent
  detection) is unused; `loadPrecomputedBriefing()` is defined but never called;
  the API precompute output has no consumer.
- **RAG exists but is dormant:** `RAGRetriever` + `SupabaseVectorStore` +
  `match_documents` (pgvector) are built and ingestion works, but no runtime
  code retrieves. `recall_knowledge` is keyword-match over ≤30 entries.
- **Confirmation flaw:** high-risk actions execute _first_, then ask
  (`handleConfirmation`: "the action was ALREADY executed … Do NOT re-execute").
  `interrupt()` inverts this correctly.
- **Lambda risk:** `POST /briefing/precompute` runs GPT-4o batches inline in the
  API Lambda (~30 s API Gateway timeout ceiling).
- **Infra:** API on Lambda; voice agent on EC2 (long-lived); Redis is Upstash in
  prod; Supabase hosts pgvector + `user_knowledge` (table has no migration —
  created manually; capture it during this migration).

---

## 3. Target Architecture Overview

```
Mobile (LiveKit room)
   │ audio
   ▼
┌────────────────────────── EC2 t3.medium ──────────────────────────┐
│  livekit-agent process (per-job child, dies with room)            │
│  ┌──────────────── VOICE NODE (hot path, <800ms) ───────────────┐ │
│  │ Deepgram STT → intent-gate (deterministic first)             │ │
│  │   ├─ progression intent → advance cursor → template speech   │ │
│  │   ├─ action/question   → UNIVERSAL LOCK → ack template → TTS │ │
│  │   │                      └─ enqueue AgentJob ────────┐       │ │
│  │   └─ chat answerable from state → gpt-4o-mini stream │       │ │
│  │ result-speaker ◄── AgentJobResult (bus) ─────────────┼─────┐ │ │
│  └──────────────────────────────────────────────────────┼─────┼─┘ │
│                                                         ▼     │   │
│  apps/worker container (survives hangup — D2)                 │   │
│  ┌───────────────────────────────────────────────────────────┐│   │
│  │ Graph A: inbox_sorting (RAG queue)   Graph B: react_worker ││   │
│  │ fetch → rules → RAG-hydrate →        plan → act → observe  ││   │
│  │ classify → write inbox_queue         ↘ interrupt(approval) ││   │
│  └───────────────────────────────────────────────────────────┘│   │
└───────────────────────────────┬────────────────────────────────┘   │
                                ▼                                    │
        Redis (Upstash): job bus (Streams) · graph checkpoints (TTL) │
        · tokens · sender profiles · briefed IDs ────────────────────┘
        Supabase: pgvector documents · user_knowledge · preferences
        API Lambda: OAuth, LiveKit tokens, precompute → enqueue only
```

---

## 4. Voice Node Specification

Lives in `packages/livekit-agent/src/voice/`. Deliberately **not** a LangGraph
graph — it is a deterministic state machine on the hot path.

### 4.1 Latency budget (from `transcript-final`, per D1)

| Step                                                 | Cost            |
| ---------------------------------------------------- | --------------- |
| Deterministic intent gate (regex + cursor state)     | ~0–5 ms         |
| gpt-4o-mini fallback classify (only if inconclusive) | 150–400 ms      |
| Template ack selection                               | ~0 ms           |
| ElevenLabs Turbo first audio                         | 150–300 ms      |
| **Total (worst case, mini-gated)**                   | **~160–700 ms** |

No GPT-4o call ever sits on this path. Endpointing/VAD settings stay exactly as
they are today (D1).

### 4.2 Universal Lock on Interruption (D5)

State machine rules — these are the UX contract:

1. The moment the user issues **any** command or question (search, draft,
   archive, "give me more details", anything that is not an explicit progression
   intent), `cursor.locked = true`. The cursor does NOT move.
2. The Voice Node fulfills the request: answers from state via gpt-4o-mini, or
   acknowledges (<800 ms) then goes **silent** and waits for Graph B (2–5 s of
   silence is accepted UX for heavy tasks).
3. When the result/answer/draft is delivered, the Voice Node enters a **context
   lock**: `cursor.focusEmailId` points at the email under discussion (which may
   be outside the briefing queue, e.g. a search hit). Follow-up actions ("draft
   a reply to it") target the focused email.
4. After delivering, the Voice Node **never auto-advances**. It always ends with
   a prompt ("Does that answer your question?", "Task complete — shall we return
   to the briefing?") and waits for an EXPLICIT progression intent.
5. On explicit intent the lock clears and the briefing resumes from the exact
   frozen cursor position. Phrase mapping (tunable in `intent-gate.ts`):
   - `next` / `skip` / `move on` → increment from the frozen position, resume.
   - `continue` / `go back to the briefing` / "yes" to the agent's return-prompt
     → resume AT the frozen position (recap current email).

### 4.3 States and transitions

```
IDLE               listening; nothing being narrated (cursor may be frozen)
BRIEFING           presenting the email at cursor; awaiting input
LOCKED_WAIT        lock engaged; job dispatched; ack spoken; silent wait
LOCKED_FOCUS       result delivered; ended with prompt; focusEmailId active
AWAITING_APPROVAL  confirmation prompt spoken; 60s window (D4)

BRIEFING/IDLE --any command/question--------→ lock + (LOCKED_WAIT | answer→LOCKED_FOCUS)
LOCKED_WAIT   --AgentJobResult--------------→ speak result + prompt → LOCKED_FOCUS
LOCKED_FOCUS  --follow-up command-----------→ stays locked → LOCKED_WAIT
LOCKED_FOCUS  --explicit progression intent-→ unlock → advance/recap → BRIEFING
ANY           --ApprovalRequest (bus)-------→ speak prompt → AWAITING_APPROVAL
AWAITING_APPROVAL --yes/no------------------→ Command(resume) to worker → LOCKED_WAIT
AWAITING_APPROVAL --60s timeout-------------→ (worker auto-rejects) → IDLE, cursor stays frozen
```

### 4.4 Intent classes (`intent-gate.ts`)

Deterministic first (extends `detectCommand()` in `stt/deepgram-config.ts` +
cursor state); gpt-4o-mini single-shot classify only when regex is inconclusive.

| Class             | Examples                                  | Handling                                                                       |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| PROGRESSION       | next, skip, move on, continue, go back    | The ONLY class that moves the cursor / clears the lock                         |
| ACTION            | archive, flag, mute, draft, search, batch | lock → enqueue `AgentJob` → ack template                                       |
| QUESTION_STATE    | "what's this one about?"                  | lock → gpt-4o-mini stream from `inbox_queue` context, no tools → prompt suffix |
| QUESTION_DATA     | "more details", "read the full email"     | lock → enqueue (body fetch happens in Graph B) → silent wait                   |
| APPROVAL_RESPONSE | yes / no while AWAITING_APPROVAL          | `Command({ resume })` to the parked graph                                      |
| STOP / PAUSE      | stop briefing                             | local, template                                                                |
| AMBIGUOUS         | —                                         | clarify template                                                               |

### 4.5 Result delivery (`result-speaker.ts`)

- Subscribes to `AgentJobResult` on the bus. If the user is speaking, hold;
  otherwise `session.say(voiceSummary)` (barge-in aware), then the mandatory
  follow-up prompt (rule 4).
- If no session is live (user hung up — D2): the result is dropped. The native
  inbox state (archived email, created draft) is the record. No replay on next
  session (non-goal, §12).

---

## 5. Graph A — `inbox_sorting` (RAG-driven queue)

`thread_id = inbox:{userId}` · checkpointer: Redis (TTL) · runs in
`apps/worker`.

Triggers: `POST /briefing/precompute` (enqueue-only after this migration),
session start when the checkpoint is stale (>15 min, keeps existing freshness
convention), later optionally a Gmail push webhook. Idempotent — safe to re-run;
an interrupted sort is simply re-triggered.

```
START
 → hydrate_preferences   PreferencesStore + UserKnowledgeStore entries
                         + SenderProfileStore.synthesizePreferences()
 → fetch_inbox           UnifiedInboxService.fetchUnread (paginated, 24h)
                         [ports briefing-pipeline.ts §1]
 → apply_rules           briefed-ID exclusion, mutes, [rule] knowledge filters
                         [ports extractFilterRules]
 → hydrate_context       Send() fan-out per batch of 25:
                           SenderProfileStore.get(sender)
                           RAGRetriever.retrieve(subject + snippet)  ← pgvector
 → classify_sort         ChatOpenAI structured output (zod): flat per-email
                         priority + summary — NO clustering (D7) — grounded
                         in retrieved context [ports preprocessor prompt
                         minus its CLUSTER step; keeps the 6–14-word
                         spoken-intent summary rules]
 → write_queue           reduce into inbox_queue (priority-ordered); mirror
                         nexus:priority-counts:{userId}; publish queue-updated
                         event if a session is live
 → conditional: batches remaining → hydrate_context (progressive) | END
```

Replaces: `briefing-pipeline.ts`, `email-preprocessor.ts`, the API's inline
precompute, and the dead `precomputed-loader.ts` (session start now reads the
Graph A checkpoint). `presortEmails()` heuristic is reused inside
`fetch_inbox`/`apply_rules` ordering.

---

## 6. Graph B — `react_worker` (Plan → Act → Observe)

`thread_id = task:{userId}:{taskId}` · checkpointer: Redis (TTL) · runs in
`apps/worker` **only** (D2 — must survive room shutdown).

```
START
 → plan                GPT-4o: task + inbox_queue slice + user_preferences
                       → PlanStep[] (or a single direct tool call)
 → route: contains a high-risk commit step (send-adjacent, bulk > N)?
     yes → stage first, then gate:
           act(stage)          e.g. create_draft natively (low risk, D4)
           request_approval    interrupt({ pendingAction, expiresAt: +60s })
                               — graph parks; Voice Node prompts the user;
                               resumes via Command({ resume: approved })
     no  → act
 → act                 execute ONE tool: email-actions (archive / flag / move /
                       draft / search / batch), rag-retrieve, knowledge-actions
                       — ToolNode with bounded retries
 → observe             validate ToolResult; append observation; update
                       inbox_queue item statuses (markActioned semantics);
                       feed SenderProfileStore
 → route: retryable error → act | plan incomplete → plan | done → respond
 → respond             compose ≤2-sentence voiceSummary (template first, LLM
                       only when composing is genuinely needed); publish
                       AgentJobResult; update BriefedEmailStore
 → END
```

### 6.1 Approval expiry (D4)

The **worker runtime is authoritative** for the 60 s timeout, because the voice
session may be gone (D2). `apps/worker` keeps a sweeper over parked runs
(`pending_actions[].expiresAt`); at expiry it resumes the graph with
`{ approved: false, reason: 'timeout' }`, marks the action `rejected`, and the
graph proceeds (staged draft remains in the provider drafts folder). The Voice
Node's own 60 s timer is UX-only: stop waiting, return to idle listening, cursor
stays frozen.

### 6.2 Credentials

Jobs carry **no OAuth tokens** (they would sit in Redis Streams). The worker
builds Gmail/Outlook adapters per job from the existing encrypted
`RedisTokenStorage` (`nexus:tokens:*`, AES-256) — same path the API uses in
prod; `FileTokenStorage` fallback in dev. This also makes D2 work: the worker
never depends on LiveKit participant metadata.

---

## 7. State Schemas

Defined in `packages/agent-graph/src/state/`; wire contracts in
`packages/shared-types/src/agent-jobs.ts`.

```ts
const InboxState = Annotation.Root({
  userId: Annotation<string>,
  inbox_queue: Annotation<InboxQueueItem[]>({
    reducer: mergeByEmailId,
    default: () => [],
  }),
  user_preferences: Annotation<UserPreferences>, // hydrated per run (§8)
  retrieval_context: Annotation<Record<string, SenderContext>>({
    reducer: merge,
  }),
  cursor: Annotation<QueueCursor>, // advanced ONLY by the Voice Node
});

interface InboxQueueItem {
  // PRD Rule 60: metadata + derived summary ONLY — never bodies
  emailId: string;
  threadId?: string;
  from: string;
  subject: string;
  receivedAt: string;
  priority: 'high' | 'medium' | 'low';
  summary: string; // the 6–14-word spoken intent line
  ragEvidence?: string[]; // doc/profile IDs that justified ranking — not content
  status: 'pending' | 'briefed' | 'actioned' | 'skipped';
}

interface QueueCursor {
  // D7: priority-bucket traversal (high → medium → low). Anchored on a stable
  // emailId so background batch merges never shift the position. Advance =
  // next 'pending' item in priority order after currentEmailId.
  currentEmailId: string | null; // null = briefing not started / complete
  locked: boolean; // Universal Lock (D5)
  lockReason?: 'command' | 'question' | 'awaiting_worker' | 'awaiting_approval';
  focusEmailId?: string; // context-lock target; may be outside the queue
  lockedAt?: string;
}

const WorkerState = Annotation.Root({
  ...MessagesAnnotation.spec, // plan/act/observe scratchpad (ephemeral, TTL'd)
  task: Annotation<AgentJob>,
  plan: Annotation<PlanStep[]>,
  pending_actions: Annotation<PendingAction[]>({ reducer: upsertById }),
  observations: Annotation<Observation[]>({ reducer: append }),
  outcome: Annotation<WorkerOutcome | undefined>,
});

interface PendingAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  status: 'proposed' | 'approved' | 'rejected' | 'executed' | 'failed';
  expiresAt: string; // createdAt + 60s (D4)
}

// Wire contracts (shared-types)
interface AgentJob {
  jobId: string;
  userId: string;
  sessionId?: string; // absent for offline runs
  kind: 'react_task' | 'inbox_sort';
  utterance?: string; // raw user command for react tasks
  focusEmailId?: string; // context-lock target at dispatch time
  requestedAt: string;
  // NO tokens — see §6.2
}

interface AgentJobResult {
  jobId: string;
  userId: string;
  sessionId?: string;
  status: 'completed' | 'rejected' | 'failed' | 'timeout';
  voiceSummary: string; // ≤2 sentences, TTS-ready
  focusEmailId?: string; // Voice Node sets cursor.focusEmailId from this
  queueDelta?: Array<{ emailId: string; status: InboxQueueItem['status'] }>;
}
```

`user_preferences` is a state **channel hydrated at run start** from
`PreferencesStore` + `UserKnowledgeStore` + `SenderProfileStore` — durable
preference data is never persisted _via_ checkpoints (see §8).

---

## 8. Persistence: Checkpointing & PRD Rule 60

- **Custom `BaseCheckpointSaver` over ioredis** (~100 lines), checkpoints at
  `nexus:graph:{thread_id}`, **24 h TTL**. Required because prod Redis is
  Upstash and the official `@langchain/langgraph-checkpoint-redis` depends on
  RediSearch `FT.*` commands, which Upstash does not implement (its search is a
  separate, incompatible engine). Upstash's JSON support is compatible, but the
  saver needs only plain GET/SET/EXPIRE.
- **Rule 60 enforcement by construction:** `inbox_queue` holds metadata +
  derived summaries only. Email bodies fetched mid-run (e.g. `QUESTION_DATA` /
  go_deeper) enter `WorkerState.messages` transiently and expire with the
  checkpoint TTL. **Nothing content-bearing is ever persisted to
  Supabase/Postgres** — no `PostgresSaver` for these graphs.
- Durable data stays in its existing homes (PreferencesStore, `user_knowledge`,
  pgvector `documents`, sender profiles in Redis with 90-day TTL) and is
  hydrated into state per run.

## 9. Job Bus

**Redis Streams** on the existing ioredis dependency: `XADD` to
`nexus:jobs:worker`, consumer group in `apps/worker` (`XREADGROUP`/`XACK`),
results on `nexus:results:{userId}` with a Voice Node subscriber. Chosen over
BullMQ because Upstash bills per command and BullMQ's polling is cost-hostile;
Streams are supported and cheap. Approval requests/resumes ride the same bus
(`ApprovalRequest` event; resume goes through `Command` on the checkpointed
thread).

---

## 10. Keep / Remove

### 10.1 KEEP

| Module                                                                                                                 | Role going forward                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/email-providers/` (all)                                                                                      | The Act substrate — wrapped as LangGraph tools, unchanged internally.                                                                                    |
| `packages/shared-types`, `logger`, `encryption`, `secure-storage`                                                      | Unchanged; shared-types gains `agent-jobs.ts` contracts.                                                                                                 |
| `intelligence/knowledge/`: `supabase-vector-store`, `rag-retriever`, `asset-*`, `csv-parser`, `pdf-extractor`          | RAG substrate, finally wired in via Graph A + `rag-retrieve` tool.                                                                                       |
| `intelligence/knowledge/sender-profile-store.ts`                                                                       | Feeds `hydrate_context`; updated by `observe`.                                                                                                           |
| `intelligence/knowledge/preferences-store.ts`                                                                          | Hydration source for `user_preferences`. (File-backed AES on EC2 is awkward — consolidating into Supabase `user_preferences` is a later, separate task.) |
| `livekit-agent/src/agent.ts`                                                                                           | Session wiring, VAD tuning (untouched per D1), events, greeting — slims down to Voice Node + graph dispatch.                                             |
| `livekit-agent/src/stt/*`, `tts/*`                                                                                     | Deepgram/ElevenLabs configs; `detectCommand`/`processTranscript` seed the intent gate; TTS text utils unchanged.                                         |
| `livekit-agent/src/prompts/`: `voice-utils`, `transition-generator`, `briefing-prompts`, `system-prompt`               | Transition templates become the ack/progression speech (triggered by explicit intents only, per D5). Persona/safety blocks survive.                      |
| `livekit-agent/src/briefing/`: `briefed-email-store`, `briefing-session-tracker`                                       | Store stays verbatim; tracker's cursor semantics move into `QueueCursor` + Voice Node.                                                                   |
| `livekit-agent/src/knowledge/`: `user-knowledge-store`, `summarize-knowledge`                                          | Unchanged; `recall_knowledge` upgraded to vector search.                                                                                                 |
| `livekit-agent/src/tools/email-tools.ts` + `knowledge-tools.ts` **executors**                                          | Kept, not rewritten — MOVED to `agent-graph/src/tools/` (§11); schemas convert to `tool()` + zod.                                                        |
| `livekit-agent/src/`: `email-bootstrap`, `config`, `health`, `session-store`, `main`                                   | Unchanged.                                                                                                                                               |
| `apps/api/` (all routes, auth, Redis libs, webhooks, stats cache)                                                      | Unchanged except `briefing-precompute.ts` (§10.2).                                                                                                       |
| `apps/mobile/`                                                                                                         | Untouched — same LiveKit room contract.                                                                                                                  |
| `supabase/migrations/`, `infra/terraform/`                                                                             | Keep; terraform gains the worker container + t3.medium (D3). Add the missing `user_knowledge` migration.                                                 |
| `presortEmails()` heuristic + preprocessor summary prompt (incl. the Task-4 rewrite in `voice_agent_bug_fix_tasks.md`) | Content reused inside Graph A nodes.                                                                                                                     |

### 10.2 REMOVE / DEPRECATE

| Module                                                                                          | Replaced by                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `livekit-agent/src/reasoning/reasoning-loop.ts` (1,413 lines)                                   | Graph B + Voice Node. History pruning → checkpointer; regex nav fallback → intent gate; `withRetry` → LangChain retries; `summarizeEmailForVoice` → `act`; `checkForNewEmails` polling → Graph A re-runs; execute-then-confirm → `interrupt()`. |
| `livekit-agent/src/llm/reasoning-llm.ts`                                                        | Thin `voice/voice-llm.ts` (streaming conversational turns, no tools). Delete the artificial 50 ms chunk delays.                                                                                                                                 |
| `livekit-agent/src/briefing-pipeline.ts`                                                        | Graph A nodes (fetch/filter/rules port 1:1).                                                                                                                                                                                                    |
| `livekit-agent/src/briefing/precomputed-loader.ts`                                              | Already dead (never called); session start reads the Graph A checkpoint.                                                                                                                                                                        |
| `intelligence/src/preprocessing/email-preprocessor.ts`                                          | `classify_sort` node (prompt + presort reused); remove after parity.                                                                                                                                                                            |
| `intelligence/src/session/`: `shadow-processor`, `drive-state`, `redis-session-store`           | Unused at runtime; superseded by graph state + checkpointer. The orphaned `DriveState` interface in shared-types (zero consumers) goes too.                                                                                                     |
| `intelligence/src/knowledge/email-summarizer.ts`, `feedback-learner.ts`                         | Unused; summarizer → worker node; feedback-learner's consumer (red-flag scorer) was deleted in `ebc2478`.                                                                                                                                       |
| `intelligence/src/knowledge/llm-client.ts`                                                      | Keep during migration (preprocessor uses it); deprecate once graphs own all LLM calls via `ChatOpenAI`.                                                                                                                                         |
| `apps/api/src/services/briefing-precompute.ts` (as-is)                                          | Rewritten to enqueue an `inbox_sort` job (fixes the Lambda-inline-LLM timeout risk). Route contract unchanged.                                                                                                                                  |
| `infra/k8s/livekit-agent/`                                                                      | Already declared abandoned in `infra/terraform/CLAUDE.md`.                                                                                                                                                                                      |
| Stray build artifacts in `src/`: `intelligence/src/**/*.js`, `shared-types/src/index.{js,d.ts}` | Delete.                                                                                                                                                                                                                                         |
| `docs/architecture/reasoning-architecture-analysis.md`                                          | Superseded by this document + a closing ADR in `design-decisions.md`.                                                                                                                                                                           |

---

## 11. Folder Reorganization

Dependency-direction decision: tool executors move OUT of `livekit-agent` into
`agent-graph`, so the worker never imports the LiveKit SDK and `livekit-agent`
depends on `agent-graph` — never the reverse.

```
packages/agent-graph/                     # NEW — @nexus-aec/agent-graph
  src/
    state/
      annotations.ts                      # InboxState, WorkerState
      inbox-queue.ts                      # InboxQueueItem + mergeByEmailId
      pending-actions.ts                  # PendingAction + upsert reducer
      user-preferences.ts                 # per-run hydration
    nodes/
      sorting/                            # fetch-inbox, apply-rules,
                                          # hydrate-context, classify-sort,
                                          # write-queue
      worker/                             # plan, act, observe,
                                          # request-approval, respond
    graphs/
      inbox-sorting.graph.ts
      react-worker.graph.ts
    tools/
      email-actions.ts                    # MOVED from livekit-agent email-tools
      knowledge-actions.ts                # MOVED; recall → RAGRetriever
      rag-retrieve.ts                     # LangChain tool over RAGRetriever
    checkpoint/
      redis-saver.ts                      # custom BaseCheckpointSaver (ioredis, TTL)
    bus/
      jobs.ts                             # Streams producer/consumer + approval events
    llm.ts                                # ChatOpenAI factory (retries, logger callbacks)

apps/worker/                              # NEW — @nexus-aec/worker (ships with Graph B, D2)
  src/main.ts                             # bus consumer, graph runner,
                                          # approval-expiry sweeper (D4)
  Dockerfile

packages/livekit-agent/                   # slimmed to voice I/O
  src/voice/                              # NEW
    intent-gate.ts                        # §4.4
    ack-templates.ts                      # extends transition-generator
    dispatcher.ts                         # enqueue, thread ids, cursor lock
    result-speaker.ts                     # §4.5
  src/llm/voice-llm.ts                    # replaces reasoning-llm.ts
  src/{stt,tts,prompts,briefing,knowledge}/  # unchanged

packages/shared-types/src/agent-jobs.ts   # AgentJob, AgentJobResult,
                                           # InboxQueueItem, PendingAction
```

Turborepo dependency order becomes:
`shared-types → encryption → logger → secure-storage → email-providers → intelligence → agent-graph → {livekit-agent, worker, api} → mobile`.

New dependencies: `@langchain/langgraph`, `@langchain/core`,
`@langchain/openai`, `zod`. No LangChain exists in the repo today — clean
addition. Watch `exactOptionalPropertyTypes` friction with LangChain generics
(real but minor).

---

## 12. Infra Changes

- EC2 `t3.small` → **`t3.medium`** (D3) in `modules/ec2-agent`.
- Second container on the host: `apps/worker` image (own Dockerfile, own ECR
  repo or tag), started by user-data / compose alongside the agent container.
  Reads the same agent secret (needs `OPENAI_API_KEY`, `REDIS_URL`,
  `SUPABASE_*`, Google/Microsoft client IDs for token refresh).
- API Lambda: `briefing-precompute` becomes enqueue-only; no timeout exposure.
- No LiveKit, mobile, or networking changes.

## 13. Migration Phases

Each phase ends with the full validation loop (`type-check` → `lint` →
`format:check` → `build` → filtered tests) plus a real voice-session smoke test
on device.

1. **Scaffold** — `packages/agent-graph`, shared-types contracts, Redis
   checkpoint saver, bus primitives. No behavior change.
2. **Graph A + worker container** — `apps/worker` ships now (hosts Graph A);
   `POST /briefing/precompute` → enqueue; session start reads the Graph A
   checkpoint (replacing the dead loader) with an in-process fallback run when
   stale (sorting is idempotent, so in-process is safe here). EC2 → t3.medium.
   Retire `email-preprocessor` after output parity is confirmed.
3. **Executor move** — email/knowledge tool executors into
   `agent-graph/src/tools/` with temporary re-exports from `livekit-agent`.
4. **Graph B + Voice Node** — react worker in `apps/worker`; intent gate,
   Universal Lock state machine, ack templates, result speaker, `voice-llm`.
   Swap `ReasoningLLM` → Voice Node behind an env flag (`NEXUS_GRAPH_MODE`) for
   per-room A/B. Retire the `ReasoningLoop` path once stable.
5. **Approvals** — `interrupt()` staging pattern (draft-first, gate the commit),
   worker expiry sweeper, Voice Node approval UX (D4).
6. **Cleanup** — delete everything in §10.2, add the `user_knowledge` migration,
   update `ARCHITECTURE.md` / workspace `CLAUDE.md` files, write the ADR, remove
   the stale analysis doc.

## 14. Behavior Changes vs Today (intentional, traceable to decisions)

1. **Post-action auto-advance is removed** (D5). Archiving an email no longer
   jumps to the next one; the agent confirms and waits for explicit progression.
   Transition templates fire only on progression intents.
2. **Confirmations gate execution** instead of following it (D4 +
   `interrupt()`); risky work is staged natively first.
3. **`go_deeper`/search leave the hot path** — instant ack, then 2–5 s of
   accepted silence while Graph B works (D5).
4. **Background work survives hangup** (D2); results may land only in the native
   inbox.
5. **New-email awareness** moves from a 60 s in-loop poll to Graph A re-runs;
   announcements happen only on queue updates and never interrupt mid-speech.
6. **Endpointing/VAD untouched** (D1) — the 800 ms budget starts at
   `transcript-final`.
7. **Topic-based narration is gone** (D7). Today's briefing groups emails into
   LLM topic clusters; the new briefing walks priority buckets (high → medium →
   low) with bucket-transition phrases instead of topic labels.

## 15. Non-Goals (explicitly out of scope)

- Push notifications / offline result replay on next session (native inbox is
  the record, per D2).
- Model changes (GPT-4o stays; only the Voice Node uses gpt-4o-mini).
- PreferencesStore → Supabase consolidation (flagged, separate task).
- Multi-host scale-out of the worker (single t3.medium hosts both).
- Mobile app changes.

## 16. Risks & Watch Items

- **Upstash command billing:** Streams consumers + checkpoint writes are
  per-command; keep `XREADGROUP` blocking with sane timeouts and checkpoint only
  at node boundaries (LangGraph default) — no super-steps with giant states.
- **Two containers on one host:** memory headroom on t3.medium should be
  monitored during the morning fan-out (Graph A `Send()` batches).
- **Interrupt/resume over voice:** users answer approvals in free-form speech;
  the APPROVAL_RESPONSE intent class must be forgiving ("yeah go ahead", "no,
  leave it").
- **Parity risk in Graph A:** priority/summary quality must match or beat the
  current preprocessor before it is deleted — compare on live inboxes behind the
  env flag.
- **`exactOptionalPropertyTypes`** with LangChain generics — expect a handful of
  conditional-spread shims.
