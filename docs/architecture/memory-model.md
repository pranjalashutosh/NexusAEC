# Three-Tier Memory Model

> Balances performance, privacy, and personalization. Email content never
> persists (PRD Rule 60). See [overview](../../ARCHITECTURE.md) for system context.

---

## Tier 1: Ephemeral (In-Memory Processing)

- **Purpose:** Real-time email analysis and scoring
- **Lifecycle:** Request-scoped (discarded after processing)
- **Location:** Application memory (Node.js/Python process)

**Components:**

| Component | Role |
|-----------|------|
| Red Flag Scorer | Composite scoring (keyword + VIP + velocity + calendar) |
| Topic Clusterer | Group emails by thread, subject similarity, participants |
| VIP Detector | Check sender against VIP list + interaction frequency |
| Thread Velocity | Count replies in 24h, detect escalation language |
| Calendar Proximity | Match emails to upcoming events |

**Data types:** `StandardEmail[]`, `RedFlag[]`, `Topic[]`

---

## Tier 2: Session State (Redis)

- **Purpose:** Live "Drive State" for active voice sessions
- **Lifecycle:** Session-scoped (24-hour TTL)
- **Location:** Redis (in-memory key-value store)

**DriveState schema:**

```json
{
  "sessionId": "uuid",
  "currentTopicIndex": 2,
  "currentItemIndex": 5,
  "itemsRemaining": 12,
  "interruptStatus": "none",
  "lastPosition": 1234,
  "startedAt": "2026-01-09T10:00:00Z",
  "updatedAt": "2026-01-09T10:15:23Z"
}
```

**Shadow Processor** (background service):
- Listens to LiveKit transcript events
- Updates Redis state in real-time
- "Ack & Act" pattern for responsiveness

**Redis key patterns** (canonical reference):
- `nexus:sender:{userId}:{hash}` — sender profiles (90-day TTL)
- `nexus:prebriefing:{userId}` — pre-computed briefing cache (30-min TTL)
- `nexus:briefed:{userId}` — briefed email records (7-day TTL)
- `nexus:knowledge:{userId}` — user knowledge document (no TTL)
- `nexus:priority-counts:{userId}` — LLM-derived high/medium/low counts (30-min TTL, written by both API `runPrecomputation()` and voice agent after pipeline)
- `nexus:tokens:{key}` — encrypted OAuth tokens (90-day TTL)
- `nexus:oauth-state:{state}` — pending OAuth flows (10-min TTL)
- `nexus:oauth-result:{state}` — completed OAuth results for mobile polling (5-min TTL)
- `nexus:drafts:{userId}` — synced drafts (30-day TTL)
- `nexus:prefs:{userId}` — user preferences (1-year TTL)
- `nexus:room-sessions` — webhook room session analytics hash (24h TTL)

---

## Tier 3: Knowledge Base (Supabase Vector Store)

- **Purpose:** Long-term domain knowledge (assets, manuals, procedures)
- **Lifecycle:** Persistent (until explicitly deleted)
- **Location:** Supabase (PostgreSQL + pgvector)

**Schema:**

```sql
documents (
  id          UUID PRIMARY KEY,
  content     TEXT,
  embedding   VECTOR(1536),          -- OpenAI ada-002
  source_type ENUM('ASSET', 'SAFETY_MANUAL', 'PROCEDURE'),
  metadata    JSONB,                 -- { asset_id, category, location, ... }
  created_at  TIMESTAMP
)
```

**Indexes:** HNSW vector similarity, `source_type`, `metadata->>'asset_id'`

**Data sources:** MVP uses hardcoded seed files (20-50 assets). Production: CSV
import from client asset management + PDF extraction/chunking for safety manuals.

---

## Data Flow Between Tiers

```
User Voice Command → LiveKit Agent
                         ↓
                   GPT-4o Reasoning
                         ↓
              ┌──────────┴──────────┐
              ▼                     ▼
     Tier 2: Redis           Tier 3: Supabase
     (Check state)           (RAG lookup)
              │                     │
              └──────────┬──────────┘
                         ▼
              Tier 1: Ephemeral
              (Process, score)
                         ↓
                 Generate Response
                         ↓
                  ElevenLabs TTS → User
```

## Tier Selection Guide

| Use Case | Tier | Rationale |
|----------|------|-----------|
| Email content analysis | 1 | Ephemeral, no need to persist email bodies |
| Red flag scoring | 1 | Computed per-request, discarded after |
| Current briefing position | 2 | Session state, survives interruptions |
| User interrupt handling | 2 | Real-time updates from transcript |
| Asset knowledge (NCE IDs) | 3 | Persistent domain knowledge |
| Safety manual excerpts | 3 | Persistent, rarely changes |
| User preferences (VIPs) | 3 | Persistent, synced across devices |
