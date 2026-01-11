/**
 * Severity level for red flag patterns
 */
export enum Severity {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Category of red flag pattern
 */
export enum RedFlagCategory {
  URGENCY = 'urgency',
  INCIDENT = 'incident',
  DEADLINE = 'deadline',
  ESCALATION = 'escalation',
  VIP = 'vip',
  OUTAGE = 'outage',
  EMERGENCY = 'emergency',
}

/**
 * Context fields where pattern should be matched
 */
export type ContextField = 'subject' | 'body' | 'sender';

/**
 * Pattern type indicator
 */
export enum PatternType {
  KEYWORD = 'keyword',
  REGEX = 'regex',
}

/**
 * Red flag pattern definition
 */
export interface RedFlagPattern {
  /**
   * Unique identifier for this pattern
   */
  id: string;

  /**
   * Pattern to match (string for exact/keyword, RegExp for regex)
   */
  pattern: string | RegExp;

  /**
   * Type of pattern (keyword or regex)
   */
  type: PatternType;

  /**
   * Severity level of this red flag
   */
  severity: Severity;

  /**
   * Weight for scoring (0.0-1.0)
   * Used in composite scoring algorithm
   */
  weight: number;

  /**
   * Category this pattern belongs to
   */
  category: RedFlagCategory;

  /**
   * Which email fields this pattern should be checked against
   */
  contextFields: ContextField[];

  /**
   * Human-readable description of what this pattern detects
   */
  description: string;

  /**
   * Whether this pattern is case-sensitive (default: false)
   */
  caseSensitive?: boolean;
}

/**
 * Result of pattern matching
 */
export interface PatternMatch {
  /**
   * Pattern that matched
   */
  pattern: RedFlagPattern;

  /**
   * Field where match occurred
   */
  field: ContextField;

  /**
   * Matched text
   */
  matchedText: string;

  /**
   * Position in text (for regex matches)
   */
  position?: number;
}
