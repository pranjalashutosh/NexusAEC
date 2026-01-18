"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeywordMatcher = void 0;
var types_1 = require("../types");
var default_patterns_1 = require("./default-patterns");
/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching
 */
function levenshteinDistance(str1, str2) {
    var _a, _b, _c, _d;
    var len1 = str1.length;
    var len2 = str2.length;
    // Create a 2D array to store distances
    var matrix = Array.from({ length: len1 + 1 }, function () {
        return Array.from({ length: len2 + 1 }, function () { return 0; });
    });
    // Initialize first column and row
    for (var i = 0; i <= len1; i++) {
        var row = matrix[i];
        if (row) {
            row[0] = i;
        }
    }
    for (var j = 0; j <= len2; j++) {
        var firstRow = matrix[0];
        if (firstRow) {
            firstRow[j] = j;
        }
    }
    // Calculate distances
    for (var i = 1; i <= len1; i++) {
        for (var j = 1; j <= len2; j++) {
            var cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            var currentRow = matrix[i];
            var prevRow = matrix[i - 1];
            if (currentRow && prevRow) {
                var deletion = ((_a = prevRow[j]) !== null && _a !== void 0 ? _a : 0) + 1;
                var insertion = ((_b = currentRow[j - 1]) !== null && _b !== void 0 ? _b : 0) + 1;
                var substitution = ((_c = prevRow[j - 1]) !== null && _c !== void 0 ? _c : 0) + cost;
                currentRow[j] = Math.min(deletion, insertion, substitution);
            }
        }
    }
    var lastRow = matrix[len1];
    return lastRow ? ((_d = lastRow[len2]) !== null && _d !== void 0 ? _d : 0) : 0;
}
/**
 * Calculate similarity ratio between two strings (0.0-1.0)
 */
function similarityRatio(str1, str2) {
    var distance = levenshteinDistance(str1, str2);
    var maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) {
        return 1.0;
    }
    return 1 - distance / maxLength;
}
/**
 * Check if text contains pattern with fuzzy matching
 */
function fuzzyMatch(text, pattern, threshold, maxDistance, caseSensitive) {
    var searchText = caseSensitive ? text : text.toLowerCase();
    var searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
    // Try exact match first
    var exactIndex = searchText.indexOf(searchPattern);
    if (exactIndex !== -1) {
        return {
            matched: true,
            position: exactIndex,
            matchedText: text.substring(exactIndex, exactIndex + pattern.length),
        };
    }
    // Try fuzzy matching by sliding window
    var words = searchText.split(/\s+/);
    for (var i = 0; i < words.length; i++) {
        var word = words[i];
        if (!word) {
            continue;
        }
        // Check single word
        var distance = levenshteinDistance(word, searchPattern);
        if (distance <= maxDistance) {
            var similarity = similarityRatio(word, searchPattern);
            if (similarity >= threshold) {
                var position = searchText.indexOf(word);
                if (position !== -1) {
                    return {
                        matched: true,
                        position: position,
                        matchedText: text.substring(position, position + word.length),
                    };
                }
                return {
                    matched: true,
                    matchedText: word,
                };
            }
        }
        // Check multi-word combinations (up to 3 words)
        var nextWord = words[i + 1];
        if (i < words.length - 1 && nextWord) {
            var twoWords = word + ' ' + nextWord;
            var distance2 = levenshteinDistance(twoWords, searchPattern);
            if (distance2 <= maxDistance) {
                var similarity = similarityRatio(twoWords, searchPattern);
                if (similarity >= threshold) {
                    var position = searchText.indexOf(twoWords);
                    if (position !== -1) {
                        return {
                            matched: true,
                            position: position,
                            matchedText: text.substring(position, position + twoWords.length),
                        };
                    }
                    return {
                        matched: true,
                        matchedText: twoWords,
                    };
                }
            }
        }
        var thirdWord = words[i + 2];
        if (i < words.length - 2 && nextWord && thirdWord) {
            var threeWords = word + ' ' + nextWord + ' ' + thirdWord;
            var distance3 = levenshteinDistance(threeWords, searchPattern);
            if (distance3 <= maxDistance) {
                var similarity = similarityRatio(threeWords, searchPattern);
                if (similarity >= threshold) {
                    var position = searchText.indexOf(threeWords);
                    if (position !== -1) {
                        return {
                            matched: true,
                            position: position,
                            matchedText: text.substring(position, position + threeWords.length),
                        };
                    }
                    return {
                        matched: true,
                        matchedText: threeWords,
                    };
                }
            }
        }
    }
    return { matched: false };
}
/**
 * Extract field value from email based on context field
 */
function extractFieldValue(email, field) {
    var _a, _b, _c, _d;
    switch (field) {
        case 'subject':
            return (_a = email.subject) !== null && _a !== void 0 ? _a : '';
        case 'body':
            return (_c = (_b = email.body) !== null && _b !== void 0 ? _b : email.snippet) !== null && _c !== void 0 ? _c : '';
        case 'sender':
            return "".concat((_d = email.from.name) !== null && _d !== void 0 ? _d : '', " ").concat(email.from.email).trim();
        default:
            return '';
    }
}
/**
 * Match a single pattern against email text
 */
