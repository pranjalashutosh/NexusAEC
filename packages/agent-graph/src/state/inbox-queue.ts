/**
 * `inbox_queue` channel helpers + the `mergeByEmailId` reducer.
 *
 * The queue is the RAG-sorted briefing produced by Graph A. Ordering relies
 * EXCLUSIVELY on priority (D7): high → medium → low, then most-recent-first
 * within a bucket. The reducer is the sole guarantor of two invariants:
 *
 *   1. Idempotent re-runs — a background re-sort emits every item as
 *      `pending`; merging must never regress an item that the Voice Node or
 *      worker has already advanced (briefed / actioned / skipped).
 *   2. Stable ordering — merges keep the queue in priority order so the Voice
 *      Node cursor (anchored on `emailId`) never shifts under it.
 */

import type { InboxQueueItem, QueuePriority } from '@nexus-aec/shared-types';

/** Priority ordering rank — lower sorts first (D7: high → medium → low). */
const PRIORITY_RANK: Record<QueuePriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Status progression rank. A merge keeps the higher-ranked status so a
 * re-classification (always `pending`) cannot undo real progress, while a
 * deliberate advance (worker → `actioned`) still wins.
 */
const STATUS_RANK: Record<InboxQueueItem['status'], number> = {
  pending: 0,
  briefed: 1,
  skipped: 2,
  actioned: 3,
};

export function priorityRank(priority: QueuePriority): number {
  return PRIORITY_RANK[priority];
}

/**
 * Sort a queue into briefing order: by priority bucket, then most recent
 * first, then `emailId` as a stable final tiebreak.
 */
export function sortByPriority(items: InboxQueueItem[]): InboxQueueItem[] {
  return [...items].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) {
      return byPriority;
    }
    const byRecency = b.receivedAt.localeCompare(a.receivedAt);
    if (byRecency !== 0) {
      return byRecency;
    }
    return a.emailId.localeCompare(b.emailId);
  });
}

/** Merge one incoming item onto its existing counterpart (content wins, status never regresses). */
function mergeItem(prev: InboxQueueItem, incoming: InboxQueueItem): InboxQueueItem {
  const status =
    STATUS_RANK[incoming.status] >= STATUS_RANK[prev.status] ? incoming.status : prev.status;
  return { ...prev, ...incoming, status };
}

/**
 * Reducer for the `inbox_queue` channel. Upserts incoming items by `emailId`,
 * protects status from regression, and returns the queue in priority order.
 */
export function mergeByEmailId(
  existing: InboxQueueItem[],
  update: InboxQueueItem[]
): InboxQueueItem[] {
  const byId = new Map<string, InboxQueueItem>();
  for (const item of existing) {
    byId.set(item.emailId, item);
  }
  for (const incoming of update) {
    const prev = byId.get(incoming.emailId);
    byId.set(incoming.emailId, prev ? mergeItem(prev, incoming) : incoming);
  }
  return sortByPriority([...byId.values()]);
}

/**
 * Apply a set of `{ emailId, status }` deltas onto a queue, returning a new
 * queue. Deltas for unknown ids are ignored (the email left the window).
 * Used by nodes that only know an id + its new status (worker `observe`,
 * Voice Node briefed/skipped transitions).
 */
export function applyStatusDeltas(
  queue: InboxQueueItem[],
  deltas: Array<{ emailId: string; status: InboxQueueItem['status'] }>
): InboxQueueItem[] {
  if (deltas.length === 0) {
    return queue;
  }
  const statusById = new Map(deltas.map((d) => [d.emailId, d.status]));
  return queue.map((item) => {
    const next = statusById.get(item.emailId);
    return next ? { ...item, status: next } : item;
  });
}
