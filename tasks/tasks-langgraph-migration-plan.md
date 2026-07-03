# Task List: LangGraph Migration (Voice Node + Background Graphs)

> Generated from: `docs/architecture/langgraph-migration-plan.md` (master plan).
> Decisions D1–D6 in the plan's §1 are locked — tasks below implement them, they
> do not reopen them. Phase N here = plan §13 phase N.

---

## Relevant Files

### New — `packages/agent-graph/` (@nexus-aec/agent-graph)

- `package.json` / `tsconfig.json` / `jest.config.js` - Package skeleton;
  workspace deps on shared-types, logger, email-providers, intelligence; new
  deps `@langchain/langgraph`, `@langchain/core`, `@langchain/openai`, `zod`
- `src/state/annotations.ts` - `InboxState` + `WorkerState` `Annotation.Root`
  definitions (plan §7)
- `src/state/inbox-queue.ts` - `InboxQueueItem` helpers + `mergeByEmailId`
  reducer
- `src/state/pending-actions.ts` - `PendingAction` helpers + `upsertById`
  reducer
- `src/state/user-preferences.ts` - Per-run hydration from PreferencesStore +
  UserKnowledgeStore + SenderProfileStore
- `src/checkpoint/redis-saver.ts` - Custom `BaseCheckpointSaver` over ioredis
  (plain GET/SET/EXPIRE — Upstash-safe), key `nexus:graph:{thread_id}`, 24h TTL
- `src/bus/jobs.ts` - Redis Streams job bus: `nexus:jobs:worker` producer,
  consumer-group helpers, `nexus:results:{userId}` publisher, ApprovalRequest
  events
- `src/llm.ts` - `ChatOpenAI` factory (retries, logger callbacks)
- `src/nodes/sorting/fetch-inbox.ts` - Paginated 24h unread fetch (ports
  `briefing-pipeline.ts` §1)
- `src/nodes/sorting/apply-rules.ts` - Briefed-ID exclusion, mutes, `[rule]`
  filters (ports `extractFilterRules`)
- `src/nodes/sorting/hydrate-context.ts` - `Send()` fan-out: sender profiles +
  `RAGRetriever` per batch of 25
- `src/nodes/sorting/classify-sort.ts` - Structured-output classify — flat
  priority + summary, NO clustering (D7); ports preprocessor prompt minus its
  CLUSTER step, keeps the 6–14-word summary rules
- `src/nodes/sorting/write-queue.ts` - `inbox_queue` commit + priority-counts
  mirror + queue-updated event
- `src/graphs/inbox-sorting.graph.ts` - Graph A wiring,
  `thread_id = inbox:{userId}`
- `src/nodes/worker/plan.ts` - GPT-4o planning node
- `src/nodes/worker/act.ts` - Single-tool execution (ToolNode, bounded retries,
  per-job credentials from RedisTokenStorage)
- `src/nodes/worker/observe.ts` - Result validation, queue status updates,
  sender-profile feedback
- `src/nodes/worker/request-approval.ts` - `interrupt()` gate with `expiresAt`
  (Phase 5)
- `src/nodes/worker/respond.ts` - voiceSummary composition + result publish
- `src/graphs/react-worker.graph.ts` - Graph B wiring,
  `thread_id = task:{userId}:{taskId}`
- `src/tools/email-actions.ts` - Executors MOVED from livekit-agent
  `email-tools.ts` (injected services, no module globals)
- `src/tools/knowledge-actions.ts` - save/recall MOVED; recall upgraded to
  vector search
- `src/tools/rag-retrieve.ts` - LangChain `tool()` over `RAGRetriever`
- Co-located `*.test.ts` for every file above

### New — `apps/worker/` (@nexus-aec/worker)

- `package.json` / `tsconfig.json` - Worker runtime package (depends on
  agent-graph; never on livekit-agent)
- `src/main.ts` - Bus consumer loop → graph runner; approval-expiry sweeper
  (Phase 5); graceful shutdown; `unhandledRejection` handler
- `Dockerfile` - Second container on the agent EC2 host

### New — `packages/livekit-agent/src/voice/`

- `intent-gate.ts` - Deterministic intent classes (plan §4.4) extending
  `detectCommand()`; gpt-4o-mini fallback classify
- `ack-templates.ts` - Instant acks + mandatory follow-up prompts (extends
  `transition-generator.ts`)
