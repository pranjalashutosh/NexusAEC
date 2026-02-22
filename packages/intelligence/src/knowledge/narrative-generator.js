'use strict';
/**
 * Narrative Generator (Tier 3)
 *
 * Converts email clusters, red flag scores, and summaries into
 * podcast-style briefing scripts for voice delivery.
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
var __spreadArray =
  (this && this.__spreadArray) ||
  function (to, from, pack) {
    if (pack || arguments.length === 2)
      for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
        }
      }
    return to.concat(ar || Array.prototype.slice.call(from));
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.NarrativeGenerator = void 0;
/**
 * Narrative Generator
 *
 * Converts email clusters, red flags, and summaries into podcast-style
 * briefing scripts optimized for voice delivery.
 *
 * @example
 * ```typescript
 * import { NarrativeGenerator, LLMClient } from '@nexus-aec/intelligence';
 *
 * const llmClient = new LLMClient({ apiKey: process.env.OPENAI_API_KEY! });
 * const generator = new NarrativeGenerator({
 *   llmClient,
 *   defaultStyle: 'conversational',
 * });
 *
 * const script = await generator.generateBriefing({
 *   clusters,
 *   redFlagScores,
 *   summaries,
 *   userName: 'John',
 *   currentTime: new Date(),
 * });
 *
 * for (const segment of script.segments) {
 *   console.log(`[${segment.type}] ${segment.content}`);
 * }
 * ```
 */
