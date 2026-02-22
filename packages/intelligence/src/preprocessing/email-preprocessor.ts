/**
 * @nexus-aec/intelligence - Email Preprocessor
 *
 * Batched LLM preprocessing pipeline that replaces the dumb scorer + clusterer.
 * Processes emails in batches of 25 via GPT-4o for:
 *   1. Semantic clustering (group related emails)
 *   2. Priority classification (high / medium / low)
 *   3. Voice-friendly summaries (one-liner per email)
 *
 * Supports progressive loading — Batch 1 returns immediately,
 * remaining batches are processed in background by the caller.
 */

import { LLMClient } from '../knowledge/llm-client.js';

import type { LLMMessage } from '../knowledge/llm-client.js';

// =============================================================================
// Types
// =============================================================================

/**
 * A preprocessed email with LLM-assigned cluster, priority, and summary.
 */
export interface PreprocessedEmail {
  emailId: string;
  priority: 'high' | 'medium' | 'low';
  /** Voice-friendly one-liner ("CEO requesting board deck by Friday") */
  summary: string;
  /** Semantic topic label ("Board Meeting Prep") */
  clusterLabel: string;
}

/**
 * Result of processing a single batch of emails.
 */
export interface BatchResult {
  batchIndex: number;
  emails: PreprocessedEmail[];
  clusters: Array<{
    label: string;
    priority: 'high' | 'medium' | 'low';
    emails: PreprocessedEmail[];
  }>;
}

/**
 * Full preprocessing result across all batches.
 */
export interface PreprocessingResult {
  batches: BatchResult[];
  /** Human-readable filter summary ("Filtered 38 newsletters, 12 LinkedIn notifications") */
  skippedSummary: string;
  totalFetched: number;
  totalIncluded: number;
}

/**
 * Input email shape — metadata only (PRD Rule 60 compliant).
 */
export interface EmailMetadata {
  id: string;
  subject: string;
  from: string;
  /** First ~100 chars (Gmail bodyPreview / snippet) */
  snippet: string;
  receivedAt: Date;
  threadId?: string;
  isVip?: boolean;
  hasBeenRepliedTo?: boolean;
}

/**
 * Options for preprocessing.
 */
export interface PreprocessOptions {
  apiKey: string;
  vipEmails?: string[];
  /** Default: 25 */
  batchSize?: number;
  /** Default: 'gpt-4o' */
  model?: string;
  /** Natural language preference summary from SenderProfileStore */
  senderPreferences?: string;
  /** User's knowledge base entries for domain-aware prioritization */
  knowledgeEntries?: string[];
}

// =============================================================================
// Heuristic Pre-Sort
// =============================================================================

/**
 * Pre-sort emails by heuristic before batching:
 *   1. VIP senders first
 *   2. Replied-to threads first
 *   3. Most recent first
 */
export function presortEmails(emails: EmailMetadata[], vipEmails: string[]): EmailMetadata[] {
  const vipSet = new Set(vipEmails.map((e) => e.toLowerCase()));

  return [...emails].sort((a, b) => {
    // 1. VIP senders first
    const aVip = vipSet.has(a.from.toLowerCase()) ? 1 : 0;
    const bVip = vipSet.has(b.from.toLowerCase()) ? 1 : 0;
    if (bVip !== aVip) {
      return bVip - aVip;
    }

    // 2. Replied-to threads first
    const aReplied = a.hasBeenRepliedTo ? 1 : 0;
    const bReplied = b.hasBeenRepliedTo ? 1 : 0;
    if (bReplied !== aReplied) {
      return bReplied - aReplied;
    }

    // 3. Most recent first
    return b.receivedAt.getTime() - a.receivedAt.getTime();
  });
}

// =============================================================================
// Batch Processing
// =============================================================================

/**
 * Format a Date for the LLM prompt (relative time like "2h ago" or "yesterday").
 */
function formatTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return `${Math.floor(diffHours / 24)}d ago`;
}

/**
 * Build the LLM prompt for a single batch.
 */
