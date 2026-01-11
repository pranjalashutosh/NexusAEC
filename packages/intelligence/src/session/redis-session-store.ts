/**
 * Redis Session Store for Drive State (Tier 2 Memory)
 *
 * Stores ephemeral session state in Redis with TTL-based expiration.
 * Enables real-time "Ack & Act" pattern for voice briefing sessions.
 */

import Redis, { type RedisOptions } from 'ioredis';
import type { DriveState } from './drive-state';
import { validateDriveState } from './drive-state';

/**
 * Configuration options for RedisSessionStore
 */
export interface RedisSessionStoreOptions {
  /**
   * Redis connection options (ioredis RedisOptions)
   */
  redis?: RedisOptions;

  /**
   * Redis URL (alternative to redis options)
   * Format: redis://[:password@]host[:port][/db]
   */
  redisUrl?: string;

  /**
   * Existing Redis client instance
   */
  client?: Redis;

  /**
   * Key prefix for all session keys
   * Default: 'session:'
   */
  keyPrefix?: string;

  /**
   * Default TTL in seconds for session keys
   * Default: 86400 (24 hours)
   */
  defaultTtl?: number;

  /**
   * Whether to enable debug logging
   */
  debug?: boolean;
}

/**
 * Serialized DriveState for Redis storage
 * Dates are converted to ISO strings
 */
interface SerializedDriveState {
  sessionId: string;
  userId: string;
  position: {
    topicIndex: number;
    itemIndex: number;
    totalTopics: number;
    totalItemsInTopic: number;
    itemsRemaining: number;
    currentTopicId?: string;
    currentEmailId?: string;
    depth: number;
  };
  interruptStatus: string;
  startedAt: string; // ISO string
  updatedAt: string; // ISO string
  lastAction?: {
    type: string;
    timestamp: string; // ISO string
    utterance?: string;
    target?: string;
    metadata?: Record<string, unknown>;
  };
  briefingSnapshot: {
    topicIds: string[];
    topicEmailMap: Record<string, string[]>;
    totalEmails: number;
    generatedAt: string; // ISO string
  };
  metadata: {
    roomName: string;
    sources: ('OUTLOOK' | 'GMAIL')[];
    preferencesVersion?: string;
    clientType?: 'mobile' | 'desktop';
    clientVersion?: string;
  };
  ttl: number;
}

/**
 * Session metadata for listing
 */
export interface SessionMetadata {
  sessionId: string;
  userId: string;
  roomName: string;
  startedAt: Date;
  updatedAt: Date;
  ttl: number;
}

/**
 * Redis-backed session store for DriveState
 *
 * Provides CRUD operations with automatic TTL management and
 * efficient serialization/deserialization.
 *
 * @example
 * ```typescript
 * const store = new RedisSessionStore({
 *   redisUrl: 'redis://localhost:6379',
 * });
 *
 * await store.connect();
 *
 * // Create session
 * await store.create(driveState);
 *
 * // Retrieve session
 * const state = await store.get('session-123');
 *
 * // Update session
 * await store.update(updatedState);
 *
 * // Delete session
 * await store.delete('session-123');
 *
 * await store.disconnect();
 * ```
 */
export class RedisSessionStore {
  private client: Redis;
  private ownClient: boolean;
  private keyPrefix: string;
  private defaultTtl: number;
  private debug: boolean;

  constructor(options: RedisSessionStoreOptions = {}) {
    this.keyPrefix = options.keyPrefix ?? 'session:';
    this.defaultTtl = options.defaultTtl ?? 86400; // 24 hours
    this.debug = options.debug ?? false;

    // Use provided client or create new one
    if (options.client) {
      this.client = options.client;
      this.ownClient = false;
    } else if (options.redisUrl) {
      this.client = new Redis(options.redisUrl, options.redis);
      this.ownClient = true;
    } else {
      this.client = new Redis(options.redis);
      this.ownClient = true;
    }

    this.setupErrorHandlers();
  }

