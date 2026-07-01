# CLAUDE.md

Guidance for Claude Code when working in this repository. This is the **hub** —
global rules only. Workspace-specific rules live in per-directory `CLAUDE.md`
files that load automatically when you work in that subtree (see
[Local Context Map](#local-context-map)).

## Project Overview

NexusAEC is a voice-driven AI executive assistant. It uses LiveKit for real-time
voice (STT via Deepgram, TTS via ElevenLabs, reasoning via GPT-4o), unified
email adapters (Gmail + Outlook), and a 3-tier memory model (in-memory → Redis →
Supabase vector store).

## Working Principles

Behavioral guidelines to reduce common LLM mistakes. These apply to **every
task**.

### 1. Don't Assume. Don't Hide Confusion. Surface Tradeoffs.

Before implementation:

- State your assumptions explicitly.
- If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so.
- Push back when warranted.

If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.

If you write 200 lines and it could be 50, rewrite it. Ask yourself: "Would a
senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified. Transform tasks into verifiable
goals.

- "Add validation" → write tests for invalid inputs, then make them pass.
- "Fix the bug" → write a test that reproduces it, then make it pass.
- "Refactor X" → ensure tests pass before and after.

## Monorepo Structure

**Package manager:** pnpm 9.0.0 (required — never use npm or yarn) · **Build
system:** Turborepo 2.0 · **Node:** >=20.0.0 · **TypeScript:** 5.4+ strict mode

```
apps/
  api/          — Fastify 5 backend (OAuth, LiveKit tokens, email stats, briefing pre-computation)
  mobile/       — React Native iOS/Android with LiveKit voice
packages/
  shared-types  — TypeScript interfaces for the monorepo (no deps, root of dep graph)
  encryption    — AES-256 encryption utilities
  secure-storage — Platform-agnostic secure storage abstraction
  logger        — Structured logging with PII filtering
  email-providers — Gmail/Outlook adapters, OAuth providers, token management
  intelligence  — Email preprocessing (LLM batched), sender profiles, knowledge base (Supabase vectors)
  livekit-agent — Voice agent: briefings, STT/TTS, GPT-4o reasoning loop
infra/          — Docker Compose (dev) + Terraform (prod AWS)
```

The system diagram and Turborepo dependency order live in `ARCHITECTURE.md`.
`shared-types` is the root of the dependency graph — any change there requires a
full `pnpm build` from root.

## Global Commands

```bash
# Build & verify (whole repo, Turborepo-ordered)
pnpm build                # Build all
pnpm type-check           # TypeScript validation
pnpm lint                 # ESLint (pnpm lint:fix to auto-fix)
pnpm format:check         # Prettier check (pnpm format to auto-format)

# Testing (explicit per-package filters)
pnpm --filter @nexus-aec/encryption --filter @nexus-aec/logger --filter @nexus-aec/secure-storage --filter @nexus-aec/intelligence --filter @nexus-aec/email-providers --filter @nexus-aec/livekit-agent --filter @nexus-aec/api test
pnpm --filter @nexus-aec/encryption test  # Single package

# Infrastructure (local dev)
pnpm infra:up             # Redis + PostgreSQL (infra:up:tools adds Redis Commander + pgAdmin)
pnpm infra:down           # Stop services (infra:reset wipes data + volumes)
```

Per-workspace dev/run commands live in each workspace's `CLAUDE.md`.

## Build & Validation Loop

Before considering any code change complete, run in order — if any step fails,
fix and restart from step 1:

1. `pnpm type-check` — fix ALL TypeScript errors.
2. `pnpm lint` — `pnpm lint:fix` first, then fix the rest manually.
3. `pnpm format:check` — run `pnpm format` if needed.
4. `pnpm build` — surfaces dependency-order issues.
5. Tests (the filtered command above). All must pass; fix the code, not the test
   (unless the test itself is wrong).

**Zero tolerance for failures**, including pre-existing ones. Only commit when
steps 1–5 are all clean.

## Code Conventions

- **Imports:** grouped (builtin → external → internal → parent/sibling → index →
  type) with blank lines between, alphabetized. Use `@nexus-aec/*` workspace
  imports.
- **Dependencies:** always the `workspace:*` protocol for internal deps.
- **Logging:** use `@nexus-aec/logger` — no `console.log` (only `console.warn` /
  `console.error`).
- **Unused vars:** prefix with `_` (`@typescript-eslint/no-unused-vars`).
- **Floating promises:** `no-floating-promises` is `error` — always await or
  void.
- **`exactOptionalPropertyTypes` is on** — use conditional spread
  `...(val ? { key: val } : {})` for optional fields; never assign `undefined`
  directly.
- **Tests:** co-located (`foo.ts` → `foo.test.ts`), Jest + ts-jest, AAA pattern.
- **Commits:** `feat|fix|refactor|test|docs|chore(scope): description` — scope
  is the package name without the `@nexus-aec/` prefix.
- **Prettier:** 2-space indent, single quotes, semicolons, 100-char width (80
  for `*.json` / `*.md`), trailing commas (es5).

## Global Constraints

- **PRD Rule 60 (privacy):** Email _content_ must NOT persist beyond the active
  session. Only metadata (sender, subject, timestamp, thread ID) may be cached.
  See `docs/architecture/memory-model.md`.

## Local Context Map

Domain rules live next to the code, in per-workspace `CLAUDE.md` files (loaded
on demand when you touch that subtree):

| Workspace                   | Its `CLAUDE.md` covers                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `apps/api/`                 | Fastify middleware, JWT auth, Redis fallback + token storage, pre-computation, webhooks |
| `apps/mobile/`              | React Native + LiveKit, iOS audio / WebRTC gotchas, API URL config                      |
| `packages/livekit-agent/`   | Node 20, LLM chunking, briefing pipeline, voice quality, cross-session memory           |
| `packages/email-providers/` | Gmail/Outlook adapter + OAuth helpers                                                   |
| `packages/intelligence/`    | Email preprocessing, preprocessing output fields, sender profiles                       |
| `infra/terraform/`          | AWS runtime targets, environment variables, Secrets Manager, IaC modules                |

**Architecture reference** (the _why / how_ — diagrams, ADRs, data flows) is a
separate layer: `ARCHITECTURE.md` is the hub, pointing into
`docs/architecture/*.md`. Deployment roadmap: `docs/DEPLOYMENT_ROADMAP.md`.
