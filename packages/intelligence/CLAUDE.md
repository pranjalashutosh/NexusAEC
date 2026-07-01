# packages/intelligence — Email preprocessing & knowledge

Global rules: root `CLAUDE.md`. Architecture:
`docs/architecture/intelligence-layer.md` (LLM preprocessing, prioritization,
briefing generation), `docs/architecture/design-decisions.md` ADR-8.
Human-facing package docs: `README.md`.

## Preprocessing

- `EmailPreprocessor` (`src/preprocessing/email-preprocessor.ts`) does batched
  GPT-4o preprocessing. `presortEmails()` + `preprocessEmails()` are the
  exported entry points (consumed by the API pre-compute service and the agent
  briefing pipeline).

## Preprocessing output (exact field names — easy to get wrong)

- `PreprocessedEmail` (`src/preprocessing/email-preprocessor.ts`) carries the
  LLM's per-email `priority` (`'high' | 'medium' | 'low'`), `summary`, and
  `clusterLabel`. These flow straight through to the agent's `ScoredEmail` —
  there is no separate scoring step.

## Sender profiles

- `SenderProfileStore` (`src/knowledge/sender-profile-store.ts`): Redis-backed
  per-sender engagement tracking, 90-day TTL. Key pattern:
  `nexus:sender:{userId}:{sha256[:16]}` (first 16 chars of the SHA-256 of the
  lowercase sender email).
- Tracks `archived`, `flagged`, `replied`, `deeperViewed`, `markRead`, `skipped`
  action counts + priority-mismatch feedback.
- `synthesizePreferences()` generates natural language injected into the LLM
  preprocessing prompt (requires ≥3 interactions per sender).

> The agent wires this store via `BriefingSessionTracker` — see
> `packages/livekit-agent/CLAUDE.md`.
