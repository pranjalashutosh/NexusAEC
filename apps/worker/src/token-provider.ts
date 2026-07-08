/**
 * Resolve a user's provider credentials from encrypted Redis token storage,
 * for building inbox adapters in the worker.
 *
 * Phase 2 scope: reads STORED tokens as-is (no proactive refresh). OAuth-provider
 * wiring for `TokenManager` refresh is a hand-off item — an expired token simply
 * surfaces as a fetch failure and that provider is skipped. The shared
 * `RedisTokenStorage` requires the API and worker to run with the same encryption
 * password + Redis instance (a deployment concern — see task 2.11).
 */

import { RedisTokenStorage, TokenManager } from '@nexus-aec/email-providers';

import type { WorkerLogger } from './consumer';
import type { CredentialResolver, ProviderCredentials } from './inbox-service';
import type { EmailSource } from '@nexus-aec/email-providers';
import type { Redis } from 'ioredis';

const SOURCES: EmailSource[] = ['GMAIL', 'OUTLOOK'];

export interface CredentialResolverConfig {
  redis: Redis;
  encryptionPassword: string;
  logger?: WorkerLogger;
}

/** Build a `CredentialResolver` backed by the encrypted token store. */
export function createCredentialResolver(config: CredentialResolverConfig): CredentialResolver {
  const storage = new RedisTokenStorage(config.redis, config.encryptionPassword);
  const tokenManager = new TokenManager({ storage, autoRefresh: false });

  return async (userId) => {
    const credentials: ProviderCredentials[] = [];
    for (const source of SOURCES) {
      try {
        if (!(await tokenManager.hasTokens(userId, source))) {
          continue;
        }
        const data = await tokenManager.getTokens(userId, source);
        if (!data?.tokens) {
          continue;
        }
        credentials.push({ source, config: { userId, tokens: data.tokens } });
      } catch (err) {
        config.logger?.warn('worker: failed to resolve credentials', {
          userId,
          source,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return credentials;
  };
}
