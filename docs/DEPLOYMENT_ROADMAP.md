# NexusAEC Production Deployment Roadmap

## Context

NexusAEC is ready to move from development to production. The codebase has solid
foundations — multi-stage Dockerfiles, K8s manifests, CI pipeline, structured
logging, and a well-designed 3-tier memory architecture. However, several
critical gaps exist: no graceful shutdown, no CORS/rate limiting, auth
middleware built but never wired, webhook verification stubbed out, in-memory
state blocking horizontal scaling, and CI test command that will hang on the
desktop package.

**Scope:** API backend + LiveKit voice agent + React Native mobile.
Desktop/Electron is excluded from v1.

---

## 1. Hosting Strategy: Serverless-First on AWS

### Architecture: Lambda (API) + ECS Fargate (Agent)

The API is stateless HTTP — it's a natural fit for Lambda. The voice agent
maintains long-lived WebSocket sessions (minutes to hours) — it must run on ECS
Fargate. This hybrid gives you near-zero cost at low usage and smooth scaling to
10+ users.

**Why Lambda for the API:**

- **Truly pay-per-request**: Free tier covers 1M requests + 400K
  GB-seconds/month. At 2 users, you'll likely pay $0-3/mo for compute.
- **No idle cost**: Unlike ECS or Railway, Lambda charges nothing when nobody's
  making API calls.
- **Built-in scaling**: Handles 1 to 1,000 concurrent requests with zero
  configuration.
- **API Gateway provides CORS, rate limiting, custom domain, and TLS for free**
  — this eliminates several P0 fixes as infrastructure concerns rather than code
  changes.
- **Fastify adapter exists**: `@fastify/aws-lambda` wraps the existing Fastify
  app with minimal code change. All routes, middleware, and handlers stay
  identical.
- **Cold starts acceptable**: Node.js 20 Lambda cold starts are ~200-500ms. For
  an API that serves mobile polling (email stats, briefing status), this is
  fine. The voice path goes through LiveKit Cloud directly, not through your
  API.

**Why NOT Lambda for the Agent:**

- Voice sessions are long-lived (5-30 minutes). Lambda max timeout is 15
  minutes.
- The LiveKit Agent SDK needs a persistent WebSocket connection to LiveKit Cloud
  for room dispatch.
- Audio streaming requires sustained compute, not request/response.

**Why ECS Fargate for the Agent (not EC2, not Railway):**

- **Fargate = serverless containers**: No instance management. Pay-per-second
  for vCPU/memory.
- At 2 users, 1 agent task (2 vCPU, 4GB) handles everything. At 10+, add more
  tasks — LiveKit Cloud auto-distributes rooms.
- The existing Dockerfile at `packages/livekit-agent/Dockerfile` deploys
  directly.
- **Not Railway**: Railway works at 2 users but caps at 32 GB RAM and lacks true
  autoscaling. Migrating later wastes time.
- **Not EC2**: Instance management overhead isn't worth it until 50+ users.

**Why Upstash Redis (not ElastiCache):**

- Upstash is serverless Redis over public HTTPS — no VPC needed. Lambda in a VPC
  adds 1-2s cold start penalty. Upstash avoids this entirely.
- Free tier: 10K commands/day. At 2 users this is ample.
- Pay-per-command above free tier: $0.20 per 100K commands. Even at 10 users
  with heavy briefing pipelines, monthly cost is $5-15.
- When you exceed ~50 users and commands get expensive, migrate to ElastiCache
  (by then you may move API to ECS too).

### Service Placement

