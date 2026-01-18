/**
 * Asset Ingestion Orchestrator
 *
 * Coordinates the ingestion of assets and safety documents into the vector store.
 * Handles:
 * - Loading from various sources (CSV, JSON, PDFs)
 * - Generating embeddings
 * - Storing in vector database
 * - Progress tracking and error handling
 */

import fs from 'fs';
import path from 'path';

import {
  type Asset,
  type SafetyDocument,
  validateAsset,
  validateSafetyDocument,
  assetToContent,
  safetyDocumentToContent,
} from './asset-types';
import { parseAssetCSV } from './csv-parser';
import { extractPDF } from './pdf-extractor';
import {
  SupabaseVectorStore,
  type SourceType,
  type VectorDocumentInsert,
} from './supabase-vector-store';

/**
 * Embedding generator function type
 * Takes text content and returns embedding vector
 */
export type EmbeddingGenerator = (text: string) => Promise<number[]>;

/**
 * Options for asset ingestion
 */
export interface AssetIngestionOptions {
  /**
   * Batch size for processing assets
   * Default: 10
   */
  batchSize?: number;

  /**
   * Skip validation of assets
   * Default: false
   */
  skipValidation?: boolean;

  /**
   * Continue on errors (don't stop on first error)
   * Default: true
   */
  continueOnError?: boolean;

  /**
   * Clear existing data before ingestion
   * Default: false
   */
  clearExisting?: boolean;

  /**
   * Progress callback
   */
  onProgress?: (progress: IngestionProgress) => void;

  /**
   * Maximum concurrent embedding requests
   * Default: 5
   */
  maxConcurrency?: number;
}

/**
 * Progress information during ingestion
 */
export interface IngestionProgress {
  /**
   * Current phase of ingestion
   */
  phase: 'loading' | 'embedding' | 'storing' | 'complete';

  /**
   * Total items to process
   */
  total: number;

  /**
   * Items processed so far
   */
  processed: number;

  /**
   * Items successfully ingested
   */
  succeeded: number;

  /**
   * Items that failed
   */
  failed: number;

  /**
   * Progress percentage (0-100)
   */
  percentage: number;

  /**
   * Current operation message
   */
  message: string;
}

/**
 * Result of ingestion operation
 */
export interface IngestionResult {
  /**
   * Total items processed
   */
  total: number;

  /**
   * Successfully ingested items
   */
  succeeded: number;

  /**
   * Failed items
   */
  failed: number;

  /**
   * Ingested document IDs
   */
  documentIds: string[];

  /**
   * Errors encountered
   */
  errors: Array<{
    /**
     * Item identifier (assetId or document id)
     */
    itemId?: string;

    /**
     * Error message
     */
    error: string;

    /**
     * Item index in batch
     */
    index?: number;
  }>;

  /**
   * Duration in milliseconds
   */
  durationMs: number;
}

/**
 * Asset Ingestion Orchestrator
 */
export class AssetIngestion {
  private vectorStore: SupabaseVectorStore;
  private embeddingGenerator: EmbeddingGenerator;
  private options: Required<Omit<AssetIngestionOptions, 'onProgress'>> & {
    onProgress?: (progress: IngestionProgress) => void;
  };

  constructor(
    vectorStore: SupabaseVectorStore,
    embeddingGenerator: EmbeddingGenerator,
    options: AssetIngestionOptions = {}
  ) {
    this.vectorStore = vectorStore;
    this.embeddingGenerator = embeddingGenerator;
    this.options = {
      batchSize: options.batchSize ?? 10,
      skipValidation: options.skipValidation ?? false,
      continueOnError: options.continueOnError ?? true,
      clearExisting: options.clearExisting ?? false,
      maxConcurrency: options.maxConcurrency ?? 5,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    };
  }

  /**
   * Ingest assets from JSON file
   *
   * @param filePath - Path to JSON file containing Asset array
   * @returns Ingestion result
   */
  async ingestAssetsFromJSON(filePath: string): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      // Load JSON file
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const assets = JSON.parse(fileContent) as Asset[];

