# Architecture Design Decisions

> Key ADRs explaining *why* the system is built the way it is.
> See [overview](../../ARCHITECTURE.md) for system context.

---

## ADR-1: LiveKit over Custom WebRTC

**Decision:** Use LiveKit Cloud for all voice processing.

**Why:**
- WebRTC is complex (signaling, STUN/TURN, codec negotiation, resilience)
- LiveKit provides production-ready: auto-scaling media servers, built-in STT/TTS
  plugins, network resilience, connection quality monitoring, barge-in via VAD
- Development time: months → weeks
- No custom audio pipeline maintenance

**Trade-offs:**
- Vendor lock-in (mitigated: open-source, self-hostable)
- Usage-based cost (acceptable for MVP)

---

## ADR-2: Unified Adapter Pattern over Direct API Calls

**Decision:** Abstract Outlook and Gmail behind `EmailProvider` interface.

**Why:**
- Provider APIs differ (Graph vs REST)
- Normalization simplifies application logic
- Easy to add providers (Yahoo, ProtonMail)
- Single interface to test and mock
- Source tagging enables smart draft routing

**Trade-offs:**
- Abstraction overhead (mitigated: thin adapter layer)
- Potential loss of provider-specific features (acceptable for MVP)

---

## ADR-3: Three-Tier Memory over Single Database

**Decision:** Ephemeral (in-memory) → Redis (session) → Supabase (knowledge).

**Why:**
- Tier 1: Email content is sensitive, must discard after processing (PRD Rule 60)
- Tier 2: Session state needs fast access (<10ms latency)
- Tier 3: Knowledge base requires vector search (pgvector)
- Hot path (briefing) uses in-memory only = maximum performance
- Minimal data retention = maximum privacy

**Trade-offs:**
- Three stores to manage (mitigated: clear boundaries per tier)
- Redis cost (mitigated: TTL-based auto-expiry)

---

## ADR-4: Desktop-Only Draft Review

**Decision:** Draft approval via desktop Electron app only. Mobile cannot send.

**Why:**
- Safety: Large screen for reviewing draft + thread context
- Deliberate action: Requires user to stop and focus (not in-motion)
- Audit trail: Desktop UI better for activity history
- Ergonomics: Editing drafts is easier on desktop

**Trade-offs:**
- Requires desktop installation (acceptable: enterprise use case)
- Cannot send from mobile (intentional safety feature)

---

## ADR-5: Monorepo with Turborepo + pnpm

**Decision:** Single monorepo for all packages and apps.

**Why:**
- Shared types = single source of truth
- Atomic commits across shared types + consumers
- Turborepo caching and parallel builds = faster CI
- Cross-codebase grep for easier refactoring

**Trade-offs:**
- Larger repo size (mitigated: pnpm saves disk)
- Tooling learning curve (acceptable: well-documented)

---

## ADR-6: Stateless API for Lambda Compatibility

**Decision:** Move all in-memory Maps to Redis with TTLs.

**Why:**
- Lambda runs each request in potentially different containers — in-memory Maps
  (`pendingOAuthStates`, `completedOAuthResults`, `userDrafts`, `userPreferences`,
  `roomSessions`) are lost between invocations
- Redis TTLs match original `setTimeout` durations (10 min OAuth state, 5 min results)
- `redis-state.ts` returns `null`/`{}`/`false` when Redis unavailable (graceful
  fallback matching existing `getRedisClient()` pattern)

**Trade-offs:**
- Redis dependency for state (mitigated: graceful fallback, API works degraded without Redis)

---

## ADR-7: Token Encryption with Password-Based Derivation

**Decision:** Use `encryptWithPassword()` (PBKDF2, 100K iterations) for OAuth
token encryption at rest.

**Why:**
- Derives key from `TOKEN_ENCRYPTION_KEY` or `JWT_SECRET` — avoids managing a
  separate 32-byte key
- `RedisTokenStorage` in production, `FileTokenStorage` fallback in dev (switched
  by `NODE_ENV` in `auth.ts`)

---

## ADR-8: Cross-Session Memory Persistence

**Decision:** Dual-write to Redis + Supabase with fire-and-forget patterns.

**Why:**
- **Dual-write durability:** `UserKnowledgeStore.append()` uses
  `Promise.allSettled()` — succeeds if at least one backend writes. Supabase
  retries 2x with exponential backoff for transient failures.
- **Redis race condition:** `lazyConnect` mode meant reads could fire before
  connection completed. Solved by `connectPromise` + `waitForReady()`.
- **Knowledge must load before pipeline:** Rules like "never show Quora emails"
  need to be available _before_ `runBriefingPipeline()` processes emails.
- **Mute/VIP must survive reconnects:** Fire-and-forget writes to
  `PreferencesStore` make them durable without blocking voice interaction.
- **`recall_knowledge` synthesizes via LLM:** After `recall_knowledge` executes,
  a follow-up `callLLM()` lets GPT-4o synthesize findings into natural speech
  instead of reading raw `[rule]` entries verbatim.