- `dispatcher.ts` - Universal Lock management (`cursor.locked`, `focusEmailId`),
  job enqueue, thread ids
- `result-speaker.ts` - Bus subscriber → `session.say()`; hold while user
  speaks; drop when no session (D2)
- `../llm/voice-llm.ts` - Streaming gpt-4o-mini conversational LLM (no tools);
  replaces `reasoning-llm.ts`

### Modified

- `packages/shared-types/src/agent-jobs.ts` (new) + `src/index.ts` - Wire
  contracts: `AgentJob`, `AgentJobResult`, `InboxQueueItem`, `PendingAction`,
  `QueueCursor`
- `apps/api/src/services/briefing-precompute.ts` - Inline LLM run → enqueue
  `inbox_sort` job (route contract unchanged)
- `apps/api/src/routes/briefing.ts` - Status endpoint reads Graph A checkpoint /
  priority-counts mirror
- `packages/livekit-agent/src/agent.ts` - Session start reads Graph A
  checkpoint; `NEXUS_GRAPH_MODE` flag selects Voice Node vs legacy loop
- `infra/terraform/modules/ec2-agent/` - t3.small → t3.medium (D3); user-data
  starts the worker container
- `infra/terraform/scripts/build-worker-image.sh` (new) - Worker image build +
  ECR push
- `supabase/migrations/` - New migration capturing the manually created
  `user_knowledge` table

### Deleted (Phase 6 only — see plan §10.2)

- `packages/livekit-agent/src/reasoning/reasoning-loop.ts`,
  `src/llm/reasoning-llm.ts`, `src/briefing-pipeline.ts`,
  `src/briefing/precomputed-loader.ts`
- `packages/intelligence/src/preprocessing/email-preprocessor.ts`,
  `src/session/*` (shadow-processor, drive-state, redis-session-store),
  `src/knowledge/email-summarizer.ts`, `src/knowledge/feedback-learner.ts`,
  `src/knowledge/llm-client.ts` (if no consumers remain)
- `DriveState` interface in `packages/shared-types/src/index.ts`
- Stray build artifacts: `packages/intelligence/src/**/*.js`,
  `packages/shared-types/src/index.{js,d.ts}`
- `infra/k8s/livekit-agent/`,
  `docs/architecture/reasoning-architecture-analysis.md`

### Notes

- Every phase gates on the root `CLAUDE.md` Build & Validation Loop
  (`type-check` → `lint` → `format:check` → `build` → filtered tests) plus the
  phase's device smoke test. Zero tolerance for failures.
- Tests are co-located (`foo.ts` → `foo.test.ts`), Jest + ts-jest, AAA pattern.
  Redis-backed units use `ioredis-mock` (pattern exists in intelligence).
- `shared-types` is the dependency-graph root — any change there requires a full
  `pnpm build` from root.

---

## Tasks

- [ ] **1.0 Phase 1 — Scaffold (`agent-graph`, contracts, checkpointer, bus; no
      behavior change)**
  - [ ] 1.1 Create `packages/agent-graph` skeleton: `package.json`
        (`workspace:*` deps: shared-types, logger, email-providers,
        intelligence; deps: `@langchain/langgraph`, `@langchain/core`,
        `@langchain/openai`, `zod`, `ioredis`), strict `tsconfig.json`,
        `jest.config.js`, empty `src/index.ts`
  - [ ] 1.2 Run `pnpm build` from root and confirm Turborepo orders agent-graph
        between intelligence and livekit-agent
  - [ ] 1.3 Add `packages/shared-types/src/agent-jobs.ts` with `AgentJob`,
        `AgentJobResult`, `InboxQueueItem`, `PendingAction`, `QueueCursor` (plan
        §7 — jobs carry NO tokens; NO `clusterLabel` on `InboxQueueItem`;
        `QueueCursor` anchors on `currentEmailId` with priority-only ordering,
        D7); export from `index.ts`; full root rebuild
  - [ ] 1.4 Implement `src/state/annotations.ts` — `InboxState` (`userId`,
        `inbox_queue`, `user_preferences`, `retrieval_context`, `cursor`) and
        `WorkerState` (`MessagesAnnotation` + `task`, `plan`, `pending_actions`,
        `observations`, `outcome`)
  - [ ] 1.5 Implement `src/state/inbox-queue.ts` — `mergeByEmailId` reducer
        (merge, status upsert, priority ordering) + tests
  - [ ] 1.6 Implement `src/state/pending-actions.ts` — `upsertById` reducer +
        tests
  - [ ] 1.7 Implement `src/state/user-preferences.ts` — hydration from
        `PreferencesStore` + `UserKnowledgeStore` +
        `SenderProfileStore.synthesizePreferences()` + tests (ioredis-mock)
  - [ ] 1.8 Implement `src/checkpoint/redis-saver.ts` — `BaseCheckpointSaver`
        (`getTuple`/`put`/`putWrites`/`list`) over ioredis, key
        `nexus:graph:{thread_id}`, 24h TTL, plain commands only (Upstash-safe,
        plan §8) + tests
  - [ ] 1.9 Implement `src/bus/jobs.ts` — `XADD` producer to
        `nexus:jobs:worker`, consumer-group helpers (`XREADGROUP`/`XACK` with
        blocking reads + sane timeouts, plan §16), result publisher to
        `nexus:results:{userId}`, `ApprovalRequest` event shape + tests
  - [ ] 1.10 Implement `src/llm.ts` — `ChatOpenAI` factory (model, retries,
        logger callbacks); resolve any `exactOptionalPropertyTypes` friction
        here once
  - [ ] 1.11 Validation loop clean (no runtime behavior change expected)