function matchPattern(pattern, email, options) {
    var _a, _b;
    var matches = [];
    var caseSensitive = (_a = pattern.caseSensitive) !== null && _a !== void 0 ? _a : false;
    // Check each context field
    for (var _i = 0, _c = pattern.contextFields; _i < _c.length; _i++) {
        var field = _c[_i];
        var fieldValue = extractFieldValue(email, field);
        if (!fieldValue) {
            continue;
        }
        if (pattern.type === types_1.PatternType.KEYWORD) {
            // Keyword matching
            var keyword = pattern.pattern;
            var searchText = caseSensitive ? fieldValue : fieldValue.toLowerCase();
            var searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();
            // Try exact match first
            var exactIndex = searchText.indexOf(searchKeyword);
            if (exactIndex !== -1) {
                matches.push({
                    pattern: pattern,
                    field: field,
                    matchedText: fieldValue.substring(exactIndex, exactIndex + keyword.length),
                    position: exactIndex,
                });
                continue;
            }
            // Try fuzzy match if enabled
            if (options.enableFuzzyMatching) {
                var fuzzyResult = fuzzyMatch(fieldValue, keyword, options.fuzzyMatchThreshold, options.maxFuzzyDistance, caseSensitive);
                if (fuzzyResult.matched) {
                    var match = {
                        pattern: pattern,
                        field: field,
                        matchedText: (_b = fuzzyResult.matchedText) !== null && _b !== void 0 ? _b : keyword,
                    };
                    if (fuzzyResult.position !== undefined) {
                        match.position = fuzzyResult.position;
                    }
                    matches.push(match);
                }
            }
        }
        else if (pattern.type === types_1.PatternType.REGEX) {
            // Regex matching
            var regex = pattern.pattern;
            var regexMatch = regex.exec(fieldValue);
            if (regexMatch) {
                matches.push({
                    pattern: pattern,
                    field: field,
                    matchedText: regexMatch[0],
                    position: regexMatch.index,
                });
            }
        }
    }
    return matches;
}
/**
 * KeywordMatcher class for matching emails against red flag patterns
 *
 * Supports:
 * - Exact keyword matching
 * - Regex pattern matching
 * - Fuzzy matching with configurable threshold
 * - Context-aware matching (subject, body, sender)
 *
 * @example
 * ```typescript
 * const matcher = new KeywordMatcher();
 * const result = matcher.matchEmail(email);
 *
 * if (result.hasMatches) {
 *   console.log(`Found ${result.totalMatches} red flags`);
 *   console.log(`Aggregate weight: ${result.aggregateWeight}`);
 * }
 * ```
 */
var KeywordMatcher = /** @class */ (function () {
    function KeywordMatcher(options) {
        if (options === void 0) { options = {}; }
        var _a, _b, _c, _d;
        this.options = {
            enableFuzzyMatching: (_a = options.enableFuzzyMatching) !== null && _a !== void 0 ? _a : true,
            fuzzyMatchThreshold: (_b = options.fuzzyMatchThreshold) !== null && _b !== void 0 ? _b : 0.8,
            maxFuzzyDistance: (_c = options.maxFuzzyDistance) !== null && _c !== void 0 ? _c : 2,
            patterns: (_d = options.patterns) !== null && _d !== void 0 ? _d : default_patterns_1.DEFAULT_RED_FLAG_PATTERNS,
        };
    }
    /**
     * Match an email against all configured patterns
     */
    KeywordMatcher.prototype.matchEmail = function (email) {
        var _this = this;
        var allMatches = [];
        for (var _i = 0, _a = this.options.patterns; _i < _a.length; _i++) {
            var pattern = _a[_i];
            var matches = matchPattern(pattern, email, this.options);
            allMatches.push.apply(allMatches, matches);
        }
        // Calculate aggregate weight (avoid double-counting same pattern)
        var uniquePatternIds = new Set(allMatches.map(function (m) { return m.pattern.id; }));
        var aggregateWeight = Array.from(uniquePatternIds).reduce(function (sum, patternId) {
            var _a;
            var pattern = _this.options.patterns.find(function (p) { return p.id === patternId; });
            return sum + ((_a = pattern === null || pattern === void 0 ? void 0 : pattern.weight) !== null && _a !== void 0 ? _a : 0);
        }, 0);
        return {
            matches: allMatches,
            totalMatches: allMatches.length,
            hasMatches: allMatches.length > 0,
            aggregateWeight: aggregateWeight,
        };
    };
    /**
     * Match an email against specific patterns
     */
    KeywordMatcher.prototype.matchEmailWithPatterns = function (email, patterns) {
        var allMatches = [];
        for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
            var pattern = patterns_1[_i];
            var matches = matchPattern(pattern, email, this.options);
            allMatches.push.apply(allMatches, matches);
        }
        // Calculate aggregate weight
        var uniquePatternIds = new Set(allMatches.map(function (m) { return m.pattern.id; }));
        var aggregateWeight = Array.from(uniquePatternIds).reduce(function (sum, patternId) {
            var _a;
            var pattern = patterns.find(function (p) { return p.id === patternId; });
            return sum + ((_a = pattern === null || pattern === void 0 ? void 0 : pattern.weight) !== null && _a !== void 0 ? _a : 0);
        }, 0);
        return {
            matches: allMatches,
            totalMatches: allMatches.length,
            hasMatches: allMatches.length > 0,
            aggregateWeight: aggregateWeight,
        };
    };
    /**
     * Get configured patterns
     */
    KeywordMatcher.prototype.getPatterns = function () {
        return this.options.patterns;
    };
    /**
     * Update patterns
     */
    KeywordMatcher.prototype.setPatterns = function (patterns) {
        this.options.patterns = patterns;
    };
    /**
     * Add custom patterns to existing patterns
     */
    KeywordMatcher.prototype.addPatterns = function (patterns) {
        this.options.patterns = __spreadArray(__spreadArray([], this.options.patterns, true), patterns, true);
    };
    return KeywordMatcher;
}());
exports.KeywordMatcher = KeywordMatcher;
