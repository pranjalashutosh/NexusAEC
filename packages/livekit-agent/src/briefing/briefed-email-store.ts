/**
 * @nexus-aec/livekit-agent - Briefed Email Store
 *
 * Redis-backed store that persists which emails have been briefed/actioned
 * across sessions. On the next session, these email IDs are used to exclude
 * already-handled emails from the briefing pipeline, giving accurate
 * "new email" counts.
 *
 * Data model:
 *   Redis key: nexus:briefed:{userId}
 *   Type: Hash
 *   Fields: emailId → JSON { status, action, timestamp }
 *   TTL: 7 days (briefings older than a week are forgotten)
 *
 * PRD Rule 60 compliant: Only stores email IDs and status metadata,
 * never email content (body, subject, sender).
 *
 * Pattern: Follows the same Redis pattern as UserKnowledgeStore
 * (singleton client, graceful fallback if Redis unavailable).
 */

import Redis from 'ioredis';
import { createLogger } from '@nexus-aec/logger';

const logger = createLogger({ baseContext: { component: 'briefed-email-store' } });

// =============================================================================
// Types
// =============================================================================

export interface BriefedEmailRecord {
  status: 'briefed' | 'actioned' | 'skipped';
  action?: string; // 'archive_email' | 'flagged' | 'mark_read'
  timestamp: number; // epoch ms
}

interface BriefedEmailStoreOptions {
  redisUrl: string;
}

// =============================================================================
// Constants
// =============================================================================

const REDIS_KEY_PREFIX = 'nexus:briefed:';
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// =============================================================================
// BriefedEmailStore
// =============================================================================

export class BriefedEmailStore {
  private redis: Redis | null = null;
  private redisAvailable = false;

  constructor(options: BriefedEmailStoreOptions) {
    try {
      this.redis = new Redis(options.redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
          if (times > 3) return null;
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true,
      });

      this.redis.on('connect', () => {
        this.redisAvailable = true;
        logger.info('BriefedEmailStore Redis connected');
      });

      this.redis.on('error', (err) => {
        if (this.redisAvailable) {
          logger.warn('BriefedEmailStore Redis error', { error: err.message });
          this.redisAvailable = false;
        }
      });

      this.redis.on('close', () => {
        this.redisAvailable = false;
      });

      this.redis.connect().catch((err) => {
        logger.warn('BriefedEmailStore Redis unavailable', {
          error: err instanceof Error ? err.message : String(err),
        });
        this.redisAvailable = false;
      });
    } catch (err) {
      logger.warn('BriefedEmailStore Redis init failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ===========================================================================
  // Write
  // ===========================================================================

  /**
   * Mark a single email as briefed.
   */
  async markBriefed(userId: string, emailId: string): Promise<void> {
    const record: BriefedEmailRecord = {
      status: 'briefed',
      timestamp: Date.now(),
    };
    await this.writeRecord(userId, emailId, record);
  }

  /**
   * Mark a single email as actioned (archived, flagged, read).
   */
  async markActioned(userId: string, emailId: string, action: string): Promise<void> {
    const record: BriefedEmailRecord = {
      status: 'actioned',
      action,
      timestamp: Date.now(),
    };
    await this.writeRecord(userId, emailId, record);
  }

  /**
   * Mark a single email as skipped.
   */
  async markSkipped(userId: string, emailId: string): Promise<void> {
    const record: BriefedEmailRecord = {
      status: 'skipped',
      timestamp: Date.now(),
    };
    await this.writeRecord(userId, emailId, record);
  }

  /**
   * Write a batch of records at once (used at end-of-session flush).
   */
  async markBatch(
    userId: string,
    records: Array<{ emailId: string; record: BriefedEmailRecord }>,
  ): Promise<void> {
    if (!this.redis || !this.redisAvailable || records.length === 0) return;

    const key = `${REDIS_KEY_PREFIX}${userId}`;
    try {
      const pipeline = this.redis.pipeline();
      for (const { emailId, record } of records) {
        pipeline.hset(key, emailId, JSON.stringify(record));
      }
      pipeline.expire(key, TTL_SECONDS);
      await pipeline.exec();

      logger.info('Batch briefed records written', {
        userId,
        count: records.length,
      });
    } catch (err) {
      logger.warn('Redis batch write failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ===========================================================================
  // Read
  // ===========================================================================

  /**
   * Get all briefed/actioned/skipped email IDs (any status).
   */
  async getBriefedIds(userId: string): Promise<Set<string>> {
    const all = await this.getAll(userId);
    return new Set(all.keys());
  }

  /**
   * Get only actioned email IDs.
   */
  async getActionedIds(userId: string): Promise<Set<string>> {
    const all = await this.getAll(userId);
    const result = new Set<string>();
    for (const [emailId, record] of all) {
      if (record.status === 'actioned') {
        result.add(emailId);
      }
    }
    return result;
  }

  /**
   * Get all records for a user.
   */
  async getAll(userId: string): Promise<Map<string, BriefedEmailRecord>> {
    const result = new Map<string, BriefedEmailRecord>();
    if (!this.redis || !this.redisAvailable) return result;

    const key = `${REDIS_KEY_PREFIX}${userId}`;
    try {
      const data = await this.redis.hgetall(key);
      for (const [emailId, json] of Object.entries(data)) {
        try {
          result.set(emailId, JSON.parse(json) as BriefedEmailRecord);
        } catch {
          // Skip malformed records
        }
      }
    } catch (err) {
      logger.warn('Redis read failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Disconnect Redis. Call on agent shutdown.
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // Ignore disconnect errors
      }
      this.redis = null;
      this.redisAvailable = false;
    }
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private async writeRecord(
    userId: string,
    emailId: string,
    record: BriefedEmailRecord,
  ): Promise<void> {
    if (!this.redis || !this.redisAvailable) return;

    const key = `${REDIS_KEY_PREFIX}${userId}`;
    try {
      await this.redis.hset(key, emailId, JSON.stringify(record));
      await this.redis.expire(key, TTL_SECONDS);
    } catch (err) {
      logger.warn('Redis write failed', {
        userId,
        emailId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
