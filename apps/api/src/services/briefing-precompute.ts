/**
 * @nexus-aec/api - Briefing Pre-Compute Service
 *
 * The mobile app calls POST /briefing/precompute when it opens. The API is now a
 * thin producer: it enqueues an `inbox_sort` job onto the worker bus, and the
 * worker runs Graph A (fetch → filter → classify → priority-ordered queue).
 * Status reads the worker's priority-counts mirror (`nexus:priority-counts:{userId}`).
 *
 * Historical note: this service used to run the fetch + LLM preprocessing inline
 * (adapters, `preprocessEmails`, prebriefing cache). That work moved to
 * `apps/worker` (Graph A) as part of the LangGraph migration.
 */

import { randomUUID } from 'node:crypto';

import { enqueueJob } from '@nexus-aec/agent-graph';
import { createLogger } from '@nexus-aec/logger';

import { EmailStatsCache } from './email-stats-cache';
import { getRedisClient } from '../lib/redis';

const logger = createLogger({ baseContext: { component: 'briefing-precompute' } });

export interface PriorityCounts {
  high: number;
  medium: number;
  low: number;
}

/**
 * Enqueue an `inbox_sort` job for the worker to run Graph A. Fire-and-forget:
 * the route responds immediately and the mobile app polls GET /briefing/status.
 */
export async function runPrecomputation(userId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn('Redis unavailable — cannot enqueue inbox sort', { userId });
    return;
  }

  const streamId = await enqueueJob(redis, {
    jobId: randomUUID(),
    userId,
    kind: 'inbox_sort',
    requestedAt: new Date().toISOString(),
  });

  logger.info('Enqueued inbox_sort job', { userId, streamId });
}

/**
 * Pre-computation status, read from the worker's priority-counts mirror. `ready`
 * once Graph A has committed a queue for the user (counts present).
 */
export async function getPrebriefingStatus(
  userId: string
): Promise<{ ready: boolean; emailCount: number; priorityCounts?: PriorityCounts }> {
  const cache = new EmailStatsCache(getRedisClient());
  const counts = await cache.getPriorityCounts(userId);
  if (!counts) {
    return { ready: false, emailCount: 0 };
  }
  return {
    ready: true,
    emailCount: counts.high + counts.medium + counts.low,
    priorityCounts: counts,
  };
}
