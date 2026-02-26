/**
 * @nexus-aec/api - Briefing Pre-Compute Service
 *
 * Runs the full briefing pipeline (fetch + Batch 1 LLM preprocessing)
 * in the API layer when the mobile app opens. Stores Batch 1 results
 * in Redis for instant session start.
 *
 * Key: nexus:prebriefing:{userId}
 * TTL: 30 minutes
 */

import { GmailAdapter, OutlookAdapter, UnifiedInboxService } from '@nexus-aec/email-providers';
import { presortEmails, preprocessEmails } from '@nexus-aec/intelligence';
import { createLogger } from '@nexus-aec/logger';

import { EmailStatsCache } from './email-stats-cache';
import { getRedisClient } from '../lib/redis';
import { getTokenManagerInstance } from '../routes/auth';

import type { EmailProviderConfig, EmailSource } from '@nexus-aec/email-providers';
import type { EmailMetadata } from '@nexus-aec/intelligence';

const logger = createLogger({ baseContext: { component: 'briefing-precompute' } });

// =============================================================================
// Types
// =============================================================================

export interface PriorityCounts {
  high: number;
  medium: number;
  low: number;
}

export interface PrecomputedBriefing {
  /** Serialized BriefingData from Batch 1 */
  briefingJson: string;
  /** Remaining batches (serialized EmailMetadata[][]) */
  remainingBatchesJson: string;
  /** When the pre-computation was performed */
  computedAt: string;
  /** Gmail historyId at time of computation (for staleness check) */
  historyId?: string;
  /** Number of emails included */
  emailCount: number;
  /** LLM-derived priority counts */
  priorityCounts?: PriorityCounts;
}

// =============================================================================
// Constants
// =============================================================================

const KEY_PREFIX = 'nexus:prebriefing:';
const TTL_SECONDS = 30 * 60; // 30 minutes
const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes — loader uses fresh data after this

// =============================================================================
// Service
// =============================================================================

/**
 * Store pre-computed briefing data in Redis.
 */
export async function storePrebriefing(
  userId: string,
  data: PrecomputedBriefing
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn('Redis unavailable, cannot store pre-briefing');
    return false;
  }

  try {
    const key = `${KEY_PREFIX}${userId}`;
    await redis.set(key, JSON.stringify(data), 'EX', TTL_SECONDS);
    logger.info('Pre-briefing stored', {
      userId,
      emailCount: data.emailCount,
      ttlSeconds: TTL_SECONDS,
    });
    return true;
  } catch (error) {
    logger.warn('Failed to store pre-briefing', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return false;
  }
}

/**
 * Load pre-computed briefing data from Redis.
 * Returns null if not found or too old.
 */
export async function loadPrebriefing(userId: string): Promise<PrecomputedBriefing | null> {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  try {
    const key = `${KEY_PREFIX}${userId}`;
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }

    const data = JSON.parse(raw) as PrecomputedBriefing;

    // Check staleness
    const computedAt = new Date(data.computedAt).getTime();
    if (Date.now() - computedAt > MAX_AGE_MS) {
      logger.info('Pre-briefing too old, discarding', {
        userId,
        ageMs: Date.now() - computedAt,
        maxAgeMs: MAX_AGE_MS,
      });
      return null;
    }

    return data;
  } catch (error) {
    logger.warn('Failed to load pre-briefing', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return null;
  }
}

/**
 * Check if a pre-computed briefing exists and is fresh.
 */
export async function getPrebriefingStatus(
  userId: string
): Promise<{ ready: boolean; emailCount: number; priorityCounts?: PriorityCounts }> {
  const data = await loadPrebriefing(userId);
  if (!data) {
    return { ready: false, emailCount: 0 };
  }
  return {
    ready: true,
    emailCount: data.emailCount,
    ...(data.priorityCounts ? { priorityCounts: data.priorityCounts } : {}),
  };
}

// =============================================================================
// Pre-Computation Pipeline
// =============================================================================

/**
 * Run the actual LLM briefing pipeline in the API layer.
 * Fetches unread emails, runs presort + Batch 1 LLM preprocessing,
 * computes priority counts, and stores everything in Redis.
 */
