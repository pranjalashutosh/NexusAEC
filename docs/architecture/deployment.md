# Deployment Architecture

> Local development uses Docker Compose + cloud APIs. Production targets
> serverless-first on AWS. See [overview](../../ARCHITECTURE.md) for system context.

---

## Local Development

```
Developer Machine
├─ Docker Compose (infra/docker-compose.yml)
│  ├─ Redis (port 6379)
│  ├─ PostgreSQL + pgvector (port 5432)
│  ├─ Redis Commander (port 8081) [profile: tools]
│  └─ pgAdmin (port 5050) [profile: tools]
│
├─ pnpm dev (all packages in watch mode)
│
└─ External Services (cloud)
   ├─ LiveKit Cloud (wss://your-app.livekit.cloud)
   ├─ Deepgram API (STT)
   ├─ ElevenLabs API (TTS)
   ├─ OpenAI API (GPT-4o + embeddings)
   ├─ Microsoft Graph (Outlook)
   └─ Google APIs (Gmail)
```

---

## Production Infrastructure

```
┌────────────────────────────────────────────────────┐
│                Client Devices                       │
│  Mobile (RN) ──HTTPS/WSS──┐                        │
│  Desktop (Electron) ──HTTPS┤                        │
└────────────────────────────┼────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────┐
│              Cloud Infrastructure                    │
│                                                      │
│  Load Balancer (HTTPS termination)                  │
│       │                                              │
│  ┌────▼─────────┐    ┌──────────────┐               │
│  │ Backend API  │    │ LiveKit Cloud │               │
│  │ (Lambda +    │    │  (Managed)   │               │
│  │  API Gateway)│    │ Rooms/Agents │               │
│  └────┬─────────┘    │ STT/TTS     │               │
│       │              └──────────────┘               │
│  ┌────▼─────────────────────────────┐               │
│  │ LiveKit Agent (EC2 t3.small)    │               │
│  │ Long-lived WebSocket sessions   │               │
│  │ Auto-scale: min 2, max 50 pods  │               │
│  │ 2 CPU, 4GB RAM per pod          │               │
│  └──────────────────────────────────┘               │
│                                                      │
│  ┌──────────────────────────────────┐               │
│  │ Managed Services                 │               │
│  │ Redis: Upstash (serverless)     │               │
│  │ PostgreSQL: Supabase Cloud      │               │
│  │ Secrets: AWS Secrets Manager    │               │
│  └──────────────────────────────────┘               │
│                                                      │
│  Region: us-east-1                                  │
└──────────────────────────────────────────────────────┘
```

---

## Scaling Strategy

| Component | Strategy | Rationale |
|-----------|----------|-----------|
| Backend API | Lambda (serverless) | Pay-per-request, auto-scaling |
| LiveKit Agent | EC2 → ECS Fargate at 10+ users | Long-lived WebSocket, ~$15/mo |
| Redis | Upstash (serverless) | No VPC needed for Lambda |
| Supabase | Managed (auto-scaling) | Vector queries scale with data |
| LiveKit Cloud | Managed (auto-scaling) | WebRTC media routing |

**Cost trajectory:** ~$15/mo (EC2) + pay-per-use (Lambda, Upstash) at MVP scale.
Upgrade path: ECS Fargate (~$69/mo) at 10+ concurrent users.