| Service                   | Where                             | Why                                                   | Est. Cost/mo (2 users) | Est. Cost/mo (10 users) |
| ------------------------- | --------------------------------- | ----------------------------------------------------- | ---------------------- | ----------------------- |
| **API (Fastify 5)**       | Lambda + API Gateway              | Pay-per-request. CORS, rate limiting, TLS built-in.   | $0-3                   | $3-10                   |
| **LiveKit Agent**         | ECS Fargate (1 task: 2 vCPU, 4GB) | Long-lived sessions. Scale tasks as users grow.       | $20-30                 | $60-150 (3-5 tasks)     |
| **Redis**                 | Upstash (serverless)              | No VPC needed for Lambda. Free tier. Pay-per-command. | $0-5                   | $5-15                   |
| **PostgreSQL + pgvector** | Supabase Cloud (already in use)   | Already provisioned. Free tier for 2 users.           | $0                     | $0-25                   |
| **LiveKit Cloud**         | Already provisioned               | Free tier: 5K participant-min/mo.                     | $0-5                   | $20-60                  |
| **Mobile**                | TestFlight → App Store            | EAS Build or Xcode Cloud.                             | $0                     | $0                      |
| **Secrets**               | AWS Secrets Manager               | Native ECS + Lambda integration.                      | $5-8                   | $5-10                   |
| **Container Registry**    | AWS ECR                           | Agent Docker images. Lambda deploys as zip.           | $0-2                   | $0-5                    |
| **DNS**                   | Route 53                          | Custom domain for API Gateway.                        | $0.50                  | $0.50                   |

### Total Monthly Cost Estimate

|                                    | 2 users         | 10 users         |
| ---------------------------------- | --------------- | ---------------- |
| AWS compute (Lambda + ECS)         | $20-35          | $65-165          |
| AWS infra (Secrets, ECR, Route 53) | $6              | $8               |
| Upstash Redis                      | $0-5            | $5-15            |
| Supabase                           | $0              | $0-25            |
| LiveKit Cloud                      | $0-5            | $20-60           |
| Deepgram STT                       | $5-15           | $80-150          |
| ElevenLabs TTS                     | $5-22           | $50-100          |
| OpenAI GPT-4o                      | $10-30          | $100-300         |
| **Total**                          | **~$50-120/mo** | **~$330-830/mo** |

> At 2 users, ~70% of the cost is AI services (Deepgram, ElevenLabs, OpenAI)
> which are purely usage-based. Infrastructure is nearly free.

### Lambda Integration Approach

**File to create:** `apps/api/src/lambda.ts` (Lambda handler entry point)

The existing `apps/api/src/app.ts` creates a Fastify instance. The Lambda
handler wraps it:

```typescript
import awsLambdaFastify from '@fastify/aws-lambda';
import { createApp } from './app';

let proxy: ReturnType<typeof awsLambdaFastify>;
export const handler = async (event, context) => {
  if (!proxy) {
    const app = await createApp();
    proxy = awsLambdaFastify(app);
  }
  return proxy(event, context);
};
```

The existing `apps/api/src/index.ts` (standalone server) stays for local
development. The Lambda handler is a parallel entry point — no code duplication,
same routes and middleware.

### AWS Region Selection

Choose **us-east-1** (N. Virginia):

- Lowest Lambda + API Gateway pricing
- LiveKit Cloud default region is us-east
- Supabase free tier defaults to us-east
- Upstash supports us-east-1

### Scaling Path

| Users | Change                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------- |
| 2→5   | No changes. Lambda auto-scales. Keep 1 agent task.                                                    |
| 5→10  | Add 1-2 more agent ECS tasks.                                                                         |
| 10→25 | Add agent ECS auto-scaling (CloudWatch metric: active sessions).                                      |
| 25→50 | Consider moving API from Lambda to ECS (if cold starts become an issue). Switch Redis to ElastiCache. |
| 50+   | Full ECS for all services. EC2 Spot for agent tasks.                                                  |

---

## 2. Pre-Launch Fixes (Prioritized)

### P0 — Must Fix Before Any Public User Touches This

#### 2.1 Graceful Shutdown Handler

**File:** `apps/api/src/index.ts` **Problem:** No SIGTERM/SIGINT handlers.
Container restarts drop in-flight requests. `disconnectRedis()` is never called.
**Fix:** Add signal handlers after `app.listen()` that call `app.close()`
(drains HTTP connections) then `disconnectRedis()`.

#### 2.2 CORS

**File:** `apps/api/src/app.ts` **Problem:** No `@fastify/cors` registered.
Mobile API requests from different origin will fail. **Fix:** Install
`@fastify/cors`, register in `createApp()`. Allow the production API domain +
mobile deep link scheme. In dev, also allow `localhost`. **Note:** API Gateway
also provides CORS configuration as a second layer. Both should be configured
for defense in depth.

#### 2.3 Rate Limiting

