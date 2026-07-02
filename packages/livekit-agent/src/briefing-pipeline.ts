/**
 * @nexus-aec/livekit-agent - Briefing Pipeline
 *
 * Connects the intelligence layer to the voice agent by orchestrating:
 *   1. Fetch unread emails from last 24 hours
 *   2. Filter: muted senders, previously-briefed IDs, knowledge rules
 *   3. Pre-sort by heuristic (VIP → replied-to → recency)
 *   4. Process Batch 1 via LLM → build BriefingData
 *   5. Return { briefingData, remainingBatches }
 *
 * LLM-powered preprocessing is the only path. When no OpenAI API key is
 * available (or the LLM call fails), the pipeline returns an empty briefing.
 */

import { createLogger } from '@nexus-aec/logger';

import type {
  UnifiedInboxService,
  StandardEmail as ProviderEmail,
} from '@nexus-aec/email-providers';
import type { EmailMetadata } from '@nexus-aec/intelligence';

const logger = createLogger({ baseContext: { component: 'briefing-pipeline' } });

// =============================================================================
// Types
// =============================================================================

/**
 * An email with its LLM-assigned priority and voice-friendly summary.
 */
export interface ScoredEmail {
  email: ProviderEmail;
  /** LLM-assigned priority from preprocessing */
  priority: 'high' | 'medium' | 'low';
  /** Voice-friendly one-liner summary from LLM preprocessing */
  summary: string;
}

/**
 * A briefing topic — a cluster of related emails.
 */
export interface BriefingTopic {
  /** Cluster ID */
  id: string;
  /** Human-readable topic label (e.g., "Q4 Reports", "VIP Messages") */
  label: string;
  /** Keywords describing this topic */
  keywords: string[];
  /** Emails in this topic */
  emails: ScoredEmail[];
  /** Number of high-priority emails in this topic */
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
  /** Number of high-priority emails across all topics */
  totalFlagged: number;
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
  /** VIP email addresses to boost pre-sort ordering */
  vipEmails?: string[];
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
 * LLM preprocessing is the only supported path. When `apiKey` is not provided,
 * or the LLM call fails, the pipeline returns an empty briefing.
 */
export async function runBriefingPipeline(
  inboxService: UnifiedInboxService,
  options: BriefingPipelineOptions = {}
): Promise<BriefingPipelineResult> {
  const startTime = Date.now();
  const maxEmails = options.maxEmails ?? 500;
  const PAGE_SIZE = 50;
  const MAX_PAGES = 10;
  const since = options.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  logger.info('Starting briefing pipeline', { maxEmails, since: since.toISOString() });

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

  // Filter based on user knowledge rules (e.g., "never show Quora emails")
  const knowledgeEntries = options.knowledgeEntries ?? [];
  if (knowledgeEntries.length > 0) {
    const rules = extractFilterRules(knowledgeEntries);
    if (rules.blockedDomains.length > 0 || rules.blockedKeywords.length > 0) {
      const beforeRules = emails.length;
      emails = emails.filter((e) => {
        const fromLower = e.from.email.toLowerCase();
        const subjectLower = e.subject.toLowerCase();
        const previewLower = (e.bodyPreview ?? '').toLowerCase();
        const searchable = `${fromLower} ${subjectLower} ${previewLower}`;

        for (const domain of rules.blockedDomains) {
          if (fromLower.includes(domain)) {
            return false;
          }
        }
        for (const keyword of rules.blockedKeywords) {
          if (searchable.includes(keyword)) {
            return false;
          }
        }
        return true;
      });
      logger.info('Filtered by knowledge rules', {
        blockedDomains: rules.blockedDomains,
        blockedKeywords: rules.blockedKeywords,
        removed: beforeRules - emails.length,
      });
    }
  }

  logger.info('Fetched emails for briefing', {
    fetched: rawEmails.length,
    excluded: rawEmails.length - emails.length,
    remaining: emails.length,
  });

  if (emails.length === 0) {
    logger.info('[briefing-pipeline] 0 emails after filtering — returning empty briefing', {
      rawFetched: rawEmails.length,
      excludedCount: rawEmails.length - emails.length,
      since: since.toISOString(),
    });
    return {
      briefingData: createEmptyBriefing(Date.now() - startTime),
      remainingBatches: [],
    };
  }

  // -------------------------------------------------------------------------
  // 2. LLM preprocessing (only supported path)
  // -------------------------------------------------------------------------
  if (!options.apiKey) {
    logger.warn(
      'No OPENAI_API_KEY provided — returning empty briefing (LLM preprocessing required)'
    );
    return {
      briefingData: createEmptyBriefing(Date.now() - startTime),
      remainingBatches: [],
    };
  }

  try {
    return await runLLMPipeline(emails, rawEmails.length, options, startTime);
  } catch (error) {
    logger.warn('LLM pipeline failed — returning empty briefing', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      briefingData: createEmptyBriefing(Date.now() - startTime),
      remainingBatches: [],
    };
  }
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

  const batch1 = result.batches[0];
  const emailById = new Map(emails.map((e) => [e.id, e]));

  // Build topics directly from the LLM clusters, carrying the LLM's own
  // priority and summary through to the briefing (no intermediate scoring).
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
          if (!email) {
            return null;
          }
          return { email, priority: pe.priority, summary: pe.summary };
        })
        .filter((e): e is ScoredEmail => e !== null);

      return {
        id: `llm-cluster-${i}`,
        label: cluster.label,
        keywords: [],
        emails: clusterEmails,
        flaggedCount: clusterEmails.filter((e) => e.priority === 'high').length,
        priority: cluster.priority,
      };
    }
  );

  // Sort topics: high first, then by high-priority count
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
  const totalFlagged = topics.reduce((sum, t) => sum + t.flaggedCount, 0);

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
      pipelineDurationMs,
      ...(totalFetched ? { totalFetched } : {}),
      ...(result.skippedSummary ? { triageSummary: result.skippedSummary } : {}),
    },
    remainingBatches: allBatches.slice(1),
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse user knowledge entries tagged as [rule] for email filtering patterns.
 * Looks for phrases like "never show X", "skip all X", "block X", "hide X",
 * "don't bring X", "no X emails", "exclude X".
 */
