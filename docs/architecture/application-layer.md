# Application Layer

> Two applications: Mobile (voice) and Backend API (auth + sync). See
> [overview](../../ARCHITECTURE.md) for system context.

---

## Mobile App (React Native)

**Navigation flow:** Welcome → Onboarding → Briefing Room | Settings

**LiveKit integration:**

```jsx
<LiveKitRoom url={...} token={...}>
  <RoomAudioRenderer />          // web-only, not used in RN
  <ConnectionQualityIndicator />
  <PTTButton onPress={...} />
</LiveKitRoom>
```

**State management (Zustand):**

- `useAuthStore` — OAuth tokens (secure storage), connected accounts
- `usePreferencesStore` — VIPs, keywords, topics, verbosity, quiet mode
- `useBriefingStore` — Current session state, connection quality

**Services:**

- `livekit-token.ts` — Fetch room token from backend API
- `offline-queue.ts` — Queue failed commands, retry on network restore
  (AsyncStorage)

---

## Drafts

Drafts are created directly in the user's mailbox via the native provider APIs
(`GmailAdapter.createDraft()` / `OutlookAdapter.createDraft()`), invoked by the
voice agent's `create_draft` tool. There is no separate draft-review client or
backend draft store — a created draft appears in the user's Gmail/Outlook Drafts
folder.

---

## Backend API (Fastify 5)

**Route pattern:** `registerXxxRoutes(app: FastifyInstance)` in `src/routes/`

**Endpoints:**

| Method | Path                       | Purpose                                                 |
| ------ | -------------------------- | ------------------------------------------------------- |
| POST   | `/auth/microsoft/callback` | OAuth redirect, exchange code, store tokens, return JWT |
| POST   | `/auth/google/callback`    | Same for Google                                         |
| POST   | `/livekit/token`           | Generate LiveKit room access token (1h TTL)             |
| POST   | `/webhooks/livekit`        | Room events, track pub/unpub, analytics                 |
| POST   | `/briefing/precompute`     | Trigger background LLM pipeline                         |
| GET    | `/briefing/status/:userId` | Check if precomputation is ready                        |
| GET    | `/email/stats`             | Priority counts (high/medium/low)                       |
| GET    | `/health`                  | Redis dependency check                                  |
| GET    | `/live`                    | K8s liveness (always ok)                                |
| GET    | `/ready`                   | K8s readiness (503 if Redis down)                       |

**Middleware stack** (registered in `createApp()`):

1. `@fastify/helmet` — Security headers
2. `@fastify/cors` — Production: `API_BASE_URL` + `*.nexusaec.com`; dev: all
   origins
3. `@fastify/rate-limit` — 100 req/min/IP, Redis store when available
4. JWT auth — preHandler on all routes except health, auth, webhooks
