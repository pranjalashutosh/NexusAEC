'use strict';
/**
 * RAG Retriever (Tier 3)
 *
 * Provides semantic search for Retrieval Augmented Generation (RAG) workflows.
 * Combines query embedding generation with vector similarity search.
 */
var __assign =
  (this && this.__assign) ||
  function () {
    __assign =
      Object.assign ||
      function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
    return __assign.apply(this, arguments);
  };
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
exports.RAGRetriever = void 0;
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
var RAGRetriever = /** @class */ (function () {
  function RAGRetriever(options) {
    var _a, _b, _c;
    this.vectorStore = options.vectorStore;
    this.embeddingGenerator = options.embeddingGenerator;
    this.defaultTopK = (_a = options.defaultTopK) !== null && _a !== void 0 ? _a : 5;
    this.defaultMinSimilarity =
      (_b = options.defaultMinSimilarity) !== null && _b !== void 0 ? _b : 0.7;
    this.debug = (_c = options.debug) !== null && _c !== void 0 ? _c : false;
  }
  /**
   * Retrieve relevant documents for a query
   *
   * @param query - Natural language query
   * @param options - Query options
   * @returns Array of relevant results with scores
   */
  RAGRetriever.prototype.retrieve = function (query_1) {
    return __awaiter(this, arguments, void 0, function (query, options) {
      var startTime,
        queryEmbedding,
        topK,
        minSimilarity,
        sourceType,
        searchResults,
        results,
        queryTime,
        error_1,
        err;
      var _a, _b;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_c) {
        switch (_c.label) {
          case 0:
            startTime = Date.now();
            _c.label = 1;
          case 1:
            _c.trys.push([1, 4, , 5]);
            // Generate embedding for query
            if (this.debug) {
              console.log('[RAGRetriever] Generating embedding for query: "'.concat(query, '"'));
            }
            return [4 /*yield*/, this.embeddingGenerator(query)];
          case 2:
            queryEmbedding = _c.sent();
            topK = (_a = options.topK) !== null && _a !== void 0 ? _a : this.defaultTopK;
            minSimilarity =
              (_b = options.minSimilarity) !== null && _b !== void 0
                ? _b
                : this.defaultMinSimilarity;
            sourceType = options.sourceType ? options.sourceType.toUpperCase() : undefined;
            // Search vector store
            if (this.debug) {
              console.log(
                '[RAGRetriever] Searching with topK='
                  .concat(topK, ', minSimilarity=')
                  .concat(minSimilarity, ', sourceType=')
                  .concat(sourceType !== null && sourceType !== void 0 ? sourceType : 'all')
              );
            }
            return [
              4 /*yield*/,
              this.vectorStore.search(queryEmbedding, {
                limit: topK,
                minSimilarity: minSimilarity,
                sourceType: sourceType,
                metadataFilter: options.metadataFilter,
              }),
            ];
          case 3:
            searchResults = _c.sent();
            results = searchResults.map(function (result) {
              return {
                data: result.document.metadata,
                score: result.similarity,
                content: result.document.content,
                sourceType: result.document.source_type.toLowerCase(),
                documentId: result.document.id,
              };
            });
            queryTime = Date.now() - startTime;
            if (this.debug) {
              console.log(
                '[RAGRetriever] Found '
                  .concat(results.length, ' results in ')
                  .concat(queryTime, 'ms')
              );
            }
            return [2 /*return*/, results];
          case 4:
            error_1 = _c.sent();
            err = error_1 instanceof Error ? error_1 : new Error(String(error_1));
            console.error('[RAGRetriever] Error retrieving documents:', err);
            throw new Error('RAG retrieval failed: '.concat(err.message));
          case 5:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * Retrieve relevant assets for a query
   *
   * Convenience method that filters to asset documents only.
   *
   * @param query - Natural language query
   * @param options - Query options (sourceType will be overridden to 'asset')
   * @returns Array of asset results
   */
  RAGRetriever.prototype.retrieveAssets = function (query_1) {
    return __awaiter(this, arguments, void 0, function (query, options) {
      var results;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [
              4 /*yield*/,
              this.retrieve(query, __assign(__assign({}, options), { sourceType: 'asset' })),
            ];
          case 1:
            results = _a.sent();
            return [2 /*return*/, results];
        }
      });
    });
  };
  /**
   * Retrieve relevant safety documents for a query
   *
   * Convenience method that filters to safety manual documents only.
   *
   * @param query - Natural language query
   * @param options - Query options (sourceType will be overridden to 'safety_manual')
   * @returns Array of safety document results
   */
  RAGRetriever.prototype.retrieveSafetyDocuments = function (query_1) {
    return __awaiter(this, arguments, void 0, function (query, options) {
      var results;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [
              4 /*yield*/,
              this.retrieve(
                query,
                __assign(__assign({}, options), { sourceType: 'safety_manual' })
              ),
            ];
          case 1:
            results = _a.sent();
            return [2 /*return*/, results];
        }
      });
    });
  };
  /**
   * Retrieve with statistics
   *
   * Returns both results and retrieval statistics for monitoring.
   *
   * @param query - Natural language query
   * @param options - Query options
   * @returns Results and statistics
   */
  RAGRetriever.prototype.retrieveWithStats = function (query_1) {
    return __awaiter(this, arguments, void 0, function (query, options) {
      var startTime, results, queryTimeMs, scores, stats;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            startTime = Date.now();
            return [4 /*yield*/, this.retrieve(query, options)];
          case 1:
            results = _a.sent();
            queryTimeMs = Date.now() - startTime;
            scores = results.map(function (r) {
              return r.score;
            });
            stats = {
              resultCount: results.length,
              queryTimeMs: queryTimeMs,
              averageScore:
                scores.length > 0
                  ? scores.reduce(function (a, b) {
                      return a + b;
                    }, 0) / scores.length
                  : 0,
              maxScore: scores.length > 0 ? Math.max.apply(Math, scores) : 0,
              minScore: scores.length > 0 ? Math.min.apply(Math, scores) : 0,
            };
            return [2 /*return*/, { results: results, stats: stats }];
        }
      });
    });
  };
  /**
   * Get retriever configuration
   */
  RAGRetriever.prototype.getConfig = function () {
    return {
      defaultTopK: this.defaultTopK,
      defaultMinSimilarity: this.defaultMinSimilarity,
      debug: this.debug,
    };
  };
  /**
   * Update retriever configuration
   */
  RAGRetriever.prototype.setConfig = function (config) {
    if (config.defaultTopK !== undefined) {
      this.defaultTopK = config.defaultTopK;
    }
    if (config.defaultMinSimilarity !== undefined) {
      this.defaultMinSimilarity = config.defaultMinSimilarity;
    }
    if (config.debug !== undefined) {
      this.debug = config.debug;
    }
  };
  return RAGRetriever;
})();
exports.RAGRetriever = RAGRetriever;