**File:** `apps/api/src/app.ts` **Problem:** No rate limiting on any endpoint.
`/livekit/token` creates rooms and embeds OAuth tokens — abuse could exhaust
LiveKit quotas and leak credentials. **Fix:** Install `@fastify/rate-limit` with
Redis store (Upstash) so limits work across Lambda invocations. Global: 100
req/min/IP. Sensitive endpoints: `/livekit/token` 10 req/min, `/auth/*` 20
req/min, `/briefing/precompute` 5 req/min. API Gateway also supports usage plans
with throttling as an additional layer.

#### 2.4 Wire Auth Middleware

**File:** `apps/api/src/app.ts` (register), `apps/api/src/middleware/auth.ts`
(already implemented) **Problem:** Full JWT auth middleware exists at
`middleware/auth.ts:299` (`registerAuthMiddleware`) but is never called. Every
endpoint is publicly accessible — anyone can fetch any user's email stats,
trigger briefing precomputation, or generate LiveKit tokens. **Fix:** Call
`registerAuthMiddleware(app, { excludePaths: ['/health', '/auth/', '/webhooks/'] })`
in `createApp()`. Add JWT token issuance to the OAuth callback flow. Update
mobile app to include Bearer tokens. **Critical:** Change `JWT_SECRET` default
from `'development-secret-change-in-production'` (line 75 of auth.ts) to a
strong random value in production env vars.

#### 2.5 Webhook HMAC Verification

**File:** `apps/api/src/routes/webhooks.ts:126-134` **Problem:**
`verifyLiveKitWebhook()` always returns `true`. In production
(`NODE_ENV=production`), the guard executes but verification is a no-op.
**Fix:** Use `@livekit/server-sdk`'s `WebhookReceiver` to verify the JWT in the
`Authorization` header signed with `LIVEKIT_API_SECRET`.

#### 2.6 Mobile Hardcoded URL

**File:** `apps/mobile/src/config/api.ts:21` **Problem:** `NGROK_URL` is
hardcoded to a Cloudflare tunnel. Any release build will route all API traffic
through a dev tunnel that may not exist. **Fix:** Set `NGROK_URL = null`. The
existing fallback logic at lines 47-57 already handles dev (localhost) vs
production. For release builds, use `react-native-config` to inject
`API_BASE_URL` at build time.

#### 2.7 Token Storage Migration

**File:** `apps/api/src/routes/auth.ts` (uses `FileTokenStorage`) **Problem:**
OAuth tokens stored as plaintext JSON at `.nexus-data/tokens.json`. Docker
containers have ephemeral filesystems — tokens vanish on every container
restart. Users would need to re-authenticate on every deploy. **Fix:** Create a
`RedisTokenStorage` class that implements the same interface. Encrypt tokens at
rest using `@nexus-aec/encryption` (AES-256, already available). Store with
user-scoped keys and reasonable TTL (OAuth refresh tokens can last months).

#### 2.8b Move In-Memory State Out of API (Required for Lambda)

**Files:** `apps/api/src/routes/auth.ts`, `apps/api/src/routes/sync.ts`,
`apps/api/src/routes/webhooks.ts` **Problem:** Lambda runs each request in a
potentially different invocation. In-memory Maps for OAuth state,
drafts/preferences, and webhook sessions are lost between invocations. Even with
container reuse, they're unreliable. **Fix:**

- `pendingOAuthStates` + `completedOAuthResults` → Upstash Redis with 10-min /
  5-min TTL (matches existing `setTimeout` durations)
- `userDrafts` + `userPreferences` → Supabase PostgreSQL (tables `drafts` and
  `user_preferences` already exist in `init-db.sql`)
- `roomSessions` → Upstash Redis hash with 24h TTL

### P1 — Should Fix Before Launch (Reduces Risk Significantly)

#### 2.8 Enhanced Health Check

**File:** `apps/api/src/routes/health.ts` **Problem:** Returns `{ ok: true }`
unconditionally (10 lines total). No dependency checks. A container can report
healthy while Redis is down and Supabase is unreachable. **Fix:** Add `/health`
with dependency checks (Redis ping, Supabase query). Return 503 if critical deps
are down. Add `/ready` and `/live` endpoints matching the agent's pattern.

