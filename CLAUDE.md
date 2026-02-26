# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

NexusAEC is a voice-driven AI executive assistant. It uses LiveKit for real-time
voice (STT via Deepgram, TTS via ElevenLabs, reasoning via GPT-4o), unified
email adapters (Gmail + Outlook), and a 3-tier memory model (in-memory → Redis →
Supabase vector store).

## Monorepo Structure

**Package manager:** pnpm 9.0.0 (required — never use npm or yarn) **Build
system:** Turborepo 2.0 **Node:** >=20.0.0 **TypeScript:** 5.4+ strict mode

```
apps/
  api/          — Fastify 5 backend (OAuth, LiveKit tokens, email stats, sync, briefing pre-computation)
  mobile/       — React Native iOS/Android with LiveKit voice
  desktop/      — Electron + React + Vite (draft review, settings sync)
packages/
  shared-types  — TypeScript interfaces for the monorepo (no deps, root of dep graph)
  encryption    — AES-256 encryption utilities
  secure-storage — Platform-agnostic secure storage abstraction
  logger        — Structured logging with PII filtering
  email-providers — Gmail/Outlook adapters, OAuth providers, token management
  intelligence  — Email preprocessing (LLM batched), sender profiles, red flags, knowledge base (Supabase vectors)
  livekit-agent — Voice agent: briefings, STT/TTS, GPT-4o reasoning loop
infra/          — Docker Compose (Redis, PostgreSQL/pgvector)
```

## Common Commands

```bash
# Development
pnpm --filter @nexus-aec/api dev          # API server (port 3000)
pnpm --filter @nexus-aec/mobile ios       # iOS app via Metro
pnpm --filter @nexus-aec/livekit-agent start:dev  # LiveKit agent (needs Node 20+)

# Build & verify
pnpm build                # Build all (Turborepo-ordered)
pnpm type-check           # TypeScript validation
pnpm lint                 # ESLint
pnpm lint:fix             # ESLint auto-fix
pnpm format:check         # Prettier check
pnpm format               # Prettier auto-format

# Testing (NEVER include desktop — no test files, hangs the runner)
pnpm --filter @nexus-aec/encryption --filter @nexus-aec/logger --filter @nexus-aec/secure-storage --filter @nexus-aec/intelligence --filter @nexus-aec/email-providers --filter @nexus-aec/livekit-agent --filter @nexus-aec/api test
pnpm --filter @nexus-aec/encryption test  # Single package
pnpm test:watch           # Watch mode

# Infrastructure
pnpm infra:up             # Start Redis + PostgreSQL
pnpm infra:up:tools       # Also start Redis Commander (8081) + pgAdmin (5050)
pnpm infra:down           # Stop services
pnpm infra:reset          # Reset all data and volumes
```

## Architecture

### API (apps/api)

- Entry: `src/index.ts` → `src/app.ts`
- Routes follow `registerXxxRoutes(app: FastifyInstance)` pattern in
  `src/routes/`
- Redis client (`src/lib/redis.ts`) is a singleton with graceful fallback
  (returns null if Redis unavailable)
- OAuth tokens stored via `FileTokenStorage` →
  `apps/api/.nexus-data/tokens.json`
- Briefing routes: `POST /briefing/precompute` (triggers background
  computation), `GET /briefing/status/:userId` (returns `{ ready, emailCount }`)
- Pre-computation service in `src/services/briefing-precompute.ts` — stores
  results in Redis with 30-min TTL, 15-min freshness window

### Email Providers (packages/email-providers)

- `EmailProvider` interface with Gmail and Outlook adapter implementations
- Gmail uses `gmailRequest<T>()`, Outlook uses `graphRequest<T>()` helper
  methods
- OAuth: `GoogleOAuthProvider` (requires `prompt: 'consent'` for refresh
  tokens), `MicrosoftOAuthProvider`
- Gmail adapter: `getProfileHistoryId()`, `fetchHistory()` for incremental sync
- Outlook adapter: `hasNewEmailsSince()` for polling

### LiveKit Agent (packages/livekit-agent)

- Voice sessions via LiveKit Room; STT (Deepgram Nova-2), TTS (ElevenLabs Turbo
  v2.5), VAD (Silero)
