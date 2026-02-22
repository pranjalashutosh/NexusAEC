/**
 * @nexus-aec/livekit-agent - Briefing Pipeline
 *
 * Connects the intelligence layer to the voice agent by orchestrating:
 *   1. Fetch unread emails from last 24 hours
 *   2. Filter: muted senders, previously-briefed IDs
 *   3. Pre-sort by heuristic (VIP → replied-to → recency)
 *   4. Process Batch 1 via LLM → build BriefingData
 *   5. Return { briefingData, remainingBatches }
 *
 * Replaces the old scorer + clusterer pipeline with LLM-powered preprocessing.
 */

import {
  RedFlagScorer,
  KeywordMatcher,
  VipDetector,
  TopicClusterer,
} from '@nexus-aec/intelligence';
import { createLogger } from '@nexus-aec/logger';

import type {
  UnifiedInboxService,
  StandardEmail as ProviderEmail,
} from '@nexus-aec/email-providers';
import type {
  RedFlagScore,
  RedFlagSignals,
  TopicClusteringResult,
  EmailMetadata,
} from '@nexus-aec/intelligence';
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
  /** LLM-assigned priority for this topic */
  priority?: 'high' | 'medium' | 'low';
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
  /** How many emails were fetched before filtering */
  totalFetched?: number;
  /** Human-readable summary of filtered emails */
  triageSummary?: string;
}

/**
 * Pipeline configuration
 */
export interface BriefingPipelineOptions {
  /** Max emails to fetch for the briefing (default: 500) */
  maxEmails?: number;
  /** Max topics to include (default: 50) */
  maxTopics?: number;
  /** VIP email addresses to boost scoring */
  vipEmails?: string[];
  /** Custom keywords for red-flag detection */
  customKeywords?: string[];
  /** Email IDs to exclude (already briefed/actioned in previous sessions) */
  excludeEmailIds?: Set<string>;
  /** Muted sender emails to filter out from briefing */
  mutedSenderEmails?: string[];
  /** OpenAI API key for LLM preprocessing */
  apiKey?: string;
  /** Fetch window — only include emails after this time (default: 24 hours ago) */
  since?: Date;
  /** Batch size for LLM preprocessing (default: 25) */
  batchSize?: number;
  /** Natural language preference summary from SenderProfileStore */
  senderPreferences?: string;
  /** User's knowledge base entries for domain-aware prioritization */
  knowledgeEntries?: string[];
}

/**
 * Extended pipeline return type for batched processing.
 */
export interface BriefingPipelineResult {
  /** Batch 1 results — ready to brief */
  briefingData: BriefingData;
  /** Batches 2..N of raw email metadata — caller processes in background */
  remainingBatches: EmailMetadata[][];
}

// =============================================================================
// Pipeline
// =============================================================================

/**
 * Run the briefing pipeline: fetch → filter → presort → LLM preprocess → build.
 *
 * When `apiKey` is provided, uses the new LLM-powered pipeline:
 *   1. Fetch unread emails from last 24 hours
 *   2. Filter muted/excluded, pre-sort by heuristic
 *   3. Batch into groups of 25, process Batch 1 via LLM
 *   4. Return Batch 1 as BriefingData + remaining batches for background processing
 *
 * When `apiKey` is NOT provided, falls back to the legacy scorer+clusterer pipeline.
 */
