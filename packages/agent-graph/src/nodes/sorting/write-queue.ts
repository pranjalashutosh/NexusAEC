/**
 * Graph A · write-queue
 *
 * Terminal side effects once the priority-ordered queue is committed to graph
 * state: mirror the priority counts to Redis for the mobile app, and publish a
 * queue-updated signal for any live voice session.
 *
 * The counts key + serialization match the existing writers exactly
 * (`apps/api` `email-stats-cache`, `livekit-agent` `agent.ts`) so the mobile
 * reader is unaffected: `SETEX nexus:priority-counts:{userId} 1800 {json}`.
 */

import { publishQueueUpdate } from '../../bus/jobs';

import type { InboxQueueItem } from '@nexus-aec/shared-types';
import type { Redis } from 'ioredis';

export interface PriorityCounts {
  high: number;
  medium: number;
  low: number;
}

/** 30-minute TTL — matches `email-stats-cache` DEFAULT_PRIORITY_TTL. */
export const PRIORITY_COUNTS_TTL_SECONDS = 1800;

export function priorityCountsKey(userId: string): string {
  return `nexus:priority-counts:${userId}`;
}

/** Tally items into `{ high, medium, low }`. */
export function countByPriority(items: InboxQueueItem[]): PriorityCounts {
  const counts: PriorityCounts = { high: 0, medium: 0, low: 0 };
  for (const item of items) {
    counts[item.priority] += 1;
  }
  return counts;
}

/**
 * Mirror the counts to Redis and publish a queue-updated event. Never throws —
 * a Redis failure is logged and swallowed so the sort result still stands.
 */
export async function commitQueueSideEffects(
  redis: Redis,
  userId: string,
  items: InboxQueueItem[],
  logger?: { warn(msg: string, meta?: Record<string, unknown>): void }
): Promise<PriorityCounts> {
  const counts = countByPriority(items);

  try {
    await redis.setex(
      priorityCountsKey(userId),
      PRIORITY_COUNTS_TTL_SECONDS,
      JSON.stringify(counts)
    );
  } catch (err) {
    logger?.warn('write-queue: failed to mirror priority counts', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await publishQueueUpdate(redis, {
      userId,
      counts,
      total: items.length,
      at: new Date().toISOString(),
    });
  } catch (err) {
    logger?.warn('write-queue: failed to publish queue update', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return counts;
}
