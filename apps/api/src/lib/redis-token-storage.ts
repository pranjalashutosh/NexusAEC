/**
 * Redis-backed token storage with AES-256 encryption at rest.
 *
 * Replaces FileTokenStorage for production use — tokens survive container
 * restarts and work across Lambda invocations.
 */

import { decryptWithPassword, encryptWithPassword } from '@nexus-aec/encryption';
import { createLogger } from '@nexus-aec/logger';

import { getRedisClient } from './redis';

import type { ITokenStorage } from '@nexus-aec/email-providers';

const logger = createLogger({ baseContext: { component: 'redis-token-storage' } });

const KEY_PREFIX = 'nexus:tokens:';
const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days — OAuth refresh tokens can last months

export class RedisTokenStorage implements ITokenStorage {
  private readonly encryptionPassword: string;

  constructor(encryptionPassword?: string) {
    this.encryptionPassword =
      encryptionPassword ?? process.env['TOKEN_ENCRYPTION_KEY'] ?? process.env['JWT_SECRET'] ?? '';

    if (!this.encryptionPassword) {
      logger.warn('No TOKEN_ENCRYPTION_KEY or JWT_SECRET set — tokens stored unencrypted in Redis');
    }
  }

  async get(key: string): Promise<string | null> {
    const redis = getRedisClient();
    if (!redis) {
      return null;
    }

    try {
      const raw = await redis.get(`${KEY_PREFIX}${key}`);
      if (!raw) {
        return null;
      }

      if (!this.encryptionPassword) {
        return raw;
      }

      const encrypted = JSON.parse(raw) as {
        ciphertext: string;
        iv: string;
        authTag?: string;
        algorithm: string;
        encoding: BufferEncoding;
        salt: string;
        iterations: number;
      };
      return await decryptWithPassword(encrypted, this.encryptionPassword);
    } catch (err) {
      logger.warn('RedisTokenStorage.get failed', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
      return;
    }

    try {
      let toStore: string;
      if (this.encryptionPassword) {
        const encrypted = await encryptWithPassword(value, this.encryptionPassword);
        toStore = JSON.stringify(encrypted);
      } else {
        toStore = value;
      }

      await redis.set(`${KEY_PREFIX}${key}`, toStore, 'EX', TTL_SECONDS);
    } catch (err) {
      logger.warn('RedisTokenStorage.set failed', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async delete(key: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
      return;
    }

    try {
      await redis.del(`${KEY_PREFIX}${key}`);
    } catch (err) {
      logger.warn('RedisTokenStorage.delete failed', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async has(key: string): Promise<boolean> {
    const redis = getRedisClient();
    if (!redis) {
      return false;
    }

    try {
      const exists = await redis.exists(`${KEY_PREFIX}${key}`);
      return exists === 1;
    } catch (err) {
      logger.warn('RedisTokenStorage.has failed', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }
}
