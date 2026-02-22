/**
 * Tests for SupabaseVectorStore
 */

import {
  SupabaseVectorStore,
  type VectorDocumentInsert,
  type SourceType,
} from '../supabase-vector-store';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase client
const createMockSupabaseClient = () => {
  const mockClient = {
    from: jest.fn(),
    rpc: jest.fn(),
  } as unknown as SupabaseClient;

  return mockClient;
};

// Helper to create mock query builder
const createMockQueryBuilder = (overrides: any = {}) => {
  const builder = {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn(),
    eq: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    ...overrides,
  };

  return builder;
};

describe('SupabaseVectorStore', () => {
  let mockClient: SupabaseClient;
  let store: SupabaseVectorStore;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    store = new SupabaseVectorStore({
      supabaseUrl: 'https://test.supabase.co',
      supabaseKey: 'test-key',
      client: mockClient,
      debug: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided client', () => {
      expect(store).toBeInstanceOf(SupabaseVectorStore);
      expect(store.getClient()).toBe(mockClient);
    });

    it('should use default table name', () => {
      const storeWithDefaults = new SupabaseVectorStore({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        client: mockClient,
      });

      expect(storeWithDefaults).toBeInstanceOf(SupabaseVectorStore);
    });

    it('should use custom table name', () => {
      const customStore = new SupabaseVectorStore({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        client: mockClient,
        tableName: 'custom_documents',
      });

      expect(customStore).toBeInstanceOf(SupabaseVectorStore);
    });
  });

  describe('upsert', () => {
    it('should insert a document and return id', async () => {
      const doc: VectorDocumentInsert = {
        content: 'Test content',
        embedding: new Array(1536).fill(0.1),
        source_type: 'ASSET',
        metadata: { asset_id: 'A-001' },
      };

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValue({
        data: { id: 'test-uuid-123' },
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const id = await store.upsert(doc);

      expect(id).toBe('test-uuid-123');
      expect(mockClient.from).toHaveBeenCalledWith('documents');
      expect(mockBuilder.insert).toHaveBeenCalledWith({
        content: doc.content,
        embedding: JSON.stringify(doc.embedding),
        source_type: doc.source_type,
        metadata: doc.metadata,
      });
      expect(mockBuilder.select).toHaveBeenCalledWith('id');
      expect(mockBuilder.single).toHaveBeenCalled();
    });

    it('should handle metadata being undefined', async () => {
      const doc: VectorDocumentInsert = {
        content: 'Test content',
        embedding: new Array(1536).fill(0.1),
        source_type: 'SAFETY_MANUAL',
      };

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValue({
        data: { id: 'test-uuid-456' },
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await store.upsert(doc);

      expect(mockBuilder.insert).toHaveBeenCalledWith({
        content: doc.content,
        embedding: JSON.stringify(doc.embedding),
        source_type: doc.source_type,
        metadata: {},
      });
    });

    it('should throw error on insert failure', async () => {
      const doc: VectorDocumentInsert = {
        content: 'Test content',
        embedding: new Array(1536).fill(0.1),
        source_type: 'PROCEDURE',
      };

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await expect(store.upsert(doc)).rejects.toThrow('Failed to upsert document: Database error');
    });

    it('should throw error when no data returned', async () => {
      const doc: VectorDocumentInsert = {
        content: 'Test content',
        embedding: new Array(1536).fill(0.1),
        source_type: 'ASSET',
      };

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValue({
        data: null,
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await expect(store.upsert(doc)).rejects.toThrow('No data returned from upsert');
    });
  });

  describe('upsertMany', () => {
    it('should insert multiple documents and return ids', async () => {
      const docs: VectorDocumentInsert[] = [
        {
          content: 'Doc 1',
          embedding: new Array(1536).fill(0.1),
          source_type: 'ASSET',
          metadata: { asset_id: 'A-001' },
        },
        {
          content: 'Doc 2',
          embedding: new Array(1536).fill(0.2),
          source_type: 'ASSET',
          metadata: { asset_id: 'A-002' },
        },
      ];

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.select.mockResolvedValue({
        data: [{ id: 'id-1' }, { id: 'id-2' }],
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const ids = await store.upsertMany(docs);

      expect(ids).toEqual(['id-1', 'id-2']);
      expect(mockClient.from).toHaveBeenCalledWith('documents');
      expect(mockBuilder.insert).toHaveBeenCalled();
      expect(mockBuilder.select).toHaveBeenCalledWith('id');
    });

    it('should throw error on bulk insert failure', async () => {
      const docs: VectorDocumentInsert[] = [
        {
          content: 'Doc 1',
          embedding: new Array(1536).fill(0.1),
          source_type: 'ASSET',
        },
      ];

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.select.mockResolvedValue({
        data: null,
        error: { message: 'Bulk insert error' },
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await expect(store.upsertMany(docs)).rejects.toThrow(
        'Failed to upsert documents: Bulk insert error'
      );
    });
  });

  describe('search', () => {
    it('should search for similar documents', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);
      const mockRpcBuilder = createMockQueryBuilder();

      mockRpcBuilder.eq.mockResolvedValue({
        data: [
          {
            id: 'doc-1',
            content: 'Result 1',
            embedding: JSON.stringify(new Array(1536).fill(0.5)),
            source_type: 'ASSET',
            metadata: { asset_id: 'A-001' },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            similarity: 0.95,
          },
        ],
        error: null,
      });

      (mockClient.rpc as jest.Mock).mockReturnValue(mockRpcBuilder);

      const results = await store.search(queryEmbedding, {
        limit: 5,
        minSimilarity: 0.7,
        sourceType: 'ASSET',
      });

      expect(results).toHaveLength(1);
      expect(results[0].document.id).toBe('doc-1');
      expect(results[0].document.content).toBe('Result 1');
      expect(results[0].similarity).toBe(0.95);
      expect(mockClient.rpc).toHaveBeenCalledWith('match_documents', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.7,
        match_count: 5,
      });
      expect(mockRpcBuilder.eq).toHaveBeenCalledWith('source_type', 'ASSET');
    });

    it('should search without source type filter', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);
      const mockRpcBuilder = {
        eq: jest.fn().mockReturnThis(),
      };

      (mockClient.rpc as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
      });

      await store.search(queryEmbedding, {
        limit: 10,
      });

      expect(mockClient.rpc).toHaveBeenCalledWith('match_documents', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.0,
        match_count: 10,
      });
    });

    it('should filter by metadata', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);

      (mockClient.rpc as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 'doc-1',
            content: 'Result 1',
            embedding: JSON.stringify(new Array(1536).fill(0.5)),
            source_type: 'ASSET',
            metadata: { category: 'Pump', location: 'Plant A' },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            similarity: 0.95,
          },
          {
            id: 'doc-2',
            content: 'Result 2',
            embedding: JSON.stringify(new Array(1536).fill(0.5)),
            source_type: 'ASSET',
            metadata: { category: 'Valve', location: 'Plant A' },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            similarity: 0.9,
          },
        ],
        error: null,
      });

      const results = await store.search(queryEmbedding, {
        metadataFilter: { category: 'Pump' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].document.metadata.category).toBe('Pump');
    });

    it('should return empty array when no results', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);

      (mockClient.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: null,
      });

      const results = await store.search(queryEmbedding);

      expect(results).toEqual([]);
    });

    it('should throw error on search failure', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);

      (mockClient.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Search error' },
      });

      await expect(store.search(queryEmbedding)).rejects.toThrow(
        'Failed to search documents: Search error'
      );
    });
  });

  describe('get', () => {
    it('should retrieve document by id', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValue({
        data: {
          id: 'doc-1',
          content: 'Test content',
          embedding: JSON.stringify(new Array(1536).fill(0.5)),
          source_type: 'ASSET',
          metadata: { asset_id: 'A-001' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const doc = await store.get('doc-1');

      expect(doc).toBeDefined();
      expect(doc?.id).toBe('doc-1');
      expect(doc?.content).toBe('Test content');
      expect(doc?.embedding).toHaveLength(1536);
      expect(mockClient.from).toHaveBeenCalledWith('documents');
      expect(mockBuilder.select).toHaveBeenCalledWith('*');
      expect(mockBuilder.eq).toHaveBeenCalledWith('id', 'doc-1');
    });

    it('should return null when document not found', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const doc = await store.get('non-existent');

      expect(doc).toBeNull();
    });

    it('should throw error on database error', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValue({
        data: null,
        error: { code: 'OTHER', message: 'Database error' },
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await expect(store.get('doc-1')).rejects.toThrow('Failed to get document: Database error');
    });
  });

  describe('delete', () => {
    it('should delete document by id', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.eq.mockResolvedValue({
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const result = await store.delete('doc-1');

      expect(result).toBe(true);
      expect(mockClient.from).toHaveBeenCalledWith('documents');
      expect(mockBuilder.delete).toHaveBeenCalled();
      expect(mockBuilder.eq).toHaveBeenCalledWith('id', 'doc-1');
    });

    it('should throw error on delete failure', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.eq.mockResolvedValue({
        error: { message: 'Delete error' },
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await expect(store.delete('doc-1')).rejects.toThrow(
        'Failed to delete document: Delete error'
      );
    });
  });

  describe('deleteMany', () => {
    it('should delete multiple documents by ids', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.in.mockResolvedValue({
        error: null,
        count: 2,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const count = await store.deleteMany(['doc-1', 'doc-2']);

      expect(count).toBe(2);
      expect(mockClient.from).toHaveBeenCalledWith('documents');
      expect(mockBuilder.delete).toHaveBeenCalled();
      expect(mockBuilder.in).toHaveBeenCalledWith('id', ['doc-1', 'doc-2']);
    });

    it('should return ids length when count is null', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.in.mockResolvedValue({
        error: null,
        count: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const count = await store.deleteMany(['doc-1', 'doc-2']);

      expect(count).toBe(2);
    });

    it('should throw error on deleteMany failure', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.in.mockResolvedValue({
        error: { message: 'Bulk delete error' },
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await expect(store.deleteMany(['doc-1'])).rejects.toThrow(
        'Failed to delete documents: Bulk delete error'
      );
    });
  });

  describe('deleteBySourceType', () => {
    it('should delete all documents of a source type', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.eq.mockResolvedValue({
        error: null,
        count: 5,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const count = await store.deleteBySourceType('ASSET');

      expect(count).toBe(5);
      expect(mockClient.from).toHaveBeenCalledWith('documents');
      expect(mockBuilder.delete).toHaveBeenCalled();
      expect(mockBuilder.eq).toHaveBeenCalledWith('source_type', 'ASSET');
    });

    it('should return 0 when count is null', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.eq.mockResolvedValue({
        error: null,
        count: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const count = await store.deleteBySourceType('PROCEDURE');

      expect(count).toBe(0);
    });

    it('should throw error on deleteBySourceType failure', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.eq.mockResolvedValue({
        error: { message: 'Delete by type error' },
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await expect(store.deleteBySourceType('ASSET')).rejects.toThrow(
        'Failed to delete documents by source type: Delete by type error'
      );
    });
  });

  describe('count', () => {
    it('should count all documents', async () => {
      const mockBuilder = createMockQueryBuilder();
      // When no sourceType, the chain ends at select()
      mockBuilder.select.mockResolvedValue({
        count: 42,
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const count = await store.count();

      expect(count).toBe(42);
      expect(mockClient.from).toHaveBeenCalledWith('documents');
      expect(mockBuilder.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
    });

    it('should count documents by source type', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.eq.mockResolvedValue({
        count: 10,
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const count = await store.count('ASSET');

      expect(count).toBe(10);
      expect(mockBuilder.eq).toHaveBeenCalledWith('source_type', 'ASSET');
    });

    it('should return 0 when count is null', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.select.mockResolvedValue({
        count: null,
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const count = await store.count();

      expect(count).toBe(0);
    });

    it('should throw error on count failure', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.select.mockResolvedValue({
        count: null,
        error: { message: 'Count error' },
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await expect(store.count()).rejects.toThrow('Failed to count documents: Count error');
    });
  });

  describe('list', () => {
    it('should list all documents', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.order.mockResolvedValue({
        data: [
          {
            id: 'doc-1',
            content: 'Doc 1',
            embedding: JSON.stringify(new Array(1536).fill(0.5)),
            source_type: 'ASSET',
            metadata: {},
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const docs = await store.list();

      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe('doc-1');
      expect(mockClient.from).toHaveBeenCalledWith('documents');
      expect(mockBuilder.select).toHaveBeenCalledWith('*');
      expect(mockBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should list documents with filters and pagination', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.order.mockResolvedValue({
        data: [],
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await store.list({
        sourceType: 'ASSET',
        limit: 10,
        offset: 20,
      });

      expect(mockBuilder.eq).toHaveBeenCalledWith('source_type', 'ASSET');
      expect(mockBuilder.limit).toHaveBeenCalledWith(10);
      expect(mockBuilder.range).toHaveBeenCalledWith(20, 29);
    });

    it('should return empty array when no documents', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.order.mockResolvedValue({
        data: null,
        error: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const docs = await store.list();

      expect(docs).toEqual([]);
    });

    it('should throw error on list failure', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.order.mockResolvedValue({
        data: null,
        error: { message: 'List error' },
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await expect(store.list()).rejects.toThrow('Failed to list documents: List error');
    });
  });

  describe('clear', () => {
    it('should clear all documents', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.neq.mockResolvedValue({
        error: null,
        count: 100,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const count = await store.clear();

      expect(count).toBe(100);
      expect(mockClient.from).toHaveBeenCalledWith('documents');
      expect(mockBuilder.delete).toHaveBeenCalled();
      expect(mockBuilder.neq).toHaveBeenCalledWith('id', '');
    });

    it('should return 0 when count is null', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.neq.mockResolvedValue({
        error: null,
        count: null,
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      const count = await store.clear();

      expect(count).toBe(0);
    });

    it('should throw error on clear failure', async () => {
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.neq.mockResolvedValue({
        error: { message: 'Clear error' },
      });

      (mockClient.from as jest.Mock).mockReturnValue(mockBuilder);

      await expect(store.clear()).rejects.toThrow('Failed to clear documents: Clear error');
    });
  });

  describe('getClient', () => {
    it('should return the Supabase client', () => {
      const client = store.getClient();

      expect(client).toBe(mockClient);
    });
  });

  describe('metadata filtering', () => {
    it('should filter by single metadata field', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);

      (mockClient.rpc as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 'doc-1',
            content: 'Result 1',
            embedding: JSON.stringify(new Array(1536).fill(0.5)),
            source_type: 'ASSET',
            metadata: { category: 'Pump' },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            similarity: 0.95,
          },
          {
            id: 'doc-2',
            content: 'Result 2',
            embedding: JSON.stringify(new Array(1536).fill(0.5)),
            source_type: 'ASSET',
            metadata: { category: 'Valve' },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            similarity: 0.9,
          },
        ],
        error: null,
      });

      const results = await store.search(queryEmbedding, {
        metadataFilter: { category: 'Pump' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].document.id).toBe('doc-1');
    });

    it('should filter by multiple metadata fields', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);

      (mockClient.rpc as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 'doc-1',
            content: 'Result 1',
            embedding: JSON.stringify(new Array(1536).fill(0.5)),
            source_type: 'ASSET',
            metadata: { category: 'Pump', location: 'Plant A' },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            similarity: 0.95,
          },
          {
            id: 'doc-2',
            content: 'Result 2',
            embedding: JSON.stringify(new Array(1536).fill(0.5)),
            source_type: 'ASSET',
            metadata: { category: 'Pump', location: 'Plant B' },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            similarity: 0.9,
          },
        ],
        error: null,
      });

      const results = await store.search(queryEmbedding, {
        metadataFilter: { category: 'Pump', location: 'Plant A' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].document.id).toBe('doc-1');
    });

    it('should return empty array when no metadata matches', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);

      (mockClient.rpc as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 'doc-1',
            content: 'Result 1',
            embedding: JSON.stringify(new Array(1536).fill(0.5)),
            source_type: 'ASSET',
            metadata: { category: 'Pump' },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            similarity: 0.95,
          },
        ],
        error: null,
      });

      const results = await store.search(queryEmbedding, {
        metadataFilter: { category: 'NonExistent' },
      });

      expect(results).toHaveLength(0);
    });
  });
});