- [ ] **2.0 Phase 2 — Graph A (`inbox_sorting`) + `apps/worker` container**
  - [ ] 2.1 Implement `nodes/sorting/fetch-inbox.ts` — port pagination (50/page,
        max 10 pages / 500 emails), 24h unread window from
        `briefing-pipeline.ts`; reuse `presortEmails()` ordering + tests
  - [ ] 2.2 Implement `nodes/sorting/apply-rules.ts` — port briefed-ID exclusion
        (`BriefedEmailStore`), muted senders, and `extractFilterRules` `[rule]`
        parsing + tests
  - [ ] 2.3 Implement `nodes/sorting/hydrate-context.ts` — `Send()` fan-out per
        batch of 25: `SenderProfileStore.get(sender)` +
        `RAGRetriever.retrieve(subject + snippet)`; graceful skip when
        Supabase/Redis unavailable + tests
  - [ ] 2.4 Implement `nodes/sorting/classify-sort.ts` — zod structured-output
        classify emitting flat per-email `{ emailId, priority, summary }` — NO
        clustering (D7); port the preprocessor prompt minus its CLUSTER step,
        keeping the 6–14-word spoken-intent summary rules + tests (mocked LLM,
        malformed-JSON fallback keeps summary empty — never the raw subject)
  - [ ] 2.5 Implement `nodes/sorting/write-queue.ts` — commit `inbox_queue`
        (priority-ordered), mirror `nexus:priority-counts:{userId}` (30-min
        TTL), publish queue-updated event when a session is live + tests
  - [ ] 2.6 Implement `graphs/inbox-sorting.graph.ts` — node wiring +
        conditional batch loop (progressive), Redis checkpointer,
        `thread_id = inbox:{userId}`; idempotent re-run test
  - [ ] 2.7 Create `apps/worker`: `package.json`, `src/main.ts` (consumer-group
        loop → run graphs, graceful shutdown, `unhandledRejection` handler),
        `Dockerfile`
  - [ ] 2.8 Rewrite `apps/api/src/services/briefing-precompute.ts` → enqueue
        `inbox_sort` (POST `/briefing/precompute` contract unchanged); point GET
        `/briefing/status/:userId` at the Graph A checkpoint / priority-counts
        mirror; update route tests
  - [ ] 2.9 Update `agent.ts` session start: read the Graph A checkpoint
        (replaces the dead `precomputed-loader.ts` path); run Graph A in-process
        as fallback when checkpoint is stale (>15 min); keep the legacy
        `runBriefingPipeline` path behind an env flag until 2.10 passes
  - [ ] 2.10 Parity check on the dev test account: legacy preprocessor vs Graph
        A on the same live inbox — priorities/summaries must match or beat
        quality before flipping the default (deletion waits for Phase 6)
  - [ ] 2.11 Terraform: `modules/ec2-agent` instance type → **t3.medium** (D3);
        add worker image build script
        (`infra/terraform/scripts/build-worker-image.sh`), ECR repo/tag, and
        user-data change to start both containers
  - [ ] 2.12 Device smoke: voice session serves the briefing from the Graph A
        queue; priority counts appear in the mobile app
  - [ ] 2.13 Validation loop clean

