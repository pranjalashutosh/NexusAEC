/**
 * Email Stats Cache Service (Tier 2 — Redis)
 *
 * Caches computed email stats and sync cursors in Redis.
 * PRD Rule 60 compliant: no email content or bodies are cached,
 * only aggregate stats (3 numbers) and sync cursors.
 *
 * Graceful fallback: if Redis client is null, all operations become no-ops.
 */

import { createLogger } from '@nexus-aec/logger';

import type Redis from 'ioredis';

const logger = createLogger({ baseContext: { component: 'email-stats-cache' } });

// =============================================================================
// Types
// =============================================================================

export interface CachedStats {
  newCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  cachedAt: string; // ISO timestamp
}

export interface SyncCursor {
  /** Gmail History API cursor */
  gmailHistoryId?: string;
  /** Outlook latest receivedDateTime ISO string */
  outlookLastReceivedAt?: string;
  /** Last computed stats JSON (reused when no changes detected) */
  lastStats?: CachedStats;
}

// =============================================================================
// Constants
// =============================================================================

const STATS_KEY_PREFIX = 'nexus:emailstats:';
const CURSOR_KEY_PREFIX = 'nexus:synccursor:';
const PRIORITY_KEY_PREFIX = 'nexus:priority-counts:';

const DEFAULT_STATS_TTL = 120; // 2 minutes
const DEFAULT_CURSOR_TTL = 600; // 10 minutes
const DEFAULT_PRIORITY_TTL = 1800; // 30 minutes

// =============================================================================
// Cache Service
// =============================================================================

export class EmailStatsCache {
  private readonly client: Redis | null;

  constructor(redisClient: Redis | null) {
    this.client = redisClient;
  }

  // ---------------------------------------------------------------------------
  // Stats Cache
  // ---------------------------------------------------------------------------

  /**
   * Get cached stats for a user + VIP combination.
   * Returns null on cache miss or if Redis is unavailable.
   */
  async getStats(userId: string, vipHash: string): Promise<CachedStats | null> {
    if (!this.client) {
      return null;
    }

    try {
      const key = `${STATS_KEY_PREFIX}${userId}:${vipHash}`;
      const data = await this.client.get(key);
      if (!data) {
        return null;
      }

      const stats = JSON.parse(data) as CachedStats;
      logger.info('Stats cache hit', { userId });
      return stats;
    } catch (error) {
      logger.warn('Stats cache read failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Cache computed stats with TTL.
   */
  async setStats(
    userId: string,
    vipHash: string,
    stats: Omit<CachedStats, 'cachedAt'>,
    ttlSeconds: number = DEFAULT_STATS_TTL
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const key = `${STATS_KEY_PREFIX}${userId}:${vipHash}`;
      const value: CachedStats = { ...stats, cachedAt: new Date().toISOString() };
      await this.client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      logger.warn('Stats cache write failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Sync Cursor Cache
  // ---------------------------------------------------------------------------

  /**
   * Get sync cursor for a user + source.
   */
  async getSyncCursor(userId: string, source: string): Promise<SyncCursor | null> {
    if (!this.client) {
      return null;
    }

    try {
      const key = `${CURSOR_KEY_PREFIX}${userId}:${source}`;
      const data = await this.client.get(key);
      if (!data) {
        return null;
      }

      return JSON.parse(data) as SyncCursor;
    } catch (error) {
      logger.warn('Sync cursor read failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Store sync cursor with TTL.
   */
  async setSyncCursor(
    userId: string,
    source: string,
    cursor: SyncCursor,
    ttlSeconds: number = DEFAULT_CURSOR_TTL
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const key = `${CURSOR_KEY_PREFIX}${userId}:${source}`;
      await this.client.setex(key, ttlSeconds, JSON.stringify(cursor));
    } catch (error) {
      logger.warn('Sync cursor write failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Priority Counts Cache (from LLM pipeline)
  // ---------------------------------------------------------------------------

  /**
   * Get cached LLM-derived priority counts for a user.
   */
  async getPriorityCounts(
    userId: string
  ): Promise<{ high: number; medium: number; low: number } | null> {
    if (!this.client) {
      return null;
    }

    try {
      const key = `${PRIORITY_KEY_PREFIX}${userId}`;
      const data = await this.client.get(key);
      if (!data) {
        return null;
      }

      return JSON.parse(data) as { high: number; medium: number; low: number };
    } catch (error) {
      logger.warn('Priority counts cache read failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Cache LLM-derived priority counts with 30-min TTL.
   */
  async setPriorityCounts(
    userId: string,
    counts: { high: number; medium: number; low: number },
    ttlSeconds: number = DEFAULT_PRIORITY_TTL
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const key = `${PRIORITY_KEY_PREFIX}${userId}`;
      await this.client.setex(key, ttlSeconds, JSON.stringify(counts));
    } catch (error) {
      logger.warn('Priority counts cache write failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Invalidation
  // ---------------------------------------------------------------------------

  /**
   * Invalidate all cached data for a user (stats + cursors).
   */
  async invalidateUser(userId: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const patterns = [
        `${STATS_KEY_PREFIX}${userId}:*`,
        `${CURSOR_KEY_PREFIX}${userId}:*`,
        `${PRIORITY_KEY_PREFIX}${userId}`,
      ];

      for (const pattern of patterns) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      }

      logger.info('Cache invalidated for user', { userId });
    } catch (error) {
      logger.warn('Cache invalidation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Invalidate only stats cache for a user (keeps cursors).
   */
  async invalidateStats(userId: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const pattern = `${STATS_KEY_PREFIX}${userId}:*`;
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      logger.warn('Stats invalidation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a stable hash from a VIP list for cache key generation.
 * Same VIP list always produces the same hash regardless of order.
 */
export function computeVipHash(vips: string[]): string {
  if (vips.length === 0) {
    return 'none';
  }
  return vips.slice().sort().join(',').toLowerCase();
}
