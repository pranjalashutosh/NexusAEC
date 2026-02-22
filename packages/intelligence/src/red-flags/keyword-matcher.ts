import { PatternType } from '../types';
import { DEFAULT_RED_FLAG_PATTERNS } from './default-patterns';

import type { RedFlagPattern, PatternMatch, ContextField } from '../types';
import type { StandardEmail } from '@nexus-aec/shared-types';

/**
 * Configuration options for keyword matching
 */
export interface KeywordMatcherOptions {
  /**
   * Enable fuzzy matching (default: true)
   */
  enableFuzzyMatching?: boolean;

  /**
   * Fuzzy match threshold (0.0-1.0, lower = more strict)
   * Default: 0.8 (80% similarity required)
   */
  fuzzyMatchThreshold?: number;

  /**
   * Maximum fuzzy match distance (Levenshtein distance)
   * Default: 2
   */
  maxFuzzyDistance?: number;

  /**
   * Patterns to match against (defaults to DEFAULT_RED_FLAG_PATTERNS)
   */
  patterns?: RedFlagPattern[];
}

/**
 * Result of matching an email against patterns
 */
export interface KeywordMatchResult {
  /**
   * All pattern matches found
   */
  matches: PatternMatch[];

  /**
   * Total match count
   */
  totalMatches: number;

  /**
   * Has any matches
   */
  hasMatches: boolean;

  /**
   * Aggregate weight (sum of all matched pattern weights)
   */
  aggregateWeight: number;
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create a 2D array to store distances
  const matrix = Array.from({ length: len1 + 1 }, () => Array.from({ length: len2 + 1 }, () => 0));

  // Initialize first column and row
  for (let i = 0; i <= len1; i++) {
    const row = matrix[i];
    if (row) {
      row[0] = i;
    }
  }
  for (let j = 0; j <= len2; j++) {
    const firstRow = matrix[0];
    if (firstRow) {
      firstRow[j] = j;
    }
  }

  // Calculate distances
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      const currentRow = matrix[i];
      const prevRow = matrix[i - 1];
      if (currentRow && prevRow) {
        const deletion = (prevRow[j] ?? 0) + 1;
        const insertion = (currentRow[j - 1] ?? 0) + 1;
        const substitution = (prevRow[j - 1] ?? 0) + cost;
        currentRow[j] = Math.min(deletion, insertion, substitution);
      }
    }
  }

  const lastRow = matrix[len1];
  return lastRow ? (lastRow[len2] ?? 0) : 0;
}

/**
 * Calculate similarity ratio between two strings (0.0-1.0)
 */
function similarityRatio(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) {
    return 1.0;
  }
  return 1 - distance / maxLength;
}

/**
 * Check if text contains pattern with fuzzy matching
 */
