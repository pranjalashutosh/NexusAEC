/**
 * @nexus-aec/api - Email Stats Routes
 *
 * Lightweight endpoint for the mobile home screen to fetch email counts.
 * Uses Redis (Tier 2) caching to avoid redundant Gmail/Outlook API calls.
 *
 * Cache levels:
 *   1. Stats cache (2-min TTL) — computed {newCount, vipCount, urgentCount}
 *   2. Sync cursors (10-min TTL) — Gmail historyId / Outlook lastReceivedAt
 *      for change detection before triggering a full refetch.
 */

import { OutlookAdapter, GmailAdapter, UnifiedInboxService } from '@nexus-aec/email-providers';
import { createLogger } from '@nexus-aec/logger';

import { getTokenManagerInstance } from './auth';
import { getRedisClient } from '../lib/redis';
import { EmailStatsCache, computeVipHash } from '../services/email-stats-cache';

import type { CachedStats } from '../services/email-stats-cache';
import type { EmailProvider, EmailProviderConfig, EmailSource } from '@nexus-aec/email-providers';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const logger = createLogger({ baseContext: { component: 'email-stats-routes' } });

// =============================================================================
// Module-level Singleton
// =============================================================================

let statsCache: EmailStatsCache | null = null;

function getStatsCache(): EmailStatsCache {
  if (!statsCache) {
    statsCache = new EmailStatsCache(getRedisClient());
  }
  return statsCache;
}

// =============================================================================
// Types
// =============================================================================

interface StatsQuery {
  userId: string;
  vips?: string;
  forceRefresh?: string;
}

interface EmailStatsResponse {
  success: true;
  newCount: number;
  vipCount: number;
  urgentCount: number;
}

/**
 * Typed adapter references for incremental sync.
 */
interface UserAdapters {
  providers: EmailProvider[];
  gmail: GmailAdapter | null;
  outlook: OutlookAdapter | null;
}

// =============================================================================
// Provider Creation
// =============================================================================

/**
 * Create email providers from stored OAuth tokens for a user.
 * Returns both the generic providers array (for UnifiedInboxService)
 * and typed adapter references (for incremental sync).
 */
