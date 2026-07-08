/**
 * Agent job / graph wire contracts.
 *
 * Shared across the API (enqueue), the worker (Graph A/B execution), and the
 * livekit-agent Voice Node (dispatch + result speaker). See
 * docs/architecture/langgraph-migration-plan.md §7.
 *
 * PRD Rule 60: `InboxQueueItem` carries email metadata + a derived summary
 * only — never email bodies. Jobs carry NO OAuth tokens (§6.2) — the worker
 * builds provider adapters per job from the encrypted token store.
 */

/** Priority buckets. Ordering and narration rely EXCLUSIVELY on this (D7). */
export type QueuePriority = 'high' | 'medium' | 'low';

/**
 * One email in the RAG-sorted briefing queue produced by Graph A.
 *
 * D7: no `clusterLabel` — the briefing walks priority buckets, not topics.
 */
export interface InboxQueueItem {
  emailId: string;
  threadId?: string;
  from: string;
  subject: string;
  /** ISO-8601 timestamp. */
  receivedAt: string;
  priority: QueuePriority;
  /** The 6–14-word spoken-intent line. */
  summary: string;
  /** Doc/profile IDs that justified the ranking — identifiers, never content. */
  ragEvidence?: string[];
  status: 'pending' | 'briefed' | 'actioned' | 'skipped';
}

/**
 * Voice Node cursor over the briefing queue.
 *
 * D7: priority-bucket traversal (high → medium → low), anchored on a stable
 * `emailId` so background batch merges never shift the position. The Voice
 * Node is the sole writer.
 */
export interface QueueCursor {
  /** `null` = briefing not started / complete. */
  currentEmailId: string | null;
  /** Universal Lock (D5). */
  locked: boolean;
  lockReason?: 'command' | 'question' | 'awaiting_worker' | 'awaiting_approval';
  /** Context-lock target; may be an email outside the queue (e.g. a search hit). */
  focusEmailId?: string;
  lockedAt?: string;
}

/**
 * A tool call staged by the ReAct worker that requires user approval before it
 * commits (Graph B, §6). `expiresAt` drives the 60s auto-reject (D4).
 */
export interface PendingAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  status: 'proposed' | 'approved' | 'rejected' | 'executed' | 'failed';
  /** ISO-8601, createdAt + 60s (D4). */
  expiresAt: string;
}

/** A unit of background work enqueued onto the job bus. Carries NO tokens (§6.2). */
export interface AgentJob {
  jobId: string;
  userId: string;
  /** Absent for offline runs (e.g. scheduled inbox sorts). */
  sessionId?: string;
  kind: 'react_task' | 'inbox_sort';
  /** Raw user command for react tasks. */
  utterance?: string;
  /** Context-lock target at dispatch time. */
  focusEmailId?: string;
  /** ISO-8601 timestamp. */
  requestedAt: string;
}

/** The terminal result of a worker job, published back to the Voice Node. */
export interface AgentJobResult {
  jobId: string;
  userId: string;
  sessionId?: string;
  status: 'completed' | 'rejected' | 'failed' | 'timeout';
  /** ≤2 sentences, TTS-ready. */
  voiceSummary: string;
  /** Voice Node sets `cursor.focusEmailId` from this. */
  focusEmailId?: string;
  queueDelta?: Array<{ emailId: string; status: InboxQueueItem['status'] }>;
}