function buildBatchPrompt(
  batch: EmailMetadata[],
  vipEmails: string[],
  senderPreferences?: string,
  knowledgeEntries?: string[]
): LLMMessage[] {
  const vipLine =
    vipEmails.length > 0 ? `\nVIP contacts (always HIGH): ${vipEmails.join(', ')}` : '';

  const preferencesBlock = senderPreferences ? `\n${senderPreferences}\n` : '';

  const knowledgeBlock =
    knowledgeEntries && knowledgeEntries.length > 0
      ? `\nDOMAIN KNOWLEDGE (from user's memory):\n${knowledgeEntries.map((e) => `- ${e}`).join('\n')}\n`
      : '';

  const emailList = batch
    .map(
      (e, i) =>
        `[${i}] id:${e.id} | From: ${e.from} | Subject: ${e.subject} | Preview: ${e.snippet.slice(0, 100)} | Time: ${formatTime(e.receivedAt)}`
    )
    .join('\n');

  const systemMessage: LLMMessage = {
    role: 'system',
    content: `You are an executive assistant preprocessing emails for a voice briefing.
Process these ${batch.length} emails:

1. CLUSTER: Group semantically related emails into topics
2. PRIORITIZE each as "high", "medium", or "low":
   - HIGH: Immediate attention, important people, time-sensitive, financial/legal
   - MEDIUM: Relevant but not urgent, can be handled today
   - LOW: Newsletters, notifications, automated, FYI-only
3. SUMMARIZE each in one voice-friendly sentence (will be spoken aloud by a voice assistant — keep it natural and concise)
${vipLine}${preferencesBlock}${knowledgeBlock}
Return ONLY valid JSON with this exact structure:
{
  "clusters": [
    {
      "label": "Topic Name",
      "priority": "high",
      "emails": [
        { "emailId": "...", "priority": "high", "summary": "...", "clusterLabel": "Topic Name" }
      ]
    }
  ]
}`,
  };

  const userMessage: LLMMessage = {
    role: 'user',
    content: `EMAILS:\n${emailList}`,
  };

  return [systemMessage, userMessage];
}

/**
 * Parse the LLM JSON response into a BatchResult.
 * Falls back gracefully if parsing fails.
 */
function parseBatchResponse(
  content: string,
  batchIndex: number,
  batch: EmailMetadata[]
): BatchResult {
  try {
    const parsed = JSON.parse(content) as {
      clusters: Array<{
        label: string;
        priority: 'high' | 'medium' | 'low';
        emails: PreprocessedEmail[];
      }>;
    };

    const allEmails: PreprocessedEmail[] = [];
    for (const cluster of parsed.clusters) {
      for (const email of cluster.emails) {
        allEmails.push(email);
      }
    }

    return {
      batchIndex,
      emails: allEmails,
      clusters: parsed.clusters,
    };
  } catch {
    // Fallback: if LLM returns garbage, create a single cluster with all emails
    const fallbackEmails: PreprocessedEmail[] = batch.map((e) => ({
      emailId: e.id,
      priority: e.isVip ? 'high' : ('medium' as const),
      summary: `${e.subject} from ${e.from}`,
      clusterLabel: 'Inbox',
    }));

    return {
      batchIndex,
      emails: fallbackEmails,
      clusters: [
        {
          label: 'Inbox',
          priority: 'medium',
          emails: fallbackEmails,
        },
      ],
    };
  }
}

/**
 * Process a single batch of emails through the LLM.
 */
export async function preprocessBatch(
  batch: EmailMetadata[],
  options: {
    apiKey: string;
    vipEmails?: string[];
    batchIndex: number;
    model?: string;
    senderPreferences?: string;
    knowledgeEntries?: string[];
  }
): Promise<BatchResult> {
  const client = new LLMClient({
    apiKey: options.apiKey,
    defaultModel: options.model ?? 'gpt-4o',
    defaultTemperature: 0.3,
    defaultMaxTokens: 2000,
    retry: { maxRetries: 2 },
  });

  const messages = buildBatchPrompt(
    batch,
    options.vipEmails ?? [],
    options.senderPreferences,
    options.knowledgeEntries
  );

  const result = await client.complete(messages, {
    temperature: 0.3,
    maxTokens: 2000,
  });

  return parseBatchResponse(result.content, options.batchIndex, batch);
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Preprocess emails using batched LLM calls.
 *
 * Flow:
 *   1. Pre-sort by heuristic (VIP → replied-to → recency)
 *   2. Split into batches of batchSize (default: 25)
 *   3. Process Batch 1 synchronously (must have results before briefing starts)
 *   4. Return Batch 1 results + remaining raw batches for background processing
 */
export async function preprocessEmails(
  emails: EmailMetadata[],
  options: PreprocessOptions
): Promise<PreprocessingResult> {
  const batchSize = options.batchSize ?? 25;
  const vipEmails = options.vipEmails ?? [];

  // Pre-sort
  const sorted = presortEmails(emails, vipEmails);

  // Split into batches
  const batches: EmailMetadata[][] = [];
  for (let i = 0; i < sorted.length; i += batchSize) {
    batches.push(sorted.slice(i, i + batchSize));
  }

  if (batches.length === 0) {
    return {
      batches: [],
      skippedSummary: '',
      totalFetched: 0,
      totalIncluded: 0,
    };
  }

  // Process Batch 1 synchronously
  const batch1 = await preprocessBatch(batches[0]!, {
    apiKey: options.apiKey,
    vipEmails,
    batchIndex: 0,
    ...(options.model ? { model: options.model } : {}),
    ...(options.senderPreferences ? { senderPreferences: options.senderPreferences } : {}),
    ...(options.knowledgeEntries ? { knowledgeEntries: options.knowledgeEntries } : {}),
  });

  return {
    batches: [batch1],
    skippedSummary: '',
    totalFetched: emails.length,
    totalIncluded: emails.length,
  };
}
