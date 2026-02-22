/**
 * @nexus-aec/livekit-agent - Precomputed Briefing Loader
 *
 * Loads pre-computed Batch 1 results from Redis.
 * If data is fresh (<15 min old), uses it for instant session start.
 * Otherwise falls back to the live pipeline.
 */

import { createLogger } from '@nexus-aec/logger';
import Redis from 'ioredis';

const logger = createLogger({ baseContext: { component: 'precomputed-loader' } });

// =============================================================================
// Types
// =============================================================================

interface PrecomputedBriefing {
  briefingJson: string;
  remainingBatchesJson: string;
  computedAt: string;
  historyId?: string;
  emailCount: number;
}

// =============================================================================
// Constants
// =============================================================================

const KEY_PREFIX = 'nexus:prebriefing:';
const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

// =============================================================================
// Loader
// =============================================================================

/**
 * Try to load a pre-computed briefing from Redis.
 * Returns null if not available, too old, or Redis is down.
 */
export async function loadPrecomputedBriefing(
  userId: string,
  redisUrl: string
): Promise<PrecomputedBriefing | null> {
  let redis: Redis | null = null;

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    await redis.connect();

    const key = `${KEY_PREFIX}${userId}`;
    const raw = await redis.get(key);

    if (!raw) {
      logger.info('No pre-computed briefing found', { userId });
      return null;
    }

    const data = JSON.parse(raw) as PrecomputedBriefing;

    // Check staleness
    const computedAt = new Date(data.computedAt).getTime();
    const ageMs = Date.now() - computedAt;

    if (ageMs > MAX_AGE_MS) {
      logger.info('Pre-computed briefing too old', {
        userId,
        ageMs,
        maxAgeMs: MAX_AGE_MS,
      });
      return null;
    }

    // Check if it has actual data (not just a placeholder)
    if (data.emailCount === 0) {
      logger.info('Pre-computed briefing is a placeholder (no data yet)', { userId });
      return null;
    }

    logger.info('Loaded pre-computed briefing', {
      userId,
      emailCount: data.emailCount,
      ageMs,
    });

    return data;
  } catch (error) {
    logger.warn('Failed to load pre-computed briefing', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return null;
  } finally {
    if (redis) {
      await redis.quit().catch(() => {});
    }
  }
}
