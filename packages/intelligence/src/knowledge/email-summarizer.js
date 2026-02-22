'use strict';
/**
 * Email Summarizer (Tier 3)
 *
 * Generates concise summaries of email threads using GPT-4o.
 * Supports different summarization modes for various use cases.
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
exports.EmailSummarizer = void 0;
/**
 * Email Summarizer
 *
 * Generates concise summaries of email threads using GPT-4o.
 * Supports multiple summarization modes for different use cases.
 *
 * @example
 * ```typescript
 * import { EmailSummarizer, LLMClient } from '@nexus-aec/intelligence';
 *
 * // Initialize LLM client
 * const llmClient = new LLMClient({
 *   apiKey: process.env.OPENAI_API_KEY!,
 * });
 *
 * // Initialize summarizer
 * const summarizer = new EmailSummarizer({
 *   llmClient,
 *   defaultMode: 'brief',
 * });
 *
 * // Summarize email thread
 * const summary = await summarizer.summarizeThread(thread, {
 *   mode: 'action-items',
 * });
 *
 * console.log(summary.summary);
 * if (summary.actionItems) {
 *   summary.actionItems.forEach(item => {
 *     console.log(`- ${item.action}`);
 *   });
 * }
 * ```
 */
var EmailSummarizer = /** @class */ (function () {
  function EmailSummarizer(options) {
    var _a, _b, _c, _d;
    this.llmClient = options.llmClient;
    this.defaultMode = (_a = options.defaultMode) !== null && _a !== void 0 ? _a : 'brief';
    this.maxMessagesInContext =
      (_b = options.maxMessagesInContext) !== null && _b !== void 0 ? _b : 20;
    this.includeMetadata = (_c = options.includeMetadata) !== null && _c !== void 0 ? _c : true;
    this.debug = (_d = options.debug) !== null && _d !== void 0 ? _d : false;
  }
  /**
   * Summarize an email thread
   *
   * @param thread - Email thread to summarize
   * @param options - Summarization options
   * @returns Summary result
   */
  EmailSummarizer.prototype.summarizeThread = function (thread_1) {
    return __awaiter(this, arguments, void 0, function (thread, options) {
      var mode, startTime, messages, prompt, llmMessages, result, generationTimeMs, summary;
      var _a;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            mode = (_a = options.mode) !== null && _a !== void 0 ? _a : this.defaultMode;
            if (this.debug) {
              console.log(
                '[EmailSummarizer] Summarizing thread: '
                  .concat(thread.subject, ' (')
                  .concat(thread.messages.length, ' messages, mode: ')
                  .concat(mode, ')')
              );
            }
            startTime = Date.now();
            messages = this.prepareMessages(thread.messages);
            prompt = this.buildPrompt(thread, messages, mode);
            llmMessages = [
              {
                role: 'system',
                content: this.getSystemPrompt(mode),
              },
              {
                role: 'user',
                content: prompt,
              },
            ];
            return [
              4 /*yield*/,
              this.llmClient.complete(llmMessages, {
                temperature: 0.3, // Lower temperature for more factual summaries
                maxTokens: mode === 'brief' ? 200 : mode === 'detailed' ? 500 : 400,
              }),
            ];
          case 1:
            result = _b.sent();
            generationTimeMs = Date.now() - startTime;
            summary = this.parseSummary(result.content, mode, thread);
            if (this.debug) {
              console.log(
                '[EmailSummarizer] Generated summary in '
                  .concat(generationTimeMs, 'ms (')
                  .concat(result.totalTokens, ' tokens)')
              );
            }
            return [
              2 /*return*/,
              __assign(__assign({}, summary), {
                mode: mode,
                participants: thread.participants.map(function (p) {
                  return p.email;
                }),
                messageCount: messages.length,
                tokensUsed: result.totalTokens,
                generationTimeMs: generationTimeMs,
              }),
            ];
        }
      });
    });
  };
  /**
   * Summarize a single email
   *
   * @param email - Email to summarize
   * @param options - Summarization options
   * @returns Summary result
   */
  EmailSummarizer.prototype.summarizeEmail = function (email_1) {
    return __awaiter(this, arguments, void 0, function (email, options) {
      var mode, startTime, prompt, llmMessages, result, generationTimeMs, summary;
      var _a;
      if (options === void 0) {
        options = {};
      }
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            mode = (_a = options.mode) !== null && _a !== void 0 ? _a : this.defaultMode;
            if (this.debug) {
              console.log(
                '[EmailSummarizer] Summarizing email: '
                  .concat(email.subject, ' (mode: ')
                  .concat(mode, ')')
              );
            }
            startTime = Date.now();
            prompt = this.buildSingleEmailPrompt(email, mode);
            llmMessages = [
              {
                role: 'system',
                content: this.getSystemPrompt(mode),
              },
              {
                role: 'user',
                content: prompt,
              },
            ];
            return [
              4 /*yield*/,
              this.llmClient.complete(llmMessages, {
                temperature: 0.3,
                maxTokens: mode === 'brief' ? 150 : mode === 'detailed' ? 400 : 300,
              }),
            ];
          case 1:
            result = _b.sent();
            generationTimeMs = Date.now() - startTime;
            summary = this.parseSummary(result.content, mode, null, email);
            if (this.debug) {
              console.log(
                '[EmailSummarizer] Generated summary in '
                  .concat(generationTimeMs, 'ms (')
                  .concat(result.totalTokens, ' tokens)')
              );
            }
            return [
              2 /*return*/,
              __assign(__assign({}, summary), {
                mode: mode,
                participants: __spreadArray(
                  [email.from.email],
                  email.to.map(function (t) {
                    return t.email;
                  }),
                  true
                ),
                messageCount: 1,
                tokensUsed: result.totalTokens,
                generationTimeMs: generationTimeMs,
              }),
            ];
        }
      });
    });
  };
  /**
   * Get system prompt based on mode
   */
  EmailSummarizer.prototype.getSystemPrompt = function (mode) {
    var basePrompt = 'You are an executive assistant that summarizes email conversations.';
    switch (mode) {
      case 'brief':
        return ''.concat(
          basePrompt,
          ' Provide ultra-concise summaries in 1-2 sentences that capture the core message.'
        );
      case 'detailed':
        return ''.concat(
          basePrompt,
          ' Provide detailed summaries that capture key points, decisions, and context.'
        );
      case 'action-items':
        return ''.concat(
          basePrompt,
          ' Extract and list action items, tasks, and next steps from the conversation. Format as a bulleted list with action, assignee (if mentioned), and deadline (if mentioned).'
        );
      case 'key-points':
        return ''.concat(
          basePrompt,
          ' Extract the key points and important information from the conversation. Format as a bulleted list.'
        );
      default:
        return basePrompt;
    }
  };
  /**
   * Build prompt for thread summarization
   */
  EmailSummarizer.prototype.buildPrompt = function (thread, messages, mode) {
    var _this = this;
    var parts = [];
    // Add thread metadata if enabled
    if (this.includeMetadata) {
      parts.push('Subject: '.concat(thread.subject));
      parts.push(
        'Participants: '.concat(
          thread.participants
            .map(function (p) {
              return p.name || p.email;
            })
            .join(', ')
        )
      );
      parts.push('Messages: '.concat(messages.length));
      parts.push('');
    }
    // Add conversation
    parts.push('Conversation:');
    parts.push('---');
    messages.forEach(function (msg, index) {
      var fromName = msg.from.name || msg.from.email;
      var timestamp = _this.includeMetadata
        ? ' ('.concat(_this.formatDate(msg.receivedAt), ')')
        : '';
      parts.push(
        '['
          .concat(index + 1, '] ')
          .concat(fromName)
          .concat(timestamp, ':')
      );
      parts.push(msg.body || msg.snippet);
      parts.push('');
    });
    parts.push('---');
    // Add mode-specific instructions
    switch (mode) {
      case 'brief':
        parts.push('Provide a brief 1-2 sentence summary of this email thread.');
        break;
      case 'detailed':
        parts.push(
          'Provide a detailed summary covering the main points, decisions made, and any important context.'
        );
        break;
      case 'action-items':
        parts.push(
          'Extract all action items, tasks, and next steps. Format each as:\n- Action: [description]\n  Assignee: [person if mentioned]\n  Due: [date if mentioned]'
        );
        break;
      case 'key-points':
        parts.push('Extract and list the key points from this conversation as bullet points.');
        break;
    }
    return parts.join('\n');
  };
  /**
   * Build prompt for single email summarization
   */
  EmailSummarizer.prototype.buildSingleEmailPrompt = function (email, mode) {
    var parts = [];
    if (this.includeMetadata) {
      parts.push('From: '.concat(email.from.name || email.from.email));
      parts.push(
        'To: '.concat(
          email.to
            .map(function (t) {
              return t.name || t.email;
            })
            .join(', ')
        )
      );
      parts.push('Subject: '.concat(email.subject));
      parts.push('Date: '.concat(this.formatDate(email.receivedAt)));
      parts.push('');
    }
    parts.push('Email content:');
    parts.push('---');
    parts.push(email.body || email.snippet);
    parts.push('---');
    // Add mode-specific instructions
    switch (mode) {
      case 'brief':
        parts.push('Provide a brief 1-2 sentence summary of this email.');
        break;
      case 'detailed':
        parts.push('Provide a detailed summary of the email content and its key points.');
        break;
      case 'action-items':
        parts.push(
          'Extract all action items and tasks mentioned. Format each as:\n- Action: [description]\n  Assignee: [person if mentioned]\n  Due: [date if mentioned]'
        );
        break;
      case 'key-points':
        parts.push('Extract and list the key points from this email as bullet points.');
        break;
    }
    return parts.join('\n');
  };
  /**
   * Parse summary result based on mode
   */
  EmailSummarizer.prototype.parseSummary = function (content, mode, thread, email) {
    var summary = content.trim();
    if (mode === 'key-points') {
      // Extract bullet points
      var keyPoints = this.extractBulletPoints(content);
      return { summary: summary, keyPoints: keyPoints };
    }
    if (mode === 'action-items') {
      // Extract action items
      var actionItems = this.extractActionItems(content);
      return { summary: summary, actionItems: actionItems };
    }
    return { summary: summary };
  };
  /**
   * Extract bullet points from content
   */
  EmailSummarizer.prototype.extractBulletPoints = function (content) {
    var lines = content.split('\n');
    var points = [];
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
      var line = lines_1[_i];
      var trimmed = line.trim();
      // Match lines starting with -, *, •, or numbers
      if (/^[-*•\d]+\.?\s+/.test(trimmed)) {
        points.push(trimmed.replace(/^[-*•\d]+\.?\s+/, ''));
      }
    }
    return points.length > 0 ? points : [content.trim()];
  };
  /**
   * Extract action items from content
   */
  EmailSummarizer.prototype.extractActionItems = function (content) {
    var items = [];
    var lines = content.split('\n');
    var currentAction = null;
    var currentAssignee;
    var currentDueDate;
    for (var _i = 0, lines_2 = lines; _i < lines_2.length; _i++) {
      var line = lines_2[_i];
      var trimmed = line.trim();
      // Check if it's an action line
      if (/^[-*•]/.test(trimmed) || /^Action:/i.test(trimmed)) {
        // Save previous action if exists
        if (currentAction) {
          items.push({
            action: currentAction,
            assignee: currentAssignee,
            dueDate: currentDueDate,
          });
        }
        // Start new action
        currentAction = trimmed
          .replace(/^[-*•]\s*/, '')
          .replace(/^Action:\s*/i, '')
          .trim();
        currentAssignee = undefined;
        currentDueDate = undefined;
      } else if (/^Assignee:/i.test(trimmed) && currentAction) {
        currentAssignee = trimmed.replace(/^Assignee:\s*/i, '').trim();
      } else if (/^Due:/i.test(trimmed) && currentAction) {
        currentDueDate = trimmed.replace(/^Due:\s*/i, '').trim();
      }
    }
    // Save last action
    if (currentAction) {
      items.push({
        action: currentAction,
        assignee: currentAssignee,
        dueDate: currentDueDate,
      });
    }
    // If no structured items found, treat whole content as one action
    if (items.length === 0 && content.trim()) {
      items.push({ action: content.trim() });
    }
    return items;
  };
  /**
   * Prepare messages for summarization (truncate if needed)
   */
  EmailSummarizer.prototype.prepareMessages = function (messages) {
    if (messages.length <= this.maxMessagesInContext) {
      return messages;
    }
    if (this.debug) {
      console.log(
        '[EmailSummarizer] Truncating '
          .concat(messages.length, ' messages to ')
          .concat(this.maxMessagesInContext)
      );
    }
    // Keep most recent messages
    return messages.slice(-this.maxMessagesInContext);
  };
  /**
   * Format date for display
   */
  EmailSummarizer.prototype.formatDate = function (date) {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };
  /**
   * Get current configuration
   */
  EmailSummarizer.prototype.getConfig = function () {
    return {
      defaultMode: this.defaultMode,
      maxMessagesInContext: this.maxMessagesInContext,
      includeMetadata: this.includeMetadata,
    };
  };
  /**
   * Update configuration
   */
  EmailSummarizer.prototype.setConfig = function (config) {
    if (config.defaultMode !== undefined) {
      this.defaultMode = config.defaultMode;
    }
    if (config.maxMessagesInContext !== undefined) {
      this.maxMessagesInContext = config.maxMessagesInContext;
    }
    if (config.includeMetadata !== undefined) {
      this.includeMetadata = config.includeMetadata;
    }
  };
  return EmailSummarizer;
})();
exports.EmailSummarizer = EmailSummarizer;