  /**
   * Set up error handlers for Redis client
   */
  private setupErrorHandlers(): void {
    this.client.on('error', (error) => {
      console.error('[RedisSessionStore] Redis error:', error);
    });

    this.client.on('connect', () => {
      if (this.debug) {
        console.log('[RedisSessionStore] Connected to Redis');
      }
    });

    this.client.on('ready', () => {
      if (this.debug) {
        console.log('[RedisSessionStore] Redis client ready');
      }
    });
  }

  /**
   * Get Redis key for session
   */
  private getKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  /**
   * Serialize DriveState for Redis storage
   */
  private serialize(state: DriveState): string {
    const serialized: SerializedDriveState = {
      ...state,
      startedAt: state.startedAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
      lastAction: state.lastAction
        ? {
            ...state.lastAction,
            timestamp: state.lastAction.timestamp.toISOString(),
          }
        : undefined,
      briefingSnapshot: {
        ...state.briefingSnapshot,
        generatedAt: state.briefingSnapshot.generatedAt.toISOString(),
      },
    };

    return JSON.stringify(serialized);
  }

  /**
   * Deserialize DriveState from Redis
   */
  private deserialize(data: string): DriveState {
    const parsed = JSON.parse(data) as SerializedDriveState;

    const state: DriveState = {
      ...parsed,
      startedAt: new Date(parsed.startedAt),
      updatedAt: new Date(parsed.updatedAt),
      lastAction: parsed.lastAction
        ? {
            ...parsed.lastAction,
            timestamp: new Date(parsed.lastAction.timestamp),
          }
        : undefined,
      briefingSnapshot: {
        ...parsed.briefingSnapshot,
        generatedAt: new Date(parsed.briefingSnapshot.generatedAt),
      },
    };

    // Validate deserialized state
    if (!validateDriveState(state)) {
      throw new Error('Invalid DriveState format in Redis');
    }

    return state;
  }

