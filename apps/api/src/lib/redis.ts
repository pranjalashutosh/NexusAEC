/**
 * Shared Redis Client for @nexus-aec/api
 *
 * Singleton ioredis client with graceful fallback.
 * If Redis is unavailable, getRedisClient() returns null and all
 * cache operations become no-ops — the API works exactly as before.
 */

import Redis from 'ioredis';
import { createLogger } from '@nexus-aec/logger';

const logger = createLogger({ baseContext: { component: 'redis' } });

let client: Redis | null = null;
let connectionAttempted = false;
let available = false;

/**
 * Get or create the singleton Redis client.
 * Returns null if Redis is unavailable (graceful fallback).
 */
export function getRedisClient(): Redis | null {
  if (connectionAttempted) {
    return available ? client : null;
  }

  connectionAttempted = true;

  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

  try {
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        // Only retry 3 times on initial connection, then give up
        if (times > 3) {
          return null;
        }
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
    });

    client.on('error', (error) => {
      if (available) {
        logger.warn('Redis connection error', { error: error.message });
        available = false;
      }
    });

    client.on('connect', () => {
      available = true;
      logger.info('Redis connected');
    });

    client.on('close', () => {
      available = false;
    });

    // Attempt connection
    client.connect().catch((error) => {
      logger.warn('Redis unavailable — email stats caching disabled', {
        error: error instanceof Error ? error.message : String(error),
      });
      available = false;
    });
  } catch (error) {
    logger.warn('Redis client creation failed — caching disabled', {
      error: error instanceof Error ? error.message : String(error),
    });
    client = null;
    available = false;
  }

  // Return client immediately; availability is tracked asynchronously
  return client;
}

/**
 * Check if Redis is currently available.
 */
export function isRedisAvailable(): boolean {
  return available;
}

/**
 * Disconnect Redis client. Call on server shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      // Ignore disconnect errors
    }
    client = null;
    connectionAttempted = false;
    available = false;
  }
}