export async function runPrecomputation(userId: string): Promise<void> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set, skipping pre-computation', { userId });
    return;
  }

  const startTime = Date.now();

  // 1. Create email adapters
  const tokenManager = getTokenManagerInstance();
  const providers: Array<GmailAdapter | OutlookAdapter> = [];
  const sources: EmailSource[] = ['GMAIL', 'OUTLOOK'];

  for (const source of sources) {
    const hasTokens = await tokenManager.hasTokens(userId, source);
    if (!hasTokens) {
      continue;
    }

    try {
      const accessToken = await tokenManager.getValidAccessToken(userId, source);
      const data = await tokenManager.getTokens(userId, source);
      if (!data?.tokens) {
        continue;
      }

      const config: EmailProviderConfig = {
        userId,
        tokens: { ...data.tokens, accessToken },
      };

      if (source === 'GMAIL') {
        providers.push(new GmailAdapter(config));
      } else {
        providers.push(new OutlookAdapter(config));
      }
    } catch (error) {
      logger.warn('Failed to create adapter for pre-computation', {
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (providers.length === 0) {
    logger.warn('No email providers available for pre-computation', { userId });
    return;
  }

  // 2. Fetch unread emails
  const inbox = new UnifiedInboxService(providers, {
    continueOnError: true,
    defaultPageSize: 50,
    requestTimeoutMs: 15000,
  });

  const result = await inbox.fetchUnread({ unreadOnly: true }, { pageSize: 50 });
  const items = result.items;

  if (items.length === 0) {
    logger.info('No unread emails for pre-computation', { userId });
    await storePrebriefing(userId, {
      briefingJson: JSON.stringify({ topics: [], totalEmails: 0 }),
      remainingBatchesJson: '[]',
      computedAt: new Date().toISOString(),
      emailCount: 0,
      priorityCounts: { high: 0, medium: 0, low: 0 },
    });

    const cache = new EmailStatsCache(getRedisClient());
    await cache.setPriorityCounts(userId, { high: 0, medium: 0, low: 0 });
    return;
  }

  // 3. Convert to EmailMetadata format
  const emails: EmailMetadata[] = items.map((item) => ({
    id: item.id,
    subject: item.subject,
    from: item.from.email ?? item.from.name ?? 'unknown',
    snippet: item.bodyPreview ?? '',
    receivedAt: new Date(item.receivedAt),
    ...(item.threadId ? { threadId: item.threadId } : {}),
  }));

  // 4. Presort and preprocess with LLM
  const sorted = presortEmails(emails, []);
  const preprocessResult = await preprocessEmails(sorted, {
    apiKey,
    batchSize: 25,
  });

  // 5. Compute priority counts from Batch 1 results
  const batch1 = preprocessResult.batches[0];
  const priorityCounts: PriorityCounts = { high: 0, medium: 0, low: 0 };

  if (batch1) {
    for (const email of batch1.emails) {
      priorityCounts[email.priority]++;
    }
  }

  // 6. Build remaining batches (raw EmailMetadata for agent to process)
  const batchSize = 25;
  const remainingRaw: EmailMetadata[][] = [];
  for (let i = batchSize; i < sorted.length; i += batchSize) {
    remainingRaw.push(sorted.slice(i, i + batchSize));
  }

  // 7. Store in Redis
  await storePrebriefing(userId, {
    briefingJson: JSON.stringify(preprocessResult.batches[0] ?? { emails: [], clusters: [] }),
    remainingBatchesJson: JSON.stringify(remainingRaw),
    computedAt: new Date().toISOString(),
    emailCount: emails.length,
    priorityCounts,
  });

  // Also store priority counts separately for quick access by email-stats endpoint
  const cache = new EmailStatsCache(getRedisClient());
  await cache.setPriorityCounts(userId, priorityCounts);

  logger.info('Pre-computation completed', {
    userId,
    totalEmails: emails.length,
    batch1Count: batch1?.emails.length ?? 0,
    remainingBatches: remainingRaw.length,
    priorityCounts,
    durationMs: Date.now() - startTime,
  });
}
