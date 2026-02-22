'use strict';
/**
 * LLM Client (Tier 3)
 *
 * GPT-4o API integration with retry logic, rate limiting, and streaming support.
 * Used for email summarization, narrative generation, and explanation generation.
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
var __asyncValues =
  (this && this.__asyncValues) ||
  function (o) {
    if (!Symbol.asyncIterator) throw new TypeError('Symbol.asyncIterator is not defined.');
    var m = o[Symbol.asyncIterator],
      i;
    return m
      ? m.call(o)
      : ((o = typeof __values === 'function' ? __values(o) : o[Symbol.iterator]()),
        (i = {}),
        verb('next'),
        verb('throw'),
        verb('return'),
        (i[Symbol.asyncIterator] = function () {
          return this;
        }),
        i);
    function verb(n) {
      i[n] =
        o[n] &&
        function (v) {
          return new Promise(function (resolve, reject) {
            ((v = o[n](v)), settle(resolve, reject, v.done, v.value));
          });
        };
    }
    function settle(resolve, reject, d, v) {
      Promise.resolve(v).then(function (v) {
        resolve({ value: v, done: d });
      }, reject);
    }
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.LLMClient = void 0;
var openai_1 = __importDefault(require('openai'));
/**
 * Rate limiter using token bucket algorithm
 */
var RateLimiter = /** @class */ (function () {
  function RateLimiter(options) {
    var _a, _b;
    this.requestsPerMinute = (_a = options.requestsPerMinute) !== null && _a !== void 0 ? _a : 60;
    this.tokensPerMinute = (_b = options.tokensPerMinute) !== null && _b !== void 0 ? _b : 90000;
    this.requestTokens = this.requestsPerMinute;
    this.completionTokens = this.tokensPerMinute;
    this.lastRefill = Date.now();
  }
  /**
   * Refill token buckets based on elapsed time
   */
  RateLimiter.prototype.refill = function () {
    var now = Date.now();
    var elapsedMs = now - this.lastRefill;
    var elapsedMinutes = elapsedMs / 60000;
    if (elapsedMinutes > 0) {
      // Refill requests
      this.requestTokens = Math.min(
        this.requestsPerMinute,
        this.requestTokens + this.requestsPerMinute * elapsedMinutes
      );
      // Refill tokens
      this.completionTokens = Math.min(
        this.tokensPerMinute,
        this.completionTokens + this.tokensPerMinute * elapsedMinutes
      );
      this.lastRefill = now;
    }
  };
  /**
   * Wait until rate limit allows the request
   */
  RateLimiter.prototype.waitForCapacity = function () {
    return __awaiter(this, arguments, void 0, function (estimatedTokens) {
      var _loop_1, this_1, state_1;
      if (estimatedTokens === void 0) {
        estimatedTokens = 1000;
      }
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            _loop_1 = function () {
              var requestWaitMs, tokenWaitMs, waitMs;
              return __generator(this, function (_b) {
                switch (_b.label) {
                  case 0:
                    this_1.refill();
                    // Check if we have capacity
                    if (this_1.requestTokens >= 1 && this_1.completionTokens >= estimatedTokens) {
                      // Consume tokens
                      this_1.requestTokens -= 1;
                      this_1.completionTokens -= estimatedTokens;
                      return [2 /*return*/, { value: void 0 }];
                    }
                    requestWaitMs =
                      this_1.requestTokens < 1
                        ? (1 - this_1.requestTokens) * (60000 / this_1.requestsPerMinute)
                        : 0;
                    tokenWaitMs =
                      this_1.completionTokens < estimatedTokens
                        ? (estimatedTokens - this_1.completionTokens) *
                          (60000 / this_1.tokensPerMinute)
                        : 0;
                    waitMs = Math.max(requestWaitMs, tokenWaitMs, 100);
                    return [
                      4 /*yield*/,
                      new Promise(function (resolve) {
                        return setTimeout(resolve, waitMs);
                      }),
                    ];
                  case 1:
                    _b.sent();
                    return [2 /*return*/];
                }
              });
            };
            this_1 = this;
            _a.label = 1;
          case 1:
            if (!true) return [3 /*break*/, 3];
            return [5 /*yield**/, _loop_1()];
          case 2:
            state_1 = _a.sent();
            if (typeof state_1 === 'object') return [2 /*return*/, state_1.value];
            return [3 /*break*/, 1];
          case 3:
            return [2 /*return*/];
        }
      });
    });
  };
  /**
   * Return tokens after completion (for accurate tracking)
   */
  RateLimiter.prototype.returnTokens = function (actualTokens, estimatedTokens) {
    var difference = estimatedTokens - actualTokens;
    if (difference > 0) {
      this.completionTokens = Math.min(this.tokensPerMinute, this.completionTokens + difference);
    }
  };
  return RateLimiter;
})();
/**
 * LLM Client
 *
 * Provides GPT-4o API integration with retry logic, rate limiting, and streaming support.
 *
 * @example
 * ```typescript
 * import { LLMClient } from '@nexus-aec/intelligence';
 *
 * // Initialize client
 * const client = new LLMClient({
 *   apiKey: process.env.OPENAI_API_KEY!,
 *   defaultModel: 'gpt-4o',
 *   rateLimiter: {
 *     requestsPerMinute: 60,
 *     tokensPerMinute: 90000,
 *   },
 *   retry: {
 *     maxRetries: 3,
 *   },
 * });
 *
 * // Generate completion
 * const result = await client.complete([
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Summarize this email thread.' },
 * ]);
 *
 * console.log(result.content);
 *
 * // Stream completion
 * await client.streamComplete(
 *   [{ role: 'user', content: 'Write a briefing script.' }],
 *   (chunk) => {
 *     process.stdout.write(chunk);
 *   }
 * );
 * ```
 */