var NarrativeGenerator = /** @class */ (function () {
  function NarrativeGenerator(options) {
    var _a, _b, _c, _d, _e;
    this.llmClient = options.llmClient;
    this.defaultStyle =
      (_a = options.defaultStyle) !== null && _a !== void 0 ? _a : 'conversational';
    this.maxTopics = (_b = options.maxTopics) !== null && _b !== void 0 ? _b : 10;
    this.includeOpening = (_c = options.includeOpening) !== null && _c !== void 0 ? _c : true;
    this.includeClosing = (_d = options.includeClosing) !== null && _d !== void 0 ? _d : true;
    this.debug = (_e = options.debug) !== null && _e !== void 0 ? _e : false;
  }
  /**
   * Generate briefing script from email data
   *
   * @param input - Briefing input data
   * @param options - Generation options
   * @returns Generated briefing script
   */
  NarrativeGenerator.prototype.generateBriefing = function (input_1) {
    return __awaiter(this, arguments, void 0, function (input, options) {
      var style,
        startTime,
        segments,
        totalTokens,
        redFlagCount,
        opening,
        sortedClusters,
        topicClusters,
        i,
        cluster,
        isLast,
        transition,
        topic,
        closing,
        generationTimeMs,
        totalSeconds;
      var _a;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            style = (_a = options.style) !== null && _a !== void 0 ? _a : this.defaultStyle;
            startTime = Date.now();
            if (this.debug) {
              console.log(
                '[NarrativeGenerator] Generating briefing: '
                  .concat(input.clusters.length, ' clusters, ')
                  .concat(input.redFlagScores.size, ' red flags, style: ')
                  .concat(style)
              );
            }
            segments = [];
            totalTokens = 0;
            redFlagCount = 0;
            if (!this.includeOpening) return [3 /*break*/, 2];
            return [4 /*yield*/, this.generateOpening(input, style)];
          case 1:
            opening = _b.sent();
            segments.push(opening.segment);
            totalTokens += opening.tokensUsed;
            _b.label = 2;
          case 2:
            sortedClusters = this.sortClustersByPriority(input);
            topicClusters = sortedClusters.slice(0, this.maxTopics);
            i = 0;
            _b.label = 3;
          case 3:
            if (!(i < topicClusters.length)) return [3 /*break*/, 6];
            cluster = topicClusters[i];
            isLast = i === topicClusters.length - 1;
            // Generate transition (if not first topic)
            if (i > 0) {
              transition = this.generateTransition(cluster, style);
              segments.push(transition);
            }
            return [4 /*yield*/, this.generateTopicNarrative(cluster, input, style)];
          case 4:
            topic = _b.sent();
            segments.push(topic.segment);
            totalTokens += topic.tokensUsed;
            redFlagCount += topic.redFlagCount;
            _b.label = 5;
          case 5:
            i++;
            return [3 /*break*/, 3];
          case 6:
            if (!this.includeClosing) return [3 /*break*/, 8];
            return [4 /*yield*/, this.generateClosing(input, style, redFlagCount)];
          case 7:
            closing = _b.sent();
            segments.push(closing.segment);
            totalTokens += closing.tokensUsed;
            _b.label = 8;
          case 8:
            generationTimeMs = Date.now() - startTime;
            totalSeconds = segments.reduce(function (sum, seg) {
              return sum + seg.estimatedSeconds;
            }, 0);
            if (this.debug) {
              console.log(
                '[NarrativeGenerator] Generated '
                  .concat(segments.length, ' segments in ')
                  .concat(generationTimeMs, 'ms (')
                  .concat(totalTokens, ' tokens, ~')
                  .concat(totalSeconds, 's reading time)')
              );
            }
            return [
              2 /*return*/,
              {
                segments: segments,
                totalSeconds: totalSeconds,
                topicCount: topicClusters.length,
                redFlagCount: redFlagCount,
                style: style,
                generationTimeMs: generationTimeMs,
                tokensUsed: totalTokens,
              },
            ];
        }
      });
    });
  };
  /**
   * Generate opening greeting
   */
  NarrativeGenerator.prototype.generateOpening = function (input, style) {
    return __awaiter(this, void 0, void 0, function () {
      var currentTime,
        timeOfDay,
        userName,
        clusterCount,
        redFlagCount,
        systemPrompt,
        userPrompt,
        messages,
        result;
      var _a, _b;
      return __generator(this, function (_c) {
        switch (_c.label) {
          case 0:
            currentTime = (_a = input.currentTime) !== null && _a !== void 0 ? _a : new Date();
            timeOfDay = this.getTimeOfDay(currentTime);
            userName = (_b = input.userName) !== null && _b !== void 0 ? _b : '';
            clusterCount = input.clusters.length;
            redFlagCount = Array.from(input.redFlagScores.values()).filter(function (s) {
              return s.isFlagged;
            }).length;
            systemPrompt = this.getStyleSystemPrompt(style);
            userPrompt =
              'Generate a brief opening greeting for an email briefing. Context:\n- Time of day: '
                .concat(timeOfDay, '\n- User name: ')
                .concat(userName || 'executive', '\n- Total topics: ')
                .concat(clusterCount, '\n- Red flags: ')
                .concat(
                  redFlagCount,
                  "\n\nGenerate 1-2 sentences that welcome the user and preview what's ahead. Be natural and concise."
                );
            messages = [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ];
            return [
              4 /*yield*/,
              this.llmClient.complete(messages, {
                temperature: 0.7,
                maxTokens: 150,
              }),
            ];
          case 1:
            result = _c.sent();
            return [
              2 /*return*/,
              {
                segment: {
                  type: 'opening',
                  content: result.content.trim(),
                  estimatedSeconds: this.estimateReadingTime(result.content),
                },
                tokensUsed: result.totalTokens,
              },
            ];
        }
      });
    });
  };
  /**
   * Generate closing
   */
  NarrativeGenerator.prototype.generateClosing = function (input, style, redFlagCount) {
    return __awaiter(this, void 0, void 0, function () {
      var systemPrompt, userPrompt, messages, result;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            systemPrompt = this.getStyleSystemPrompt(style);
            userPrompt =
              'Generate a brief closing for an email briefing. Context:\n- Red flags mentioned: '
                .concat(redFlagCount, '\n- Topics covered: ')
                .concat(
                  Math.min(input.clusters.length, this.maxTopics),
                  '\n\nGenerate 1-2 sentences that wrap up the briefing and prompt for user interaction. Be natural and concise.'
                );
            messages = [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ];
            return [
              4 /*yield*/,
              this.llmClient.complete(messages, {
                temperature: 0.7,
                maxTokens: 150,
              }),
            ];
          case 1:
            result = _a.sent();
            return [
              2 /*return*/,
              {
                segment: {
                  type: 'closing',
                  content: result.content.trim(),
                  estimatedSeconds: this.estimateReadingTime(result.content),
                },
                tokensUsed: result.totalTokens,
              },
            ];
        }
      });
    });
  };
  /**
   * Generate narrative for a topic cluster
   */
  NarrativeGenerator.prototype.generateTopicNarrative = function (cluster, input, style) {
    return __awaiter(this, void 0, void 0, function () {
      var redFlags,
        summaries,
        _i,
        _a,
        threadId,
        summary,
        _b,
        _c,
        emailId,
        summary,
        systemPrompt,
        userPrompt,
        messages,
        result;
      return __generator(this, function (_d) {
        switch (_d.label) {
          case 0:
            redFlags = cluster.emailIds
              .map(function (id) {
                return input.redFlagScores.get(id);
              })
              .filter(function (score) {
                return (score === null || score === void 0 ? void 0 : score.isFlagged) === true;
              });
            summaries = new Set();
            for (_i = 0, _a = cluster.threadIds; _i < _a.length; _i++) {
              threadId = _a[_i];
              summary = input.summaries.get(threadId);
              if (summary) summaries.add(summary);
            }
            // Fallback to individual email summaries
            if (summaries.size === 0) {
              for (_b = 0, _c = cluster.emailIds; _b < _c.length; _b++) {
                emailId = _c[_b];
                summary = input.summaries.get(emailId);
                if (summary) summaries.add(summary);
              }
            }
            systemPrompt = this.getStyleSystemPrompt(style);
            userPrompt = this.buildTopicPrompt(cluster, Array.from(summaries), redFlags);
            messages = [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ];
            return [
              4 /*yield*/,
              this.llmClient.complete(messages, {
                temperature: 0.7,
                maxTokens: 400,
              }),
            ];
          case 1:
            result = _d.sent();
            return [
              2 /*return*/,
              {
                segment: {
                  type: 'topic',
                  content: result.content.trim(),
                  topicId: cluster.id,
                  estimatedSeconds: this.estimateReadingTime(result.content),
                },
                tokensUsed: result.totalTokens,
                redFlagCount: redFlags.length,
              },
            ];
        }
      });
    });
  };
  /**
   * Build prompt for topic narrative generation
   */
  NarrativeGenerator.prototype.buildTopicPrompt = function (cluster, summaries, redFlags) {
    var parts = [];
    parts.push('Generate a natural narrative for this email topic:');
    parts.push('Topic: '.concat(cluster.topic));
    parts.push('Emails: '.concat(cluster.size));
    parts.push('');
    // Add summaries
    if (summaries.length > 0) {
      parts.push('Key points:');
      summaries.slice(0, 3).forEach(function (summary) {
        parts.push('- '.concat(summary.summary));
      });
      parts.push('');
    }
    // Add red flag information
    if (redFlags.length > 0) {
      parts.push('Red flags: '.concat(redFlags.length));
      var urgentReasons = redFlags
        .flatMap(function (flag) {
          return flag.reasons.map(function (r) {
            return r.reason;
          });
        })
        .slice(0, 3);
      if (urgentReasons.length > 0) {
        parts.push('Urgency reasons:');
        urgentReasons.forEach(function (reason) {
          parts.push('- '.concat(reason));
        });
      }
      parts.push('');
    }
    parts.push(
      'Generate 2-4 sentences that naturally present this topic, incorporating the key points and urgency signals. Speak directly to the user as if in a conversation.'
    );
    return parts.join('\n');
  };
  /**
   * Generate transition between topics
   */
  NarrativeGenerator.prototype.generateTransition = function (cluster, style) {
    var transitions = this.getTransitionPhrases(style);
    var phrase = transitions[Math.floor(Math.random() * transitions.length)];
    return {
      type: 'transition',
      content: phrase,
      estimatedSeconds: this.estimateReadingTime(phrase),
    };
  };
  /**
   * Get transition phrases for style
   */
  NarrativeGenerator.prototype.getTransitionPhrases = function (style) {
    switch (style) {
      case 'formal':
        return [
          'Moving on to the next item.',
          'Next on the agenda.',
          'The following matter requires attention.',
        ];
      case 'conversational':
        return [
          "Let's move on.",
          'Next up.',
          "Here's another topic.",
          'Moving along.',
          'Next item.',
        ];
      case 'executive':
        return ['Next.', 'Moving on.', 'Next item.'];
      case 'concise':
        return ['Next.', 'Also.', 'Additionally.'];
      default:
        return ['Next.'];
    }
  };
  /**
   * Sort clusters by priority (red flags + size)
   */
  NarrativeGenerator.prototype.sortClustersByPriority = function (input) {
    return __spreadArray([], input.clusters, true).sort(function (a, b) {
      // Count red flags in each cluster
      var aFlags = a.emailIds.filter(function (id) {
        var _a;
        return (_a = input.redFlagScores.get(id)) === null || _a === void 0 ? void 0 : _a.isFlagged;
      }).length;
      var bFlags = b.emailIds.filter(function (id) {
        var _a;
        return (_a = input.redFlagScores.get(id)) === null || _a === void 0 ? void 0 : _a.isFlagged;
      }).length;
      // Get highest red flag score
      var aMaxScore = Math.max.apply(
        Math,
        __spreadArray(
          __spreadArray(
            [],
            a.emailIds.map(function (id) {
              var _a, _b;
              return (_b =
                (_a = input.redFlagScores.get(id)) === null || _a === void 0
                  ? void 0
                  : _a.score) !== null && _b !== void 0
                ? _b
                : 0;
            }),
            false
          ),
          [0],
          false
        )
      );
      var bMaxScore = Math.max.apply(
        Math,
        __spreadArray(
          __spreadArray(
            [],
            b.emailIds.map(function (id) {
              var _a, _b;
              return (_b =
                (_a = input.redFlagScores.get(id)) === null || _a === void 0
                  ? void 0
                  : _a.score) !== null && _b !== void 0
                ? _b
                : 0;
            }),
            false
          ),
          [0],
          false
        )
      );
      // Sort by: red flag count (desc), max score (desc), size (desc)
      if (aFlags !== bFlags) return bFlags - aFlags;
      if (aMaxScore !== bMaxScore) return bMaxScore - aMaxScore;
      return b.size - a.size;
    });
  };
  /**
   * Get system prompt for narrative style
   */
  NarrativeGenerator.prototype.getStyleSystemPrompt = function (style) {
    var basePrompt =
      'You are an executive assistant creating a voice briefing script. Generate natural, spoken language suitable for audio delivery.';
    switch (style) {
      case 'formal':
        return ''.concat(
          basePrompt,
          ' Use formal, professional language. Be respectful and precise.'
        );
      case 'conversational':
        return ''.concat(
          basePrompt,
          ' Use warm, conversational language. Sound like a trusted colleague giving a friendly update.'
        );
      case 'executive':
        return ''.concat(
          basePrompt,
          ' Be concise and direct. Use short sentences. Get to the point quickly.'
        );
      case 'concise':
        return ''.concat(
          basePrompt,
          ' Be extremely brief. Use minimal words while conveying essential information.'
        );
      default:
        return basePrompt;
    }
  };
  /**
   * Estimate reading time in seconds (assumes 150 words per minute)
   */
  NarrativeGenerator.prototype.estimateReadingTime = function (text) {
    var words = text.split(/\s+/).length;
    return Math.ceil((words / 150) * 60);
  };
  /**
   * Get time of day greeting
   */
  NarrativeGenerator.prototype.getTimeOfDay = function (date) {
    var hour = date.getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };
  /**
   * Get current configuration
   */
  NarrativeGenerator.prototype.getConfig = function () {
    return {
      defaultStyle: this.defaultStyle,
      maxTopics: this.maxTopics,
      includeOpening: this.includeOpening,
      includeClosing: this.includeClosing,
    };
  };
  /**
   * Update configuration
   */
  NarrativeGenerator.prototype.setConfig = function (config) {
    if (config.defaultStyle !== undefined) {
      this.defaultStyle = config.defaultStyle;
    }
    if (config.maxTopics !== undefined) {
      this.maxTopics = config.maxTopics;
    }
    if (config.includeOpening !== undefined) {
      this.includeOpening = config.includeOpening;
    }
    if (config.includeClosing !== undefined) {
      this.includeClosing = config.includeClosing;
    }
  };
  return NarrativeGenerator;
})();
exports.NarrativeGenerator = NarrativeGenerator;
