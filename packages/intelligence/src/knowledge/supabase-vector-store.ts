/**
 * Supabase Vector Store for Knowledge Base (Tier 3)
 *
 * Stores and retrieves document embeddings using pgvector.
 * Supports RAG (Retrieval Augmented Generation) workflows.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Source type for documents
 */
export type SourceType = 'ASSET' | 'SAFETY_MANUAL' | 'PROCEDURE';

/**
 * Document stored in vector database
 */
export interface VectorDocument {
  /**
   * Unique document ID (UUID)
   */
  id: string;

  /**
   * Document content/text
   */
  content: string;

  /**
   * Vector embedding (1536 dimensions for OpenAI)
   */
  embedding: number[];

  /**
   * Source type category
   */
  source_type: SourceType;

  /**
   * Flexible metadata (asset_id, category, location, etc.)
   */
  metadata: Record<string, unknown>;

  /**
   * Creation timestamp
   */
  created_at: Date;

  /**
   * Last update timestamp
   */
  updated_at: Date;
}

/**
 * Document for insertion (no id or timestamps)
 */
export interface VectorDocumentInsert {
  content: string;
  embedding: number[];
  source_type: SourceType;
  metadata?: Record<string, unknown>;
}

/**
 * Query result with similarity score
 */
export interface VectorSearchResult {
  /**
   * Matched document
   */
  document: VectorDocument;

  /**
   * Similarity score (0-1, higher is more similar)
   */
  similarity: number;
}

/**
 * Options for vector search
 */
export interface VectorSearchOptions {
  /**
   * Maximum number of results to return
   * Default: 10
   */
  limit?: number;

  /**
   * Minimum similarity threshold (0-1)
   * Default: 0.0 (no filtering)
   */
  minSimilarity?: number;

  /**
   * Filter by source type
   */
  sourceType?: SourceType;

  /**
   * Filter by metadata fields
   * Example: { category: 'Pump', location: 'Riverside Bridge' }
   */
  metadataFilter?: Record<string, unknown>;
}

/**
 * Options for SupabaseVectorStore
 */
export interface SupabaseVectorStoreOptions {
  /**
   * Supabase URL
   */
  supabaseUrl: string;

  /**
   * Supabase service role key (server-side only!)
   */
  supabaseKey: string;

  /**
   * Existing Supabase client instance
   */
  client?: SupabaseClient;

  /**
   * Table name for documents
   * Default: 'documents'
   */
  tableName?: string;

  /**
   * Whether to enable debug logging
   */
  debug?: boolean;
}

/**
 * Supabase Vector Store
 *
 * Provides vector storage and similarity search using Supabase + pgvector.
 *
 * @example
 * ```typescript
 * const store = new SupabaseVectorStore({
 *   supabaseUrl: process.env.SUPABASE_URL!,
 *   supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
 * });
 *
 * // Insert document
 * await store.upsert({
 *   content: 'Pump Station 104 is the main water distribution pump',
 *   embedding: [0.1, 0.2, ...], // 1536-dimensional vector
 *   source_type: 'ASSET',
 *   metadata: {
 *     asset_id: 'P-104',
 *     category: 'Pump',
 *     location: 'Riverside Bridge',
 *   },
 * });
 *
 * // Search similar documents
 * const results = await store.search(queryEmbedding, {
 *   limit: 5,
 *   sourceType: 'ASSET',
 *   minSimilarity: 0.7,
 * });
 * ```
 */
export class SupabaseVectorStore {
  private client: SupabaseClient;
  private tableName: string;
  private debug: boolean;
  private ownClient: boolean;

  constructor(options: SupabaseVectorStoreOptions) {
    this.tableName = options.tableName ?? 'documents';
    this.debug = options.debug ?? false;

    if (options.client) {
      this.client = options.client;
      this.ownClient = false;
    } else {
      this.client = createClient(options.supabaseUrl, options.supabaseKey);
      this.ownClient = true;
    }
  }

  /**
   * Insert or update a document
   * @returns Document ID
   */
  async upsert(document: VectorDocumentInsert): Promise<string> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .insert({
          content: document.content,
          embedding: JSON.stringify(document.embedding), // pgvector expects string
          source_type: document.source_type,
          metadata: document.metadata ?? {},
        })
        .select('id')
        .single();

      if (error) {
        throw new Error(`Failed to upsert document: ${error.message}`);
      }

      if (!data) {
        throw new Error('No data returned from upsert');
      }

      if (this.debug) {
        console.log(`[SupabaseVectorStore] Inserted document ${data.id}`);
      }