#### 2.9 Fix CI Test Command

**File:** `.github/workflows/ci.yml:99` **Problem:** `pnpm test` runs ALL
packages including desktop, which has no test files and **hangs the runner
indefinitely**. **Fix:** Replace with the explicit filter command:

```
pnpm --filter @nexus-aec/encryption --filter @nexus-aec/logger --filter @nexus-aec/secure-storage --filter @nexus-aec/intelligence --filter @nexus-aec/email-providers --filter @nexus-aec/livekit-agent --filter @nexus-aec/api test
```

#### 2.10 Security Headers

**File:** `apps/api/src/app.ts` **Fix:** Add `@fastify/helmet` for
X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, etc.

### P2 — Can Defer to Post-Launch

- **Request correlation IDs** — nice for debugging, not a blocker
- **Database migration system** — single `init-db.sql` works for now; adopt
  versioned migrations when schema changes become frequent
- **Input validation schemas** — Add Zod/TypeBox request body validation
- **OAuth metadata encryption in LiveKit tokens** — tokens embed OAuth access
  tokens in participant metadata visible to room

---

## 3. CI/CD Pipeline

### Current State

GitHub Actions at `.github/workflows/ci.yml` has 4 jobs (lint, type-check, test,
build) + a placeholder `deploy-agent` job with Docker steps commented out. The
test job will hang (P1 fix above).

### Target Pipeline

```
PR → lint + type-check + test + build (parallel where possible)
        │
merge to main
        │
        ▼
Build: Lambda zip (API) + Docker image (Agent) → Push to S3/ECR
        │
        ▼
Deploy to staging: Lambda alias + ECS staging service (auto)
        │
        ▼
Smoke tests (health, token gen)
        │
        ▼ (manual approval via GitHub Environment)
Deploy to production: Lambda alias + ECS production service
```

### Specific Changes

**3.1 Fix test job** — Replace line 99 with explicit filter (see 2.9).

**3.2 Add Lambda deployment** — Build the API as a zip bundle:

```yaml
- name: Build API Lambda
  run: |
    pnpm turbo run build --filter=@nexus-aec/api
    cd apps/api && zip -r ../../api-lambda.zip dist/ node_modules/ package.json
- name: Deploy to Lambda
  run:
    aws lambda update-function-code --function-name nexus-api --zip-file
    fileb://api-lambda.zip
```

**3.3 Add Agent Docker build** — Uncomment the deploy-agent job (lines 162-180).
Switch registry to ECR:

```yaml
- name: Login to Amazon ECR
  uses: aws-actions/amazon-ecr-login@v2
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    push: true
    tags: ${{ steps.ecr.outputs.registry }}/nexus-agent:${{ github.sha }}
```

**3.4 Add deployment jobs** — Lambda: use aliases (`staging`/`production`)
pointing to specific versions. Agent:
`aws ecs update-service --force-new-deployment`. Production requires manual
approval via GitHub `environment: production`.

**3.5 Add smoke tests** — After staging deploy:

- `curl https://<STAGING_DOMAIN>/health` (expect 200 with dependency checks)
- Generate a test LiveKit token (validates LIVEKIT_API_KEY is configured)
- Check Redis connectivity via health endpoint

**3.6 Rollback** — Lambda: point alias to previous version
(`aws lambda update-alias --function-version N-1`). Agent:
`aws ecs update-service` with previous image SHA. Both are instant,
zero-downtime.

---

## 4. Environment & Secrets Management

### 30+ Env Vars Organized Into 3 Groups

**Group A — Shared (API + Agent):**

```
REDIS_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
OPENAI_API_KEY
```

**Group B — API only:**

```
PORT=3000, HOST=0.0.0.0, NODE_ENV=production, API_BASE_URL
JWT_SECRET (generate with: openssl rand -hex 64)
JWT_ISSUER, JWT_AUDIENCE
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
```

**Group C — Agent only:**

```
PORT=8080, NODE_ENV=production
DEEPGRAM_API_KEY, DEEPGRAM_MODEL, DEEPGRAM_LANGUAGE
ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID
OPENAI_MODEL, OPENAI_MAX_TOKENS, OPENAI_TEMPERATURE
```

### Management Approach

