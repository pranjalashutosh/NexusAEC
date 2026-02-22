'use strict';
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
exports.ThreadVelocityDetector = void 0;
/**
 * Escalation language patterns
 */
var ESCALATION_PATTERNS = [
  /\bescalat(e|ed|ing)\b/i,
  /\bneeds?\s+(immediate|urgent)\s+(attention|response)\b/i,
  /\bloop(ing)?\s+in\s+(management|leadership|exec)\b/i,
  /\bcc['"]?ing\s+(boss|manager|director|vp|ceo|cto)\b/i,
  /\bradioactive\b/i,
  /\bfire\s+drill\b/i,
  /\ball\s+hands\s+on\s+deck\b/i,
  /\bcode\s+red\b/i,
  /\bdefcon\s+\d\b/i,
  /\bwar\s+room\b/i,
  /\bemergency\s+(meeting|call)\b/i,
  /\btaking\s+this\s+offline\b/i,
  /\bneed\s+to\s+discuss\s+(urgently|immediately)\b/i,
  /\bget\s+on\s+a\s+call\s+(now|asap)\b/i,
  /\bthis\s+is\s+(critical|urgent|important)\b/i,
  /\bnot\s+(acceptable|happy|satisfied)\b/i,
  /\b(disappointed|frustrated|concerned)\s+(with|about|by)\b/i,
  /\bstop\s+everything\b/i,
  /\bdrop\s+everything\b/i,
  /\bpriority\s+(zero|one|1|0)\b/i,
];
/**
 * Calculate time difference in hours
 */
function hoursBetween(date1, date2) {
  var diffMs = Math.abs(date1.getTime() - date2.getTime());
  return diffMs / (1000 * 60 * 60);
}
/**
 * Calculate time difference in minutes
 */
function minutesBetween(date1, date2) {
  var diffMs = Math.abs(date1.getTime() - date2.getTime());
  return diffMs / (1000 * 60);
}
/**
 * Detect escalation language in email
 */
function detectEscalationLanguage(email) {
  var _a, _b;
  var matches = [];
  var text = ''
    .concat(email.subject, ' ')
    .concat(
      (_b = (_a = email.body) !== null && _a !== void 0 ? _a : email.snippet) !== null &&
        _b !== void 0
        ? _b
        : ''
    );
  for (
    var _i = 0, ESCALATION_PATTERNS_1 = ESCALATION_PATTERNS;
    _i < ESCALATION_PATTERNS_1.length;
    _i++
  ) {
    var pattern = ESCALATION_PATTERNS_1[_i];
    var match = pattern.exec(text);
    if (match) {
      matches.push(match[0]);
    }
  }
  return matches;
}
/**
 * Calculate reply frequency for messages within a time window
 */
function calculateReplyFrequency(messages, windowHours, now) {
  var cutoffTime = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  var recentMessages = messages.filter(function (msg) {
    return msg.receivedAt >= cutoffTime;
  });
  return recentMessages.length;
}
/**
 * ThreadVelocityDetector class for analyzing thread velocity and escalation
 *
 * Provides:
 * - Reply frequency calculation
 * - High-velocity thread detection
 * - Escalation language detection
 * - Time-based thread analysis
 *
 * @example
 * ```typescript
 * const detector = new ThreadVelocityDetector();
 *
 * const result = detector.analyzeThread(thread);
 * if (result.isHighVelocity) {
 *   console.log(`High velocity thread: ${result.replyFrequency} replies/hour`);
 *   console.log(`Escalation detected: ${result.hasEscalationLanguage}`);
 * }
 * ```
 */
var ThreadVelocityDetector = /** @class */ (function () {
  function ThreadVelocityDetector(options) {
    if (options === void 0) {
      options = {};
    }
    var _a, _b, _c, _d, _e, _f, _g;
    this.options = {
      highVelocityWindowHours:
        (_a = options.highVelocityWindowHours) !== null && _a !== void 0 ? _a : 2,
      highVelocityThreshold:
        (_b = options.highVelocityThreshold) !== null && _b !== void 0 ? _b : 4,
      highVelocityWeight: (_c = options.highVelocityWeight) !== null && _c !== void 0 ? _c : 0.7,
      mediumVelocityWindowHours:
        (_d = options.mediumVelocityWindowHours) !== null && _d !== void 0 ? _d : 6,
      mediumVelocityThreshold:
        (_e = options.mediumVelocityThreshold) !== null && _e !== void 0 ? _e : 3,
      mediumVelocityWeight:
        (_f = options.mediumVelocityWeight) !== null && _f !== void 0 ? _f : 0.5,
      escalationLanguageWeight:
        (_g = options.escalationLanguageWeight) !== null && _g !== void 0 ? _g : 0.8,
    };
  }
  /**
   * Analyze thread velocity from StandardThread
   */
  ThreadVelocityDetector.prototype.analyzeThread = function (thread) {
    return this.analyzeEmails(thread.messages);
  };
  /**
   * Analyze thread velocity from array of emails
   */
  ThreadVelocityDetector.prototype.analyzeEmails = function (emails) {
    var reasons = [];
    var score = 0;
    // Need at least 2 messages for velocity analysis
    if (emails.length < 2) {
      return {
        isHighVelocity: false,
        score: 0,
        replyFrequency: 0,
        avgTimeBetweenReplies: 0,
        hasEscalationLanguage: false,
        escalationPhrases: [],
        reasons: [],
        messageCount: emails.length,
        threadTimespanHours: 0,
      };
    }
    // Sort messages by time
    var sortedEmails = __spreadArray([], emails, true).sort(function (a, b) {
      return a.receivedAt.getTime() - b.receivedAt.getTime();
    });
    var firstMessage = sortedEmails[0];
    var lastMessage = sortedEmails[sortedEmails.length - 1];
    if (!firstMessage || !lastMessage) {
      return {
        isHighVelocity: false,
        score: 0,
        replyFrequency: 0,
        avgTimeBetweenReplies: 0,
        hasEscalationLanguage: false,
        escalationPhrases: [],
        reasons: [],
        messageCount: emails.length,
        threadTimespanHours: 0,
      };
    }
    // Calculate thread timespan
    var threadTimespanHours = hoursBetween(firstMessage.receivedAt, lastMessage.receivedAt);
    // Calculate average time between replies
    var totalMinutesBetweenReplies = 0;
    for (var i = 1; i < sortedEmails.length; i++) {
      var prev = sortedEmails[i - 1];
      var curr = sortedEmails[i];
      if (prev && curr) {
        totalMinutesBetweenReplies += minutesBetween(prev.receivedAt, curr.receivedAt);
      }
    }
    var avgTimeBetweenReplies = totalMinutesBetweenReplies / (sortedEmails.length - 1);
    // Calculate overall reply frequency (replies per hour)
    var replyFrequency = threadTimespanHours > 0 ? emails.length / threadTimespanHours : 0;
    // Check for high velocity in recent window
    var now = lastMessage.receivedAt;
    var highVelocityCount = calculateReplyFrequency(
      sortedEmails,
      this.options.highVelocityWindowHours,
      now
    );
    if (highVelocityCount >= this.options.highVelocityThreshold) {
      score += this.options.highVelocityWeight;
      reasons.push({
        type: 'high_velocity',
        description: ''
          .concat(highVelocityCount, ' replies in ')
          .concat(this.options.highVelocityWindowHours, ' hours'),
        weight: this.options.highVelocityWeight,
      });
    } else {
      // Check for medium velocity
      var mediumVelocityCount = calculateReplyFrequency(
        sortedEmails,
        this.options.mediumVelocityWindowHours,
        now
      );
      if (mediumVelocityCount >= this.options.mediumVelocityThreshold) {
        score += this.options.mediumVelocityWeight;
        reasons.push({
          type: 'medium_velocity',
          description: ''
            .concat(mediumVelocityCount, ' replies in ')
            .concat(this.options.mediumVelocityWindowHours, ' hours'),
          weight: this.options.mediumVelocityWeight,
        });
      }
    }
    // Check for rapid back-and-forth (avg reply time < 15 minutes)
    if (avgTimeBetweenReplies < 15 && emails.length >= 3) {
      var rapidWeight = 0.6;
      score += rapidWeight;
      reasons.push({
        type: 'rapid_back_and_forth',
        description: 'Rapid back-and-forth: avg '.concat(
          Math.round(avgTimeBetweenReplies),
          ' min between replies'
        ),
        weight: rapidWeight,
      });
    }
    // Detect escalation language
    var allEscalationPhrases = [];
    for (var _i = 0, sortedEmails_1 = sortedEmails; _i < sortedEmails_1.length; _i++) {
      var email = sortedEmails_1[_i];
      var phrases = detectEscalationLanguage(email);
      allEscalationPhrases.push.apply(allEscalationPhrases, phrases);
    }
    var hasEscalationLanguage = allEscalationPhrases.length > 0;
    if (hasEscalationLanguage) {
      score += this.options.escalationLanguageWeight;
      var uniquePhrases = __spreadArray([], new Set(allEscalationPhrases), true);
      reasons.push({
        type: 'escalation_language',
        description: 'Escalation language detected: "'.concat(
          uniquePhrases.slice(0, 3).join('", "'),
          '"'
        ),
        weight: this.options.escalationLanguageWeight,
      });
    }
    // Cap score at 1.0
    score = Math.min(score, 1.0);
    return {
      isHighVelocity: score >= 0.6,
      score: score,
      replyFrequency: replyFrequency,
      avgTimeBetweenReplies: Math.round(avgTimeBetweenReplies * 10) / 10,
      hasEscalationLanguage: hasEscalationLanguage,
      escalationPhrases: __spreadArray([], new Set(allEscalationPhrases), true),
      reasons: reasons,
      messageCount: emails.length,
      threadTimespanHours: Math.round(threadTimespanHours * 10) / 10,
    };
  };
  /**
   * Batch analyze multiple threads
   */
  ThreadVelocityDetector.prototype.analyzeThreads = function (threads) {
    var results = new Map();
    for (var _i = 0, threads_1 = threads; _i < threads_1.length; _i++) {
      var thread = threads_1[_i];
      var result = this.analyzeThread(thread);
      results.set(thread.id, result);
    }
    return results;
  };
  /**
   * Get detection options
   */
  ThreadVelocityDetector.prototype.getOptions = function () {
    return __assign({}, this.options);
  };
  /**
   * Update detection options
   */
  ThreadVelocityDetector.prototype.updateOptions = function (options) {
    this.options = __assign(__assign({}, this.options), options);
  };
  return ThreadVelocityDetector;
})();
exports.ThreadVelocityDetector = ThreadVelocityDetector;
