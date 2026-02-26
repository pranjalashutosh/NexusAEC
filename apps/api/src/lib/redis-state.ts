/**
 * Redis-backed state helpers for replacing in-memory Maps.
 *
 * Used by auth.ts (OAuth state), sync.ts (drafts, preferences),
 * and webhooks.ts (room sessions) to survive Lambda cold starts
 * and container restarts.
 */

import { createLogger } from '@nexus-aec/logger';

import { getRedisClient } from './redis';

const logger = createLogger({ baseContext: { component: 'redis-state' } });

/**
 * Store a JSON-serializable value in Redis with TTL.
 */
export async function setState<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn('setState failed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Get a JSON value from Redis. Returns null if not found or Redis unavailable.
 */
export async function getState<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn('getState failed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Delete a key from Redis.
 */
export async function deleteState(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.del(key);
  } catch (err) {
    logger.warn('deleteState failed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Check if a key exists in Redis.
 */
export async function hasState(key: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  try {
    return (await redis.exists(key)) === 1;
  } catch {
    return false;
  }
}

/**
 * Store a value in a Redis hash field.
 */
export async function setHashField<T>(
  hashKey: string,
  field: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.hset(hashKey, field, JSON.stringify(value));
    if (ttlSeconds) {
      const currentTtl = await redis.ttl(hashKey);
      if (currentTtl < 0) {
        await redis.expire(hashKey, ttlSeconds);
      }
    }
  } catch (err) {
    logger.warn('setHashField failed', {
      hashKey,
      field,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Get a value from a Redis hash field.
 */
export async function getHashField<T>(hashKey: string, field: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.hget(hashKey, field);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn('getHashField failed', {
      hashKey,
      field,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Get all fields from a Redis hash.
 */
export async function getHashAll<T>(hashKey: string): Promise<Record<string, T>> {
  const redis = getRedisClient();
  if (!redis) {
    return {};
  }

  try {
    const raw = await redis.hgetall(hashKey);
    const result: Record<string, T> = {};
    for (const [field, value] of Object.entries(raw)) {
      result[field] = JSON.parse(value) as T;
    }
    return result;
  } catch (err) {
    logger.warn('getHashAll failed', {
      hashKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

/**
 * Delete a field from a Redis hash.
 */
export async function deleteHashField(hashKey: string, field: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.hdel(hashKey, field);
  } catch (err) {
    logger.warn('deleteHashField failed', {
      hashKey,
      field,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