export async function runBriefingPipeline(
  inboxService: UnifiedInboxService,
  options: BriefingPipelineOptions = {}
): Promise<BriefingPipelineResult> {
  const startTime = Date.now();
  const maxEmails = options.maxEmails ?? 500;
  const maxTopics = options.maxTopics ?? 50;
  const PAGE_SIZE = 50;
  const MAX_PAGES = 10;
  const since = options.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  logger.info('Starting briefing pipeline', { maxEmails, maxTopics, since: since.toISOString() });

  // -------------------------------------------------------------------------
  // 1. Fetch unread emails with pagination (24-hour window)
  // -------------------------------------------------------------------------
  const rawEmails: ProviderEmail[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES && rawEmails.length < maxEmails; page++) {
    const fetchSize = Math.min(PAGE_SIZE, maxEmails - rawEmails.length);
    const result = await inboxService.fetchUnread(
      { after: since },
      { pageSize: fetchSize, ...(pageToken ? { pageToken } : {}) }
    );

    rawEmails.push(...result.items);
    pageToken = result.nextPageToken;

    logger.info('Fetched email page', {
      page: page + 1,
      pageItems: result.items.length,
      totalSoFar: rawEmails.length,
      hasMore: !!pageToken,
    });

    if (!pageToken || result.items.length === 0) {
      break;
    }
  }

  // Exclude emails that were already briefed/actioned in previous sessions
  const excludeIds = options.excludeEmailIds ?? new Set<string>();
  let emails = excludeIds.size > 0 ? rawEmails.filter((e) => !excludeIds.has(e.id)) : rawEmails;

  // Filter out emails from muted senders
  const mutedSenders = options.mutedSenderEmails ?? [];
  if (mutedSenders.length > 0) {
    const mutedSet = new Set(mutedSenders.map((s) => s.toLowerCase()));
    const beforeMute = emails.length;
    emails = emails.filter((e) => !mutedSet.has(e.from.email.toLowerCase()));
    logger.info('Filtered muted senders', {
      mutedCount: mutedSenders.length,
      removed: beforeMute - emails.length,
    });
  }

  logger.info('Fetched emails for briefing', {
    fetched: rawEmails.length,
    excluded: rawEmails.length - emails.length,
    remaining: emails.length,
  });

  if (emails.length === 0) {
    return {
      briefingData: createEmptyBriefing(Date.now() - startTime),
      remainingBatches: [],
    };
  }

  // -------------------------------------------------------------------------
  // 2. Try LLM preprocessing if apiKey is available
  // -------------------------------------------------------------------------
  if (options.apiKey) {
    try {
      return await runLLMPipeline(emails, rawEmails.length, options, startTime);
    } catch (error) {
      logger.warn('LLM pipeline failed, falling back to legacy scorer+clusterer', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fall through to legacy pipeline
    }
  }

  // -------------------------------------------------------------------------
  // 3. Legacy pipeline: Score + Cluster (fallback)
  // -------------------------------------------------------------------------
  return {
    briefingData: runLegacyPipeline(emails, maxTopics, options, startTime),
    remainingBatches: [],
  };
}

// =============================================================================
// LLM-Powered Pipeline
// =============================================================================

async function runLLMPipeline(
  emails: ProviderEmail[],
  totalFetched: number,
  options: BriefingPipelineOptions,
  startTime: number
): Promise<BriefingPipelineResult> {
  const { preprocessEmails, presortEmails } = await import('@nexus-aec/intelligence');

  const vipEmails = options.vipEmails ?? [];
  const batchSize = options.batchSize ?? 25;

  // Convert provider emails to EmailMetadata
  const emailMetadata: EmailMetadata[] = emails.map((e) => ({
    id: e.id,
    subject: e.subject,
    from: e.from.email,
    snippet: e.bodyPreview ?? e.subject,
    receivedAt: new Date(e.receivedAt),
    threadId: e.threadId,
    isVip: vipEmails.some((v) => v.toLowerCase() === e.from.email.toLowerCase()),
  }));

  // Pre-sort
  const sorted = presortEmails(emailMetadata, vipEmails);

  // Split into batches
  const allBatches: EmailMetadata[][] = [];
  for (let i = 0; i < sorted.length; i += batchSize) {
    allBatches.push(sorted.slice(i, i + batchSize));
  }

  // Process Batch 1 synchronously
  const result = await preprocessEmails(allBatches[0] ?? [], {
    apiKey: options.apiKey!,
    vipEmails,
    batchSize,
    ...(options.senderPreferences ? { senderPreferences: options.senderPreferences } : {}),
    ...(options.knowledgeEntries ? { knowledgeEntries: options.knowledgeEntries } : {}),
  });

  // Build BriefingData from Batch 1 result
  const batch1 = result.batches[0];
  const emailById = new Map(emails.map((e) => [e.id, e]));

  // Build a minimal score for each email based on LLM priority
  const scoreMap = new Map<string, RedFlagScore>();
  const priorityScores: Record<string, number> = { high: 0.9, medium: 0.5, low: 0.1 };

  if (batch1) {
    for (const pe of batch1.emails) {
      scoreMap.set(pe.emailId, {
        score: priorityScores[pe.priority] ?? 0.5,
        isFlagged: pe.priority === 'high',
        reasons: [{ signal: 'keyword' as const, type: 'llm', description: pe.summary, weight: 1 }],
        severity: null,
        signalBreakdown: [],
      });
    }
  }

  // Build topics from LLM clusters
  interface LLMCluster {
    label: string;
    priority: 'high' | 'medium' | 'low';
    emails: Array<{
      emailId: string;
      priority: 'high' | 'medium' | 'low';
      summary: string;
      clusterLabel: string;
    }>;
  }

  const topics: BriefingTopic[] = ((batch1?.clusters ?? []) as LLMCluster[]).map(
    (cluster: LLMCluster, i: number) => {
      const clusterEmails: ScoredEmail[] = cluster.emails
        .map((pe: LLMCluster['emails'][number]) => {
          const email = emailById.get(pe.emailId);
          const score = scoreMap.get(pe.emailId);
          if (!email || !score) {
            return null;
          }
          return { email, score };
        })
        .filter((e): e is ScoredEmail => e !== null);

      return {
        id: `llm-cluster-${i}`,
        label: cluster.label,
        keywords: [],
        emails: clusterEmails,
        maxScore:
          clusterEmails.length > 0 ? Math.max(...clusterEmails.map((e) => e.score.score)) : 0,
        flaggedCount: clusterEmails.filter((e) => e.score.isFlagged).length,
        priority: cluster.priority,
      };
    }
  );

  // Sort topics: high first, then by flaggedCount
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  topics.sort((a, b) => {
    const aPrio = priorityOrder[a.priority ?? 'medium'] ?? 1;
    const bPrio = priorityOrder[b.priority ?? 'medium'] ?? 1;
    if (aPrio !== bPrio) {
      return aPrio - bPrio;
    }
    return b.flaggedCount - a.flaggedCount;
  });

  const pipelineDurationMs = Date.now() - startTime;
  const totalFlagged = Array.from(scoreMap.values()).filter((s) => s.isFlagged).length;

  logger.info('LLM briefing pipeline complete', {
    topicCount: topics.length,
    totalEmails: emails.length,
    totalFlagged,
    batch1Emails: batch1?.emails.length ?? 0,
    remainingBatches: allBatches.length - 1,
    durationMs: pipelineDurationMs,
  });

  return {
    briefingData: {
      topics,
      topicItems: topics.map((t) => t.emails.length),
      topicLabels: topics.map((t) => t.label),
      totalEmails: emails.length,
      totalFlagged,
      scoreMap,
      pipelineDurationMs,
      ...(totalFetched ? { totalFetched } : {}),
      ...(result.skippedSummary ? { triageSummary: result.skippedSummary } : {}),
    },
    remainingBatches: allBatches.slice(1),
  };
}

// =============================================================================
// Legacy Pipeline (Fallback)
// =============================================================================

function runLegacyPipeline(
  emails: ProviderEmail[],
  maxTopics: number,
  options: BriefingPipelineOptions,
  startTime: number
): BriefingData {
  // Score every email with the red-flag system
  const keywordMatcher = new KeywordMatcher();
  const vipList: VIP[] = (options.vipEmails ?? []).map((email, i) => ({
    id: `vip-${i}`,
    email,
    addedAt: new Date(),
    source: 'manual' as const,
  }));
  const vipDetector = new VipDetector({ vipList });
  const scorer = new RedFlagScorer({ flagThreshold: 0.5 });
  const scoreMap = new Map<string, RedFlagScore>();

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

  // Cluster emails into topics
  const clusterer = new TopicClusterer({ minClusterSize: 2 });
  const sharedEmails = emails as unknown as SharedEmail[];
  const clusterResult: TopicClusteringResult = clusterer.clusterEmails(sharedEmails);

  const emailById = new Map(emails.map((e) => [e.id, e]));

  let topics: BriefingTopic[] = clusterResult.clusters.map((cluster) => {
    const clusterEmails: ScoredEmail[] = cluster.emailIds
      .map((id) => {
        const email = emailById.get(id);
        const score = scoreMap.get(id);
        if (!email || !score) {
          return null;
        }
        return { email, score };
      })
      .filter((e): e is ScoredEmail => e !== null)
      .sort((a, b) => b.score.score - a.score.score);

    return {
      id: cluster.id,
      label: cluster.topic,
      keywords: cluster.keywords,
      emails: clusterEmails,
      maxScore: clusterEmails.length > 0 ? Math.max(...clusterEmails.map((e) => e.score.score)) : 0,
      flaggedCount: clusterEmails.filter((e) => e.score.isFlagged).length,
    };
  });

  // Add unclustered emails as catch-all
  if (clusterResult.unclusteredEmailIds.length > 0) {
    const unclustered: ScoredEmail[] = clusterResult.unclusteredEmailIds
      .map((id) => {
        const email = emailById.get(id);
        const score = scoreMap.get(id);
        if (!email || !score) {
          return null;
        }
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

  // Sort topics
  topics.sort((a, b) => {
    if (b.flaggedCount !== a.flaggedCount) {
      return b.flaggedCount - a.flaggedCount;
    }
    if (b.maxScore !== a.maxScore) {
      return b.maxScore - a.maxScore;
    }
    return b.emails.length - a.emails.length;
  });

  topics = topics.slice(0, maxTopics);

  const pipelineDurationMs = Date.now() - startTime;

  return {
    topics,
    topicItems: topics.map((t) => t.emails.length),
    topicLabels: topics.map((t) => t.label),
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
