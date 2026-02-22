/**
 * RAG Retriever (Tier 3)
 *
 * Provides semantic search for Retrieval Augmented Generation (RAG) workflows.
 * Combines query embedding generation with vector similarity search.
 */

import type { Asset, SafetyDocument } from './asset-types';
import type { SupabaseVectorStore, SourceType } from './supabase-vector-store';

/**
 * Function type for generating embeddings from text
 */
export type EmbeddingGenerator = (text: string) => Promise<number[]>;

/**
 * Query options for RAG retrieval
 */
export interface RAGQueryOptions {
  /**
   * Filter by source type
   * - 'asset': Search only asset documents
   * - 'safety_manual': Search only safety manual documents
   * - undefined: Search all documents
   */
  sourceType?: 'asset' | 'safety_manual';

  /**
   * Maximum number of results to return
   * Default: 5
   */
  topK?: number;

  /**
   * Minimum similarity threshold (0-1)
   * Results below this threshold will be filtered out
   * Default: 0.7
   */
  minSimilarity?: number;

  /**
   * Filter by metadata fields
   * Example: { category: 'PUMP', location: 'Riverside Bridge' }
   */
  metadataFilter?: Record<string, unknown>;
}

/**
 * RAG retrieval result with typed metadata
 */
export interface RAGResult<T = Asset | SafetyDocument> {
  /**
   * Typed metadata (Asset or SafetyDocument)
   */
  data: T;

  /**
   * Similarity score (0-1, higher is more similar)
   */
  score: number;

  /**
   * Matched content snippet
   */
  content: string;

  /**
   * Source type
   */
  sourceType: 'asset' | 'safety_manual';

  /**
   * Document ID in vector store
   */
  documentId: string;
}

/**
 * Retrieval statistics
 */
export interface RetrievalStats {
  /**
   * Number of results returned
   */
  resultCount: number;

  /**
   * Query processing time in milliseconds
   */
  queryTimeMs: number;

  /**
   * Average similarity score
   */
  averageScore: number;

  /**
   * Highest similarity score
   */
  maxScore: number;

  /**
   * Lowest similarity score
   */
  minScore: number;
}

/**
 * RAG Retriever Options
 */
export interface RAGRetrieverOptions {
  /**
   * Vector store instance
   */
  vectorStore: SupabaseVectorStore;

  /**
   * Embedding generator function
   */
  embeddingGenerator: EmbeddingGenerator;

  /**
   * Default top-k value
   * Default: 5
   */
  defaultTopK?: number;

  /**
   * Default minimum similarity threshold
   * Default: 0.7
   */
  defaultMinSimilarity?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * RAG Retriever
 *
 * High-level interface for semantic search in RAG workflows.
 * Generates embeddings from queries and retrieves relevant documents.
 *
 * @example
 * ```typescript
 * import { RAGRetriever } from '@nexus-aec/intelligence';
 * import { createClient } from '@supabase/supabase-js';
 * import { OpenAI } from 'openai';
 *
 * // Initialize vector store
 * const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 * const vectorStore = new SupabaseVectorStore(supabase);
 *
 * // Create embedding generator
 * const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
 * const embeddingGenerator = async (text: string) => {
 *   const response = await openai.embeddings.create({
 *     model: 'text-embedding-3-small',
 *     input: text,
 *   });
 *   return response.data[0].embedding;
 * };
 *
 * // Initialize retriever
 * const retriever = new RAGRetriever({
 *   vectorStore,
 *   embeddingGenerator,
 * });
 *
 * // Search for assets
 * const results = await retriever.retrieve('pump station maintenance', {
 *   sourceType: 'asset',
 *   topK: 5,
 * });
 *
 * // Search for safety procedures
 * const procedures = await retriever.retrieveSafetyDocuments(
 *   'lockout tagout procedure',
 *   { topK: 3 }
 * );
 * ```
 */
export class RAGRetriever {
  private vectorStore: SupabaseVectorStore;
  private embeddingGenerator: EmbeddingGenerator;
  private defaultTopK: number;
  private defaultMinSimilarity: number;
  private debug: boolean;

  constructor(options: RAGRetrieverOptions) {
    this.vectorStore = options.vectorStore;
    this.embeddingGenerator = options.embeddingGenerator;
    this.defaultTopK = options.defaultTopK ?? 5;
    this.defaultMinSimilarity = options.defaultMinSimilarity ?? 0.7;
    this.debug = options.debug ?? false;
  }

