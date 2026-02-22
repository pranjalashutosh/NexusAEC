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
exports.TopicClusterer = void 0;
/**
 * Normalize email subject by removing prefixes and extra whitespace
 */
function normalizeSubject(subject) {
  var normalized = subject;
  // Remove common prefixes (case-insensitive, can appear multiple times)
  var prefixes = [/^re:\s*/i, /^fwd?:\s*/i, /^fw:\s*/i, /^\[.*?\]\s*/];
  var changed = true;
  while (changed) {
    changed = false;
    for (var _i = 0, prefixes_1 = prefixes; _i < prefixes_1.length; _i++) {
      var prefix = prefixes_1[_i];
      var before = normalized;
      normalized = normalized.replace(prefix, '');
      if (before !== normalized) {
        changed = true;
      }
    }
  }
  // Normalize whitespace
  normalized = normalized.trim().replace(/\s+/g, ' ');
  return normalized;
}
/**
 * Extract keywords from text (lowercase, alphanumeric words >= 3 chars)
 */
function extractKeywords(text) {
  var words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(function (word) {
      return word.length >= 3;
    });
  // Filter out common stop words
  var stopWords = new Set([
    'the',
    'and',
    'for',
    'are',
    'but',
    'not',
    'you',
    'all',
    'can',
    'her',
    'was',
    'one',
    'our',
    'out',
    'day',
    'get',
    'has',
    'him',
    'his',
    'how',
    'its',
    'may',
    'now',
    'see',
    'than',
    'that',
    'this',
    'will',
    'with',
    'from',
  ]);
  return new Set(
    words.filter(function (word) {
      return !stopWords.has(word);
    })
  );
}
/**
 * Calculate Jaccard similarity between two keyword sets
 */
function calculateSimilarity(set1, set2) {
  if (set1.size === 0 && set2.size === 0) {
    return 1.0; // Both empty = identical
  }
  if (set1.size === 0 || set2.size === 0) {
    return 0.0; // One empty, one not = no similarity
  }
  var intersection = new Set(
    __spreadArray([], set1, true).filter(function (x) {
      return set2.has(x);
    })
  );
  var union = new Set(__spreadArray(__spreadArray([], set1, true), set2, true));
  return intersection.size / union.size;
}
/**
 * Generate unique cluster ID
 */
function generateClusterId(index) {
  return 'cluster-'.concat(index + 1);
}
/**
 * TopicClusterer class for clustering emails by topic/project
 *
 * Provides:
 * - Thread ID-based clustering (primary)
 * - Subject normalization
 * - Semantic similarity clustering
 * - Keyword extraction
 *
 * @example
 * ```typescript
 * const clusterer = new TopicClusterer({
 *   similarityThreshold: 0.5,
 *   useThreadIds: true,
 * });
 *
 * const result = clusterer.clusterEmails(emails);
 * console.log(`Found ${result.clusterCount} topic clusters`);
 *
 * result.clusters.forEach(cluster => {
 *   console.log(`Topic: ${cluster.topic}`);
 *   console.log(`Emails: ${cluster.size}`);
 *   console.log(`Keywords: ${cluster.keywords.join(', ')}`);
 * });
 * ```
 */
