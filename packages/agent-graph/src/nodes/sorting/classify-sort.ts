/**
 * Graph A · classify-sort
 *
 * Turns one batch of pre-sorted emails into priority-ranked `InboxQueueItem`s
 * via a structured-output LLM call. Ports the legacy preprocessor prompt MINUS
 * its CLUSTER step (D7 — the briefing walks priority buckets, not topics),
 * keeping the 6–14-word spoken-intent summary rules.
 *
 * Robustness (task 2.4): a malformed/failed LLM response falls back to an empty
 * summary — NEVER the raw subject line, which is exactly what the voice agent
 * must not read aloud. The pure helpers (`buildClassifyMessages`,
 * `parseClassification`) are LLM-free and directly unit-tested; only
 * `createStructuredClassifier` touches LangChain.
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import type { ChatOpenAI } from '@langchain/openai';
import type { EmailMetadata } from '@nexus-aec/intelligence';
import type { InboxQueueItem, QueuePriority } from '@nexus-aec/shared-types';

/** Zod schema for the structured classify call — flat, no clusters (D7). */
export const ClassificationSchema = z.object({
  emails: z.array(
    z.object({
      emailId: z.string().describe('The id: value copied from the email list'),
      priority: z.enum(['high', 'medium', 'low']),
      summary: z
        .string()
        .describe('6-14 word spoken-intent summary; never the subject line verbatim'),
    })
  ),
});

export type RawClassification = z.infer<typeof ClassificationSchema>['emails'][number];

export interface PromptMessage {
  role: 'system' | 'user';
  content: string;
}

/** Injected LLM call: prompt messages → per-email classifications (may throw). */
export type ClassifyFn = (messages: PromptMessage[]) => Promise<RawClassification[]>;

/** Extra signal from `hydrate-context` + hydrated preferences that grounds ranking. */
export interface ClassifyContext {
  /** Natural-language sender-preference block. */
  senderPreferences?: string;
  /** User knowledge/memory entries (parity with the legacy preprocessor). */
  knowledgeEntries?: string[];
  /** RAG snippets from the user's knowledge base. */
  knowledgeSnippets?: string[];
  /** emailId → matched KB doc IDs, attached to items as `ragEvidence`. */
  evidenceByEmail?: Record<string, string[]>;
}

const PRIORITIES: readonly QueuePriority[] = ['high', 'medium', 'low'];

/** Relative-time label for the prompt (matches the legacy preprocessor). */
function formatTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
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
 * Build the classify prompt for a batch (system rules + email list). No CLUSTER
 * step; emits a flat per-email priority + summary.
 */
export function buildClassifyMessages(
  batch: EmailMetadata[],
  vipEmails: string[],
  context: ClassifyContext = {}
): PromptMessage[] {
  const vipLine =
    vipEmails.length > 0 ? `\nVIP contacts (always HIGH): ${vipEmails.join(', ')}` : '';

  const preferencesBlock = context.senderPreferences ? `\n${context.senderPreferences}\n` : '';

  const knowledgeBlock =
    context.knowledgeEntries && context.knowledgeEntries.length > 0
      ? `\nDOMAIN KNOWLEDGE (from user's memory):\n${context.knowledgeEntries
          .map((e) => `- ${e}`)
          .join('\n')}\n`
      : '';

  const ragBlock =
    context.knowledgeSnippets && context.knowledgeSnippets.length > 0
      ? `\nRELEVANT KNOWLEDGE BASE CONTEXT:\n${context.knowledgeSnippets
          .map((s) => `- ${s}`)
          .join('\n')}\n`
      : '';

  const emailList = batch
    .map(
      (e, i) =>
        `[${i}] id:${e.id} | From: ${e.from} | Subject: ${e.subject} | Preview: ${e.snippet.slice(
          0,
          100
        )} | Time: ${formatTime(e.receivedAt)}`
    )
    .join('\n');

  const system: PromptMessage = {
    role: 'system',
    content: `You are an executive assistant preprocessing emails for a voice briefing.
Process these ${batch.length} emails:

1. PRIORITIZE each as "high", "medium", or "low":
   - HIGH: Immediate attention, important people, time-sensitive, financial/legal
   - MEDIUM: Relevant but not urgent, can be handled today
   - LOW: Newsletters, notifications, automated, FYI-only
2. SUMMARIZE each email's INTENT in 6 to 14 spoken words. The summary will be read aloud by a voice assistant. Rules: rephrase the email's intent in everyday spoken language; never copy the subject line verbatim; lead with a verb (wants, announces, is asking, shares, reminds, confirms); do not include URLs, tracking IDs, dates, money amounts, or the sender name. If the email has no clear intent, write a short generic phrase like "automated notification" or "promotional update" — never copy the subject.
${vipLine}${preferencesBlock}${knowledgeBlock}${ragBlock}
Return exactly one entry per email, echoing its emailId.`,
  };

  return [system, { role: 'user', content: `EMAILS:\n${emailList}` }];
}

