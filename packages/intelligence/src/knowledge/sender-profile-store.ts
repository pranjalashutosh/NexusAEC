/**
 * @nexus-aec/intelligence - Sender Profile Store
 *
 * Tracks per-sender engagement metrics across sessions to learn what
 * the user cares about. Stored in Redis with 90-day TTL.
 *
 * Key: nexus:sender:{userId}:{sha256(senderEmail)}
 *
 * Used by the preprocessing pipeline to inject learned preferences
 * into the LLM prompt for better prioritization.
 */

import { createHash } from 'crypto';

import Redis from 'ioredis';

// =============================================================================
// Types
// =============================================================================

export type ProfileAction =
  | 'archived'
  | 'flagged'
  | 'replied'
  | 'deeperViewed'
  | 'markRead'
  | 'skipped';

export interface SenderProfile {
  email: string;
  domain: string;
  totalReceived: number;
  actions: {
    archived: number;
    flagged: number;
    replied: number;
    deeperViewed: number;
    markRead: number;
    skipped: number;
  };
  priorityFeedback: {
    /** We said HIGH, user archived -> over-prioritized */
    highArchived: number;
    /** We said LOW, user went deeper -> under-prioritized */
    lowDeeperViewed: number;
  };
  lastSeenAt: string;
  firstSeenAt: string;
}

export interface SenderProfileStoreOptions {
  redisUrl: string;
}

// =============================================================================
// Constants
// =============================================================================

const KEY_PREFIX = 'nexus:sender:';
const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

// =============================================================================
// SenderProfileStore
// =============================================================================

export class SenderProfileStore {
  private redis: Redis;

  constructor(options: SenderProfileStoreOptions) {
    this.redis = new Redis(options.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  /**
   * Hash a sender email for use as a Redis key segment.
   */
  private hashEmail(email: string): string {
    return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
  }

  /**
   * Build the Redis key for a sender profile.
   */
  private key(userId: string, senderEmail: string): string {
    return `${KEY_PREFIX}${userId}:${this.hashEmail(senderEmail)}`;
  }

  /**
   * Record a user action on an email from this sender.
   */
  async recordAction(
    userId: string,
    senderEmail: string,
    action: ProfileAction,
    assignedPriority?: 'high' | 'medium' | 'low'
  ): Promise<void> {
    const redisKey = this.key(userId, senderEmail);
    const now = new Date().toISOString();

    try {
      await this.redis.connect().catch(() => {});
    } catch {
      // already connected
    }

    const existing = await this.redis.get(redisKey);
    let profile: SenderProfile;

    if (existing) {
      profile = JSON.parse(existing) as SenderProfile;
    } else {
      const domain = senderEmail.includes('@') ? senderEmail.split('@')[1]! : senderEmail;
      profile = {
        email: senderEmail.toLowerCase(),
        domain,
        totalReceived: 0,
        actions: {
          archived: 0,
          flagged: 0,
          replied: 0,
          deeperViewed: 0,
          markRead: 0,
          skipped: 0,
        },
        priorityFeedback: {
          highArchived: 0,
          lowDeeperViewed: 0,
        },
        lastSeenAt: now,
        firstSeenAt: now,
      };
    }

    // Update action count
    profile.actions[action] = (profile.actions[action] ?? 0) + 1;
    profile.totalReceived += 1;
    profile.lastSeenAt = now;

    // Track priority feedback for calibration
    if (assignedPriority === 'high' && action === 'archived') {
      profile.priorityFeedback.highArchived += 1;
    }
    if (assignedPriority === 'low' && action === 'deeperViewed') {
      profile.priorityFeedback.lowDeeperViewed += 1;
    }

    await this.redis.set(redisKey, JSON.stringify(profile), 'EX', TTL_SECONDS);
  }

  /**
   * Load profiles for a list of senders (batch read before preprocessing).
   */
  async getProfiles(userId: string, senderEmails: string[]): Promise<Map<string, SenderProfile>> {
    const result = new Map<string, SenderProfile>();

    if (senderEmails.length === 0) {
      return result;
    }

    try {
      await this.redis.connect().catch(() => {});
    } catch {
      // already connected
    }

    const keys = senderEmails.map((email) => this.key(userId, email));
    const values = await this.redis.mget(...keys);

    for (let i = 0; i < senderEmails.length; i++) {
      const raw = values[i];
      if (raw) {
        const profile = JSON.parse(raw) as SenderProfile;
        result.set(senderEmails[i]!.toLowerCase(), profile);
      }
    }

    return result;
  }

  /**
   * Generate natural language preference summary for LLM prompt injection.
   * Returns empty string if not enough data.
   */
  async synthesizePreferences(userId: string, senderEmails: string[]): Promise<string> {
    const profiles = await this.getProfiles(userId, senderEmails);

    if (profiles.size === 0) {
      return '';
    }

    const alwaysArchiveDomains: string[] = [];
    const alwaysEngageSenders: string[] = [];
    const underPrioritized: string[] = [];

    for (const profile of profiles.values()) {
      const total = profile.totalReceived;
      if (total < 3) {
        continue;
      } // Need at least 3 interactions for signal

      const archiveRate = profile.actions.archived / total;
      const engageRate = (profile.actions.flagged + profile.actions.replied) / total;

      if (archiveRate > 0.75) {
        alwaysArchiveDomains.push(`${profile.domain} (${Math.round(archiveRate * 100)}%)`);
      }
      if (engageRate > 0.5) {
        alwaysEngageSenders.push(`${profile.email} (${Math.round(engageRate * 100)}%)`);
      }
      if (profile.priorityFeedback.lowDeeperViewed >= 2) {
        underPrioritized.push(
          `${profile.email} (${profile.priorityFeedback.lowDeeperViewed} times went deeper)`
        );
      }
    }

    if (
      alwaysArchiveDomains.length === 0 &&
      alwaysEngageSenders.length === 0 &&
      underPrioritized.length === 0
    ) {
      return '';
    }

    const lines: string[] = ['USER LEARNED PREFERENCES (from past sessions):'];

    if (alwaysArchiveDomains.length > 0) {
      lines.push(`- Senders you almost always archive: ${alwaysArchiveDomains.join(', ')}`);
    }
    if (alwaysEngageSenders.length > 0) {
      lines.push(`- Senders you always engage with: ${alwaysEngageSenders.join(', ')}`);
    }
    if (underPrioritized.length > 0) {
      lines.push(
        `- Emails you were interested in but we marked LOW: ${underPrioritized.join(', ')}`
      );
    }

    return lines.join('\n');
  }

  /**
   * Disconnect the Redis client.
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
