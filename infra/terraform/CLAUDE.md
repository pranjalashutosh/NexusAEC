# infra/terraform — Production deployment (AWS)

Global rules: root `CLAUDE.md`. Architecture: `docs/architecture/deployment.md`
(infra diagrams, scaling strategy), `docs/architecture/design-decisions.md`
ADR-6 / ADR-7 (stateless API, token encryption). First-time apply runbook:
`infra/terraform/README.md`. Cost estimates + scaling path:
`docs/DEPLOYMENT_ROADMAP.md`.

## Runtime targets

- **API:** Lambda via `apps/api/src/lambda.ts` (`@fastify/aws-lambda`). Local
  dev uses standalone `apps/api/src/index.ts`. Both share `createApp()`.
- **Voice agent:** EC2 t3.small (a long-lived WebSocket is incompatible with the
  Lambda timeout). Image built from `packages/livekit-agent/Dockerfile` via
  `scripts/build-agent-image.sh`.
- **Environments:** dev (local Docker Compose + cloud APIs) and prod (AWS). No
  staging tier.
- **NOT Kubernetes.** `infra/k8s/livekit-agent/` holds abandoned pre-Lambda
  manifests (last touched in `d9dd846`) — not deployed, not referenced by CI,
  not the source of truth. Ignore it when reasoning about prod.

## Environment variables

The Lambda entry (`apps/api/src/lambda.ts`) reads `SECRET_NAME` at cold start,
fetches the JSON secret from AWS Secrets Manager, and injects each key into
`process.env`. The agent EC2 user-data does the same on boot. Local dev reads
`.env` directly. Keys below match the Secrets Manager payload
(`modules/secrets/main.tf`).

| Variable                                     | Required In  | Notes                                                                                                                                              |
| -------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                             | API + Agent  | Briefing pre-compute (API) and GPT-4o reasoning (agent).                                                                                           |
| `REDIS_URL`                                  | API + Agent  | Local `redis://localhost:6379`; prod Upstash `rediss://` URL injected from Secrets Manager.                                                        |
| `JWT_SECRET`                                 | API          | Signs auth JWTs. Terraform `random_password`. Falls back to `'development-secret-change-in-production'` if unset — must be set in prod.            |
| `TOKEN_ENCRYPTION_KEY`                       | API          | AES-256 key for `RedisTokenStorage`. Falls back to `JWT_SECRET`, but Terraform generates a separate value so rotating one doesn't break the other. |
| `LIVEKIT_URL`                                | API + Agent  | LiveKit Cloud project URL (`wss://...`).                                                                                                           |
| `LIVEKIT_API_KEY`                            | API + Agent  | LiveKit Cloud API key.                                                                                                                             |
| `LIVEKIT_API_SECRET`                         | API + Agent  | Token signing AND webhook HMAC. Verification is enforced when `NODE_ENV=production` (`apps/api/src/routes/webhooks.ts`); skipped in dev.           |
| `SUPABASE_URL`                               | API + Agent  | Vector store + knowledge base.                                                                                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`                  | API + Agent  | Server-side only — never expose to the client.                                                                                                     |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`  | API          | Gmail OAuth.                                                                                                                                       |
| `MICROSOFT_CLIENT_ID` / `..._SECRET`         | API          | Outlook OAuth (optional, defaults to `""`).                                                                                                        |
| `DEEPGRAM_API_KEY`                           | Agent        | STT.                                                                                                                                               |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | Agent        | TTS.                                                                                                                                               |
| `API_BASE_URL`                               | API          | Public base URL for OAuth callbacks. Falls back to `http://localhost:3000` — must be set in prod. Lambda env var (not in Secrets Manager).         |
| `NODE_ENV`                                   | API          | `production` flips token storage, webhook HMAC enforcement, and CORS. Lambda env var.                                                              |
| `SECRET_NAME`                                | API (Lambda) | Name of the Secrets Manager entry to load at cold start. Set by Terraform on the Lambda.                                                           |
| `LOG_LEVEL`                                  | API + Agent  | `info` in prod (set by Terraform), debug locally.                                                                                                  |
| `PORT` / `HOST`                              | API + Agent  | Local dev only (Lambda ignores). Agent health server defaults to 8080.                                                                             |

**Switches that flip dev → prod behavior:**

- `NODE_ENV=production` — token storage backend, webhook verification, CORS.
- `SECRET_NAME` set — Lambda hydrates env from Secrets Manager.
- `TOKEN_ENCRYPTION_KEY` unset — silently falls back to `JWT_SECRET`. Always set
  it independently in prod.

## Infrastructure as Code

The prod stack is composed in `envs/prod/main.tf`. Region: `us-east-1`. AWS
profile: `nexusAEC-prod` (account `843792057554`). State backend: S3 + DynamoDB
(provisioned by `bootstrap/`, applied once).

| Module                | Provisions                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/upstash`     | Serverless Redis (Upstash provider). Outputs the `rediss://` URL piped into `secrets`.                                                                                                                |
| `modules/secrets`     | Two Secrets Manager entries (`nexus-aec/prod/api`, `nexus-aec/prod/agent`), JSON keyed by env-var name. Auto-generates `JWT_SECRET` + `TOKEN_ENCRYPTION_KEY` via `random_password` — never in tfvars. |
| `modules/ecr`         | ECR repository for the agent Docker image.                                                                                                                                                            |
| `modules/iam`         | Lambda execution role (CloudWatch Logs + read API secret) and EC2 instance profile (read agent secret + pull from ECR + SSM Session Manager).                                                         |
| `modules/lambda-api`  | API Lambda (zip from `builds/api-lambda.zip`), CloudWatch log group with retention, `NODE_ENV=production` + `SECRET_NAME` env vars.                                                                   |
| `modules/api-gateway` | HTTP API (v2) with Lambda proxy, `ANY /{proxy+}` catch-all so Fastify routes, CORS, optional custom domain.                                                                                           |
| `modules/networking`  | Account default VPC + subnets (no dedicated VPC at MVP scale). Agent security group: zero ingress (Session Manager for shell), full egress.                                                           |
| `modules/ec2-agent`   | t3.small Amazon Linux 2023, IMDSv2 required, encrypted gp3 root, Elastic IP (stable webhook target), awslogs → CloudWatch. User-data fetches the agent secret and pulls the ECR image on boot.        |
| `modules/route53`     | Optional Route 53 zone + records for the API custom domain.                                                                                                                                           |

**Helper scripts** (`scripts/`): `build-agent-image.sh [tag]` (buildx →
linux/amd64, push to ECR, defaults to `latest`); `build-api-lambda.sh` (packages
the API into a Lambda zip in `builds/`).

**First-time apply:** `bootstrap/` once → `envs/prod/`
(`terraform init && terraform plan && terraform apply`).