var LLMClient = /** @class */ (function () {
  function LLMClient(options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    this.client = new openai_1.default({
      apiKey: options.apiKey,
      organization: options.organization,
      baseURL: options.baseURL,
    });
    this.defaultModel = (_a = options.defaultModel) !== null && _a !== void 0 ? _a : 'gpt-4o';
    this.defaultTemperature =
      (_b = options.defaultTemperature) !== null && _b !== void 0 ? _b : 0.7;
    this.defaultMaxTokens = (_c = options.defaultMaxTokens) !== null && _c !== void 0 ? _c : 1000;
    this.debug = (_d = options.debug) !== null && _d !== void 0 ? _d : false;
    // Initialize rate limiter if options provided
    this.rateLimiter = options.rateLimiter ? new RateLimiter(options.rateLimiter) : null;
    // Initialize retry options with defaults
    this.retryOptions = {
      maxRetries:
        (_f = (_e = options.retry) === null || _e === void 0 ? void 0 : _e.maxRetries) !== null &&
        _f !== void 0
          ? _f
          : 3,
      initialRetryDelay:
        (_h = (_g = options.retry) === null || _g === void 0 ? void 0 : _g.initialRetryDelay) !==
          null && _h !== void 0
          ? _h
          : 1000,
      maxRetryDelay:
        (_k = (_j = options.retry) === null || _j === void 0 ? void 0 : _j.maxRetryDelay) !==
          null && _k !== void 0
          ? _k
          : 60000,
      backoffMultiplier:
        (_m = (_l = options.retry) === null || _l === void 0 ? void 0 : _l.backoffMultiplier) !==
          null && _m !== void 0
          ? _m
          : 2,
    };
  }
  /**
   * Generate a completion
   *
   * @param messages - Conversation messages
   * @param options - Completion options
   * @returns Completion result
   */
  LLMClient.prototype.complete = function (messages_1) {
    return __awaiter(this, arguments, void 0, function (messages, options) {
      var model, temperature, maxTokens, estimatedPromptTokens, estimatedTokens;
      var _this = this;
      var _a, _b, _c;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_d) {
        switch (_d.label) {
          case 0:
            model = (_a = options.model) !== null && _a !== void 0 ? _a : this.defaultModel;
            temperature =
              (_b = options.temperature) !== null && _b !== void 0 ? _b : this.defaultTemperature;
            maxTokens =
              (_c = options.maxTokens) !== null && _c !== void 0 ? _c : this.defaultMaxTokens;
            if (this.debug) {
              console.log('[LLMClient] Generating completion with model: '.concat(model));
            }
            estimatedPromptTokens = messages.reduce(function (sum, msg) {
              return sum + Math.ceil(msg.content.length / 4);
            }, 0);
            estimatedTokens = estimatedPromptTokens + maxTokens;
            if (!this.rateLimiter) return [3 /*break*/, 2];
            return [4 /*yield*/, this.rateLimiter.waitForCapacity(estimatedTokens)];
          case 1:
            _d.sent();
            _d.label = 2;
          case 2:
            // Execute with retry
            return [
              2 /*return*/,
              this.executeWithRetry(function () {
                return __awaiter(_this, void 0, void 0, function () {
                  var startTime, response, responseTimeMs, choice, result;
                  var _a, _b, _c, _d, _e, _f, _g;
                  return __generator(this, function (_h) {
                    switch (_h.label) {
                      case 0:
                        startTime = Date.now();
                        return [
                          4 /*yield*/,
                          this.client.chat.completions.create({
                            model: model,
                            messages: messages,
                            temperature: temperature,
                            max_tokens: maxTokens,
                            top_p: options.topP,
                            frequency_penalty: options.frequencyPenalty,
                            presence_penalty: options.presencePenalty,
                            stop: options.stop,
                          }),
                        ];
                      case 1:
                        response = _h.sent();
                        responseTimeMs = Date.now() - startTime;
                        choice = response.choices[0];
                        if (!choice || !choice.message) {
                          throw new Error('No completion generated');
                        }
                        result = {
                          content:
                            (_a = choice.message.content) !== null && _a !== void 0 ? _a : '',
                          model: response.model,
                          promptTokens:
                            (_c =
                              (_b = response.usage) === null || _b === void 0
                                ? void 0
                                : _b.prompt_tokens) !== null && _c !== void 0
                              ? _c
                              : 0,
                          completionTokens:
                            (_e =
                              (_d = response.usage) === null || _d === void 0
                                ? void 0
                                : _d.completion_tokens) !== null && _e !== void 0
                              ? _e
                              : 0,
                          totalTokens:
                            (_g =
                              (_f = response.usage) === null || _f === void 0
                                ? void 0
                                : _f.total_tokens) !== null && _g !== void 0
                              ? _g
                              : 0,
                          finishReason: choice.finish_reason,
                          responseTimeMs: responseTimeMs,
                        };
                        // Return unused tokens to rate limiter
                        if (this.rateLimiter && response.usage) {
                          this.rateLimiter.returnTokens(
                            response.usage.total_tokens,
                            estimatedTokens
                          );
                        }
                        if (this.debug) {
                          console.log(
                            '[LLMClient] Completion generated: '
                              .concat(result.totalTokens, ' tokens in ')
                              .concat(result.responseTimeMs, 'ms')
                          );
                        }
                        return [2 /*return*/, result];
                    }
                  });
                });
              }),
            ];
        }
      });
    });
  };
  /**
   * Generate a streaming completion
   *
   * @param messages - Conversation messages
   * @param onChunk - Callback for each chunk
   * @param options - Completion options
   * @returns Completion result
   */
  LLMClient.prototype.streamComplete = function (messages_1, onChunk_1) {
    return __awaiter(this, arguments, void 0, function (messages, onChunk, options) {
      var model, temperature, maxTokens, estimatedPromptTokens, estimatedTokens;
      var _this = this;
      var _a, _b, _c;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_d) {
        switch (_d.label) {
          case 0:
            model = (_a = options.model) !== null && _a !== void 0 ? _a : this.defaultModel;
            temperature =
              (_b = options.temperature) !== null && _b !== void 0 ? _b : this.defaultTemperature;
            maxTokens =
              (_c = options.maxTokens) !== null && _c !== void 0 ? _c : this.defaultMaxTokens;
            if (this.debug) {
              console.log('[LLMClient] Generating streaming completion with model: '.concat(model));
            }
            estimatedPromptTokens = messages.reduce(function (sum, msg) {
              return sum + Math.ceil(msg.content.length / 4);
            }, 0);
            estimatedTokens = estimatedPromptTokens + maxTokens;
            if (!this.rateLimiter) return [3 /*break*/, 2];
            return [4 /*yield*/, this.rateLimiter.waitForCapacity(estimatedTokens)];
          case 1:
            _d.sent();
            _d.label = 2;
          case 2:
            // Execute with retry
            return [
              2 /*return*/,
              this.executeWithRetry(function () {
                return __awaiter(_this, void 0, void 0, function () {
                  var startTime,
                    fullContent,
                    finishReason,
                    stream,
                    _a,
                    stream_1,
                    stream_1_1,
                    chunk,
                    delta,
                    e_1_1,
                    responseTimeMs,
                    promptTokens,
                    completionTokens,
                    totalTokens,
                    result;
                  var _b, e_1, _c, _d;
                  var _e, _f;
                  return __generator(this, function (_g) {
                    switch (_g.label) {
                      case 0:
                        startTime = Date.now();
                        fullContent = '';
                        finishReason = null;
                        return [
                          4 /*yield*/,
                          this.client.chat.completions.create({
                            model: model,
                            messages: messages,
                            temperature: temperature,
                            max_tokens: maxTokens,
                            top_p: options.topP,
                            frequency_penalty: options.frequencyPenalty,
                            presence_penalty: options.presencePenalty,
                            stop: options.stop,
                            stream: true,
                          }),
                        ];
                      case 1:
                        stream = _g.sent();
                        _g.label = 2;
                      case 2:
                        _g.trys.push([2, 9, 10, 15]);
                        ((_a = true), (stream_1 = __asyncValues(stream)));
                        _g.label = 3;
                      case 3:
                        return [4 /*yield*/, stream_1.next()];
                      case 4:
                        if (!((stream_1_1 = _g.sent()), (_b = stream_1_1.done), !_b))
                          return [3 /*break*/, 8];
                        _d = stream_1_1.value;
                        _a = false;
                        chunk = _d;
                        delta =
                          (_e = chunk.choices[0]) === null || _e === void 0 ? void 0 : _e.delta;
                        if (!(delta === null || delta === void 0 ? void 0 : delta.content))
                          return [3 /*break*/, 6];
                        fullContent += delta.content;
                        return [4 /*yield*/, onChunk(delta.content)];
                      case 5:
                        _g.sent();
                        _g.label = 6;
                      case 6:
                        if (
                          (_f = chunk.choices[0]) === null || _f === void 0
                            ? void 0
                            : _f.finish_reason
                        ) {
                          finishReason = chunk.choices[0].finish_reason;
                        }
                        _g.label = 7;
                      case 7:
                        _a = true;
                        return [3 /*break*/, 3];
                      case 8:
                        return [3 /*break*/, 15];
                      case 9:
                        e_1_1 = _g.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 15];
                      case 10:
                        _g.trys.push([10, , 13, 14]);
                        if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 12];
                        return [4 /*yield*/, _c.call(stream_1)];
                      case 11:
                        _g.sent();
                        _g.label = 12;
                      case 12:
                        return [3 /*break*/, 14];
                      case 13:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                      case 14:
                        return [7 /*endfinally*/];
                      case 15:
                        responseTimeMs = Date.now() - startTime;
                        promptTokens = estimatedPromptTokens;
                        completionTokens = Math.ceil(fullContent.length / 4);
                        totalTokens = promptTokens + completionTokens;
                        result = {
                          content: fullContent,
                          model: model,
                          promptTokens: promptTokens,
                          completionTokens: completionTokens,
                          totalTokens: totalTokens,
                          finishReason: finishReason,
                          responseTimeMs: responseTimeMs,
                        };
                        // Return unused tokens to rate limiter
                        if (this.rateLimiter) {
                          this.rateLimiter.returnTokens(totalTokens, estimatedTokens);
                        }
                        if (this.debug) {
                          console.log(
                            '[LLMClient] Streaming completion generated: ~'
                              .concat(result.totalTokens, ' tokens in ')
                              .concat(result.responseTimeMs, 'ms')
                          );
                        }
                        return [2 /*return*/, result];
                    }
                  });
                });
              }),
            ];
        }
      });
    });
  };
  /**
   * Execute a function with retry logic
   */
  LLMClient.prototype.executeWithRetry = function (fn) {
    return __awaiter(this, void 0, void 0, function () {
      var lastError, retryDelay, attempt, error_1, isRetryable;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            lastError = null;
            retryDelay = this.retryOptions.initialRetryDelay;
            attempt = 0;
            _a.label = 1;
          case 1:
            if (!(attempt <= this.retryOptions.maxRetries)) return [3 /*break*/, 7];
            _a.label = 2;
          case 2:
            _a.trys.push([2, 4, , 6]);
            return [4 /*yield*/, fn()];
          case 3:
            return [2 /*return*/, _a.sent()];
          case 4:
            error_1 = _a.sent();
            lastError = error_1 instanceof Error ? error_1 : new Error(String(error_1));
            isRetryable = this.isRetryableError(lastError);
            if (!isRetryable || attempt === this.retryOptions.maxRetries) {
              // Don't retry or max retries reached
              throw lastError;
            }
            if (this.debug) {
              console.log(
                '[LLMClient] Retry '
                  .concat(attempt + 1, '/')
                  .concat(this.retryOptions.maxRetries, ' after ')
                  .concat(retryDelay, 'ms: ')
                  .concat(lastError.message)
              );
            }
            // Wait before retrying
            return [
              4 /*yield*/,
              new Promise(function (resolve) {
                return setTimeout(resolve, retryDelay);
              }),
            ];
          case 5:
            // Wait before retrying
            _a.sent();
            // Exponential backoff
            retryDelay = Math.min(
              retryDelay * this.retryOptions.backoffMultiplier,
              this.retryOptions.maxRetryDelay
            );
            return [3 /*break*/, 6];
          case 6:
            attempt++;
            return [3 /*break*/, 1];
          case 7:
            throw lastError;
        }
      });
    });
  };
  /**
   * Check if error is retryable
   */
  LLMClient.prototype.isRetryableError = function (error) {
    var message = error.message.toLowerCase();
    // Retryable errors
    var retryablePatterns = [
      'rate limit',
      'timeout',
      'network',
      'econnreset',
      'enotfound',
      'econnrefused',
      'etimedout',
      '429',
      '500',
      '502',
      '503',
      '504',
    ];
    return retryablePatterns.some(function (pattern) {
      return message.includes(pattern);
    });
  };
  /**
   * Get current configuration
   */
  LLMClient.prototype.getConfig = function () {
    return {
      defaultModel: this.defaultModel,
      defaultTemperature: this.defaultTemperature,
      defaultMaxTokens: this.defaultMaxTokens,
      retryOptions: this.retryOptions,
      hasRateLimiter: this.rateLimiter !== null,
    };
  };
  /**
   * Update configuration
   */
  LLMClient.prototype.setConfig = function (config) {
    if (config.defaultModel !== undefined) {
      this.defaultModel = config.defaultModel;
    }
    if (config.defaultTemperature !== undefined) {
      this.defaultTemperature = config.defaultTemperature;
    }
    if (config.defaultMaxTokens !== undefined) {
      this.defaultMaxTokens = config.defaultMaxTokens;
    }
  };
  return LLMClient;
})();
exports.LLMClient = LLMClient;
