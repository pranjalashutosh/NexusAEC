/**
 * Tests for RAGRetriever
 */

import {
  RAGRetriever,
  type RAGQueryOptions,
  type RAGResult,
  type EmbeddingGenerator,
} from '../rag-retriever';
import type { SupabaseVectorStore, VectorSearchResult } from '../supabase-vector-store';
import type { Asset, SafetyDocument } from '../asset-types';

// Mock embedding generator
const createMockEmbeddingGenerator = (): jest.MockedFunction<EmbeddingGenerator> => {
  return jest.fn().mockResolvedValue(new Array(1536).fill(0.5));
};

// Mock vector store
const createMockVectorStore = (): jest.Mocked<SupabaseVectorStore> => {
  return {
    search: jest.fn(),
    upsert: jest.fn(),
    upsertMany: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    deleteBySourceType: jest.fn(),
    count: jest.fn(),
    list: jest.fn(),
    clear: jest.fn(),
    getClient: jest.fn(),
  } as any;
};

// Sample test data
const mockAsset: Asset = {
  assetId: 'P-104',
  name: 'Pump Station 104',
  description: 'Main water distribution pump',
  category: 'PUMP',
  location: 'Riverside Bridge',
  criticality: 'CRITICAL',
  status: 'OPERATIONAL',
};

const mockSafetyDocument: SafetyDocument = {
  id: 'PROC-001',
  title: 'Lockout/Tagout Procedure',
  content: 'LOTO procedure for equipment maintenance',
  type: 'PROCEDURE',
  relatedAssets: ['P-104', 'P-105'],
};

const mockAssetSearchResult: VectorSearchResult = {
  document: {
    id: 'doc-uuid-1',
    content: 'Pump Station 104 - Main water distribution pump',
    embedding: new Array(1536).fill(0.5),
    source_type: 'ASSET',
    metadata: mockAsset,
    created_at: new Date(),
    updated_at: new Date(),
  },
  similarity: 0.85,
};

const mockSafetyDocSearchResult: VectorSearchResult = {
  document: {
    id: 'doc-uuid-2',
    content: 'LOTO procedure for equipment maintenance',
    embedding: new Array(1536).fill(0.5),
    source_type: 'SAFETY_MANUAL',
    metadata: mockSafetyDocument,
    created_at: new Date(),
    updated_at: new Date(),
  },
  similarity: 0.92,
};

