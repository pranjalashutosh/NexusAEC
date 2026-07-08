/**
 * @nexus-aec/email-providers - Redis Token Storage
 *
 * Redis-backed `ITokenStorage` with AES-256 encryption at rest. Tokens survive
 * container restarts and are shared across processes (the API writes them on the
 * OAuth callback; the worker reads them to fetch a user's inbox), so both must
 * run with the SAME encryption password and Redis instance.
 *
 * The Redis client is injected — pass either a live client (worker) or a
 * `() => Redis | null` provider (the API's graceful-fallback singleton, which
 * yields `null` while Redis is unavailable). Every operation is null-safe: with
 * no client, reads return `null` and writes are no-ops.
 */

import { decryptWithPassword, encryptWithPassword } from '@nexus-aec/encryption';
import { createLogger } from '@nexus-aec/logger';

import type { ITokenStorage } from './token-manager';
import type { Redis } from 'ioredis';

const logger = createLogger({ baseContext: { component: 'redis-token-storage' } });

const KEY_PREFIX = 'nexus:tokens:';
const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days — OAuth refresh tokens can last months

/** A Redis client, or a provider that resolves one lazily (may be unavailable). */
export type RedisSource = Redis | (() => Redis | null);

type EncryptedPayload = Awaited<ReturnType<typeof encryptWithPassword>>;

export class RedisTokenStorage implements ITokenStorage {
  private readonly redisSource: RedisSource;
  private readonly encryptionPassword: string;

  constructor(redis: RedisSource, encryptionPassword: string) {
    this.redisSource = redis;
    this.encryptionPassword = encryptionPassword;

    if (!encryptionPassword) {
      logger.warn('No token encryption password set — tokens stored unencrypted in Redis');
    }
  }

  private redis(): Redis | null {
    return typeof this.redisSource === 'function' ? this.redisSource() : this.redisSource;
  }

  async get(key: string): Promise<string | null> {
    const redis = this.redis();
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
      const encrypted = JSON.parse(raw) as EncryptedPayload;
      return await decryptWithPassword(encrypted, this.encryptionPassword);
    } catch (err) {
      logger.warn('RedisTokenStorage.get failed', { key, error: msg(err) });
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const redis = this.redis();
    if (!redis) {
      return;
    }

    try {
      const toStore = this.encryptionPassword
        ? JSON.stringify(await encryptWithPassword(value, this.encryptionPassword))
        : value;
      await redis.set(`${KEY_PREFIX}${key}`, toStore, 'EX', TTL_SECONDS);
    } catch (err) {
      logger.warn('RedisTokenStorage.set failed', { key, error: msg(err) });
    }
  }

  async delete(key: string): Promise<void> {
    const redis = this.redis();
    if (!redis) {
      return;
    }

    try {
      await redis.del(`${KEY_PREFIX}${key}`);
    } catch (err) {
      logger.warn('RedisTokenStorage.delete failed', { key, error: msg(err) });
    }
  }

  async has(key: string): Promise<boolean> {
    const redis = this.redis();
    if (!redis) {
      return false;
    }

    try {
      return (await redis.exists(`${KEY_PREFIX}${key}`)) === 1;
    } catch (err) {
      logger.warn('RedisTokenStorage.has failed', { key, error: msg(err) });
      return false;
    }
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
