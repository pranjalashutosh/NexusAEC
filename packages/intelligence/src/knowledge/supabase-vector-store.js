'use strict';
/**
 * Supabase Vector Store for Knowledge Base (Tier 3)
 *
 * Stores and retrieves document embeddings using pgvector.
 * Supports RAG (Retrieval Augmented Generation) workflows.
 */
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1];
          return t[1];
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g = Object.create((typeof Iterator === 'function' ? Iterator : Object).prototype);
    return (
      (g.next = verb(0)),
      (g['throw'] = verb(1)),
      (g['return'] = verb(2)),
      typeof Symbol === 'function' &&
        (g[Symbol.iterator] = function () {
          return this;
        }),
      g
    );
    function verb(n) {
      return function (v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f) throw new TypeError('Generator is already executing.');
      while ((g && ((g = 0), op[0] && (_ = 0)), _))
        try {
          if (
            ((f = 1),
            y &&
              (t =
                op[0] & 2
                  ? y['return']
                  : op[0]
                    ? y['throw'] || ((t = y['return']) && t.call(y), 0)
                    : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t;
          if (((y = 0), t)) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0:
            case 1:
              t = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (
                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                (op[0] === 6 || op[0] === 2)
              ) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1];
                t = op;
                break;
              }
              if (t && _.label < t[2]) {
                _.label = t[2];
                _.ops.push(op);
                break;
              }
              if (t[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t = 0;
        }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.SupabaseVectorStore = void 0;
var supabase_js_1 = require('@supabase/supabase-js');
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
var SupabaseVectorStore = /** @class */ (function () {
  function SupabaseVectorStore(options) {
    var _a, _b;
    this.tableName = (_a = options.tableName) !== null && _a !== void 0 ? _a : 'documents';
    this.debug = (_b = options.debug) !== null && _b !== void 0 ? _b : false;
    if (options.client) {
      this.client = options.client;
      this.ownClient = false;
    } else {
      this.client = (0, supabase_js_1.createClient)(options.supabaseUrl, options.supabaseKey);
      this.ownClient = true;
    }
  }
  /**
   * Insert or update a document
   * @returns Document ID
   */
  SupabaseVectorStore.prototype.upsert = function (document) {
    return __awaiter(this, void 0, void 0, function () {
      var _a, data, error, error_1, err;
      var _b;
      return __generator(this, function (_c) {
        switch (_c.label) {
          case 0:
            _c.trys.push([0, 2, , 3]);
            return [
              4 /*yield*/,
              this.client
                .from(this.tableName)
                .insert({
                  content: document.content,
                  embedding: JSON.stringify(document.embedding), // pgvector expects string
                  source_type: document.source_type,
                  metadata: (_b = document.metadata) !== null && _b !== void 0 ? _b : {},
                })
                .select('id')
                .single(),
            ];
          case 1:
            ((_a = _c.sent()), (data = _a.data), (error = _a.error));
            if (error) {
              throw new Error('Failed to upsert document: '.concat(error.message));
            }
            if (!data) {
              throw new Error('No data returned from upsert');
            }
            if (this.debug) {
              console.log('[SupabaseVectorStore] Inserted document '.concat(data.id));
            }
            return [2 /*return*/, data.id];
          case 2:
            error_1 = _c.sent();
            err = error_1 instanceof Error ? error_1 : new Error(String(error_1));
            console.error('[SupabaseVectorStore] Error upserting document:', err);
            throw err;
          case 3:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * Insert or update multiple documents
   * @returns Array of document IDs
   */
  SupabaseVectorStore.prototype.upsertMany = function (documents) {
    return __awaiter(this, void 0, void 0, function () {
      var records, _a, data, error, error_2, err;
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            _b.trys.push([0, 2, , 3]);
            records = documents.map(function (doc) {
              var _a;
              return {
                content: doc.content,
                embedding: JSON.stringify(doc.embedding),
                source_type: doc.source_type,
                metadata: (_a = doc.metadata) !== null && _a !== void 0 ? _a : {},
              };
            });
            return [4 /*yield*/, this.client.from(this.tableName).insert(records).select('id')];
          case 1:
            ((_a = _b.sent()), (data = _a.data), (error = _a.error));
            if (error) {
              throw new Error('Failed to upsert documents: '.concat(error.message));
            }
            if (!data) {
              throw new Error('No data returned from bulk upsert');
            }
            if (this.debug) {
              console.log('[SupabaseVectorStore] Inserted '.concat(data.length, ' documents'));
            }
            return [
              2 /*return*/,
              data.map(function (row) {
                return row.id;
              }),
            ];
          case 2:
            error_2 = _b.sent();
            err = error_2 instanceof Error ? error_2 : new Error(String(error_2));
            console.error('[SupabaseVectorStore] Error upserting documents:', err);
            throw err;
          case 3:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * Search for similar documents using vector similarity
   */
  SupabaseVectorStore.prototype.search = function (queryEmbedding_1) {
    return __awaiter(this, arguments, void 0, function (queryEmbedding, options) {
      var limit, minSimilarity, query, _a, data, error, results, error_3, err;
      var _this = this;
      var _b, _c;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_d) {
        switch (_d.label) {
          case 0:
            limit = (_b = options.limit) !== null && _b !== void 0 ? _b : 10;
            minSimilarity = (_c = options.minSimilarity) !== null && _c !== void 0 ? _c : 0.0;
            _d.label = 1;
          case 1:
            _d.trys.push([1, 3, , 4]);
            query = this.client.rpc('match_documents', {
              query_embedding: JSON.stringify(queryEmbedding),
              match_threshold: minSimilarity,
              match_count: limit,
            });
            // Apply source type filter if specified
            if (options.sourceType) {
              query = query.eq('source_type', options.sourceType);
            }
            return [4 /*yield*/, query];
          case 2:
            ((_a = _d.sent()), (data = _a.data), (error = _a.error));
            if (error) {
              throw new Error('Failed to search documents: '.concat(error.message));
            }
            if (!data) {
              return [2 /*return*/, []];
            }
            results = data.map(function (row) {
              return {
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
              };
            });
            // Apply metadata filter if specified
            if (options.metadataFilter) {
              results = results.filter(function (result) {
                return _this.matchesMetadataFilter(
                  result.document.metadata,
                  options.metadataFilter
                );
              });
            }
            if (this.debug) {
              console.log(
                '[SupabaseVectorStore] Found '.concat(results.length, ' similar documents')
              );
            }
            return [2 /*return*/, results];
          case 3:
            error_3 = _d.sent();
            err = error_3 instanceof Error ? error_3 : new Error(String(error_3));
            console.error('[SupabaseVectorStore] Error searching documents:', err);
            throw err;
          case 4:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * Get document by ID
   */
  SupabaseVectorStore.prototype.get = function (id) {
    return __awaiter(this, void 0, void 0, function () {
      var _a, data, error, error_4, err;
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            _b.trys.push([0, 2, , 3]);
            return [
              4 /*yield*/,
              this.client.from(this.tableName).select('*').eq('id', id).single(),
            ];
          case 1:
            ((_a = _b.sent()), (data = _a.data), (error = _a.error));
            if (error) {
              if (error.code === 'PGRST116') {
                // Not found
                return [2 /*return*/, null];
              }
              throw new Error('Failed to get document: '.concat(error.message));
            }
            if (!data) {
              return [2 /*return*/, null];
            }
            return [
              2 /*return*/,
              {
                id: data.id,
                content: data.content,
                embedding: JSON.parse(data.embedding),
                source_type: data.source_type,
                metadata: data.metadata,
                created_at: new Date(data.created_at),
                updated_at: new Date(data.updated_at),
              },
            ];
          case 2:
            error_4 = _b.sent();
            err = error_4 instanceof Error ? error_4 : new Error(String(error_4));
            console.error('[SupabaseVectorStore] Error getting document:', err);
            throw err;
          case 3:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * Delete document by ID
   */
  SupabaseVectorStore.prototype.delete = function (id) {
    return __awaiter(this, void 0, void 0, function () {
      var error, error_5, err;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            _a.trys.push([0, 2, , 3]);
            return [4 /*yield*/, this.client.from(this.tableName).delete().eq('id', id)];
          case 1:
            error = _a.sent().error;
            if (error) {
              throw new Error('Failed to delete document: '.concat(error.message));
            }
            if (this.debug) {
              console.log('[SupabaseVectorStore] Deleted document '.concat(id));
            }
            return [2 /*return*/, true];
          case 2:
            error_5 = _a.sent();
            err = error_5 instanceof Error ? error_5 : new Error(String(error_5));
            console.error('[SupabaseVectorStore] Error deleting document:', err);
            throw err;
          case 3:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * Delete multiple documents by IDs
   */
  SupabaseVectorStore.prototype.deleteMany = function (ids) {
    return __awaiter(this, void 0, void 0, function () {
      var _a, error, count, error_6, err;
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            _b.trys.push([0, 2, , 3]);
            return [4 /*yield*/, this.client.from(this.tableName).delete().in('id', ids)];
          case 1:
            ((_a = _b.sent()), (error = _a.error), (count = _a.count));
            if (error) {
              throw new Error('Failed to delete documents: '.concat(error.message));
            }
            if (this.debug) {
              console.log(
                '[SupabaseVectorStore] Deleted '.concat(
                  count !== null && count !== void 0 ? count : ids.length,
                  ' documents'
                )
              );
            }
            return [2 /*return*/, count !== null && count !== void 0 ? count : ids.length];
          case 2:
            error_6 = _b.sent();
            err = error_6 instanceof Error ? error_6 : new Error(String(error_6));
            console.error('[SupabaseVectorStore] Error deleting documents:', err);
            throw err;
          case 3:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * Delete all documents of a specific source type
   */
  SupabaseVectorStore.prototype.deleteBySourceType = function (sourceType) {
    return __awaiter(this, void 0, void 0, function () {
      var _a, error, count, error_7, err;
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            _b.trys.push([0, 2, , 3]);
            return [
              4 /*yield*/,
              this.client.from(this.tableName).delete().eq('source_type', sourceType),
            ];
          case 1:
            ((_a = _b.sent()), (error = _a.error), (count = _a.count));
            if (error) {
              throw new Error('Failed to delete documents by source type: '.concat(error.message));
            }
            if (this.debug) {
              console.log(
                '[SupabaseVectorStore] Deleted '
                  .concat(count !== null && count !== void 0 ? count : 0, ' documents of type ')
                  .concat(sourceType)
              );
            }
            return [2 /*return*/, count !== null && count !== void 0 ? count : 0];
          case 2:
            error_7 = _b.sent();
            err = error_7 instanceof Error ? error_7 : new Error(String(error_7));
            console.error('[SupabaseVectorStore] Error deleting by source type:', err);
            throw err;
          case 3:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * Get count of documents by source type
   */
  SupabaseVectorStore.prototype.count = function (sourceType) {
    return __awaiter(this, void 0, void 0, function () {
      var query, _a, count, error, error_8, err;
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            _b.trys.push([0, 2, , 3]);
            query = this.client.from(this.tableName).select('*', { count: 'exact', head: true });
            if (sourceType) {
              query = query.eq('source_type', sourceType);
            }
            return [4 /*yield*/, query];
          case 1:
            ((_a = _b.sent()), (count = _a.count), (error = _a.error));
            if (error) {
              throw new Error('Failed to count documents: '.concat(error.message));
            }
            return [2 /*return*/, count !== null && count !== void 0 ? count : 0];
          case 2:
            error_8 = _b.sent();
            err = error_8 instanceof Error ? error_8 : new Error(String(error_8));
            console.error('[SupabaseVectorStore] Error counting documents:', err);
            throw err;
          case 3:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * List all documents with optional filtering
   */
  SupabaseVectorStore.prototype.list = function () {
    return __awaiter(this, arguments, void 0, function (options) {
      var query, _a, data, error, error_9, err;
      var _b;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_c) {
        switch (_c.label) {
          case 0:
            _c.trys.push([0, 2, , 3]);
            query = this.client.from(this.tableName).select('*');
            if (options.sourceType) {
              query = query.eq('source_type', options.sourceType);
            }
            if (options.limit) {
              query = query.limit(options.limit);
            }
            if (options.offset) {
              query = query.range(
                options.offset,
                options.offset + ((_b = options.limit) !== null && _b !== void 0 ? _b : 10) - 1
              );
            }
            return [4 /*yield*/, query.order('created_at', { ascending: false })];
          case 1:
            ((_a = _c.sent()), (data = _a.data), (error = _a.error));
            if (error) {
              throw new Error('Failed to list documents: '.concat(error.message));
            }
            if (!data) {
              return [2 /*return*/, []];
            }
            return [
              2 /*return*/,
              data.map(function (row) {
                return {
                  id: row.id,
                  content: row.content,
                  embedding: JSON.parse(row.embedding),
                  source_type: row.source_type,
                  metadata: row.metadata,
                  created_at: new Date(row.created_at),
                  updated_at: new Date(row.updated_at),
                };
              }),
            ];
          case 2:
            error_9 = _c.sent();
            err = error_9 instanceof Error ? error_9 : new Error(String(error_9));
            console.error('[SupabaseVectorStore] Error listing documents:', err);
            throw err;
          case 3:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * Clear all documents (use with caution!)
   */
  SupabaseVectorStore.prototype.clear = function () {
    return __awaiter(this, void 0, void 0, function () {
      var _a, error, count, error_10, err;
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            _b.trys.push([0, 2, , 3]);
            return [4 /*yield*/, this.client.from(this.tableName).delete().neq('id', '')];
          case 1:
            ((_a = _b.sent()), (error = _a.error), (count = _a.count));
            if (error) {
              throw new Error('Failed to clear documents: '.concat(error.message));
            }
            if (this.debug) {
              console.log(
                '[SupabaseVectorStore] Cleared '.concat(
                  count !== null && count !== void 0 ? count : 0,
                  ' documents'
                )
              );
            }
            return [2 /*return*/, count !== null && count !== void 0 ? count : 0];
          case 2:
            error_10 = _b.sent();
            err = error_10 instanceof Error ? error_10 : new Error(String(error_10));
            console.error('[SupabaseVectorStore] Error clearing documents:', err);
            throw err;
          case 3:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * Get Supabase client for advanced operations
   */
  SupabaseVectorStore.prototype.getClient = function () {
    return this.client;
  };
  /**
   * Check if metadata matches filter
   */
  SupabaseVectorStore.prototype.matchesMetadataFilter = function (metadata, filter) {
    for (var _i = 0, _a = Object.entries(filter); _i < _a.length; _i++) {
      var _b = _a[_i],
        key = _b[0],
        value = _b[1];
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  };
  return SupabaseVectorStore;
})();
exports.SupabaseVectorStore = SupabaseVectorStore;
