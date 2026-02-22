/**
 * @nexus-aec/api - Briefing Pre-Compute Service
 *
 * Runs the full briefing pipeline (fetch + Batch 1 LLM preprocessing)
 * in the API layer when the mobile app opens. Stores Batch 1 results
 * in Redis for instant session start.
 *
 * Key: nexus:prebriefing:{userId}
 * TTL: 30 minutes
 */

import { createLogger } from '@nexus-aec/logger';

import { getRedisClient } from '../lib/redis';

const logger = createLogger({ baseContext: { component: 'briefing-precompute' } });

// =============================================================================
// Types
// =============================================================================

export interface PrecomputedBriefing {
  /** Serialized BriefingData from Batch 1 */
  briefingJson: string;
  /** Remaining batches (serialized EmailMetadata[][]) */
  remainingBatchesJson: string;
  /** When the pre-computation was performed */
  computedAt: string;
  /** Gmail historyId at time of computation (for staleness check) */
  historyId?: string;
  /** Number of emails included */
  emailCount: number;
}

// =============================================================================
// Constants
// =============================================================================

const KEY_PREFIX = 'nexus:prebriefing:';
const TTL_SECONDS = 30 * 60; // 30 minutes
const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes — loader uses fresh data after this

// =============================================================================
// Service
// =============================================================================

/**
 * Store pre-computed briefing data in Redis.
 */
export async function storePrebriefing(
  userId: string,
  data: PrecomputedBriefing
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn('Redis unavailable, cannot store pre-briefing');
    return false;
  }

  try {
    const key = `${KEY_PREFIX}${userId}`;
    await redis.set(key, JSON.stringify(data), 'EX', TTL_SECONDS);
    logger.info('Pre-briefing stored', {
      userId,
      emailCount: data.emailCount,
      ttlSeconds: TTL_SECONDS,
    });
    return true;
  } catch (error) {
    logger.warn('Failed to store pre-briefing', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return false;
  }
}

/**
 * Load pre-computed briefing data from Redis.
 * Returns null if not found or too old.
 */
export async function loadPrebriefing(userId: string): Promise<PrecomputedBriefing | null> {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  try {
    const key = `${KEY_PREFIX}${userId}`;
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }

    const data = JSON.parse(raw) as PrecomputedBriefing;

    // Check staleness
    const computedAt = new Date(data.computedAt).getTime();
    if (Date.now() - computedAt > MAX_AGE_MS) {
      logger.info('Pre-briefing too old, discarding', {
        userId,
        ageMs: Date.now() - computedAt,
        maxAgeMs: MAX_AGE_MS,
      });
      return null;
    }

    return data;
  } catch (error) {
    logger.warn('Failed to load pre-briefing', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return null;
  }
}

/**
 * Check if a pre-computed briefing exists and is fresh.
 */
export async function getPrebriefingStatus(
  userId: string
): Promise<{ ready: boolean; emailCount: number }> {
  const data = await loadPrebriefing(userId);
  if (!data) {
    return { ready: false, emailCount: 0 };
  }
  return { ready: true, emailCount: data.emailCount };
}
