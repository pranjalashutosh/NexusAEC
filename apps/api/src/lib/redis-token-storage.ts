/**
 * Redis-backed token storage with AES-256 encryption at rest.
 *
 * The encrypt/decrypt/keying logic lives in the shared `RedisTokenStorage`
 * (`@nexus-aec/email-providers`) so the API and the worker read/write tokens
 * identically. This subclass only wires in the API's app-specific concerns: the
 * graceful-fallback Redis singleton (`getRedisClient`, which yields `null` while
 * Redis is unavailable) and the encryption password default from env.
 */

import { RedisTokenStorage as SharedRedisTokenStorage } from '@nexus-aec/email-providers';

import { getRedisClient } from './redis';

export class RedisTokenStorage extends SharedRedisTokenStorage {
  constructor(encryptionPassword?: string) {
    super(
      getRedisClient,
      encryptionPassword ?? process.env['TOKEN_ENCRYPTION_KEY'] ?? process.env['JWT_SECRET'] ?? ''
    );
  }
}
