/**
 * Graph A · hydrate-context
 *
 * Gathers the extra signal that grounds classification for one batch of 25:
 *   - a natural-language sender-preference block (from `SenderProfileStore`),
 *     matching what the legacy preprocessor injected;
 *   - per-email knowledge-base evidence via RAG over `subject + snippet`
 *     (documents the user ingested — assets/safety manuals — NOT email content).
 *
 * Both sources are optional and degrade gracefully: if Redis/Supabase is
 * unavailable (or a call throws), the batch is still classified on metadata
 * alone (task 2.3). Injected via structural interfaces so `agent-graph` never
 * depends on the concrete stores.
 */

import type { EmailMetadata } from '@nexus-aec/intelligence';

/** Subset of `SenderProfileStore` used to synthesize a preference block. */
export interface SenderInsightProvider {
  synthesizePreferences(userId: string, senderEmails: string[]): Promise<string>;
}

/** Subset of `RAGRetriever` used to fetch grounding evidence for an email. */
export interface KnowledgeRetriever {
  retrieve(
    query: string,
    options?: { topK?: number; minSimilarity?: number }
  ): Promise<Array<{ documentId: string; content: string; score: number }>>;
}

export interface HydrateContextDeps {
  senderInsights?: SenderInsightProvider;
  knowledge?: KnowledgeRetriever;
  logger?: { warn(msg: string, meta?: Record<string, unknown>): void };
  /** Max KB docs to retrieve per email. Default: 3. */
  ragTopK?: number;
}

export interface HydrateContextResult {
  /** Sender-preference block for the classify prompt ('' when unavailable). */
  senderPreferences: string;
  /** emailId → matched KB doc IDs (identifiers only — Rule 60 safe). */
  evidenceByEmail: Record<string, string[]>;
  /** Deduped KB snippets used transiently to ground the ranking (not persisted). */
  knowledgeSnippets: string[];
}

const MAX_SNIPPETS = 6;
const SNIPPET_CHARS = 200;

/** Unique, lowercased sender addresses in the batch. */
function uniqueSenders(batch: EmailMetadata[]): string[] {
  return [...new Set(batch.map((e) => e.from.toLowerCase()))];
}

async function synthesizeSenderPrefs(
  userId: string,
  batch: EmailMetadata[],
  deps: HydrateContextDeps
): Promise<string> {
  if (!deps.senderInsights) {
    return '';
  }
  try {
    return await deps.senderInsights.synthesizePreferences(userId, uniqueSenders(batch));
  } catch (err) {
    deps.logger?.warn('hydrate-context: sender insight synthesis failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

async function gatherKnowledge(
  batch: EmailMetadata[],
  deps: HydrateContextDeps
): Promise<{ evidenceByEmail: Record<string, string[]>; knowledgeSnippets: string[] }> {
  const evidenceByEmail: Record<string, string[]> = {};
  const snippets: string[] = [];

  if (!deps.knowledge) {
    return { evidenceByEmail, knowledgeSnippets: snippets };
  }

  const topK = deps.ragTopK ?? 3;
  const retriever = deps.knowledge;

  const perEmail = await Promise.all(
    batch.map(async (email) => {
      const query = `${email.subject} ${email.snippet}`.trim();
      try {
        const hits = await retriever.retrieve(query, { topK });
        return { emailId: email.id, hits };
      } catch (err) {
        deps.logger?.warn('hydrate-context: RAG retrieval failed', {
          emailId: email.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          emailId: email.id,
          hits: [] as Awaited<ReturnType<KnowledgeRetriever['retrieve']>>,
        };
      }
    })
  );

  const seenSnippets = new Set<string>();
  for (const { emailId, hits } of perEmail) {
    if (hits.length === 0) {
      continue;
    }
    evidenceByEmail[emailId] = hits.map((h) => h.documentId);
    for (const hit of hits) {
      const snippet = hit.content.slice(0, SNIPPET_CHARS).trim();
      if (snippet.length > 0 && !seenSnippets.has(snippet) && snippets.length < MAX_SNIPPETS) {
        seenSnippets.add(snippet);
        snippets.push(snippet);
      }
    }
  }

  return { evidenceByEmail, knowledgeSnippets: snippets };
}

/**
 * Hydrate sender-preference + knowledge context for one batch. Never throws —
 * an unavailable source yields empty context and metadata-only classification.
 */
export async function hydrateContext(
  userId: string,
  batch: EmailMetadata[],
  deps: HydrateContextDeps = {}
): Promise<HydrateContextResult> {
  const [senderPreferences, knowledge] = await Promise.all([
    synthesizeSenderPrefs(userId, batch, deps),
    gatherKnowledge(batch, deps),
  ]);

  return {
    senderPreferences,
    evidenceByEmail: knowledge.evidenceByEmail,
    knowledgeSnippets: knowledge.knowledgeSnippets,
  };
}
