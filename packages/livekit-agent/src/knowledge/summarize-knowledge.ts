/**
 * Knowledge Summarization
 *
 * When the knowledge document exceeds size limits, this function
 * condenses entries using GPT-4o while preserving all rules and feedback.
 *
 * Called ONLY at session start (before the user hears anything),
 * so it adds zero latency to the live voice pipeline.
 */

import OpenAI from 'openai';
import { createLogger } from '@nexus-aec/logger';

import type { UserKnowledgeStore, KnowledgeDocument, KnowledgeEntry } from './user-knowledge-store.js';

const logger = createLogger({ baseContext: { component: 'knowledge-summarize' } });

const SUMMARIZE_PROMPT = `You are a knowledge compactor. Given a list of user knowledge entries, produce a condensed version.

RULES:
1. Preserve ALL entries with category "rule" or "feedback" EXACTLY as-is — do not rephrase, merge, or drop them.
2. Merge and condense "context" entries into fewer, more concise entries.
3. Merge similar "preference" entries but keep the intent clear.
4. Output valid JSON: an array of objects with { "content": string, "category": string }.
5. Target: reduce to 10-15 entries maximum.
6. Do NOT invent new information. Only condense what exists.

INPUT ENTRIES:
`;

/**
 * Summarize the knowledge document if it exceeds limits.
 * Preserves rules and feedback verbatim, condenses context and preferences.
 */
export async function summarizeKnowledge(
  store: UserKnowledgeStore,
  doc: KnowledgeDocument,
  openaiApiKey: string,
): Promise<void> {
  if (doc.entries.length === 0) return;

  logger.info('Summarizing knowledge document', {
    userId: doc.userId,
    entryCount: doc.entries.length,
    totalContentLength: doc.entries.reduce((sum, e) => sum + e.content.length, 0),
  });

  const inputJson = JSON.stringify(
    doc.entries.map((e) => ({ content: e.content, category: e.category })),
    null,
    2,
  );

  try {
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SUMMARIZE_PROMPT + inputJson },
        { role: 'user', content: 'Condense these entries. Return ONLY the JSON array, no other text.' },
      ],
      max_tokens: 1000,
      temperature: 0.2,
    });

    const rawContent = response.choices[0]?.message?.content?.trim();
    if (!rawContent) {
      logger.warn('Summarization returned empty response, keeping original');
      return;
    }

    // Parse the JSON response (strip markdown code fences if present)
    const cleaned = rawContent.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned) as Array<{ content: string; category: string }>;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      logger.warn('Summarization returned invalid format, keeping original');
      return;
    }

    // Rebuild entries with fresh IDs
    const condensed: KnowledgeEntry[] = parsed.map((item, i) => ({
      id: `k_sum_${Date.now()}_${i}`,
      content: item.content,
      category: item.category as KnowledgeEntry['category'],
      source: 'agent' as const,
      createdAt: new Date().toISOString(),
    }));

    await store.replace(doc.userId, condensed);

    logger.info('Knowledge document summarized', {
      userId: doc.userId,
      originalCount: doc.entries.length,
      condensedCount: condensed.length,
    });
  } catch (error) {
    logger.error(
      'Knowledge summarization failed, keeping original',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
