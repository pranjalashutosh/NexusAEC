# Intelligence Layer

> AI-powered email analysis: LLM-based preprocessing, prioritization, and
> clustering for briefing generation. All processing is Tier 1 (ephemeral). See
> [overview](../../ARCHITECTURE.md).

---

## LLM Preprocessing Pipeline

The intelligence layer prioritizes and groups emails with a single batched
GPT-4o pass (`EmailPreprocessor`). There is no separate rule-based scoring or
clustering stage — priority and grouping come directly from the LLM.

```
StandardEmail[] (from UnifiedInbox)
  │
  ├─► presortEmails()            heuristic ordering (VIP → replied-to → recency)
  │
  ├─► Batch into groups of 25
  │
  ├─► preprocessEmails() → GPT-4o (Batch 1 sync, Batches 2..N in background)
  │     For each email: { priority: high|medium|low, summary, clusterLabel }
  │     For each cluster: { label, priority, emails[] }
  │
  └─► BriefingData → briefing generator
        topics ordered high → medium → low
```

**Per-email output (`PreprocessedEmail`):**

- `priority` — `high` | `medium` | `low` (LLM-assigned)
- `summary` — voice-friendly one-liner
- `clusterLabel` — the topic this email belongs to

**Fallback:** When no `OPENAI_API_KEY` is available, or the LLM call fails, the
pipeline returns an **empty briefing** (logged as a warning). There is no
rule-based fallback path.

---

## Prioritization

`priority` flows straight from the LLM through the pipeline. The briefing
pipeline (`packages/livekit-agent/src/briefing-pipeline.ts`) carries each
email's `priority` and `summary` onto `ScoredEmail`, and derives:

- `BriefingTopic.flaggedCount` — number of `high`-priority emails in the topic
- `BriefingData.totalFlagged` — number of `high`-priority emails overall
- Topic ordering — `high` first, then by `flaggedCount`

Personalization signals feed the LLM prompt rather than a scoring formula:

- **VIP hints** — `presortEmails()` boosts VIP senders in the pre-sort order.
- **Sender preferences** — `SenderProfileStore.synthesizePreferences()` injects
  natural-language guidance ("archives newsletters", "always replies to X").
- **Knowledge rules** — `[rule]` knowledge entries drive `extractFilterRules()`,
  which filters blocked domains/keywords out before the LLM pass.

---

## Topic Clustering

Clustering is produced by the LLM in the same `preprocessEmails()` pass — each
cluster is `{ label, priority, emails[] }`. The briefing pipeline maps clusters
to `BriefingTopic`s (`id: llm-cluster-N`) with no separate similarity/merge
algorithm.

---

## Briefing Generation

`BriefingData.topics` → the voice agent's `ReasoningLoop` builds a per-turn
system context (`buildCursorContext()`) and streams GPT-4o narration.

**Script structure:**

1. **Opening** — Email count, high-priority count, set expectations
2. **Topics** — Ordered by priority, with the LLM summary per email
3. **Closing** — Summary, offer to continue or skip

**Navigation commands during briefing:** `skip this topic` · `go deeper` ·
`next item` · `repeat that` · `pause` · `stop`

**Progressive loading:** Batch 1 briefs immediately; later batches are processed
in the background and merged into the active session via
`BriefingSessionTracker.addTopics()`.