      return data.id;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SupabaseVectorStore] Error upserting document:', err);
      throw err;
    }
  }

  /**
   * Insert or update multiple documents
   * @returns Array of document IDs
   */
  async upsertMany(documents: VectorDocumentInsert[]): Promise<string[]> {
    try {
      const records = documents.map((doc) => ({
        content: doc.content,
        embedding: JSON.stringify(doc.embedding),
        source_type: doc.source_type,
        metadata: doc.metadata ?? {},
      }));

      const { data, error } = await this.client
        .from(this.tableName)
        .insert(records)
        .select('id');

      if (error) {
        throw new Error(`Failed to upsert documents: ${error.message}`);
      }

      if (!data) {
        throw new Error('No data returned from bulk upsert');
      }

      if (this.debug) {
        console.log(`[SupabaseVectorStore] Inserted ${data.length} documents`);
      }

      return data.map((row) => row.id);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SupabaseVectorStore] Error upserting documents:', err);
      throw err;
    }
  }

  /**
   * Search for similar documents using vector similarity
   */
  async search(
    queryEmbedding: number[],
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const limit = options.limit ?? 10;
    const minSimilarity = options.minSimilarity ?? 0.0;

    try {
      // Build RPC call for vector similarity search
      // Using custom SQL function for better performance
      let query = this.client.rpc('match_documents', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: minSimilarity,
        match_count: limit,
      });

      // Apply source type filter if specified
      if (options.sourceType) {
        query = query.eq('source_type', options.sourceType);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to search documents: ${error.message}`);
      }

      if (!data) {
        return [];
      }

      // Map results and apply metadata filter if needed
      let results: VectorSearchResult[] = data.map((row: any) => ({
        document: {
          id: row.id,
          content: row.content,
          embedding: JSON.parse(row.embedding),
          source_type: row.source_type,
          metadata: row.metadata,
          created_at: new Date(row.created_at),
          updated_at: new Date(row.updated_at),
        },
        similarity: row.similarity,
      }));

      // Apply metadata filter if specified
      if (options.metadataFilter) {
        results = results.filter((result) =>
          this.matchesMetadataFilter(result.document.metadata, options.metadataFilter!)
        );
      }

      if (this.debug) {
        console.log(`[SupabaseVectorStore] Found ${results.length} similar documents`);
      }

      return results;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SupabaseVectorStore] Error searching documents:', err);
      throw err;
    }
  }

  /**
   * Get document by ID
   */
  async get(id: string): Promise<VectorDocument | null> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found
          return null;
        }
        throw new Error(`Failed to get document: ${error.message}`);
      }

      if (!data) {
        return null;
      }

      return {
        id: data.id,
        content: data.content,
        embedding: JSON.parse(data.embedding),
        source_type: data.source_type,
        metadata: data.metadata,
        created_at: new Date(data.created_at),
        updated_at: new Date(data.updated_at),
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SupabaseVectorStore] Error getting document:', err);
      throw err;
    }
  }

  /**
   * Delete document by ID
   */
  async delete(id: string): Promise<boolean> {
    try {
      const { error } = await this.client.from(this.tableName).delete().eq('id', id);

      if (error) {
        throw new Error(`Failed to delete document: ${error.message}`);
      }

      if (this.debug) {
        console.log(`[SupabaseVectorStore] Deleted document ${id}`);
      }

      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SupabaseVectorStore] Error deleting document:', err);
      throw err;
    }
  }

  /**
   * Delete multiple documents by IDs
   */
  async deleteMany(ids: string[]): Promise<number> {
    try {
      const { error, count } = await this.client
        .from(this.tableName)
        .delete()
        .in('id', ids);

      if (error) {
        throw new Error(`Failed to delete documents: ${error.message}`);
      }

      if (this.debug) {
        console.log(`[SupabaseVectorStore] Deleted ${count ?? ids.length} documents`);
      }

      return count ?? ids.length;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SupabaseVectorStore] Error deleting documents:', err);
      throw err;
    }
  }

  /**
   * Delete all documents of a specific source type
   */
  async deleteBySourceType(sourceType: SourceType): Promise<number> {
    try {
      const { error, count } = await this.client
        .from(this.tableName)
        .delete()
        .eq('source_type', sourceType);

      if (error) {
        throw new Error(`Failed to delete documents by source type: ${error.message}`);
      }

      if (this.debug) {
        console.log(
          `[SupabaseVectorStore] Deleted ${count ?? 0} documents of type ${sourceType}`
        );
      }

      return count ?? 0;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SupabaseVectorStore] Error deleting by source type:', err);
      throw err;
    }
  }

  /**
   * Get count of documents by source type
   */
  async count(sourceType?: SourceType): Promise<number> {
    try {
      let query = this.client.from(this.tableName).select('*', { count: 'exact', head: true });

      if (sourceType) {
        query = query.eq('source_type', sourceType);
      }

      const { count, error } = await query;

      if (error) {
        throw new Error(`Failed to count documents: ${error.message}`);
      }

      return count ?? 0;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SupabaseVectorStore] Error counting documents:', err);
      throw err;
    }
  }

  /**
   * List all documents with optional filtering
   */
  async list(options: {
    sourceType?: SourceType;
    limit?: number;
    offset?: number;
  } = {}): Promise<VectorDocument[]> {
    try {
      let query = this.client.from(this.tableName).select('*');

      if (options.sourceType) {
        query = query.eq('source_type', options.sourceType);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit ?? 10) - 1);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to list documents: ${error.message}`);
      }

      if (!data) {
        return [];
      }

      return data.map((row) => ({
        id: row.id,
        content: row.content,
        embedding: JSON.parse(row.embedding),
        source_type: row.source_type,
        metadata: row.metadata,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SupabaseVectorStore] Error listing documents:', err);
      throw err;
    }
  }

  /**
   * Clear all documents (use with caution!)
   */
  async clear(): Promise<number> {
    try {
      const { error, count } = await this.client.from(this.tableName).delete().neq('id', '');

      if (error) {
        throw new Error(`Failed to clear documents: ${error.message}`);
      }

      if (this.debug) {
        console.log(`[SupabaseVectorStore] Cleared ${count ?? 0} documents`);
      }

      return count ?? 0;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SupabaseVectorStore] Error clearing documents:', err);
      throw err;
    }
  }

  /**
   * Get Supabase client for advanced operations
   */
  getClient(): SupabaseClient {
    return this.client;
  }

  /**
   * Check if metadata matches filter
   */
  private matchesMetadataFilter(
    metadata: Record<string, unknown>,
    filter: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }
}
