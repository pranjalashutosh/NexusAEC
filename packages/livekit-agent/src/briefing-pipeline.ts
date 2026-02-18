/**
 * @nexus-aec/livekit-agent - Briefing Pipeline
 *
 * Connects the intelligence layer to the voice agent by orchestrating:
 *   1. Fetch unread emails via UnifiedInboxService
 *   2. Score emails for urgency via RedFlagScorer + signal detectors
 *   3. Cluster emails into topics via TopicClusterer
 *   4. Produce structured briefing data for the ReasoningLoop
 *
 * This replaces the hardcoded topicItems with real, data-driven briefing content.
 */

import { createLogger } from '@nexus-aec/logger';
import {
  RedFlagScorer,
  KeywordMatcher,
  VipDetector,
  TopicClusterer,
} from '@nexus-aec/intelligence';

import type {
  RedFlagScore,
  RedFlagSignals,
  TopicClusteringResult,
} from '@nexus-aec/intelligence';
import type { UnifiedInboxService, StandardEmail as ProviderEmail } from '@nexus-aec/email-providers';
import type { StandardEmail as SharedEmail, VIP } from '@nexus-aec/shared-types';

const logger = createLogger({ baseContext: { component: 'briefing-pipeline' } });

// =============================================================================
// Types
// =============================================================================

/**
 * A scored email with its red-flag assessment attached
 */
export interface ScoredEmail {
  email: ProviderEmail;
  score: RedFlagScore;
}

/**
 * A briefing topic — a cluster of related emails with scoring
 */
export interface BriefingTopic {
  /** Cluster ID */
  id: string;
  /** Human-readable topic label (e.g., "Q4 Reports", "VIP Messages") */
  label: string;
  /** Keywords describing this topic */
  keywords: string[];
  /** Emails in this topic, sorted by score descending */
  emails: ScoredEmail[];
  /** Highest red-flag score in this topic */
  maxScore: number;
  /** Number of flagged emails in this topic */
  flaggedCount: number;
}

/**
 * Full briefing data produced by the pipeline
 */
export interface BriefingData {
  /** Ordered topics (highest priority first) */
  topics: BriefingTopic[];
  /** Topic item counts (for ReasoningLoop initialization) */
  topicItems: number[];
  /** Topic labels (for briefing context) */
  topicLabels: string[];
  /** Total email count */
  totalEmails: number;
  /** Total flagged count */
  totalFlagged: number;
  /** All scored emails (for lookup) */
  scoreMap: Map<string, RedFlagScore>;
  /** Time taken to build the briefing (ms) */
  pipelineDurationMs: number;
}

/**
 * Pipeline configuration
 */
export interface BriefingPipelineOptions {
  /** Max emails to fetch for the briefing (default: 50) */
  maxEmails?: number;
  /** Max topics to include (default: 8) */
  maxTopics?: number;
  /** VIP email addresses to boost scoring */
  vipEmails?: string[];
  /** Custom keywords for red-flag detection */
  customKeywords?: string[];
  /** Email IDs to exclude (already briefed/actioned in previous sessions) */
  excludeEmailIds?: Set<string>;
}

// =============================================================================
// Pipeline
// =============================================================================

/**
 * Run the briefing pipeline: fetch → score → cluster → sort.
 *
 * @param inboxService - The wired UnifiedInboxService (from email-bootstrap)
 * @param options - Pipeline configuration
 * @returns Structured briefing data ready for the ReasoningLoop
 */