- [ ] **3.0 Phase 3 — Move tool executors into `agent-graph`**
  - [ ] 3.1 Move `email-tools.ts` executor logic →
        `agent-graph/src/tools/email-actions.ts`; replace module-global
        registries (`getInboxService`, `setPreferencesStore`) with an injected
        services context (the worker builds adapters per job from
        `RedisTokenStorage`, plan §6.2)
  - [ ] 3.2 Move `knowledge-tools.ts` executors → `tools/knowledge-actions.ts`;
        upgrade `recall_knowledge` to `RAGRetriever` vector search with keyword
        fallback
  - [ ] 3.3 Implement `tools/rag-retrieve.ts` — LangChain `tool()` over
        `RAGRetriever`
  - [ ] 3.4 Convert all OpenAI JSON tool schemas → `tool()` + zod (preserve
        names, descriptions, riskLevel metadata, undo-stack behavior)
  - [ ] 3.5 Add temporary re-exports in `livekit-agent/src/tools/*` so the
        legacy `ReasoningLoop` keeps compiling until the Phase 4 flag flip
  - [ ] 3.6 Move co-located tests with the code; validation loop clean

- [ ] **4.0 Phase 4 — Graph B (`react_worker`) + Voice Node behind
      `NEXUS_GRAPH_MODE`**
  - [ ] 4.1 Implement `nodes/worker/plan.ts` — GPT-4o: task + `inbox_queue`
        slice + `user_preferences` → `PlanStep[]` or direct tool call + tests
        (mocked LLM)
  - [ ] 4.2 Implement `nodes/worker/act.ts` — single-tool execution (ToolNode,
        bounded retries); per-job Gmail/Outlook adapters from
        `RedisTokenStorage` (dev: `FileTokenStorage`) + tests
  - [ ] 4.3 Implement `nodes/worker/observe.ts` — validate `ToolResult`, append
        observation, update `inbox_queue` statuses (markActioned semantics),
        feed `SenderProfileStore` + tests
  - [ ] 4.4 Implement `nodes/worker/respond.ts` — ≤2-sentence `voiceSummary`
        (template first, LLM only when composing), publish `AgentJobResult`,
        update `BriefedEmailStore` + tests
  - [ ] 4.5 Implement `graphs/react-worker.graph.ts` — plan → act → observe with
        conditional routes (retryable error → act, incomplete → plan, done →
        respond), `thread_id = task:{userId}:{taskId}`. Interim: `batch_action`
        keeps today's confirmation semantics (replaced by `interrupt()` in
        Phase 5)
  - [ ] 4.6 Implement `voice/intent-gate.ts` — deterministic classes per plan
        §4.4 (PROGRESSION / ACTION / QUESTION_STATE / QUESTION_DATA /
        APPROVAL_RESPONSE / STOP / AMBIGUOUS) extending `detectCommand()`;
        gpt-4o-mini fallback classify; exhaustive unit tests incl. the §4.2.5
        phrase mapping (`next`/`skip`/`move on` increment; `continue`/`go back`
        resume at frozen position)
  - [ ] 4.7 Implement `voice/ack-templates.ts` — instant acks + the mandatory
        post-delivery prompts ("Does that answer your question?", "Task complete
        — shall we return to the briefing?") + priority-bucket transitions
        ("That's everything high-priority — moving to medium", D7) extending
        `transition-generator.ts`
  - [ ] 4.8 Implement `voice/dispatcher.ts` — Universal Lock management
        (`cursor.locked`, `lockReason`, `focusEmailId`), `AgentJob` enqueue,
        thread-id assignment
  - [ ] 4.9 Implement `voice/result-speaker.ts` — bus subscriber; hold while
        user is speaking; `session.say(voiceSummary)` + follow-up prompt; drop
        results when no live session (D2)
  - [ ] 4.10 Implement `llm/voice-llm.ts` — streaming gpt-4o-mini conversational
        turns (no tools, `inbox_queue` context, deterministic prompt suffix); no
        artificial 50 ms chunk delays
  - [ ] 4.11 Implement cursor persistence — Voice Node is the sole writer of
        `QueueCursor` on the `inbox:{userId}` thread state (read on session
        start, write on advance/lock/unlock)
  - [ ] 4.12 Implement the Voice Node state machine (plan §4.3: IDLE / BRIEFING
        / LOCKED_WAIT / LOCKED_FOCUS / AWAITING_APPROVAL) + unit tests: never
        auto-advance after delivery; lock on ANY non-progression intent; resume
        from the exact frozen position
  - [ ] 4.13 Wire `NEXUS_GRAPH_MODE` in `agent.ts` — per-room A/B between legacy
        `ReasoningLLM` and the Voice Node
  - [ ] 4.14 Device smoke (graph mode): full briefing; mid-narration question →
        lock → answer → explicit "next" resumes; out-of-queue search → context
        lock → "draft a reply to it" → explicit resume returns to the frozen
        cursor; ack latency <800 ms from transcript-final (D1); hang up mid-task
        → draft appears natively in Gmail (D2)
  - [ ] 4.15 Validation loop clean; flip `NEXUS_GRAPH_MODE` default once stable
- [ ] **5.0 Phase 5 — Approvals (`interrupt()` + 60 s expiry)**
  - [ ] 5.1 Implement `nodes/worker/request-approval.ts` —
        `interrupt({ pendingAction, expiresAt: now + 60s })`; wire
        stage-then-gate routing in `plan`/graph (e.g. `create_draft` executes
        BEFORE the gate so timeouts lose nothing, D4)
  - [ ] 5.2 Implement the approval-expiry sweeper in `apps/worker/src/main.ts` —
        scan parked runs, resume with `{ approved: false, reason: 'timeout' }`
        at expiry (authoritative — must work with no live session)
  - [ ] 5.3 Wire `ApprovalRequest` over the bus + Voice Node AWAITING_APPROVAL
        handling (speak confirmation prompt, 60 s UX timer → idle listening,
        cursor stays frozen)
  - [ ] 5.4 Add APPROVAL_RESPONSE intent phrases (forgiving: "yeah go ahead",
        "no, leave it") + tests
  - [ ] 5.5 Move `batch_action > N` from confirm-after to interrupt-before;
        delete the execute-then-confirm path in the new code
  - [ ] 5.6 Tests: approve / reject / timeout-with-live-session /
        timeout-after-hangup (staged draft survives in the drafts folder)
  - [ ] 5.7 Validation loop clean + device smoke of one full approval round-trip
        (incl. a timeout)

- [ ] **6.0 Phase 6 — Cleanup, migration capture, docs**
  - [ ] 6.1 Delete `livekit-agent`: `reasoning/reasoning-loop.ts`,
        `llm/reasoning-llm.ts`, `briefing-pipeline.ts`,
        `briefing/precomputed-loader.ts` (+ their tests and the Phase 3
        re-export shims)
  - [ ] 6.2 Delete `intelligence`: `preprocessing/email-preprocessor.ts`,
        `session/shadow-processor.ts`, `session/drive-state.ts`,
        `session/redis-session-store.ts`, `knowledge/email-summarizer.ts`,
        `knowledge/feedback-learner.ts`; delete `knowledge/llm-client.ts` if no
        consumers remain; prune `src/index.ts` exports accordingly
  - [ ] 6.3 Remove the orphaned `DriveState` interface from
        `shared-types/src/index.ts` (re-verify zero consumers first)
  - [ ] 6.4 Delete stray build artifacts inside `src/`:
        `packages/intelligence/src/**/*.js`,
        `packages/shared-types/src/index.{js,d.ts}`
  - [ ] 6.5 Delete `infra/k8s/livekit-agent/`
  - [ ] 6.6 Add the Supabase migration capturing the manually created
        `user_knowledge` table
  - [ ] 6.7 Docs: update `ARCHITECTURE.md` (system diagram + dependency order
        with agent-graph/worker); root `CLAUDE.md` (Monorepo Structure + Local
        Context Map rows); new `CLAUDE.md` for `packages/agent-graph` and
        `apps/worker`; update `packages/livekit-agent/CLAUDE.md`,
        `packages/intelligence/CLAUDE.md`, `apps/api/CLAUDE.md`;
        `docs/architecture/memory-model.md` Redis key patterns (`nexus:graph:*`,
        `nexus:jobs:*`, `nexus:results:*`)
  - [ ] 6.8 Add the closing ADR to `docs/architecture/design-decisions.md`
        (D1–D6 rationale); delete the superseded
        `docs/architecture/reasoning-architecture-analysis.md`
  - [ ] 6.9 Final validation loop + full regression smoke on device (both
        AirPods and speakerphone, per the existing test protocol)