describe('RAGRetriever', () => {
  let mockVectorStore: jest.Mocked<SupabaseVectorStore>;
  let mockEmbeddingGenerator: jest.MockedFunction<EmbeddingGenerator>;
  let retriever: RAGRetriever;

  beforeEach(() => {
    mockVectorStore = createMockVectorStore();
    mockEmbeddingGenerator = createMockEmbeddingGenerator();

    retriever = new RAGRetriever({
      vectorStore: mockVectorStore,
      embeddingGenerator: mockEmbeddingGenerator,
      defaultTopK: 5,
      defaultMinSimilarity: 0.7,
      debug: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided options', () => {
      expect(retriever).toBeInstanceOf(RAGRetriever);
      const config = retriever.getConfig();
      expect(config.defaultTopK).toBe(5);
      expect(config.defaultMinSimilarity).toBe(0.7);
      expect(config.debug).toBe(false);
    });

    it('should use default values when not provided', () => {
      const defaultRetriever = new RAGRetriever({
        vectorStore: mockVectorStore,
        embeddingGenerator: mockEmbeddingGenerator,
      });

      const config = defaultRetriever.getConfig();
      expect(config.defaultTopK).toBe(5);
      expect(config.defaultMinSimilarity).toBe(0.7);
      expect(config.debug).toBe(false);
    });
  });

  describe('retrieve', () => {
    it('should retrieve documents for a query', async () => {
      mockVectorStore.search.mockResolvedValue([mockAssetSearchResult]);

      const results = await retriever.retrieve('pump station maintenance');

      expect(mockEmbeddingGenerator).toHaveBeenCalledWith('pump station maintenance');
      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          limit: 5,
          minSimilarity: 0.7,
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0].data).toEqual(mockAsset);
      expect(results[0].score).toBe(0.85);
      expect(results[0].sourceType).toBe('asset');
    });

    it('should use custom topK and minSimilarity', async () => {
      mockVectorStore.search.mockResolvedValue([mockAssetSearchResult]);

      const options: RAGQueryOptions = {
        topK: 10,
        minSimilarity: 0.8,
      };

      await retriever.retrieve('pump maintenance', options);

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          limit: 10,
          minSimilarity: 0.8,
        })
      );
    });

    it('should filter by source type', async () => {
      mockVectorStore.search.mockResolvedValue([mockAssetSearchResult]);

      await retriever.retrieve('pump', { sourceType: 'asset' });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          sourceType: 'ASSET',
        })
      );
    });

    it('should apply metadata filter', async () => {
      mockVectorStore.search.mockResolvedValue([mockAssetSearchResult]);

      const metadataFilter = {
        category: 'PUMP',
        location: 'Riverside Bridge',
      };

      await retriever.retrieve('pump', { metadataFilter });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          metadataFilter,
        })
      );
    });

    it('should return empty array when no results found', async () => {
      mockVectorStore.search.mockResolvedValue([]);

      const results = await retriever.retrieve('nonexistent query');

      expect(results).toHaveLength(0);
    });

    it('should handle multiple results', async () => {
      const mockResults = [mockAssetSearchResult, mockSafetyDocSearchResult];
      mockVectorStore.search.mockResolvedValue(mockResults);

      const results = await retriever.retrieve('safety');

      expect(results).toHaveLength(2);
      expect(results[0].sourceType).toBe('asset');
      expect(results[1].sourceType).toBe('safety_manual');
    });

    it('should throw error when embedding generation fails', async () => {
      mockEmbeddingGenerator.mockRejectedValue(new Error('Embedding API error'));

      await expect(retriever.retrieve('test query')).rejects.toThrow(
        'RAG retrieval failed: Embedding API error'
      );
    });

    it('should throw error when vector search fails', async () => {
      mockVectorStore.search.mockRejectedValue(new Error('Database error'));

      await expect(retriever.retrieve('test query')).rejects.toThrow(
        'RAG retrieval failed: Database error'
      );
    });
  });

  describe('retrieveAssets', () => {
    it('should retrieve only asset documents', async () => {
      mockVectorStore.search.mockResolvedValue([mockAssetSearchResult]);

      const results = await retriever.retrieveAssets('pump station');

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          sourceType: 'ASSET',
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0].data).toEqual(mockAsset);
      expect(results[0].sourceType).toBe('asset');
    });

    it('should accept custom options', async () => {
      mockVectorStore.search.mockResolvedValue([mockAssetSearchResult]);

      await retriever.retrieveAssets('pump', {
        topK: 3,
        minSimilarity: 0.9,
      });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          limit: 3,
          minSimilarity: 0.9,
          sourceType: 'ASSET',
        })
      );
    });
  });

  describe('retrieveSafetyDocuments', () => {
    it('should retrieve only safety manual documents', async () => {
      mockVectorStore.search.mockResolvedValue([mockSafetyDocSearchResult]);

      const results = await retriever.retrieveSafetyDocuments('lockout tagout');

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          sourceType: 'SAFETY_MANUAL',
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0].data).toEqual(mockSafetyDocument);
      expect(results[0].sourceType).toBe('safety_manual');
    });

    it('should accept custom options', async () => {
      mockVectorStore.search.mockResolvedValue([mockSafetyDocSearchResult]);

      await retriever.retrieveSafetyDocuments('safety procedure', {
        topK: 2,
        minSimilarity: 0.85,
      });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          limit: 2,
          minSimilarity: 0.85,
          sourceType: 'SAFETY_MANUAL',
        })
      );
    });
  });

  describe('retrieveWithStats', () => {
    it('should return results with statistics', async () => {
      const mockResults = [
        mockAssetSearchResult,
        {
          ...mockSafetyDocSearchResult,
          similarity: 0.75,
        },
      ];
      mockVectorStore.search.mockResolvedValue(mockResults);

      const { results, stats } = await retriever.retrieveWithStats('test query');

      expect(results).toHaveLength(2);
      expect(stats.resultCount).toBe(2);
      expect(stats.queryTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.averageScore).toBeCloseTo(0.8, 1); // (0.85 + 0.75) / 2
      expect(stats.maxScore).toBe(0.85);
      expect(stats.minScore).toBe(0.75);
    });

    it('should handle empty results in stats', async () => {
      mockVectorStore.search.mockResolvedValue([]);

      const { results, stats } = await retriever.retrieveWithStats('test');

      expect(results).toHaveLength(0);
      expect(stats.resultCount).toBe(0);
      expect(stats.averageScore).toBe(0);
      expect(stats.maxScore).toBe(0);
      expect(stats.minScore).toBe(0);
    });

    it('should handle single result in stats', async () => {
      mockVectorStore.search.mockResolvedValue([mockAssetSearchResult]);

      const { results, stats } = await retriever.retrieveWithStats('pump');

      expect(results).toHaveLength(1);
      expect(stats.resultCount).toBe(1);
      expect(stats.averageScore).toBe(0.85);
      expect(stats.maxScore).toBe(0.85);
      expect(stats.minScore).toBe(0.85);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = retriever.getConfig();

      expect(config).toEqual({
        defaultTopK: 5,
        defaultMinSimilarity: 0.7,
        debug: false,
      });
    });
  });

  describe('setConfig', () => {
    it('should update defaultTopK', () => {
      retriever.setConfig({ defaultTopK: 10 });

      const config = retriever.getConfig();
      expect(config.defaultTopK).toBe(10);
      expect(config.defaultMinSimilarity).toBe(0.7);
      expect(config.debug).toBe(false);
    });

    it('should update defaultMinSimilarity', () => {
      retriever.setConfig({ defaultMinSimilarity: 0.8 });

      const config = retriever.getConfig();
      expect(config.defaultTopK).toBe(5);
      expect(config.defaultMinSimilarity).toBe(0.8);
      expect(config.debug).toBe(false);
    });

    it('should update debug flag', () => {
      retriever.setConfig({ debug: true });

      const config = retriever.getConfig();
      expect(config.debug).toBe(true);
    });

    it('should update multiple config values', () => {
      retriever.setConfig({
        defaultTopK: 15,
        defaultMinSimilarity: 0.9,
        debug: true,
      });

      const config = retriever.getConfig();
      expect(config.defaultTopK).toBe(15);
      expect(config.defaultMinSimilarity).toBe(0.9);
      expect(config.debug).toBe(true);
    });

    it('should not update values when undefined', () => {
      retriever.setConfig({});

      const config = retriever.getConfig();
      expect(config.defaultTopK).toBe(5);
      expect(config.defaultMinSimilarity).toBe(0.7);
      expect(config.debug).toBe(false);
    });
  });

  describe('debug logging', () => {
    it('should log when debug is enabled', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const debugRetriever = new RAGRetriever({
        vectorStore: mockVectorStore,
        embeddingGenerator: mockEmbeddingGenerator,
        debug: true,
      });

      mockVectorStore.search.mockResolvedValue([mockAssetSearchResult]);

      await debugRetriever.retrieve('test query');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RAGRetriever] Generating embedding')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RAGRetriever] Searching')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RAGRetriever] Found')
      );

      consoleLogSpy.mockRestore();
    });

    it('should not log when debug is disabled', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockVectorStore.search.mockResolvedValue([mockAssetSearchResult]);

      await retriever.retrieve('test query');

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[RAGRetriever]')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('result format', () => {
    it('should format asset results correctly', async () => {
      mockVectorStore.search.mockResolvedValue([mockAssetSearchResult]);

      const results = await retriever.retrieve('pump');

      expect(results[0]).toMatchObject({
        data: mockAsset,
        score: 0.85,
        content: 'Pump Station 104 - Main water distribution pump',
        sourceType: 'asset',
        documentId: 'doc-uuid-1',
      });
    });

    it('should format safety document results correctly', async () => {
      mockVectorStore.search.mockResolvedValue([mockSafetyDocSearchResult]);

      const results = await retriever.retrieve('safety');

      expect(results[0]).toMatchObject({
        data: mockSafetyDocument,
        score: 0.92,
        content: 'LOTO procedure for equipment maintenance',
        sourceType: 'safety_manual',
        documentId: 'doc-uuid-2',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty query string', async () => {
      mockVectorStore.search.mockResolvedValue([]);

      const results = await retriever.retrieve('');

      expect(mockEmbeddingGenerator).toHaveBeenCalledWith('');
      expect(results).toHaveLength(0);
    });

    it('should handle very long query strings', async () => {
      const longQuery = 'a'.repeat(10000);
      mockVectorStore.search.mockResolvedValue([]);

      await retriever.retrieve(longQuery);

      expect(mockEmbeddingGenerator).toHaveBeenCalledWith(longQuery);
    });

    it('should handle topK of 0', async () => {
      mockVectorStore.search.mockResolvedValue([]);

      await retriever.retrieve('test', { topK: 0 });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          limit: 0,
        })
      );
    });

    it('should handle minSimilarity of 0', async () => {
      mockVectorStore.search.mockResolvedValue([mockAssetSearchResult]);

      await retriever.retrieve('test', { minSimilarity: 0 });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          minSimilarity: 0,
        })
      );
    });

    it('should handle minSimilarity of 1', async () => {
      mockVectorStore.search.mockResolvedValue([]);

      await retriever.retrieve('test', { minSimilarity: 1.0 });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          minSimilarity: 1.0,
        })
      );
    });
  });
});
