# Intelligence Layer

> AI-powered email analysis: red flag detection, topic clustering, and briefing
> generation. All processing is Tier 1 (ephemeral). See [overview](../../ARCHITECTURE.md).

---

## Red Flag Detection Pipeline

```
StandardEmail[] (from UnifiedInbox)
  │
  ├─► Parallel Scoring
  │     ├─ Keyword Matcher    (regex + fuzzy, score 0.0-1.0)
  │     ├─ VIP Detector       (VIP list + frequency, 0.0 or 0.8)
  │     ├─ Thread Velocity    (reply count in 24h, escalation, 0.0-1.0)
  │     └─ Calendar Proximity (upcoming events, 0.0-1.0)
  │
  ├─► Composite Scorer
  │     score = (keyword × 0.3) + (vip × 0.4) +
  │             (velocity × 0.2) + (calendar × 0.1)
  │     Threshold: > 0.7 = RED FLAG
  │
  ├─► Explanation Generator (GPT-4o)
  │     "This is a red flag because John Smith (your VIP) sent 3
  │      follow-ups about the incident, and you have a meeting in 2h."
  │
  └─► RedFlag[] → briefing generator
```

---

## Topic Clustering

**Algorithm:**

1. **Extract features** per email: thread ID, normalized subject (strip RE:/FW:),
   participants, optional semantic embedding
2. **Group by thread ID** — same conversation = same topic
3. **Cluster remaining** by subject similarity (Levenshtein, 80% threshold)
4. **Merge clusters** with 50%+ participant overlap
5. **Label clusters** — user-defined topics or auto-generated from common subject

**Output:**

```json
[
  {
    "id": "topic-1",
    "name": "Q1 Budget Review",
    "emails": [/* 12 emails */],
    "redFlagCount": 2,
    "lastActivityAt": "2026-01-09T10:30:00Z"
  },
  {
    "id": "topic-2",
    "name": "P-104 Pump Maintenance",
    "emails": [/* 5 emails */],
    "redFlagCount": 1
  }
]
```

---

## Briefing Generation

`Topics[] + RedFlags[]` → GPT-4o Narrative Generator

**Script structure:**

1. **Opening** — Email count, red flag count, set expectations
2. **Red Flags** — High priority first, with context and action prompts
3. **Topics** — Grouped by importance, with latest highlights
4. **Closing** — Summary, offer to continue or skip

**Navigation commands during briefing:**
`skip this topic` · `go deeper` · `next item` · `repeat that` · `pause` · `stop`

**Wait behavior:** After each red flag, wait for user response or auto-continue
after 3 seconds.
