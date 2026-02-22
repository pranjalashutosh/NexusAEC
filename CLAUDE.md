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
  api/          — Fastify 5 backend (OAuth, LiveKit tokens, email stats, sync)
  mobile/       — React Native iOS/Android with LiveKit voice
  desktop/      — Electron + React + Vite (draft review, settings sync)
packages/
  shared-types  — TypeScript interfaces for the monorepo (no deps, root of dep graph)
  encryption    — AES-256 encryption utilities
  secure-storage — Platform-agnostic secure storage abstraction
  logger        — Structured logging with PII filtering
  email-providers — Gmail/Outlook adapters, OAuth providers, token management
  intelligence  — Red flag detection, clustering, knowledge base (Supabase vectors)
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

# Testing
pnpm test                 # All tests (Jest, runs after build)
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

### 3-Tier Memory

- **Tier 1 (Ephemeral):** In-memory, per-session only
- **Tier 2 (Session):** Redis on port 6379 (`infra/docker-compose.yml`)
- **Tier 3 (Knowledge):** Supabase + pgvector for vector search
- **PRD Rule 60:** Email content must NOT persist beyond active session. Only
  metadata (sender, subject, timestamp, thread ID) may be cached.

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
5. **Tests:** `pnpm test` — all tests must pass. Fix the code, not the tests
   (unless the test itself is wrong).

**Loop rule:** If any step fails → fix → restart from step 1. Do not skip steps
or proceed with known failures.

**Commit gate:** Only commit when steps 1–5 are all clean.

### Package-Specific Validation Gotchas

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