function extractFilterRules(knowledgeEntries: string[]): {
  blockedDomains: string[];
  blockedKeywords: string[];
} {
  const blockedDomains: string[] = [];
  const blockedKeywords: string[] = [];

  // Scan ALL entries — blocking intent can appear in any category (rule, preference, etc.)
  const ruleEntries = knowledgeEntries;

  // Patterns that indicate blocking/filtering intent
  const blockPatterns =
    /(?:never\s+(?:show|include|bring)|skip\s+all|block|hide|exclude|don't\s+(?:show|bring|include)|no\s+\S+\s+emails|filter\s+out)\s+(.+)/i;

  for (const entry of ruleEntries) {
    // Strip any [category] prefix (e.g., [rule], [preference], [feedback])
    const content = entry.replace(/^\[\w+\]\s*/i, '');
    const match = content.match(blockPatterns);
    if (!match?.[1]) {
      continue;
    }

    const target = match[1]
      .replace(/\s*(emails?|messages?|notifications?|in\s+briefings?|from\s+briefings?)\s*/gi, '')
      .trim()
      .toLowerCase();

    if (target.length === 0) {
      continue;
    }

    // If it looks like a domain or email, treat as domain filter
    if (target.includes('.') || target.includes('@')) {
      blockedDomains.push(target);
    } else {
      blockedKeywords.push(target);
    }
  }

  return { blockedDomains, blockedKeywords };
}

function createEmptyBriefing(durationMs: number): BriefingData {
  return {
    topics: [],
    topicItems: [],
    topicLabels: [],
    totalEmails: 0,
    totalFlagged: 0,
    pipelineDurationMs: durationMs,
  };
}