  /**
   * Retrieve relevant documents for a query
   *
   * @param query - Natural language query
   * @param options - Query options
   * @returns Array of relevant results with scores
   */
  async retrieve(query: string, options: RAGQueryOptions = {}): Promise<RAGResult[]> {
    const startTime = Date.now();

    try {
      // Generate embedding for query
      if (this.debug) {
        console.log(`[RAGRetriever] Generating embedding for query: "${query}"`);
      }

      const queryEmbedding = await this.embeddingGenerator(query);

      // Prepare search options
      const topK = options.topK ?? this.defaultTopK;
      const minSimilarity = options.minSimilarity ?? this.defaultMinSimilarity;

      // Convert source type to uppercase for vector store
      const sourceType = options.sourceType
        ? (options.sourceType.toUpperCase() as SourceType)
        : undefined;

      // Search vector store
      if (this.debug) {
        console.log(
          `[RAGRetriever] Searching with topK=${topK}, minSimilarity=${minSimilarity}, sourceType=${sourceType ?? 'all'}`
        );
      }

      const searchResults = await this.vectorStore.search(queryEmbedding, {
        limit: topK,
        minSimilarity,
        ...(sourceType ? { sourceType } : {}),
        ...(options.metadataFilter ? { metadataFilter: options.metadataFilter } : {}),
      });

      // Map results to RAG format
      const results: RAGResult[] = searchResults.map((result) => ({
        data: result.document.metadata as unknown as Asset | SafetyDocument,
        score: result.similarity,
        content: result.document.content,
        sourceType: result.document.source_type.toLowerCase() as 'asset' | 'safety_manual',
        documentId: result.document.id,
      }));

      const queryTime = Date.now() - startTime;

      if (this.debug) {
        console.log(`[RAGRetriever] Found ${results.length} results in ${queryTime}ms`);
      }

      return results;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[RAGRetriever] Error retrieving documents:', err);
      throw new Error(`RAG retrieval failed: ${err.message}`);
    }
  }

  /**
   * Retrieve relevant assets for a query
   *
   * Convenience method that filters to asset documents only.
   *
   * @param query - Natural language query
   * @param options - Query options (sourceType will be overridden to 'asset')
   * @returns Array of asset results
   */
  async retrieveAssets(
    query: string,
    options: Omit<RAGQueryOptions, 'sourceType'> = {}
  ): Promise<RAGResult<Asset>[]> {
    const results = await this.retrieve(query, {
      ...options,
      sourceType: 'asset',
    });

    return results as RAGResult<Asset>[];
  }

  /**
   * Retrieve relevant safety documents for a query
   *
   * Convenience method that filters to safety manual documents only.
   *
   * @param query - Natural language query
   * @param options - Query options (sourceType will be overridden to 'safety_manual')
   * @returns Array of safety document results
   */
  async retrieveSafetyDocuments(
    query: string,
    options: Omit<RAGQueryOptions, 'sourceType'> = {}
  ): Promise<RAGResult<SafetyDocument>[]> {
    const results = await this.retrieve(query, {
      ...options,
      sourceType: 'safety_manual',
    });

    return results as RAGResult<SafetyDocument>[];
  }

  /**
   * Retrieve with statistics
   *
   * Returns both results and retrieval statistics for monitoring.
   *
   * @param query - Natural language query
   * @param options - Query options
   * @returns Results and statistics
   */
  async retrieveWithStats(
    query: string,
    options: RAGQueryOptions = {}
  ): Promise<{ results: RAGResult[]; stats: RetrievalStats }> {
    const startTime = Date.now();
    const results = await this.retrieve(query, options);
    const queryTimeMs = Date.now() - startTime;

    const scores = results.map((r) => r.score);
    const stats: RetrievalStats = {
      resultCount: results.length,
      queryTimeMs,
      averageScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      maxScore: scores.length > 0 ? Math.max(...scores) : 0,
      minScore: scores.length > 0 ? Math.min(...scores) : 0,
    };

    return { results, stats };
  }

  /**
   * Get retriever configuration
   */
  getConfig(): {
    defaultTopK: number;
    defaultMinSimilarity: number;
    debug: boolean;
  } {
    return {
      defaultTopK: this.defaultTopK,
      defaultMinSimilarity: this.defaultMinSimilarity,
      debug: this.debug,
    };
  }

  /**
   * Update retriever configuration
   */
  setConfig(config: {
    defaultTopK?: number;
    defaultMinSimilarity?: number;
    debug?: boolean;
  }): void {
    if (config.defaultTopK !== undefined) {
      this.defaultTopK = config.defaultTopK;
    }
    if (config.defaultMinSimilarity !== undefined) {
      this.defaultMinSimilarity = config.defaultMinSimilarity;
    }
    if (config.debug !== undefined) {
      this.debug = config.debug;
    }
  }
}
