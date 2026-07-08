/**
 * Assemble per-user Graph A dependencies for a worker job.
 *
 * The worker runs a "vanilla" priority sort (parity with the legacy precompute):
 * no VIP/mute/knowledge personalization — that stays on the agent's in-process
 * path (2.9), which owns the file-based `PreferencesStore` + the livekit-agent
 * knowledge/briefed stores. The worker adds only the Redis-backed
 * `SenderProfileStore` as an optional "beat" (per-batch sender insight).
 */

import { createChatModel, createStructuredClassifier, RedisSaver } from '@nexus-aec/agent-graph';
import { SenderProfileStore } from '@nexus-aec/intelligence';

import { buildInboxService } from './inbox-service';

import type { WorkerLogger } from './consumer';
import type { CredentialResolver } from './inbox-service';
import type { InboxSortingDeps } from '@nexus-aec/agent-graph';
import type { Redis } from 'ioredis';

export interface GraphDepsContext {
  redis: Redis;
  resolveCredentials: CredentialResolver;
  openaiApiKey: string;
  /** When set, a `SenderProfileStore` is constructed for per-batch insights. */
  redisUrl?: string;
  logger?: WorkerLogger;
}

/**
 * Build a `(userId) => InboxSortingDeps | null` factory. The classify call and
 * sender-profile store are created once and reused across jobs; the inbox
 * adapter is built per user (per-user OAuth credentials).
 */
export function createGraphDepsBuilder(
  ctx: GraphDepsContext
): (userId: string) => Promise<InboxSortingDeps | null> {
  const classify = createStructuredClassifier(createChatModel({ apiKey: ctx.openaiApiKey }));
  const senderProfiles = ctx.redisUrl
    ? new SenderProfileStore({ redisUrl: ctx.redisUrl })
    : undefined;

  return async (userId) => {
    const inboxService = await buildInboxService(userId, ctx.resolveCredentials);
    if (!inboxService) {
      return null;
    }

    return {
      inboxService,
      classify,
      redis: ctx.redis,
      checkpointer: new RedisSaver({ client: ctx.redis }),
      ...(senderProfiles ? { hydrate: { senderInsights: senderProfiles } } : {}),
      ...(ctx.logger ? { logger: ctx.logger } : {}),
    };
  };
}