      if (!Array.isArray(assets)) {
        throw new Error('JSON file must contain an array of assets');
      }

      return await this.ingestAssets(assets, startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        total: 0,
        succeeded: 0,
        failed: 0,
        documentIds: [],
        errors: [{ error: `Failed to load JSON file: ${errorMessage}` }],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Ingest assets from CSV file
   *
   * @param filePath - Path to CSV file
   * @returns Ingestion result
   */
  async ingestAssetsFromCSV(filePath: string): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      // Parse CSV
      const parseResult = parseAssetCSV(filePath, {
        skipValidation: this.options.skipValidation,
        continueOnError: this.options.continueOnError,
      });

      // Convert parse errors to ingestion errors
      const errors = parseResult.errors.map((err) => {
        const e: { itemId?: string; error: string; index?: number } = {
          error: err.error,
          index: err.row,
        };
        if (err.assetId) {
          e.itemId = err.assetId;
        }
        return e;
      });

      if (parseResult.assets.length === 0) {
        return {
          total: parseResult.stats.totalRows,
          succeeded: 0,
          failed: parseResult.stats.failureCount,
          documentIds: [],
          errors,
          durationMs: Date.now() - startTime,
        };
      }

      const result = await this.ingestAssets(parseResult.assets, startTime);

      // Merge parsing errors with ingestion errors
      result.errors = [...errors, ...result.errors];
      result.failed += parseResult.stats.failureCount;

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        total: 0,
        succeeded: 0,
        failed: 0,
        documentIds: [],
        errors: [{ error: `Failed to load CSV file: ${errorMessage}` }],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Ingest safety documents from JSON file
   *
   * @param filePath - Path to JSON file containing SafetyDocument array
   * @returns Ingestion result
   */
  async ingestSafetyDocumentsFromJSON(filePath: string): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      // Load JSON file
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const documents = JSON.parse(fileContent) as SafetyDocument[];

      if (!Array.isArray(documents)) {
        throw new Error('JSON file must contain an array of safety documents');
      }

      return await this.ingestSafetyDocuments(documents, startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        total: 0,
        succeeded: 0,
        failed: 0,
        documentIds: [],
        errors: [{ error: `Failed to load JSON file: ${errorMessage}` }],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Ingest safety document from PDF file
   *
   * @param filePath - Path to PDF file
   * @param metadata - Document metadata (id, title, type, etc.)
   * @returns Ingestion result
   */
  async ingestSafetyDocumentFromPDF(
    filePath: string,
    metadata: {
      id: string;
      title: string;
      type: SafetyDocument['type'];
      relatedAssets?: string[];
      metadata?: Record<string, string>;
    }
  ): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      // Extract text from PDF
      const pdfResult = await extractPDF(filePath);

      // Create safety document
      const document: SafetyDocument = {
        id: metadata.id,
        title: metadata.title,
        content: pdfResult.text,
        type: metadata.type,
        relatedAssets: metadata.relatedAssets ?? [],
        metadata: {
          ...metadata.metadata,
          pageCount: String(pdfResult.pageCount),
          wordCount: String(pdfResult.stats.wordCount),
          extractedFrom: path.basename(filePath),
        },
      };

      return await this.ingestSafetyDocuments([document], startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        total: 1,
        succeeded: 0,
        failed: 1,
        documentIds: [],
        errors: [{ itemId: metadata.id, error: `Failed to extract PDF: ${errorMessage}` }],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Ingest array of assets
   */
  private async ingestAssets(assets: Asset[], startTime: number): Promise<IngestionResult> {
    const result: IngestionResult = {
      total: assets.length,
      succeeded: 0,
      failed: 0,
      documentIds: [],
      errors: [],
      durationMs: 0,
    };

    // Clear existing data if requested
    if (this.options.clearExisting) {
      await this.vectorStore.deleteBySourceType('ASSET');
    }

    // Report loading phase
    this.reportProgress({
      phase: 'loading',
      total: assets.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      percentage: 0,
      message: `Loaded ${assets.length} assets`,
    });

    // Validate assets
    if (!this.options.skipValidation) {
      for (let i = 0; i < assets.length; i++) {
        if (!validateAsset(assets[i])) {
          result.failed++;
          const itemId = assets[i]?.assetId;
          result.errors.push({
            ...(itemId ? { itemId } : {}),
            error: 'Asset validation failed',
            index: i,
          });

          if (!this.options.continueOnError) {
            result.durationMs = Date.now() - startTime;
            return result;
          }
        }
      }
    }

    // Filter out invalid assets
    const validAssets = this.options.skipValidation
      ? assets
      : assets.filter((a) => validateAsset(a));

    // Process in batches
    const batches = this.createBatches(validAssets, this.options.batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex] ?? [];

      try {
        await this.processBatch(
          batch,
          'ASSET',
          assetToContent,
          result,
          batchIndex * this.options.batchSize
        );
      } catch (error) {
        if (!this.options.continueOnError) {
          result.durationMs = Date.now() - startTime;
          return result;
        }
      }

      // Report progress
      const processed = (batchIndex + 1) * this.options.batchSize;
      this.reportProgress({
        phase: 'storing',
        total: validAssets.length,
        processed: Math.min(processed, validAssets.length),
        succeeded: result.succeeded,
        failed: result.failed,
        percentage: Math.round((processed / validAssets.length) * 100),
        message: `Processed ${Math.min(processed, validAssets.length)} of ${validAssets.length} assets`,
      });
    }

    // Report complete
    this.reportProgress({
      phase: 'complete',
      total: result.total,
      processed: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      percentage: 100,
      message: `Ingestion complete: ${result.succeeded} succeeded, ${result.failed} failed`,
    });

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Ingest array of safety documents
   */
  private async ingestSafetyDocuments(
    documents: SafetyDocument[],
    startTime: number
  ): Promise<IngestionResult> {
    const result: IngestionResult = {
      total: documents.length,
      succeeded: 0,
      failed: 0,
      documentIds: [],
      errors: [],
      durationMs: 0,
    };

    // Clear existing data if requested
    if (this.options.clearExisting) {
      await this.vectorStore.deleteBySourceType('SAFETY_MANUAL');
    }

    // Report loading phase
    this.reportProgress({
      phase: 'loading',
      total: documents.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      percentage: 0,
      message: `Loaded ${documents.length} safety documents`,
    });

    // Validate documents
    if (!this.options.skipValidation) {
      for (let i = 0; i < documents.length; i++) {
        if (!validateSafetyDocument(documents[i])) {
          result.failed++;
          const itemId = documents[i]?.id;
          result.errors.push({
            ...(itemId ? { itemId } : {}),
            error: 'Safety document validation failed',
            index: i,
          });

          if (!this.options.continueOnError) {
            result.durationMs = Date.now() - startTime;
            return result;
          }
        }
      }
    }

    // Filter out invalid documents
    const validDocuments = this.options.skipValidation
      ? documents
      : documents.filter((d) => validateSafetyDocument(d));

    // Process in batches
    const batches = this.createBatches(validDocuments, this.options.batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex] ?? [];

      try {
        await this.processBatch(
          batch,
          'SAFETY_MANUAL',
          safetyDocumentToContent,
          result,
          batchIndex * this.options.batchSize
        );
      } catch (error) {
        if (!this.options.continueOnError) {
          result.durationMs = Date.now() - startTime;
          return result;
        }
      }

      // Report progress
      const processed = (batchIndex + 1) * this.options.batchSize;
      this.reportProgress({
        phase: 'storing',
        total: validDocuments.length,
        processed: Math.min(processed, validDocuments.length),
        succeeded: result.succeeded,
        failed: result.failed,
        percentage: Math.round((processed / validDocuments.length) * 100),
        message: `Processed ${Math.min(processed, validDocuments.length)} of ${validDocuments.length} documents`,
      });
    }

    // Report complete
    this.reportProgress({
      phase: 'complete',
      total: result.total,
      processed: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      percentage: 100,
      message: `Ingestion complete: ${result.succeeded} succeeded, ${result.failed} failed`,
    });

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Process a batch of items
   */
  private async processBatch<T extends Asset | SafetyDocument>(
    batch: T[],
    sourceType: SourceType,
    toContent: (item: T) => string,
    result: IngestionResult,
    baseIndex: number
  ): Promise<void> {
    // Report embedding phase
    this.reportProgress({
      phase: 'embedding',
      total: result.total,
      processed: baseIndex,
      succeeded: result.succeeded,
      failed: result.failed,
      percentage: Math.round((baseIndex / result.total) * 100),
      message: `Generating embeddings for batch ${Math.floor(baseIndex / this.options.batchSize) + 1}`,
    });

    // Generate embeddings with concurrency control
    const embeddingPromiseFns = batch.map((item, index) => () =>
      this.generateEmbeddingWithRetry(toContent(item), item, index + baseIndex)
    );

    const embeddingResults = await this.limitConcurrency(
      embeddingPromiseFns,
      this.options.maxConcurrency
    );

    // Prepare documents for vector store
    const documents: VectorDocumentInsert[] = [];

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const embeddingResult = embeddingResults[i];
      if (!item || !embeddingResult) {
        result.failed++;
        result.errors.push({
          error: 'Internal error: missing batch item or embedding result',
          index: baseIndex + i,
        });
        continue;
      }

      if (embeddingResult.error) {
        result.failed++;
        const itemId = 'assetId' in item ? item.assetId : item.id;
        result.errors.push({
          ...(itemId ? { itemId } : {}),
          error: embeddingResult.error,
          index: baseIndex + i,
        });
        continue;
      }

      documents.push({
        content: toContent(item),
        embedding: embeddingResult.embedding!,
        source_type: sourceType,
        metadata: {
          id: 'assetId' in item ? item.assetId : item.id,
          ...(item as any),
        },
      });
    }

    // Store in vector database
    if (documents.length > 0) {
      try {
        const ids = await this.vectorStore.upsertMany(documents);
        result.succeeded += ids.length;
        result.documentIds.push(...ids);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.failed += documents.length;
        documents.forEach((doc, i) => {
          const itemId =
            typeof doc.metadata?.['id'] === 'string' ? (doc.metadata['id']) : undefined;
          result.errors.push({
            ...(itemId ? { itemId } : {}),
            error: `Failed to store: ${errorMessage}`,
            index: baseIndex + i,
          });
        });
      }
    }
  }

  /**
   * Generate embedding with retry logic
   */
  private async generateEmbeddingWithRetry(
    text: string,
    _item: Asset | SafetyDocument,
    _index: number,
    retries = 3
  ): Promise<{ embedding?: number[]; error?: string }> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const embedding = await this.embeddingGenerator(text);
        return { embedding };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt === retries - 1) {
          return { error: `Failed to generate embedding after ${retries} attempts: ${errorMessage}` };
        }

        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    return { error: 'Failed to generate embedding' };
  }

  /**
   * Limit concurrent promises
   */
  private async limitConcurrency<T>(
    promiseFns: (() => Promise<T>)[],
    maxConcurrency: number
  ): Promise<T[]> {
    const results: T[] = new Array(promiseFns.length);
    const executing: Set<Promise<void>> = new Set();

    for (let i = 0; i < promiseFns.length; i++) {
      const index = i;
      const promiseFn = promiseFns[i];
      if (!promiseFn) {
        continue;
      }

      const p = promiseFn().then((result) => {
        results[index] = result;
        executing.delete(p);
      });

      executing.add(p);

      if (executing.size >= maxConcurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(Array.from(executing));
    return results;
  }

  /**
   * Create batches from array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Report progress to callback
   */
  private reportProgress(progress: IngestionProgress): void {
    if (this.options.onProgress) {
      this.options.onProgress(progress);
    }
  }
}