export async function runBriefingPipeline(
  inboxService: UnifiedInboxService,
  options: BriefingPipelineOptions = {},
): Promise<BriefingData> {
  const startTime = Date.now();
  const maxEmails = options.maxEmails ?? 50;
  const maxTopics = options.maxTopics ?? 50;

  logger.info('Starting briefing pipeline', { maxEmails, maxTopics });

  // -------------------------------------------------------------------------
  // 1. Fetch unread emails and filter out already-briefed ones
  // -------------------------------------------------------------------------
  const { items: rawEmails } = await inboxService.fetchUnread(
    {},
    { pageSize: maxEmails },
  );

  // Exclude emails that were already briefed/actioned in previous sessions
  const excludeIds = options.excludeEmailIds ?? new Set<string>();
  const emails = excludeIds.size > 0
    ? rawEmails.filter((e) => !excludeIds.has(e.id))
    : rawEmails;

  logger.info('Fetched emails for briefing', {
    fetched: rawEmails.length,
    excluded: rawEmails.length - emails.length,
    remaining: emails.length,
  });

  if (emails.length === 0) {
    return createEmptyBriefing(Date.now() - startTime);
  }

  // -------------------------------------------------------------------------
  // 2. Score every email with the red-flag system
  // -------------------------------------------------------------------------
  const keywordMatcher = new KeywordMatcher();
  const vipList: VIP[] = (options.vipEmails ?? []).map((email, i) => ({
    id: `vip-${i}`,
    email,
    addedAt: new Date(),
    source: 'manual' as const,
  }));
  const vipDetector = new VipDetector({ vipList });
  const scorer = new RedFlagScorer();
  const scoreMap = new Map<string, RedFlagScore>();

  // The intelligence layer uses shared-types StandardEmail;
  // email-providers StandardEmail has a compatible superset shape,
  // so we cast through unknown to bridge the two interfaces.
  for (const email of emails) {
    const sharedEmail = email as unknown as SharedEmail;
    const signals: RedFlagSignals = {
      keywordMatch: keywordMatcher.matchEmail(sharedEmail),
      vipDetection: vipDetector.detectVip(sharedEmail),
    };
    const score = scorer.scoreEmail(signals);
    scoreMap.set(email.id, score);
  }

  const totalFlagged = Array.from(scoreMap.values()).filter((s) => s.isFlagged).length;
  logger.info('Scored emails', {
    total: emails.length,
    flagged: totalFlagged,
  });

  // -------------------------------------------------------------------------
  // 3. Cluster emails into topics
  // -------------------------------------------------------------------------
  const clusterer = new TopicClusterer({ minClusterSize: 2 });
  const sharedEmails = emails as unknown as SharedEmail[];
  const clusterResult: TopicClusteringResult = clusterer.clusterEmails(sharedEmails);

  logger.info('Clustered emails', {
    clusterCount: clusterResult.clusterCount,
    unclustered: clusterResult.unclusteredEmailIds.length,
  });

  // -------------------------------------------------------------------------
  // 4. Build BriefingTopics sorted by priority
  // -------------------------------------------------------------------------
  const emailById = new Map(emails.map((e) => [e.id, e]));

  let topics: BriefingTopic[] = clusterResult.clusters.map((cluster) => {
    const clusterEmails: ScoredEmail[] = cluster.emailIds
      .map((id) => {
        const email = emailById.get(id);
        const score = scoreMap.get(id);
        if (!email || !score) return null;
        return { email, score };
      })
      .filter((e): e is ScoredEmail => e !== null)
      .sort((a, b) => b.score.score - a.score.score);

    const maxScore = clusterEmails.length > 0
      ? Math.max(...clusterEmails.map((e) => e.score.score))
      : 0;
    const flaggedCount = clusterEmails.filter((e) => e.score.isFlagged).length;

    return {
      id: cluster.id,
      label: cluster.topic,
      keywords: cluster.keywords,
      emails: clusterEmails,
      maxScore,
      flaggedCount,
    };
  });

  // Add unclustered emails as a catch-all topic
  if (clusterResult.unclusteredEmailIds.length > 0) {
    const unclustered: ScoredEmail[] = clusterResult.unclusteredEmailIds
      .map((id) => {
        const email = emailById.get(id);
        const score = scoreMap.get(id);
        if (!email || !score) return null;
        return { email, score };
      })
      .filter((e): e is ScoredEmail => e !== null)
      .sort((a, b) => b.score.score - a.score.score);

    if (unclustered.length > 0) {
      topics.push({
        id: 'unclustered',
        label: 'Other Messages',
        keywords: [],
        emails: unclustered,
        maxScore: Math.max(...unclustered.map((e) => e.score.score)),
        flaggedCount: unclustered.filter((e) => e.score.isFlagged).length,
      });
    }
  }

  // Sort topics: flaggedCount desc → maxScore desc → email count desc
  topics.sort((a, b) => {
    if (b.flaggedCount !== a.flaggedCount) return b.flaggedCount - a.flaggedCount;
    if (b.maxScore !== a.maxScore) return b.maxScore - a.maxScore;
    return b.emails.length - a.emails.length;
  });

  // Limit to maxTopics
  topics = topics.slice(0, maxTopics);

  // Verify no emails were lost during topic building
  const totalInTopics = topics.reduce((sum, t) => sum + t.emails.length, 0);
  if (totalInTopics < emails.length) {
    logger.warn('Emails lost during topic building', {
      fetched: emails.length,
      inTopics: totalInTopics,
      lost: emails.length - totalInTopics,
    });
  }

  const topicItems = topics.map((t) => t.emails.length);
  const topicLabels = topics.map((t) => t.label);

  const pipelineDurationMs = Date.now() - startTime;

  logger.info('Briefing pipeline complete', {
    topicCount: topics.length,
    topicItems,
    totalEmails: emails.length,
    totalFlagged,
    durationMs: pipelineDurationMs,
  });

  return {
    topics,
    topicItems,
    topicLabels,
    totalEmails: emails.length,
    totalFlagged,
    scoreMap,
    pipelineDurationMs,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function createEmptyBriefing(durationMs: number): BriefingData {
  return {
    topics: [],
    topicItems: [],
    topicLabels: [],
    totalEmails: 0,
    totalFlagged: 0,
    scoreMap: new Map(),
    pipelineDurationMs: durationMs,
  };
}
