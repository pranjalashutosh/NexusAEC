# packages/livekit-agent — Voice agent

Global rules: root `CLAUDE.md`. Architecture: `docs/architecture/voice-stack.md`
(voice pipeline), `docs/architecture/reasoning-architecture-analysis.md`
(pre-computed vs real-time reasoning), `docs/architecture/design-decisions.md`
ADR-8 (dual-write, Redis race conditions, memory loading order).

**Run:** `pnpm --filter @nexus-aec/livekit-agent start:dev`

**Requires Node >=20** — prepend
`PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"` before any command (dev,
build, test).

## Reasoning loop & LLM

- Custom LLM wrapping GPT-4o in `src/llm/reasoning-llm.ts`.
- **LLMStream MUST push text in small, sentence-sized chunks** — one giant chunk
  stalls TTS.
- The SDK uses fire-and-forget Promises — add
  `process.on('unhandledRejection', ...)` in `main.ts`.
- Layout: briefing logic in `src/briefing/` (pipeline at
  `src/briefing-pipeline.ts`), tools in `src/tools/`, prompts in `src/prompts/`.

## Briefing tools & transitions

- During briefing, `callLLM()` sends only core tools (archive, mark_read, flag,
  create_draft, mute, batch_action, navigation, save_to_memory,
  recall_knowledge) — saves ~130 tokens per call.
- `batch_action` handles bulk ops ("archive all LinkedIn", "mark all newsletters
  as read") — supports `archive`, `mark_read`, `flag`.
- `go_deeper` uses `summarizeEmailForVoice()` (private on `ReasoningLoop`) for
  clean summaries instead of raw email text.
- Template transitions in `src/prompts/transition-generator.ts` eliminate the
  follow-up LLM call per email (2 → 1 LLM calls per transition).

## Voice quality (natural TTS output)

- `cleanSubjectForVoice()` (`src/prompts/voice-utils.ts`): strips URLs, email
  addresses, domain suffixes, tracking IDs (`[JIRA-123]`); converts `$N` → "N
  dollars" and `%` → "percent"; collapses whitespace. Used by
  `buildCursorContext()`, `buildCompactEmailReference()`, and the
  `transition-generator.ts` fallback path.
- Cursor context prefers LLM summaries: shows the summary as primary and marks
  the raw subject "reference only, do NOT read aloud"; falls back to
  `cleanSubjectForVoice()` on the raw subject when no summary exists.
- Both the cursor-context NEXT instruction and `BRIEFING_INSTRUCTIONS`
  (`system-prompt.ts`) tell GPT-4o to mention priority levels naturally and
  never read subjects verbatim.
- The agent stores priority counts in Redis (after the initial pipeline and each
  background batch) so the mobile app can display them.

## Briefing pipeline (`src/briefing-pipeline.ts`) — LLM-only

- **LLM path** (when `apiKey` is provided): uses `EmailPreprocessor` from
  `@nexus-aec/intelligence`, batches of 25; Batch 1 synchronous, the rest in the
  background. Priority order HIGH → MEDIUM → LOW. Per-email `priority` +
  `summary` flow straight through to `ScoredEmail` (no separate scoring step).
- **No `apiKey` or LLM failure:** returns an **empty briefing** (logged as a
  warning) — there is no rule-based fallback.
- 24-hour fetch window (unread emails only).
- Progressive loading: `BriefingSessionTracker.addTopics()` merges background
  batch results into the active session; `ReasoningLoop` can inject system
  alerts for high-priority finds from later batches.
- Pre-computation: `precomputed-loader.ts` uses the Redis-cached Batch 1 if it
  is <15 min old, otherwise runs fresh.
- Dynamic context: `buildCursorContext()` emits per-call system messages
  (current position, topic progress, priority); `buildCompactEmailReference()`
  shows the current topic in detail and others as one-line summaries.

## Cross-session memory

- `save_to_memory` + `recall_knowledge` are in `BRIEFING_CORE_TOOLS` (usable
  during briefing). `recall_knowledge` keyword-matches the user's
  `KnowledgeDocument`, falling back to all entries (the document is ≤30). It is
  not a stub — fully functional.
- Rule-based filtering: `extractFilterRules()` in `briefing-pipeline.ts` parses
  `[rule]` entries ("never show X" / "skip all X" / "block X") into
  `blockedDomains` / `blockedKeywords`, applied before briefing. `agent.ts`
  loads `knowledgeEntries` BEFORE calling `runBriefingPipeline()` so rules are
  available for filtering.
- Mute / VIP: `executeMuteSender` + `executePrioritizeVip`
  (`src/tools/email-tools.ts`) fire-and-forget persist to `PreferencesStore` via
  `setPreferencesStore()` (wired in `agent.ts` after
  `initializeFromPreferences`).
- `UserKnowledgeStore` (`src/knowledge/user-knowledge-store.ts`) uses
  `lazyConnect` Redis — **always `await waitForReady()`** before any read/write,
  or reads race the connection and silently return empty results. `append()`
  uses `Promise.allSettled()` (succeeds if ≥1 backend writes);
  `writeToSupabase()` retries 2× with exponential backoff.
- `BriefedEmailStore` (`src/briefing/briefed-email-store.ts`): a Redis hash per
  user tracking briefed / actioned / skipped emails (7-day TTL). Skipped emails
  re-appear in future sessions. Tracking is fire-and-forget via
  `BriefingSessionTracker` (`markActioned()` / `markSkipped()` / `markBriefed()`
  → `mapToolToProfileAction()`).

> Sender-learning internals (`SenderProfileStore`, `synthesizePreferences()`)
> live in `packages/intelligence` — see its `CLAUDE.md`.
