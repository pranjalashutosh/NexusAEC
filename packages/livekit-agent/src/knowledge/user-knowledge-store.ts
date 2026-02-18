/**
 * User Knowledge Store
 *
 * Manages a per-user knowledge document with dual-write to Redis (fast) and
 * Supabase (permanent). Redis is the primary read path; Supabase is the
 * fallback if Redis is empty (cold start / restart).
 *
 * The knowledge document is a small JSON object containing user rules,
 * preferences, feedback, and context observations. It is loaded into the
 * system prompt at session start so the agent remembers across sessions.
 *
 * PRD Rule 60: This store must NEVER contain email content (body, subject,
 * sender). Only behavioural rules, preferences, feedback, and context.
 */

import Redis from 'ioredis';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@nexus-aec/logger';

const logger = createLogger({ baseContext: { component: 'user-knowledge-store' } });

// =============================================================================
// Types
// =============================================================================

export interface KnowledgeEntry {
  id: string;
  content: string;
  category: 'rule' | 'preference' | 'feedback' | 'context';
  source: 'user' | 'agent';
  createdAt: string;
}

export interface KnowledgeDocument {
  userId: string;
  entries: KnowledgeEntry[];
  version: number;
  lastUpdatedAt: string;
}

interface KnowledgeStoreOptions {
  redisUrl: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  /** Maximum number of entries before summarization is needed. Default: 30 */
  maxEntries?: number;
  /** Maximum total character count of all entry content. Default: 3000 */
  maxContentLength?: number;
}

// =============================================================================
// Constants
// =============================================================================

const REDIS_KEY_PREFIX = 'nexus:knowledge:';
const DEFAULT_MAX_ENTRIES = 30;
const DEFAULT_MAX_CONTENT_LENGTH = 3000;

// =============================================================================
// UserKnowledgeStore
// =============================================================================

export class UserKnowledgeStore {
  private redis: Redis | null = null;
  private supabase: SupabaseClient | null = null;
  private redisAvailable = false;
  private maxEntries: number;
  private maxContentLength: number;

  constructor(options: KnowledgeStoreOptions) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxContentLength = options.maxContentLength ?? DEFAULT_MAX_CONTENT_LENGTH;