- Custom LLM wrapping GPT-4o in `src/llm/reasoning-llm.ts`
- LLMStream MUST push text in small sentence-sized chunks (not one giant chunk —
  stalls TTS)
- Briefing logic in `src/briefing/`, tools in `src/tools/`, prompts in
  `src/prompts/`
- Agent requires Node >=20: `PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`
- `go_deeper` uses `summarizeEmailForVoice()` (private method on
  `ReasoningLoop`) for clean LLM summaries instead of raw email text
- Template transitions in `src/prompts/transition-generator.ts` — eliminates
  follow-up LLM call per email (2→1 LLM calls per transition)
- Conditional tool inclusion during briefing: `callLLM()` sends only core tools
  (archive, mark_read, flag, create_draft, mute, batch_action, navigation,
  save_to_memory, recall_knowledge), saving ~130 tokens per call
- `batch_action` tool for bulk operations ("archive all LinkedIn", "mark all
  newsletters as read") — supports `archive`, `mark_read`, `flag` actions

#### Cross-Session Memory

The voice agent remembers user preferences, rules, and feedback across sessions
via a multi-layer persistence system:

- **Knowledge tools in briefing:** `save_to_memory` and `recall_knowledge` are
  in `BRIEFING_CORE_TOOLS`, so GPT-4o can save/recall during briefing mode.
- **`recall_knowledge` searches saved memory:** Keyword-matches the user's
  `KnowledgeDocument` entries. Falls back to returning all entries if no match
  (document is ≤30 entries). NOT a stub — fully functional.
- **Rule-based pipeline filtering:** `extractFilterRules()` in
  `briefing-pipeline.ts` parses `[rule]` knowledge entries for blocking patterns
  ("never show X", "skip all X", "block X") and filters emails by
  `blockedDomains` / `blockedKeywords` before briefing.
- **Knowledge loaded BEFORE pipeline:** `agent.ts` loads `knowledgeEntries`
  before calling `runBriefingPipeline()`, so rules are available for filtering.
  `knowledgeEntries` is passed into pipeline options.
- **Mute/VIP persistence:** `executeMuteSender` and `executePrioritizeVip` in
  `email-tools.ts` fire-and-forget persist to `PreferencesStore` via
  `setPreferencesStore()`. Wired in `agent.ts` after
  `initializeFromPreferences`.
- **Sender preferences in reasoning prompt:** `senderPreferences` from
  `SenderProfileStore.synthesizePreferences()` is injected into the system
  prompt's CURRENT CONTEXT section as "LEARNED SENDER PATTERNS".
- **Dual-write durability:** `UserKnowledgeStore.append()` uses
  `Promise.allSettled()` — succeeds if at least one backend writes.
  `writeToSupabase()` retries 2x with exponential backoff.

#### Design Motivations

Why the cross-session memory system works the way it does:

- **Redis race condition:** `lazyConnect` mode meant reads could fire before the
  connection completed. Solved by `connectPromise` + `waitForReady()` in
  `UserKnowledgeStore` — all reads/writes await the connection promise first.
- **Knowledge must load before pipeline:** Rules like "never show Quora emails"
  need to be available _before_ `runBriefingPipeline()` fetches and processes
  emails. `agent.ts` loads `knowledgeEntries` early so `extractFilterRules()`
  can apply them during pipeline execution, not after.
- **Dual-write for high availability:** A single backend failure (Redis down,
  Supabase timeout) shouldn't lose user knowledge. `Promise.allSettled()`
  succeeds if either backend writes. Supabase gets 2x retry with exponential
  backoff for transient failures.
- **Mute/VIP must survive reconnects:** Without persistence, a "mute this
  sender" command only lasted the current session. Fire-and-forget writes to
  `PreferencesStore` make them durable without blocking voice interaction.
- **`recall_knowledge` was a stub:** The tool existed but returned "no documents
  uploaded." Now it keyword-searches the user's `KnowledgeDocument` entries with
  a smart fallback (returns all entries if document is small, ≤30 entries).
- **Raw memory entries shouldn't be read verbatim:** After `recall_knowledge`
  executes, a follow-up `callLLM()` in `reasoning-loop.ts` lets GPT-4o
  synthesize findings into natural speech instead of reading
  `[rule] Never show Quora emails` verbatim.

### Briefing Pipeline

The briefing pipeline (`src/briefing/briefing-pipeline.ts`) has dual mode:

- **LLM path** (when `apiKey` provided): Uses `EmailPreprocessor` from
  `@nexus-aec/intelligence` for batched GPT-4o preprocessing. Emails split into
  batches of 25; Batch 1 processed synchronously, remaining batches processed in
  background. Priority ordering: HIGH → MEDIUM → LOW.
- **Legacy fallback** (no `apiKey` or LLM failure): Uses `RedFlagScorer` +
  `KeywordMatcher` + `VipDetector` + `TopicClusterer`. Always test both paths.
- **24-hour fetch window:** Only processes last 24 hours of unread emails.
- **Progressive loading:** `BriefingSessionTracker.addTopics()` merges
  background batch results into the active session. `ReasoningLoop` can inject
  system alerts for high-priority finds from later batches.
- **Pre-computation:** `precomputed-loader.ts` checks Redis for cached Batch 1
  results — uses cache if <15 min old, otherwise runs fresh.
- **Dynamic context:** `buildCursorContext()` generates per-call system messages
  with current email position, topic progress, and priority.
  `buildCompactEmailReference()` shows current topic in detail, others as
  one-line summaries.

#### Personalization

- **SenderProfileStore**
  (`packages/intelligence/src/knowledge/sender-profile-store.ts`): Redis-backed
  per-sender engagement tracking with 90-day TTL.
- Key pattern: `nexus:sender:{userId}:{sha256[:16]}` (first 16 chars of SHA-256
  of lowercase sender email).
- Tracks: `archived`, `flagged`, `replied`, `deeperViewed`, `markRead`,
  `skipped` action counts + priority mismatch feedback.
- `synthesizePreferences()` generates natural language injected into the LLM
  preprocessing prompt (requires ≥3 interactions per sender).
- Fire-and-forget tracking in `BriefingSessionTracker`: `markActioned()`,
  `markSkipped()`, `markBriefed()` — maps tool names to profile actions via
  `mapToolToProfileAction()`.
- `BriefedEmailStore` (`src/briefing/briefed-email-store.ts`): Redis hash per
  user tracking briefed/actioned/skipped emails (7-day TTL). Skipped emails
  re-appear in future sessions.

### 3-Tier Memory

- **Tier 1 (Ephemeral):** In-memory, per-session only
- **Tier 2 (Session):** Redis on port 6379 (`infra/docker-compose.yml`)
- **Tier 3 (Knowledge):** Supabase + pgvector for vector search
- **PRD Rule 60:** Email content must NOT persist beyond active session. Only
  metadata (sender, subject, timestamp, thread ID) may be cached.
- **Redis schemas:** `nexus:sender:{userId}:{hash}` (sender profiles, 90-day
  TTL), `nexus:prebriefing:{userId}` (pre-computed briefing cache, 30-min TTL),
  `nexus:briefed:{userId}` (briefed email records, 7-day TTL),
  `nexus:knowledge:{userId}` (user knowledge document, no TTL)

### Mobile (apps/mobile)

- React Native 0.74 with `@livekit/react-native` +
  `@livekit/react-native-webrtc`
- iOS Simulator CANNOT render WebRTC audio — must test on physical device
- Screens in `src/screens/main/`, use `useFocusEffect` for refetch on screen
  focus

## Code Conventions

- **Imports:** Ordered by group (builtin → external → internal → parent/sibling
  → index → type) with newlines between, alphabetized. Use `@nexus-aec/*`
  workspace imports.
- **Dependencies:** Always use `workspace:*` protocol for internal deps.
- **Logging:** Use `@nexus-aec/logger` — no `console.log` (only
  `console.warn`/`console.error` allowed).
- **Unused vars:** Prefix with `_` to satisfy
  `@typescript-eslint/no-unused-vars`.
- **Floating promises:** `@typescript-eslint/no-floating-promises` is `error` —
  always await or void.
- **Tests:** Co-located (`foo.ts` → `foo.test.ts`), Jest with ts-jest, AAA
  pattern (Arrange/Act/Assert).
- **Commits:** `feat|fix|refactor|test|docs|chore(scope): description` — scope
  is package name without `@nexus-aec/` prefix.
- **Prettier:** 2-space indent, single quotes, semicolons, 100 char width,
  trailing commas (es5).

## Build & Validation Loop

When making code changes, ALWAYS follow this loop before considering a task
complete:

1. **Type Check:** `pnpm type-check` — fix ALL TypeScript errors before
   proceeding.
2. **Lint:** `pnpm lint` — use `pnpm lint:fix` for auto-fixable issues first,
   then fix remaining manually.
3. **Format:** `pnpm format:check` — run `pnpm format` if format errors exist.
4. **Build:** `pnpm build` — Turborepo will surface dependency order issues
   here.
5. **Tests:** Run tests for all packages EXCEPT desktop (no test files, hangs
   the runner). Use explicit filters:
   `pnpm --filter @nexus-aec/encryption --filter @nexus-aec/logger --filter @nexus-aec/secure-storage --filter @nexus-aec/intelligence --filter @nexus-aec/email-providers --filter @nexus-aec/livekit-agent --filter @nexus-aec/api test`
   All tests must pass. Fix the code, not the tests (unless the test itself is
   wrong). **NEVER include `@nexus-aec/desktop`** — only if explicitly asked.

**Loop rule:** If any step fails → fix → restart from step 1. Do not skip steps
or proceed with known failures.

**Pre-existing test failures:** Do NOT ignore pre-existing test failures. If a
test was already failing before your changes (e.g., the ElevenLabs defaults test
in `packages/livekit-agent/tests/config.test.ts`), fix it as part of your
current work. All tests must pass — zero tolerance for known failures.

**Commit gate:** Only commit when steps 1–5 are all clean.

### Package-Specific Validation Gotchas

- **desktop:** Has NO test files — `pnpm test` hangs indefinitely if desktop is
  included. Always use explicit `--filter` flags listing only testable packages.
- **livekit-agent:** Must use Node 20 —
  `PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"` before running.
- **mobile:** React Native type errors may require Metro cache clear —
  `pnpm --filter @nexus-aec/mobile start --reset-cache`.
- **email-providers:** OAuth flows cannot be unit tested — validate via API
  integration test manually.
- **shared-types:** Any change here requires full monorepo rebuild — always run
  `pnpm build` from root.

## Key Gotchas

- LiveKit Room is persistent via `useState(() => new Room())` — never attach
  event listeners in `connect()`, use a `useEffect` that runs once.
- iOS audio: must call
  `AudioSession.setAppleAudioConfiguration({ audioCategory: 'playAndRecord' })`
  BEFORE `startAudioSession()`. Never return `soloAmbient` — it kills WebRTC
  audio.
- `AudioSession.configureAudio` should be called once on mount, not every
  connect. `startAudioSession`/`stopAudioSession` go in connect/disconnect.
- In React Native, `@livekit/react-native-webrtc` plays subscribed audio
  automatically — no `RoomAudioRenderer` needed (that's web-only).
- SDK "event listener wasn't added" warning is cosmetic from internal WebRTC —
  cannot be fixed.
- SDK uses fire-and-forget Promises — add
  `process.on('unhandledRejection', ...)` in agent `main.ts`.
- `exactOptionalPropertyTypes` is enabled — use conditional spread
  `...(val ? { key: val } : {})` for optional fields, never assign `undefined`
  directly.
- `briefing-pipeline.ts` has dual mode: LLM path (with `apiKey`) and legacy
  fallback — always test both paths when modifying briefing logic.
- `RedFlagScore` interface uses `signalBreakdown` (not `contributions`) and
  `severity` field (can be `null` when below threshold).
- `ScoringReason` uses `description` (not `reason`) for the human-readable
  explanation field.
- `UserKnowledgeStore` uses `lazyConnect` Redis — always call `waitForReady()`
  before any read/write operation, or reads will race against the connection and
  silently return empty results.