**AWS Secrets Manager:** Native integration with both Lambda and ECS. Secrets
stored encrypted, referenced in Lambda environment config and ECS task
definitions, injected as environment variables at launch. No secrets in git, no
secrets in Docker images. The K8s `secret.yaml` template at
`infra/k8s/livekit-agent/secret.yaml` documents the secret structure — translate
to Secrets Manager entries.

Cost: $0.40/secret/month + $0.05/10K API calls. For ~15 secrets = ~$6/month.

### Secret Rotation

| Secret                                  | Frequency | Notes                                                    |
| --------------------------------------- | --------- | -------------------------------------------------------- |
| JWT_SECRET                              | 90 days   | Support dual-validation during 24h overlap window        |
| API keys (OpenAI, Deepgram, ElevenLabs) | On demand | Rotate via provider dashboard, update in Secrets Manager |
| OAuth client secrets                    | Annually  | Google Cloud Console / Azure Portal                      |
| LIVEKIT_API_KEY/SECRET                  | Annually  | LiveKit Cloud dashboard                                  |
| REDIS password                          | 90 days   | Update Upstash dashboard + Secrets Manager               |

---

## 5. Observability & Error Logging

### Logging — CloudWatch Logs (Default) or Axiom (Better Querying)

The `@nexus-aec/logger` package already outputs structured JSON in production
with PII filtering. Both Lambda and ECS Fargate natively ship stdout to
CloudWatch Logs — zero configuration needed.

**Option A: CloudWatch Logs (simplest)**

- Free for first 5GB/month, then $0.50/GB ingest
- Native AWS integration — logs appear automatically for Lambda functions and
  ECS tasks
- CloudWatch Logs Insights for querying structured JSON
- Set up CloudWatch Alarms directly on log patterns (e.g., ERROR count >
  threshold)

**Option B: Axiom (better developer experience)**

- Free tier: 500GB/month ingest, 30-day retention
- Superior query language (APL) and dashboarding vs CloudWatch Insights
- Ship logs via CloudWatch Logs subscription filter → Axiom Lambda forwarder
- Zero code changes — just infrastructure wiring

**Recommendation:** Start with CloudWatch Logs (zero setup). Add Axiom when you
need better ad-hoc querying and dashboards.

### Error Tracking — Sentry

Already planned (`.env.example` has a commented `SENTRY_DSN` variable).

- `@sentry/node` for API and Agent
- `@sentry/react-native` for mobile
- Source map upload in CI for readable stack traces
- **Free tier:** 5K errors/month, 10K performance transactions
- **Cost:** $0 initially, $26/mo (Team plan) at scale

**Integration point:** Add a Sentry transport to the existing logger — when
level is `error` or `fatal`, forward to Sentry with context.

### Key Metrics to Alert On

| Metric                       | Source                        | Alert When               |
| ---------------------------- | ----------------------------- | ------------------------ |
| Voice session duration       | Agent `/health` endpoint      | > 30 min (stuck session) |
| STT/TTS latency              | Agent timing logs             | > 3s average             |
| GPT-4o response time         | Agent timing logs             | > 10s per call           |
| API p99 latency              | Fastify `onResponse` hook     | > 2s                     |
| Redis available              | `isRedisAvailable()`          | false for > 30s          |
| Email fetch failures         | Agent logs                    | > 3 consecutive          |
| OAuth token refresh failures | API auth logs                 | Any occurrence           |
| Container memory             | CloudWatch Container Insights | > 85% of limit           |

**Launch approach:** CloudWatch Container Insights for ECS metrics (CPU, memory,
network) + CloudWatch Alarms for threshold alerts + Sentry for error tracking.
No custom Prometheus/Grafana needed yet.

### PostHog for Product Analytics (Optional, Post-Launch)

PostHog provides session recording, feature flags, and product analytics. Free
tier is generous (1M events/month). Useful for understanding how users interact
with voice briefings — but not a launch blocker.

---

## 6. Scaling Strategy

### Voice Agent Concurrency Model

The LiveKit Agent SDK uses a **job-based dispatch model**: LiveKit Cloud assigns
incoming room connections to available agent workers. One agent process CAN
handle multiple concurrent rooms, but each voice session is resource-intensive:

