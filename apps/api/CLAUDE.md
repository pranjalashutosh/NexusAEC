# apps/api — Backend API (Fastify 5)

Global rules: root `CLAUDE.md`. Architecture:
`docs/architecture/application-layer.md` (full endpoint list + middleware
stack), `docs/architecture/security.md` (auth, tokens, privacy),
`docs/architecture/design-decisions.md` ADR-6 / ADR-7 (stateless API, token
encryption).

**Dev:** `pnpm --filter @nexus-aec/api dev` (port 3000)

## Entry points

- `src/index.ts` — standalone server (local dev) → `src/app.ts`.
- `src/lambda.ts` — Lambda entry (`@fastify/aws-lambda`), same `createApp()`. No
  code duplication between the two entry points.

## Middleware & routes

- Routes follow the `registerXxxRoutes(app: FastifyInstance)` pattern in
  `src/routes/`.
- Middleware is registered in `createApp()` (`src/app.ts`). Helmet has CSP
  disabled (API-only). JWT auth (`src/middleware/auth.ts`) excludes `/health`,
  `/live`, `/ready`, `/auth/`, `/webhooks/`.
- `createApp()` takes a `disableAuth` option — pass `{ disableAuth: true }` in
  tests, or every request to a protected route returns 401.
- `injectPendingState()` in `auth.ts` is async (`Promise<void>`) — `await` it in
  tests or `no-floating-promises` errors.
- The webhook route registers an `application/webhook+json` content-type parser
  (returns the raw string) so `WebhookReceiver.receive()` gets the unmodified
  body for HMAC verification.

## Redis & token storage

- Redis client (`src/lib/redis.ts`) is a singleton with graceful fallback
  (returns `null` if Redis is unavailable).
- Redis state helpers (`src/lib/redis-state.ts`): generic `setState` /
  `getState` / `deleteState` + hash variants. Used by `auth.ts`, `sync.ts`,
  `webhooks.ts`.
- **Token storage** switches on `NODE_ENV` in `auth.ts`: prod uses
  `RedisTokenStorage` (`src/lib/redis-token-storage.ts`, AES-256, key prefix
  `nexus:tokens:`, 90-day TTL); dev uses `FileTokenStorage`
  (`.nexus-data/tokens.json`).
- The OAuth callback issues a JWT: `auth.ts` calls
  `generateJWT(userId, { email, name })` and returns `token` in the response.

## Briefing pre-computation & stats

- `src/services/briefing-precompute.ts` — `runPrecomputation(userId)` fetches
  unread emails, runs `presortEmails()` + `preprocessEmails()` from
  `@nexus-aec/intelligence`, stores results in Redis (30-min TTL, 15-min
  freshness). Requires `OPENAI_API_KEY`.
- `EmailStatsCache` — `getPriorityCounts()` / `setPriorityCounts()` for the
  `nexus:priority-counts:{userId}` key (30-min TTL). Falls back to all unread as
  `lowCount` when no priority data exists.

## Webhooks

- `WebhookReceiver` (from `livekit-server-sdk`) verifies against
  `LIVEKIT_API_SECRET`. **Enforced** in production, skipped in dev. Requires
  `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET`.

> Deployment env vars and Lambda wiring: `infra/terraform/CLAUDE.md`.