  /**
   * Connect to Redis (async initialization)
   */
  async connect(): Promise<void> {
    if (this.client.status === 'ready') {
      return;
    }

    await this.client.connect();
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.ownClient) {
      await this.client.quit();
    }
  }

  /**
   * Create a new session in Redis
   * @throws Error if session already exists
   */
  async create(state: DriveState): Promise<void> {
    const key = this.getKey(state.sessionId);

    // Check if session already exists
    const exists = await this.client.exists(key);
    if (exists) {
      throw new Error(`Session ${state.sessionId} already exists`);
    }

    const serialized = this.serialize(state);
    const ttl = state.ttl ?? this.defaultTtl;

    await this.client.setex(key, ttl, serialized);

    if (this.debug) {
      console.log(`[RedisSessionStore] Created session ${state.sessionId} with TTL ${ttl}s`);
    }
  }

  /**
   * Get session by ID
   * @returns DriveState or null if not found
   */
  async get(sessionId: string): Promise<DriveState | null> {
    const key = this.getKey(sessionId);
    const data = await this.client.get(key);

    if (!data) {
      return null;
    }

    return this.deserialize(data);
  }

  /**
   * Update existing session
   * @throws Error if session does not exist
   */
  async update(state: DriveState): Promise<void> {
    const key = this.getKey(state.sessionId);

    // Check if session exists
    const exists = await this.client.exists(key);
    if (!exists) {
      throw new Error(`Session ${state.sessionId} does not exist`);
    }

    const serialized = this.serialize(state);
    const ttl = state.ttl ?? this.defaultTtl;

    await this.client.setex(key, ttl, serialized);

    if (this.debug) {
      console.log(`[RedisSessionStore] Updated session ${state.sessionId}`);
    }
  }

  /**
   * Create or update session (upsert)
   */
  async set(state: DriveState): Promise<void> {
    const key = this.getKey(state.sessionId);
    const serialized = this.serialize(state);
    const ttl = state.ttl ?? this.defaultTtl;

    await this.client.setex(key, ttl, serialized);

    if (this.debug) {
      console.log(`[RedisSessionStore] Set session ${state.sessionId}`);
    }
  }

  /**
   * Delete session by ID
   * @returns true if session was deleted, false if not found
   */
  async delete(sessionId: string): Promise<boolean> {
    const key = this.getKey(sessionId);
    const result = await this.client.del(key);

    if (this.debug) {
      console.log(`[RedisSessionStore] Deleted session ${sessionId}`);
    }

    return result > 0;
  }

  /**
   * Check if session exists
   */
  async exists(sessionId: string): Promise<boolean> {
    const key = this.getKey(sessionId);
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Get remaining TTL for session in seconds
   * @returns TTL in seconds, -1 if no TTL, -2 if key doesn't exist
   */
  async getTTL(sessionId: string): Promise<number> {
    const key = this.getKey(sessionId);
    return await this.client.ttl(key);
  }

  /**
   * Extend session TTL
   * @param sessionId Session ID
   * @param ttlSeconds New TTL in seconds (default: defaultTtl)
   * @returns true if TTL was set, false if session doesn't exist
   */
  async extendTTL(sessionId: string, ttlSeconds?: number): Promise<boolean> {
    const key = this.getKey(sessionId);
    const ttl = ttlSeconds ?? this.defaultTtl;

    const result = await this.client.expire(key, ttl);

    if (this.debug && result) {
      console.log(`[RedisSessionStore] Extended TTL for session ${sessionId} to ${ttl}s`);
    }

    return result === 1;
  }

  /**
   * List all active session IDs
   */
  async listSessions(): Promise<string[]> {
    const pattern = `${this.keyPrefix}*`;
    const keys = await this.client.keys(pattern);

    // Extract session IDs from keys
    return keys.map((key) => key.substring(this.keyPrefix.length));
  }

  /**
   * Get metadata for all active sessions
   */
  async listSessionMetadata(): Promise<SessionMetadata[]> {
    const sessionIds = await this.listSessions();
    const metadata: SessionMetadata[] = [];

    for (const sessionId of sessionIds) {
      const state = await this.get(sessionId);
      if (state) {
        metadata.push({
          sessionId: state.sessionId,
          userId: state.userId,
          roomName: state.metadata.roomName,
          startedAt: state.startedAt,
          updatedAt: state.updatedAt,
          ttl: state.ttl,
        });
      }
    }

    return metadata;
  }

  /**
   * Get sessions for specific user
   */
  async getSessionsByUser(userId: string): Promise<DriveState[]> {
    const sessionIds = await this.listSessions();
    const userSessions: DriveState[] = [];

    for (const sessionId of sessionIds) {
      const state = await this.get(sessionId);
      if (state && state.userId === userId) {
        userSessions.push(state);
      }
    }

    return userSessions;
  }

  /**
   * Delete all sessions for a user
   * @returns Number of sessions deleted
   */
  async deleteUserSessions(userId: string): Promise<number> {
    const sessions = await this.getSessionsByUser(userId);
    let deleted = 0;

    for (const session of sessions) {
      const result = await this.delete(session.sessionId);
      if (result) {
        deleted++;
      }
    }

    if (this.debug) {
      console.log(`[RedisSessionStore] Deleted ${deleted} sessions for user ${userId}`);
    }

    return deleted;
  }

  /**
   * Clear all sessions (use with caution!)
   * @returns Number of sessions deleted
   */
  async clear(): Promise<number> {
    const sessionIds = await this.listSessions();
    const keys = sessionIds.map((id) => this.getKey(id));

    if (keys.length === 0) {
      return 0;
    }

    const result = await this.client.del(...keys);

    if (this.debug) {
      console.log(`[RedisSessionStore] Cleared ${result} sessions`);
    }

    return result;
  }

  /**
   * Get Redis client for advanced operations
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Check Redis connection status
   */
  isConnected(): boolean {
    return this.client.status === 'ready';
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    uniqueUsers: number;
    oldestSession: Date | null;
    newestSession: Date | null;
  }> {
    const metadata = await this.listSessionMetadata();

    const uniqueUsers = new Set(metadata.map((m) => m.userId)).size;
    const startDates = metadata.map((m) => m.startedAt);

    return {
      totalSessions: metadata.length,
      uniqueUsers,
      oldestSession: startDates.length > 0 ? new Date(Math.min(...startDates.map((d) => d.getTime()))) : null,
      newestSession: startDates.length > 0 ? new Date(Math.max(...startDates.map((d) => d.getTime()))) : null,
    };
  }
}