function toPriority(value: string | undefined, fallback: QueuePriority): QueuePriority {
  return PRIORITIES.includes(value as QueuePriority) ? (value as QueuePriority) : fallback;
}

/**
 * Map raw classifications back onto batch metadata, preserving the pre-sorted
 * order. Emails the LLM omitted (or a wholesale failure → empty `raw`) fall back
 * to a metadata-only item with an EMPTY summary — never the subject.
 */
export function parseClassification(
  raw: RawClassification[],
  batch: EmailMetadata[],
  context: ClassifyContext = {}
): InboxQueueItem[] {
  const byId = new Map(raw.map((r) => [r.emailId, r]));
  const evidence = context.evidenceByEmail ?? {};

  return batch.map((meta) => {
    const hit = byId.get(meta.id);
    const fallbackPriority: QueuePriority = meta.isVip ? 'high' : 'medium';
    const priority = hit ? toPriority(hit.priority, fallbackPriority) : fallbackPriority;

    // Never let the subject leak into speech: blank a missing summary or one
    // that just echoes the subject line.
    let summary = hit?.summary?.trim() ?? '';
    if (summary.toLowerCase() === meta.subject.trim().toLowerCase()) {
      summary = '';
    }

    const ragEvidence = evidence[meta.id];

    return {
      emailId: meta.id,
      ...(meta.threadId ? { threadId: meta.threadId } : {}),
      from: meta.from,
      subject: meta.subject,
      receivedAt: meta.receivedAt.toISOString(),
      priority,
      summary,
      ...(ragEvidence && ragEvidence.length > 0 ? { ragEvidence } : {}),
      status: 'pending' as const,
    };
  });
}

/**
 * Classify one batch: build the prompt, call the LLM, map results onto items.
 * Any LLM/parse failure degrades to metadata-only fallback items.
 */
export async function classifyBatch(
  batch: EmailMetadata[],
  vipEmails: string[],
  context: ClassifyContext,
  classify: ClassifyFn
): Promise<InboxQueueItem[]> {
  let raw: RawClassification[] = [];
  try {
    raw = await classify(buildClassifyMessages(batch, vipEmails, context));
  } catch {
    raw = [];
  }
  return parseClassification(raw, batch, context);
}

/**
 * Adapt a `ChatOpenAI` into a `ClassifyFn` via structured output. The only
 * LangChain-coupled export here.
 */
export function createStructuredClassifier(chatModel: ChatOpenAI): ClassifyFn {
  const structured = chatModel.withStructuredOutput(ClassificationSchema, {
    name: 'classify_emails',
  });
  return async (messages) => {
    const lcMessages = messages.map((m) =>
      m.role === 'system' ? new SystemMessage(m.content) : new HumanMessage(m.content)
    );
    const result = await structured.invoke(lcMessages);
    return result.emails;
  };
}