async function createAdaptersForUser(userId: string): Promise<UserAdapters> {
  const tokenManager = getTokenManagerInstance();
  const result: UserAdapters = { providers: [], gmail: null, outlook: null };
  const sources: EmailSource[] = ['OUTLOOK', 'GMAIL'];

  for (const source of sources) {
    const hasTokens = await tokenManager.hasTokens(userId, source);
    if (!hasTokens) {
      continue;
    }

    try {
      // getValidAccessToken() auto-refreshes expired tokens using the refresh token
      const accessToken = await tokenManager.getValidAccessToken(userId, source);
      const data = await tokenManager.getTokens(userId, source);
      if (!data?.tokens) {
        continue;
      }

      const config: EmailProviderConfig = {
        userId,
        tokens: { ...data.tokens, accessToken },
      };
      if (source === 'OUTLOOK') {
        const adapter = new OutlookAdapter(config);
        result.providers.push(adapter);
        result.outlook = adapter;
      } else {
        const adapter = new GmailAdapter(config);
        result.providers.push(adapter);
        result.gmail = adapter;
      }
    } catch (error) {
      logger.warn('Failed to create adapter for stats', {
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

// =============================================================================
// Full Fetch (existing flow)
// =============================================================================

/**
 * Perform a full email fetch and compute stats.
 */
async function fullFetchStats(
  adapters: UserAdapters,
  vipList: string[]
): Promise<{ newCount: number; vipCount: number; urgentCount: number }> {
  const inbox = new UnifiedInboxService(adapters.providers, {
    continueOnError: true,
    defaultPageSize: 50,
    requestTimeoutMs: 15000,
  });

  const result = await inbox.fetchUnread({ unreadOnly: true }, { pageSize: 50 });

  const emails = result.items;
  const newCount = emails.length;

  const vipCount =
    vipList.length > 0
      ? emails.filter((e) => vipList.some((vip) => e.from.email.toLowerCase().includes(vip))).length
      : 0;

  const urgentCount = emails.filter((e) => e.isFlagged || e.importance === 'high').length;

  return { newCount, vipCount, urgentCount };
}

// =============================================================================
// Change Detection
// =============================================================================

/**
 * Check if the user's inbox has changed since the last sync.
 * Uses Gmail History API and Outlook date-filter for cheap change detection.
 *
 * Returns true if any provider detects changes (or on error, to be safe).
 */
async function hasInboxChanged(
  adapters: UserAdapters,
  cache: EmailStatsCache,
  userId: string
): Promise<boolean> {
  const checks: Promise<boolean>[] = [];

  if (adapters.gmail) {
    const gmailAdapter = adapters.gmail;
    checks.push(
      (async () => {
        const cursor = await cache.getSyncCursor(userId, 'GMAIL');
        if (!cursor?.gmailHistoryId) {
          return true;
        } // No cursor = assume changed

        const { hasChanges } = await gmailAdapter.fetchHistory(cursor.gmailHistoryId);
        if (!hasChanges) {
          logger.info('Gmail: no changes since last sync', { userId });
        }
        return hasChanges;
      })().catch(() => true) // On error, assume changed
    );
  }

  if (adapters.outlook) {
    const outlookAdapter = adapters.outlook;
    checks.push(
      (async () => {
        const cursor = await cache.getSyncCursor(userId, 'OUTLOOK');
        if (!cursor?.outlookLastReceivedAt) {
          return true;
        } // No cursor = assume changed

        const hasNew = await outlookAdapter.hasNewEmailsSince(cursor.outlookLastReceivedAt);
        if (!hasNew) {
          logger.info('Outlook: no changes since last sync', { userId });
        }
        return hasNew;
      })().catch(() => true) // On error, assume changed
    );
  }

  if (checks.length === 0) {
    return true;
  }

  const results = await Promise.all(checks);
  return results.some((changed) => changed);
}

/**
 * Update sync cursors after a full fetch.
 */
async function updateSyncCursors(
  adapters: UserAdapters,
  cache: EmailStatsCache,
  userId: string,
  stats: { newCount: number; vipCount: number; urgentCount: number }
): Promise<void> {
  const lastStats: CachedStats = { ...stats, cachedAt: new Date().toISOString() };

  if (adapters.gmail) {
    try {
      const historyId = await adapters.gmail.getProfileHistoryId();
      await cache.setSyncCursor(userId, 'GMAIL', {
        gmailHistoryId: historyId,
        lastStats,
      });
    } catch (error) {
      logger.warn('Failed to store Gmail sync cursor', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (adapters.outlook) {
    await cache.setSyncCursor(userId, 'OUTLOOK', {
      outlookLastReceivedAt: new Date().toISOString(),
      lastStats,
    });
  }
}

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Register email stats routes
 */
export function registerEmailStatsRoutes(app: FastifyInstance): void {
  /**
   * GET /email/stats?userId=xxx&vips=a@b.com,c@d.com&forceRefresh=true
   *
   * Returns email counts for the home screen:
   * - newCount: total unread emails
   * - vipCount: unread emails from VIP senders
   * - urgentCount: flagged or high-importance emails
   *
   * Caching: Results are cached in Redis for 2 minutes.
   * Use forceRefresh=true to bypass the cache.
   */
  app.get<{ Querystring: StatsQuery }>(
    '/email/stats',
    async (request: FastifyRequest<{ Querystring: StatsQuery }>, reply: FastifyReply) => {
      const { userId, vips, forceRefresh } = request.query;

      if (!userId) {
        return reply.status(400).send({
          success: false,
          error: 'userId query parameter is required',
        });
      }

      const vipList = vips ? vips.split(',').map((v) => v.trim().toLowerCase()) : [];
      const vipHash = computeVipHash(vipList);
      const cache = getStatsCache();
      const shouldForceRefresh = forceRefresh === 'true';

      try {
        // =====================================================================
        // Level 1: Check stats cache
        // =====================================================================
        if (!shouldForceRefresh) {
          const cached = await cache.getStats(userId, vipHash);
          if (cached) {
            return reply.send({
              success: true,
              newCount: cached.newCount,
              vipCount: cached.vipCount,
              urgentCount: cached.urgentCount,
            } satisfies EmailStatsResponse);
          }
        }

        // =====================================================================
        // Create adapters (needed for both change detection and full fetch)
        // =====================================================================
        const adapters = await createAdaptersForUser(userId);

        if (adapters.providers.length === 0) {
          return reply.send({
            success: true,
            newCount: 0,
            vipCount: 0,
            urgentCount: 0,
          } satisfies EmailStatsResponse);
        }

        // =====================================================================
        // Level 2: Check sync cursors for change detection
        // =====================================================================
        if (!shouldForceRefresh) {
          const changed = await hasInboxChanged(adapters, cache, userId);

          if (!changed) {
            // No changes detected — try to reuse last stats from cursors
            const gmailCursor = await cache.getSyncCursor(userId, 'GMAIL');
            const outlookCursor = await cache.getSyncCursor(userId, 'OUTLOOK');
            const lastStats = gmailCursor?.lastStats ?? outlookCursor?.lastStats;

            if (lastStats) {
              // Refresh the stats cache TTL
              await cache.setStats(userId, vipHash, {
                newCount: lastStats.newCount,
                vipCount: lastStats.vipCount,
                urgentCount: lastStats.urgentCount,
              });

              logger.info('Stats served from sync cursor (no changes)', {
                userId,
                newCount: lastStats.newCount,
              });

              return reply.send({
                success: true,
                newCount: lastStats.newCount,
                vipCount: lastStats.vipCount,
                urgentCount: lastStats.urgentCount,
              } satisfies EmailStatsResponse);
            }
          }
        }

        // =====================================================================
        // Full fetch (same as original flow)
        // =====================================================================
        const stats = await fullFetchStats(adapters, vipList);

        // Cache the results
        await cache.setStats(userId, vipHash, stats);
        await updateSyncCursors(adapters, cache, userId, stats);

        logger.info('Email stats fetched (full)', {
          userId,
          newCount: stats.newCount,
          vipCount: stats.vipCount,
          urgentCount: stats.urgentCount,
        });

        return reply.send({
          success: true,
          ...stats,
        } satisfies EmailStatsResponse);
      } catch (error) {
        logger.error('Failed to fetch email stats', null, {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch email stats',
        });
      }
    }
  );

  /**
   * POST /email/cache/invalidate?userId=xxx
   *
   * Explicitly invalidate all cached email data for a user.
   * Used after briefing sessions or when the user reconnects an account.
   */
  app.post<{ Querystring: { userId: string } }>(
    '/email/cache/invalidate',
    async (request: FastifyRequest<{ Querystring: { userId: string } }>, reply: FastifyReply) => {
      const { userId } = request.query;

      if (!userId) {
        return reply.status(400).send({
          success: false,
          error: 'userId query parameter is required',
        });
      }

      const cache = getStatsCache();
      await cache.invalidateUser(userId);

      logger.info('Email cache invalidated', { userId });

      return reply.send({ success: true });
    }
  );
}