    // Initialize Redis
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
        logger.info('Knowledge store Redis connected');
      });

      this.redis.on('error', (err) => {
        if (this.redisAvailable) {
          logger.warn('Knowledge store Redis error', { error: err.message });
          this.redisAvailable = false;
        }
      });

      this.redis.on('close', () => {
        this.redisAvailable = false;
      });

      this.redis.connect().catch((err) => {
        logger.warn('Knowledge store Redis unavailable — using Supabase only', {
          error: err instanceof Error ? err.message : String(err),
        });
        this.redisAvailable = false;
      });
    } catch (err) {
      logger.warn('Knowledge store Redis init failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Initialize Supabase (if configured)
    if (options.supabaseUrl && options.supabaseKey) {
      this.supabase = createClient(options.supabaseUrl, options.supabaseKey);
      logger.info('Knowledge store Supabase client initialized');
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get the full knowledge document for a user.
   * Tries Redis first, falls back to Supabase, returns empty doc if both miss.
   */
  async get(userId: string): Promise<KnowledgeDocument> {
    // Try Redis
    const redisDoc = await this.getFromRedis(userId);
    if (redisDoc) return redisDoc;

    // Fallback to Supabase
    const supabaseDoc = await this.getFromSupabase(userId);
    if (supabaseDoc) {
      // Re-cache in Redis for next time
      await this.writeToRedis(userId, supabaseDoc);
      return supabaseDoc;
    }

    // Empty document
    return this.emptyDocument(userId);
  }

  /**
   * Append a new entry to the user's knowledge document.
   * Dual-writes to Redis and Supabase.
   */
  async append(
    userId: string,
    entry: Omit<KnowledgeEntry, 'id' | 'createdAt'>,
  ): Promise<KnowledgeEntry> {
    const doc = await this.get(userId);

    const newEntry: KnowledgeEntry = {
      id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      content: entry.content,
      category: entry.category,
      source: entry.source,
      createdAt: new Date().toISOString(),
    };

    doc.entries.push(newEntry);
    doc.version++;
    doc.lastUpdatedAt = new Date().toISOString();

    // Dual-write
    await Promise.all([
      this.writeToRedis(userId, doc),
      this.writeToSupabase(userId, doc),
    ]);

    logger.info('Knowledge entry appended', {
      userId,
      entryId: newEntry.id,
      category: newEntry.category,
      source: newEntry.source,
      entryCount: doc.entries.length,
    });

    return newEntry;
  }

  /**
   * Check if the document exceeds configured limits.
   */
  isOverLimit(doc: KnowledgeDocument): boolean {
    if (doc.entries.length > this.maxEntries) return true;

    const totalLength = doc.entries.reduce((sum, e) => sum + e.content.length, 0);
    if (totalLength > this.maxContentLength) return true;

    return false;
  }

  /**
   * Replace all entries in the document (used after summarization).
   * Dual-writes to Redis and Supabase.
   */
  async replace(userId: string, entries: KnowledgeEntry[]): Promise<void> {
    const doc: KnowledgeDocument = {
      userId,
      entries,
      version: (await this.get(userId)).version + 1,
      lastUpdatedAt: new Date().toISOString(),
    };

    await Promise.all([
      this.writeToRedis(userId, doc),
      this.writeToSupabase(userId, doc),
    ]);

    logger.info('Knowledge document replaced', {
      userId,
      entryCount: entries.length,
    });
  }

  /**
   * Delete all knowledge for a user.
   */
  async clear(userId: string): Promise<void> {
    const emptyDoc = this.emptyDocument(userId);

    await Promise.all([
      this.writeToRedis(userId, emptyDoc),
      this.writeToSupabase(userId, emptyDoc),
    ]);

    logger.info('Knowledge cleared', { userId });
  }

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
  // Redis Operations
  // ===========================================================================

  private async getFromRedis(userId: string): Promise<KnowledgeDocument | null> {
    if (!this.redis || !this.redisAvailable) return null;

    try {
      const data = await this.redis.get(`${REDIS_KEY_PREFIX}${userId}`);
      if (!data) return null;
      return JSON.parse(data) as KnowledgeDocument;
    } catch (err) {
      logger.warn('Redis read failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async writeToRedis(userId: string, doc: KnowledgeDocument): Promise<void> {
    if (!this.redis || !this.redisAvailable) return;

    try {
      await this.redis.set(
        `${REDIS_KEY_PREFIX}${userId}`,
        JSON.stringify(doc),
      );
    } catch (err) {
      logger.warn('Redis write failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ===========================================================================
  // Supabase Operations
  // ===========================================================================

  private async getFromSupabase(userId: string): Promise<KnowledgeDocument | null> {
    if (!this.supabase) return null;

    try {
      const { data, error } = await this.supabase
        .from('user_knowledge')
        .select('entries, version, updated_at')
        .eq('user_id', userId)
        .single();

      if (error || !data) return null;

      return {
        userId,
        entries: (data.entries ?? []) as KnowledgeEntry[],
        version: (data.version ?? 0) as number,
        lastUpdatedAt: (data.updated_at ?? new Date().toISOString()) as string,
      };
    } catch (err) {
      logger.warn('Supabase read failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async writeToSupabase(userId: string, doc: KnowledgeDocument): Promise<void> {
    if (!this.supabase) return;

    try {
      const { error } = await this.supabase
        .from('user_knowledge')
        .upsert(
          {
            user_id: userId,
            entries: doc.entries,
            version: doc.version,
            updated_at: doc.lastUpdatedAt,
          },
          { onConflict: 'user_id' },
        );

      if (error) {
        logger.warn('Supabase write failed', {
          userId,
          error: error.message,
        });
      }
    } catch (err) {
      logger.warn('Supabase write failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private emptyDocument(userId: string): KnowledgeDocument {
    return {
      userId,
      entries: [],
      version: 0,
      lastUpdatedAt: new Date().toISOString(),
    };
  }
}