function fuzzyMatch(
  text: string,
  pattern: string,
  threshold: number,
  maxDistance: number,
  caseSensitive: boolean
): { matched: boolean; position?: number; matchedText?: string } {
  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();

  // Try exact match first
  const exactIndex = searchText.indexOf(searchPattern);
  if (exactIndex !== -1) {
    return {
      matched: true,
      position: exactIndex,
      matchedText: text.substring(exactIndex, exactIndex + pattern.length),
    };
  }

  // Try fuzzy matching by sliding window
  const words = searchText.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) {
      continue;
    }

    // Check single word
    const distance = levenshteinDistance(word, searchPattern);
    if (distance <= maxDistance) {
      const similarity = similarityRatio(word, searchPattern);
      if (similarity >= threshold) {
        const position = searchText.indexOf(word);
        if (position !== -1) {
          return {
            matched: true,
            position,
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
    const nextWord = words[i + 1];
    if (i < words.length - 1 && nextWord) {
      const twoWords = word + ' ' + nextWord;
      const distance2 = levenshteinDistance(twoWords, searchPattern);
      if (distance2 <= maxDistance) {
        const similarity = similarityRatio(twoWords, searchPattern);
        if (similarity >= threshold) {
          const position = searchText.indexOf(twoWords);
          if (position !== -1) {
            return {
              matched: true,
              position,
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

    const thirdWord = words[i + 2];
    if (i < words.length - 2 && nextWord && thirdWord) {
      const threeWords = word + ' ' + nextWord + ' ' + thirdWord;
      const distance3 = levenshteinDistance(threeWords, searchPattern);
      if (distance3 <= maxDistance) {
        const similarity = similarityRatio(threeWords, searchPattern);
        if (similarity >= threshold) {
          const position = searchText.indexOf(threeWords);
          if (position !== -1) {
            return {
              matched: true,
              position,
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
function extractFieldValue(email: StandardEmail, field: ContextField): string {
  switch (field) {
    case 'subject':
      return email.subject ?? '';
    case 'body':
      return email.body ?? email.snippet ?? '';
    case 'sender':
      return `${email.from.name ?? ''} ${email.from.email}`.trim();
    default:
      return '';
  }
}

/**
 * Match a single pattern against email text
 */
function matchPattern(
  pattern: RedFlagPattern,
  email: StandardEmail,
  options: Required<KeywordMatcherOptions>
): PatternMatch[] {
  const matches: PatternMatch[] = [];
  const caseSensitive = pattern.caseSensitive ?? false;

  // Check each context field
  for (const field of pattern.contextFields) {
    const fieldValue = extractFieldValue(email, field);
    if (!fieldValue) {
      continue;
    }

    if (pattern.type === PatternType.KEYWORD) {
      // Keyword matching
      const keyword = pattern.pattern as string;
      const searchText = caseSensitive ? fieldValue : fieldValue.toLowerCase();
      const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();

      // Try exact match first
      const exactIndex = searchText.indexOf(searchKeyword);
      if (exactIndex !== -1) {
        matches.push({
          pattern,
          field,
          matchedText: fieldValue.substring(exactIndex, exactIndex + keyword.length),
          position: exactIndex,
        });
        continue;
      }

      // Try fuzzy match if enabled
      if (options.enableFuzzyMatching) {
        const fuzzyResult = fuzzyMatch(
          fieldValue,
          keyword,
          options.fuzzyMatchThreshold,
          options.maxFuzzyDistance,
          caseSensitive
        );

        if (fuzzyResult.matched) {
          const match: PatternMatch = {
            pattern,
            field,
            matchedText: fuzzyResult.matchedText ?? keyword,
          };
          if (fuzzyResult.position !== undefined) {
            match.position = fuzzyResult.position;
          }
          matches.push(match);
        }
      }
    } else if (pattern.type === PatternType.REGEX) {
      // Regex matching
      const regex = pattern.pattern as RegExp;
      const regexMatch = regex.exec(fieldValue);

      if (regexMatch) {
        matches.push({
          pattern,
          field,
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
export class KeywordMatcher {
  private options: Required<KeywordMatcherOptions>;

  constructor(options: KeywordMatcherOptions = {}) {
    this.options = {
      enableFuzzyMatching: options.enableFuzzyMatching ?? true,
      fuzzyMatchThreshold: options.fuzzyMatchThreshold ?? 0.8,
      maxFuzzyDistance: options.maxFuzzyDistance ?? 2,
      patterns: options.patterns ?? DEFAULT_RED_FLAG_PATTERNS,
    };
  }

  /**
   * Match an email against all configured patterns
   */
  matchEmail(email: StandardEmail): KeywordMatchResult {
    const allMatches: PatternMatch[] = [];

    for (const pattern of this.options.patterns) {
      const matches = matchPattern(pattern, email, this.options);
      allMatches.push(...matches);
    }

    // Calculate aggregate weight (avoid double-counting same pattern)
    const uniquePatternIds = new Set(allMatches.map((m) => m.pattern.id));
    const aggregateWeight = Array.from(uniquePatternIds).reduce((sum, patternId) => {
      const pattern = this.options.patterns.find((p) => p.id === patternId);
      return sum + (pattern?.weight ?? 0);
    }, 0);

    return {
      matches: allMatches,
      totalMatches: allMatches.length,
      hasMatches: allMatches.length > 0,
      aggregateWeight,
    };
  }

  /**
   * Match an email against specific patterns
   */
  matchEmailWithPatterns(email: StandardEmail, patterns: RedFlagPattern[]): KeywordMatchResult {
    const allMatches: PatternMatch[] = [];

    for (const pattern of patterns) {
      const matches = matchPattern(pattern, email, this.options);
      allMatches.push(...matches);
    }

    // Calculate aggregate weight
    const uniquePatternIds = new Set(allMatches.map((m) => m.pattern.id));
    const aggregateWeight = Array.from(uniquePatternIds).reduce((sum, patternId) => {
      const pattern = patterns.find((p) => p.id === patternId);
      return sum + (pattern?.weight ?? 0);
    }, 0);

    return {
      matches: allMatches,
      totalMatches: allMatches.length,
      hasMatches: allMatches.length > 0,
      aggregateWeight,
    };
  }

  /**
   * Get configured patterns
   */
  getPatterns(): RedFlagPattern[] {
    return this.options.patterns;
  }

  /**
   * Update patterns
   */
  setPatterns(patterns: RedFlagPattern[]): void {
    this.options.patterns = patterns;
  }

  /**
   * Add custom patterns to existing patterns
   */
  addPatterns(patterns: RedFlagPattern[]): void {
    this.options.patterns = [...this.options.patterns, ...patterns];
  }
}
