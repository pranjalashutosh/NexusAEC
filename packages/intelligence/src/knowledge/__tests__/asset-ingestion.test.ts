/**
 * Tests for Asset Ingestion Orchestrator
 */

import {
  AssetIngestion,
  type EmbeddingGenerator,
  type IngestionProgress,
  type IngestionResult,
} from '../asset-ingestion';
import { SupabaseVectorStore } from '../supabase-vector-store';
import type { Asset, SafetyDocument } from '../asset-types';
import fs from 'fs';

// Mock dependencies
jest.mock('fs');
jest.mock('../csv-parser');
jest.mock('../pdf-extractor');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('AssetIngestion', () => {
  let mockVectorStore: jest.Mocked<SupabaseVectorStore>;
  let mockEmbeddingGenerator: jest.MockedFunction<EmbeddingGenerator>;
  let ingestion: AssetIngestion;

  const sampleAsset: Asset = {
    assetId: 'P-001',
    name: 'Test Pump',
    description: 'A test pump',
    category: 'PUMP',
    location: 'Building A',
  };

  const sampleDocument: SafetyDocument = {
    id: 'DOC-001',
    title: 'Safety Manual',
    content: 'Safety procedures for pump operation',
    type: 'SAFETY_MANUAL',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock vector store
    mockVectorStore = {
      upsert: jest.fn(),
      upsertMany: jest.fn(),
      deleteBySourceType: jest.fn(),
    } as any;

    // Create mock embedding generator
    mockEmbeddingGenerator = jest.fn().mockResolvedValue(new Array(1536).fill(0.1));

    // Create ingestion instance
    ingestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator);
  });

  describe('Constructor', () => {
    it('should create instance with default options', () => {
      expect(ingestion).toBeInstanceOf(AssetIngestion);
    });

    it('should accept custom options', () => {
      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        batchSize: 20,
        skipValidation: true,
        continueOnError: false,
        clearExisting: true,
        maxConcurrency: 10,
      });

      expect(customIngestion).toBeInstanceOf(AssetIngestion);
    });

    it('should accept progress callback', () => {
      const onProgress = jest.fn();
      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        onProgress,
      });

      expect(customIngestion).toBeInstanceOf(AssetIngestion);
    });
  });

  describe('ingestAssetsFromJSON', () => {
    it('should ingest assets from JSON file', async () => {
      const assets = [sampleAsset, { ...sampleAsset, assetId: 'P-002', name: 'Pump 2' }];

      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockVectorStore.upsertMany.mockResolvedValue(['id1', 'id2']);

      const result = await ingestion.ingestAssetsFromJSON('/path/to/assets.json');

      expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/assets.json', 'utf-8');
      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.documentIds).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle invalid JSON', async () => {
      mockFs.readFileSync.mockReturnValue('{ invalid json');

      const result = await ingestion.ingestAssetsFromJSON('/path/to/invalid.json');

      expect(result.total).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Failed to load JSON file');
    });

    it('should reject non-array JSON', async () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ not: 'an array' }));

      const result = await ingestion.ingestAssetsFromJSON('/path/to/object.json');

      expect(result.errors[0].error).toContain('must contain an array');
    });

    it('should clear existing data when requested', async () => {
      const assets = [sampleAsset];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        clearExisting: true,
      });

      await customIngestion.ingestAssetsFromJSON('/path/to/assets.json');

      expect(mockVectorStore.deleteBySourceType).toHaveBeenCalledWith('ASSET');
    });

    it('should validate assets by default', async () => {
      const invalidAsset = { ...sampleAsset, assetId: '' }; // Missing required field
      mockFs.readFileSync.mockReturnValue(JSON.stringify([invalidAsset]));

      const result = await ingestion.ingestAssetsFromJSON('/path/to/assets.json');

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.error.includes('validation'))).toBe(true);
    });

    it('should skip validation when requested', async () => {
      const invalidAsset = { ...sampleAsset, assetId: '' };
      mockFs.readFileSync.mockReturnValue(JSON.stringify([invalidAsset]));
      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        skipValidation: true,
      });

      const result = await customIngestion.ingestAssetsFromJSON('/path/to/assets.json');

      // Should not fail validation
      expect(result.succeeded).toBeGreaterThan(0);
    });

    it('should generate embeddings for each asset', async () => {
      const assets = [sampleAsset, { ...sampleAsset, assetId: 'P-002' }];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockVectorStore.upsertMany.mockResolvedValue(['id1', 'id2']);

      await ingestion.ingestAssetsFromJSON('/path/to/assets.json');

      expect(mockEmbeddingGenerator).toHaveBeenCalledTimes(2);
      expect(mockEmbeddingGenerator).toHaveBeenCalledWith(expect.stringContaining('Test Pump'));
    });

    it('should report progress', async () => {
      const onProgress = jest.fn();
      const assets = [sampleAsset];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        onProgress,
      });

      await customIngestion.ingestAssetsFromJSON('/path/to/assets.json');

      expect(onProgress).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: expect.any(String),
          total: expect.any(Number),
          processed: expect.any(Number),
          percentage: expect.any(Number),
        })
      );
    });

    it('should handle embedding generation errors', async () => {
      const assets = [sampleAsset];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockEmbeddingGenerator.mockRejectedValue(new Error('OpenAI API error'));

      const result = await ingestion.ingestAssetsFromJSON('/path/to/assets.json');

      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toContain('embedding');
    });

    it('should handle vector store errors', async () => {
      const assets = [sampleAsset];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockVectorStore.upsertMany.mockRejectedValue(new Error('Database error'));

      const result = await ingestion.ingestAssetsFromJSON('/path/to/assets.json');

      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toContain('Failed to store');
    });

    it('should process in batches', async () => {
      const assets = Array.from({ length: 25 }, (_, i) => ({
        ...sampleAsset,
        assetId: `P-${i.toString().padStart(3, '0')}`,
      }));

      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        batchSize: 10,
      });

      await customIngestion.ingestAssetsFromJSON('/path/to/assets.json');

      // Should call upsertMany 3 times (10, 10, 5)
      expect(mockVectorStore.upsertMany).toHaveBeenCalledTimes(3);
    });

    it('should continue on error by default', async () => {
      const assets = [sampleAsset, { ...sampleAsset, assetId: 'P-002' }];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));

      let callCount = 0;
      // First item succeeds, second fails (with retries)
      mockEmbeddingGenerator.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Array(1536).fill(0.1);
        } else {
          throw new Error('API error');
        }
      });
      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const result = await ingestion.ingestAssetsFromJSON('/path/to/assets.json');

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should stop on first error when continueOnError is false', async () => {
      const invalidAsset = { ...sampleAsset, assetId: '' };
      const assets = [invalidAsset, sampleAsset];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));

      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        continueOnError: false,
      });

      const result = await customIngestion.ingestAssetsFromJSON('/path/to/assets.json');

      // Should stop after first validation error
      expect(result.failed).toBe(1);
      expect(result.succeeded).toBe(0);
    });
  });

  describe('ingestAssetsFromCSV', () => {
    it('should ingest assets from CSV file', async () => {
      const { parseAssetCSV } = require('../csv-parser');

      parseAssetCSV.mockReturnValue({
        assets: [sampleAsset],
        errors: [],
        stats: {
          totalRows: 1,
          successCount: 1,
          failureCount: 0,
        },
      });

      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const result = await ingestion.ingestAssetsFromCSV('/path/to/assets.csv');

      expect(parseAssetCSV).toHaveBeenCalledWith('/path/to/assets.csv', expect.any(Object));
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should handle CSV parsing errors', async () => {
      const { parseAssetCSV } = require('../csv-parser');

      parseAssetCSV.mockReturnValue({
        assets: [sampleAsset],
        errors: [{ row: 2, assetId: 'P-BAD', error: 'Missing required field' }],
        stats: {
          totalRows: 2,
          successCount: 1,
          failureCount: 1,
        },
      });

      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const result = await ingestion.ingestAssetsFromCSV('/path/to/assets.csv');

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Missing required field');
    });

    it('should handle empty CSV', async () => {
      const { parseAssetCSV } = require('../csv-parser');

      parseAssetCSV.mockReturnValue({
        assets: [],
        errors: [],
        stats: {
          totalRows: 0,
          successCount: 0,
          failureCount: 0,
        },
      });

      const result = await ingestion.ingestAssetsFromCSV('/path/to/empty.csv');

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should handle CSV load failure', async () => {
      const { parseAssetCSV } = require('../csv-parser');

      parseAssetCSV.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = await ingestion.ingestAssetsFromCSV('/path/to/nonexistent.csv');

      expect(result.errors[0].error).toContain('Failed to load CSV file');
    });
  });

  describe('ingestSafetyDocumentsFromJSON', () => {
    it('should ingest safety documents from JSON file', async () => {
      const documents = [sampleDocument];

      mockFs.readFileSync.mockReturnValue(JSON.stringify(documents));
      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const result = await ingestion.ingestSafetyDocumentsFromJSON('/path/to/manuals.json');

      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should validate safety documents', async () => {
      const invalidDoc = { ...sampleDocument, id: '' };
      mockFs.readFileSync.mockReturnValue(JSON.stringify([invalidDoc]));

      const result = await ingestion.ingestSafetyDocumentsFromJSON('/path/to/manuals.json');

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.error.includes('validation'))).toBe(true);
    });

    it('should clear existing safety manuals when requested', async () => {
      const documents = [sampleDocument];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(documents));
      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        clearExisting: true,
      });

      await customIngestion.ingestSafetyDocumentsFromJSON('/path/to/manuals.json');

      expect(mockVectorStore.deleteBySourceType).toHaveBeenCalledWith('SAFETY_MANUAL');
    });

    it('should handle non-array JSON', async () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ not: 'an array' }));

      const result = await ingestion.ingestSafetyDocumentsFromJSON('/path/to/invalid.json');

      expect(result.errors[0].error).toContain('must contain an array');
    });
  });

  describe('ingestSafetyDocumentFromPDF', () => {
    it('should ingest safety document from PDF file', async () => {
      const { extractPDF } = require('../pdf-extractor');

      extractPDF.mockResolvedValue({
        text: 'Safety procedures for lockout/tagout',
        pageCount: 5,
        metadata: {},
        stats: {
          characterCount: 100,
          wordCount: 10,
          avgCharsPerPage: 20,
        },
      });

      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const result = await ingestion.ingestSafetyDocumentFromPDF('/path/to/manual.pdf', {
        id: 'PROC-001',
        title: 'Lockout/Tagout Procedure',
        type: 'PROCEDURE',
        relatedAssets: ['P-001'],
      });

      expect(extractPDF).toHaveBeenCalledWith('/path/to/manual.pdf');
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should include PDF metadata in document', async () => {
      const { extractPDF } = require('../pdf-extractor');

      extractPDF.mockResolvedValue({
        text: 'Content',
        pageCount: 3,
        metadata: {},
        stats: { characterCount: 100, wordCount: 10, avgCharsPerPage: 33 },
      });

      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      await ingestion.ingestSafetyDocumentFromPDF('/path/to/manual.pdf', {
        id: 'PROC-001',
        title: 'Test Procedure',
        type: 'PROCEDURE',
        metadata: { version: '1.0' },
      });

      const upsertCall = mockVectorStore.upsertMany.mock.calls[0][0];
      expect(upsertCall[0].metadata).toMatchObject({
        id: 'PROC-001',
        title: 'Test Procedure',
        type: 'PROCEDURE',
        metadata: expect.objectContaining({
          version: '1.0',
          pageCount: '3',
          wordCount: '10',
        }),
      });
    });

    it('should handle PDF extraction errors', async () => {
      const { extractPDF } = require('../pdf-extractor');

      extractPDF.mockRejectedValue(new Error('Invalid PDF'));

      const result = await ingestion.ingestSafetyDocumentFromPDF('/path/to/invalid.pdf', {
        id: 'PROC-001',
        title: 'Test',
        type: 'PROCEDURE',
      });

      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toContain('Failed to extract PDF');
    });
  });

  describe('Batch processing', () => {
    it('should process assets in specified batch size', async () => {
      const assets = Array.from({ length: 35 }, (_, i) => ({
        ...sampleAsset,
        assetId: `P-${i.toString().padStart(3, '0')}`,
      }));

      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockVectorStore.upsertMany.mockResolvedValue(['id']);

      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        batchSize: 10,
      });

      await customIngestion.ingestAssetsFromJSON('/path/to/assets.json');

      // Should create 4 batches (10, 10, 10, 5)
      expect(mockVectorStore.upsertMany).toHaveBeenCalledTimes(4);
    });

    it('should respect max concurrency for embeddings', async () => {
      const assets = Array.from({ length: 20 }, (_, i) => ({
        ...sampleAsset,
        assetId: `P-${i.toString().padStart(3, '0')}`,
      }));

      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      mockEmbeddingGenerator.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrentCalls--;
        return new Array(1536).fill(0.1);
      });

      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockVectorStore.upsertMany.mockResolvedValue(['id']);

      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        maxConcurrency: 3,
        batchSize: 20,
      });

      await customIngestion.ingestAssetsFromJSON('/path/to/assets.json');

      // Max concurrent calls should not exceed 3
      expect(maxConcurrentCalls).toBeLessThanOrEqual(3);
    });
  });

  describe('Error handling and retry', () => {
    it('should retry embedding generation on failure', async () => {
      const assets = [sampleAsset];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));

      // Fail twice, succeed on third attempt
      mockEmbeddingGenerator
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce(new Array(1536).fill(0.1));

      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const result = await ingestion.ingestAssetsFromJSON('/path/to/assets.json');

      expect(result.succeeded).toBe(1);
      expect(mockEmbeddingGenerator).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const assets = [sampleAsset];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));

      mockEmbeddingGenerator.mockRejectedValue(new Error('Persistent error'));

      const result = await ingestion.ingestAssetsFromJSON('/path/to/assets.json');

      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toContain('after 3 attempts');
    });
  });

  describe('Progress reporting', () => {
    it('should report all phases', async () => {
      const onProgress = jest.fn();
      const assets = [sampleAsset];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        onProgress,
      });

      await customIngestion.ingestAssetsFromJSON('/path/to/assets.json');

      const phases = onProgress.mock.calls.map((call) => call[0].phase);
      expect(phases).toContain('loading');
      expect(phases).toContain('embedding');
      expect(phases).toContain('storing');
      expect(phases).toContain('complete');
    });

    it('should report accurate progress percentage', async () => {
      const onProgress = jest.fn();
      const assets = [sampleAsset];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const customIngestion = new AssetIngestion(mockVectorStore, mockEmbeddingGenerator, {
        onProgress,
      });

      await customIngestion.ingestAssetsFromJSON('/path/to/assets.json');

      const percentages = onProgress.mock.calls.map((call) => call[0].percentage);
      expect(percentages).toContain(100); // Should reach 100%
    });
  });

  describe('Duration tracking', () => {
    it('should track ingestion duration', async () => {
      const assets = [sampleAsset];
      mockFs.readFileSync.mockReturnValue(JSON.stringify(assets));
      mockVectorStore.upsertMany.mockResolvedValue(['id1']);

      const result = await ingestion.ingestAssetsFromJSON('/path/to/assets.json');

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });
  });
});