var TopicClusterer = /** @class */ (function () {
  function TopicClusterer(options) {
    if (options === void 0) {
      options = {};
    }
    var _a, _b, _c, _d;
    this.options = {
      similarityThreshold: (_a = options.similarityThreshold) !== null && _a !== void 0 ? _a : 0.5,
      useThreadIds: (_b = options.useThreadIds) !== null && _b !== void 0 ? _b : true,
      normalizeSubjects: (_c = options.normalizeSubjects) !== null && _c !== void 0 ? _c : true,
      minClusterSize: (_d = options.minClusterSize) !== null && _d !== void 0 ? _d : 2,
    };
  }
  /**
   * Cluster emails by topic
   */
  TopicClusterer.prototype.clusterEmails = function (emails) {
    var _a, _b, _c, _d, _e, _f;
    if (emails.length === 0) {
      return {
        clusters: [],
        totalEmails: 0,
        clusterCount: 0,
        unclusteredEmailIds: [],
      };
    }
    var emailMap = new Map();
    emails.forEach(function (email) {
      return emailMap.set(email.id, email);
    });
    var clusters = new Map();
    var processedEmails = new Set();
    // Step 1: Thread-based clustering (if enabled)
    if (this.options.useThreadIds) {
      var threadGroups = new Map();
      for (var _i = 0, emails_1 = emails; _i < emails_1.length; _i++) {
        var email = emails_1[_i];
        if (email.threadId) {
          if (!threadGroups.has(email.threadId)) {
            threadGroups.set(email.threadId, new Set());
          }
          (_a = threadGroups.get(email.threadId)) === null || _a === void 0
            ? void 0
            : _a.add(email.id);
        }
      }
      // Convert thread groups to clusters
      for (var _g = 0, _h = threadGroups.entries(); _g < _h.length; _g++) {
        var _j = _h[_g],
          threadId = _j[0],
          emailIds = _j[1];
        if (emailIds.size >= this.options.minClusterSize) {
          clusters.set('thread-'.concat(threadId), emailIds);
          emailIds.forEach(function (id) {
            return processedEmails.add(id);
          });
        }
      }
    }
    // Step 2: Subject-based clustering for remaining emails
    var remainingEmails = emails.filter(function (email) {
      return !processedEmails.has(email.id);
    });
    if (remainingEmails.length > 0) {
      // Group by normalized subject
      var subjectGroups = new Map();
      for (var _k = 0, remainingEmails_1 = remainingEmails; _k < remainingEmails_1.length; _k++) {
        var email = remainingEmails_1[_k];
        var normalized = this.options.normalizeSubjects
          ? normalizeSubject(email.subject)
          : email.subject;
        if (!subjectGroups.has(normalized)) {
          subjectGroups.set(normalized, new Set());
        }
        (_b = subjectGroups.get(normalized)) === null || _b === void 0 ? void 0 : _b.add(email.id);
      }
      // Merge similar subject groups
      var subjectList = Array.from(subjectGroups.keys());
      var merged = new Set();
      var _loop_1 = function (i) {
        var subject1 = subjectList[i];
        if (!subject1 || merged.has(subject1)) {
          return 'continue';
        }
        var keywords1 = extractKeywords(subject1);
        var group1 = subjectGroups.get(subject1);
        if (!group1) {
          return 'continue';
        }
        // Find similar subjects and merge
        for (var j = i + 1; j < subjectList.length; j++) {
          var subject2 = subjectList[j];
          if (!subject2 || merged.has(subject2)) {
            continue;
          }
          var keywords2 = extractKeywords(subject2);
          var similarity = calculateSimilarity(keywords1, keywords2);
          if (similarity >= this_1.options.similarityThreshold) {
            var group2 = subjectGroups.get(subject2);
            if (group2) {
              group2.forEach(function (id) {
                return group1.add(id);
              });
              merged.add(subject2);
            }
          }
        }
        // Add to clusters if meets minimum size
        if (group1.size >= this_1.options.minClusterSize) {
          clusters.set('subject-'.concat(subject1), group1);
          group1.forEach(function (id) {
            return processedEmails.add(id);
          });
        }
      };
      var this_1 = this;
      for (var i = 0; i < subjectList.length; i++) {
        _loop_1(i);
      }
    }
    // Step 3: Build final cluster results
    var finalClusters = [];
    var clusterIndex = 0;
    var _loop_2 = function (_key, emailIds) {
      var emailList = Array.from(emailIds)
        .map(function (id) {
          return emailMap.get(id);
        })
        .filter(function (e) {
          return e !== undefined;
        });
      if (emailList.length === 0) {
        return 'continue';
      }
      // Extract topic from first email
      var firstEmail = emailList[0];
      if (!firstEmail) {
        return 'continue';
      }
      var topic = this_2.options.normalizeSubjects
        ? normalizeSubject(firstEmail.subject)
        : firstEmail.subject;
      // Extract all keywords from cluster
      var allKeywords = new Set();
      emailList.forEach(function (email) {
        var _a, _b;
        var text = ''
          .concat(email.subject, ' ')
          .concat(
            (_b = (_a = email.body) !== null && _a !== void 0 ? _a : email.snippet) !== null &&
              _b !== void 0
              ? _b
              : ''
          );
        var keywords = extractKeywords(text);
        keywords.forEach(function (kw) {
          return allKeywords.add(kw);
        });
      });
      // Get top keywords (by frequency)
      var keywordFreq = new Map();
      emailList.forEach(function (email) {
        var _a, _b;
        var text = ''
          .concat(email.subject, ' ')
          .concat(
            (_b = (_a = email.body) !== null && _a !== void 0 ? _a : email.snippet) !== null &&
              _b !== void 0
              ? _b
              : ''
          );
        var keywords = extractKeywords(text);
        keywords.forEach(function (kw) {
          var _a;
          keywordFreq.set(kw, ((_a = keywordFreq.get(kw)) !== null && _a !== void 0 ? _a : 0) + 1);
        });
      });
      var topKeywords = Array.from(keywordFreq.entries())
        .sort(function (a, b) {
          return b[1] - a[1];
        })
        .slice(0, 5)
        .map(function (_a) {
          var kw = _a[0];
          return kw;
        });
      // Calculate cluster coherence (average pairwise similarity)
      var totalSimilarity = 0;
      var pairCount = 0;
      for (var i = 0; i < emailList.length; i++) {
        for (var j = i + 1; j < emailList.length; j++) {
          var email1 = emailList[i];
          var email2 = emailList[j];
          if (!email1 || !email2) {
            continue;
          }
          var kw1 = extractKeywords(
            ''
              .concat(email1.subject, ' ')
              .concat(
                (_d = (_c = email1.body) !== null && _c !== void 0 ? _c : email1.snippet) !==
                  null && _d !== void 0
                  ? _d
                  : ''
              )
          );
          var kw2 = extractKeywords(
            ''
              .concat(email2.subject, ' ')
              .concat(
                (_f = (_e = email2.body) !== null && _e !== void 0 ? _e : email2.snippet) !==
                  null && _f !== void 0
                  ? _f
                  : ''
              )
          );
          totalSimilarity += calculateSimilarity(kw1, kw2);
          pairCount++;
        }
      }
      var coherence = pairCount > 0 ? totalSimilarity / pairCount : 1.0;
      // Extract unique thread IDs
      var threadIds = Array.from(
        new Set(
          emailList
            .map(function (e) {
              return e.threadId;
            })
            .filter(function (id) {
              return id !== undefined;
            })
        )
      );
      finalClusters.push({
        id: generateClusterId(clusterIndex++),
        topic: topic,
        emailIds: Array.from(emailIds),
        threadIds: threadIds,
        size: emailIds.size,
        keywords: topKeywords,
        coherence: Math.round(coherence * 100) / 100,
      });
    };
    var this_2 = this;
    for (var _l = 0, _m = clusters.entries(); _l < _m.length; _l++) {
      var _o = _m[_l],
        _key = _o[0],
        emailIds = _o[1];
      _loop_2(_key, emailIds);
    }
    // Sort clusters by size (descending)
    finalClusters.sort(function (a, b) {
      return b.size - a.size;
    });
    // Find unclustered emails
    var unclusteredEmailIds = emails
      .filter(function (email) {
        return !processedEmails.has(email.id);
      })
      .map(function (email) {
        return email.id;
      });
    return {
      clusters: finalClusters,
      totalEmails: emails.length,
      clusterCount: finalClusters.length,
      unclusteredEmailIds: unclusteredEmailIds,
    };
  };
  /**
   * Cluster threads by topic
   */
  TopicClusterer.prototype.clusterThreads = function (threads) {
    // Flatten threads to emails for clustering
    var allEmails = threads.flatMap(function (thread) {
      return thread.messages;
    });
    return this.clusterEmails(allEmails);
  };
  /**
   * Get cluster for a specific email
   */
  TopicClusterer.prototype.getClusterForEmail = function (emailId, result) {
    for (var _i = 0, _a = result.clusters; _i < _a.length; _i++) {
      var cluster = _a[_i];
      if (cluster.emailIds.includes(emailId)) {
        return cluster;
      }
    }
    return null;
  };
  /**
   * Get detection options
   */
  TopicClusterer.prototype.getOptions = function () {
    return __assign({}, this.options);
  };
  /**
   * Update detection options
   */
  TopicClusterer.prototype.updateOptions = function (options) {
    this.options = __assign(__assign({}, this.options), options);
  };
  return TopicClusterer;
})();
exports.TopicClusterer = TopicClusterer;