- **~500MB-1GB RAM** per active session (GPT-4o context window, email data
  buffers, audio streams)
- **Sustained CPU** for audio encoding/decoding via Deepgram WS + ElevenLabs WS
- **Multiple concurrent HTTP connections** per session (Deepgram, ElevenLabs,
  OpenAI, Redis)

### Scaling Tiers

| Concurrent Users | Infrastructure                                           | Changes Needed                                                                  |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **2** (launch)   | Lambda (API) + 1 ECS agent task                          | Baseline. LiveKit Cloud handles room dispatch.                                  |
| **2-5**          | Same                                                     | Lambda auto-scales. Agent handles 2-3 sessions per task.                        |
| **5-10**         | Add 1-2 agent ECS tasks                                  | LiveKit Cloud auto-distributes rooms across workers.                            |
| **10-25**        | Agent auto-scaling (3-5 tasks)                           | CloudWatch custom metric: active sessions. Auto-scale at 3 sessions/task.       |
| **25-50**        | Consider moving API to ECS. Switch Redis to ElastiCache. | Lambda cold starts may matter at scale. ElastiCache for predictable Redis cost. |
| **50+**          | Full ECS for all. EC2 Spot for agent.                    | One ECS task per active session for isolation. ~40% cost savings with Spot.     |

### Why the In-Memory `activeSessions` Map Doesn't Block Scaling

At `packages/livekit-agent/src/session-store.ts`, the `activeSessions` Map is
module-scoped. This is fine because:

- LiveKit Cloud assigns each room to exactly ONE agent worker — no
  cross-instance coordination needed
- The Map is used only for the local health endpoint (`/health` reports sessions
  for this instance)
- For cross-instance visibility, query LiveKit Cloud's REST API instead

### API Horizontal Scaling

On Lambda, every invocation may run in a different container. In-memory Maps in
`auth.ts`, `sync.ts`, and `webhooks.ts` are fundamentally incompatible — state
is lost between invocations. This is why 2.8b (move in-memory state to Redis/DB)
is a hard P0 requirement for the serverless approach. After this fix, the API
scales infinitely with zero configuration — Lambda handles concurrency
automatically.

### Redis Scaling

All Redis keys have TTLs (30 min for briefing cache, 7 days for briefed emails,
90 days for sender profiles). Memory usage stays bounded regardless of user
count. Upstash free tier covers 2 users easily. At 10+ users, Upstash
pay-per-command is ~$5-15/mo. At 50+ users, switch to ElastiCache t3.micro
($13/mo, unlimited commands) for predictable cost.

### Cost Per Additional Concurrent User

| Resource                          | Per-User/Month |
| --------------------------------- | -------------- |
| Agent compute share               | $10-15         |
| LiveKit Cloud participant-minutes | $5-10          |
| Deepgram STT                      | $8-15          |
| ElevenLabs TTS                    | $10-20         |
| OpenAI GPT-4o                     | $15-30         |
| Redis (marginal)                  | $1-2           |
| **Total per concurrent user**     | **~$50-90/mo** |

---

## 7. Security Hardening Checklist

| Item                             | Status                                                          | Fix Location                                 |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| HTTPS/TLS                        | API Gateway (API) + ACM (Agent ALB if needed)                   | Custom domain setup                          |
| CORS                             | Missing                                                         | `apps/api/src/app.ts` — P0 fix               |
| Rate limiting                    | Missing                                                         | `apps/api/src/app.ts` — P0 fix               |
| JWT auth middleware              | Built, not wired                                                | `apps/api/src/app.ts` — P0 fix               |
| Webhook HMAC                     | Stubbed (always true)                                           | `apps/api/src/routes/webhooks.ts` — P0 fix   |
| Token storage encryption         | Plaintext JSON file                                             | New `RedisTokenStorage` — P0 fix             |
| Security headers (Helmet)        | Missing                                                         | `apps/api/src/app.ts` — P1 fix               |
| JWT_SECRET default               | `'development-secret-change-in-production'`                     | Env var override (never deploy with default) |
| OAuth metadata in LiveKit tokens | OAuth tokens embedded in participant metadata (visible to room) | Consider encrypting metadata payload — P2    |
| Input validation                 | No runtime schema validation on request bodies                  | Add Zod or TypeBox schemas — P2              |

---

## 8. Implementation Sequence

### Phase 1: Pre-Launch Hardening (2-3 weeks)

1. Graceful shutdown (P0 #2.1) — `apps/api/src/index.ts`
2. CORS (P0 #2.2) — `apps/api/src/app.ts`
3. Rate limiting (P0 #2.3) — `apps/api/src/app.ts`
4. Wire auth middleware (P0 #2.4) — `apps/api/src/app.ts` + mobile JWT
   integration
5. Webhook verification (P0 #2.5) — `apps/api/src/routes/webhooks.ts`
6. Mobile URL fix (P0 #2.6) — `apps/mobile/src/config/api.ts`
7. Token storage to Redis (P0 #2.7) — new class + `apps/api/src/routes/auth.ts`
8. Move in-memory state to Redis/DB (P0 #2.8b) — `auth.ts`, `sync.ts`,
   `webhooks.ts`
9. Enhanced health check (P1 #2.8) — `apps/api/src/routes/health.ts`
10. Security headers (P1 #2.10) — `apps/api/src/app.ts`

### Phase 2: AWS Infrastructure Setup (1 week)

1. Create AWS account/org, set up IAM roles for Lambda + ECS + ECR
2. Create ECR repository for `nexus-agent`
3. Create Lambda function for API (deploy as zip with `@fastify/aws-lambda`
   handler)
4. Create API Gateway (HTTP API) with custom domain + ACM certificate
5. Create Upstash Redis instance (or provision during Phase 1 for local testing)
6. Create ECS cluster (Fargate) in us-east-1
7. Create ECS task definition for agent from existing Dockerfile + K8s resource
   specs
8. Create ECS service (Agent: 1 task initially)
9. Configure Route 53 or external DNS for custom domain → API Gateway
10. Store all secrets in AWS Secrets Manager, reference from Lambda + ECS config
11. Set up Sentry (API + Agent + Mobile SDKs)
12. CloudWatch Logs enabled automatically for Lambda + ECS
13. End-to-end smoke test with real Gmail account

### Phase 3: CI/CD Automation (3-5 days)

1. Fix CI test command (P1 #2.9) — `.github/workflows/ci.yml`
2. Add Lambda deployment step (zip + `aws lambda update-function-code`)
3. Add Docker build/push for agent to ECR
4. Add staging Lambda alias + staging ECS service + auto-deploy on merge to main
5. Add production deploy with manual approval (GitHub Environment protection)
6. Add post-deploy smoke tests (health endpoint, token generation)

### Phase 4: Post-Launch Hardening (2-4 weeks, ongoing)

1. Add request correlation IDs (API Gateway request ID → Lambda → logs)
2. Adopt versioned database migrations
3. Set up CloudWatch alarms for agent session metrics
4. Configure ECS auto-scaling policies (custom metric: active sessions)
5. Add input validation schemas (Zod/TypeBox)

---

## 9. Verification Plan

After implementing each phase:

**Phase 1 verification:**

- `pnpm type-check && pnpm lint && pnpm build` — all clean
- Run tests with explicit filter — all pass
- Start API locally, verify: CORS headers present, rate limit headers present,
  unauthenticated requests to protected routes return 401, `/health` checks
  Redis
- Verify mobile app works with `NGROK_URL = null` on both simulator and device

**Phase 2 verification:**

- `curl https://<YOUR_DOMAIN>/health` returns 200 with dependency status (Redis,
  Supabase checks)
- Verify Lambda cold start is < 1s (check CloudWatch duration metric)
- Generate LiveKit token via API — validates auth + LiveKit config
- Start a voice session from mobile → agent connects, STT/TTS/GPT-4o all
  functional
- Verify Sentry receives a test error
- Verify CloudWatch Logs show structured JSON from both Lambda and Agent ECS
  task
- Verify Upstash Redis is reachable from both Lambda and Agent

**Phase 3 verification:**

- Push a PR — CI completes without hanging (desktop excluded from tests)
- Merge to main — staging Lambda alias + ECS service update, smoke tests pass
- Approve production — production Lambda alias + ECS service update successfully
- Rollback test — point Lambda alias to previous version, verify instant
  rollback
