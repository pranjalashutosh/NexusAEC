/**
 * @nexus-aec/logger
 *
 * Structured logging utility with PII filtering.
 * Ensures no personally identifiable information is logged.
 */

import { createHash } from 'crypto';

// =============================================================================
// Types
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  /** Unique request/session ID for tracing */
  requestId?: string;
  /** User ID (will be hashed, not stored in plain text) */
  userId?: string;
  /** Component/module name */
  component?: string;
  /** Additional context data */
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerOptions {
  /** Minimum log level to output (default: 'info') */
  minLevel?: LogLevel;
  /** Whether to include timestamps (default: true) */
  includeTimestamps?: boolean;
  /** Whether to output in JSON format (default: false in dev, true in prod) */
  jsonFormat?: boolean;
  /** Custom PII patterns to filter */
  piiPatterns?: RegExp[];
  /** Whether to redact stack traces (default: false) */
  redactStackTraces?: boolean;
  /** Base context to include in all log entries */
  baseContext?: LogContext;
  /** Custom output function (default: console) */
  output?: (entry: LogEntry) => void;
}

export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | null, context?: LogContext): void;
  fatal(message: string, error?: Error | null, context?: LogContext): void;

  /** Create a child logger with additional context */
  child(context: LogContext): ILogger;

  /** Set the minimum log level */
  setLevel(level: LogLevel): void;

  /** Get the current log level */
  getLevel(): LogLevel;
}

// =============================================================================
// Constants
// =============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/**
 * Default PII patterns that will be filtered from logs
 */
export const DEFAULT_PII_PATTERNS: RegExp[] = [
  // Email addresses
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  // Phone numbers (various formats)
  /\b(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
  // SSN (US Social Security Number)
  /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
  // Credit card numbers (basic pattern)
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  // IP addresses (IPv4)
  /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  // API keys / tokens (common patterns)
  /\b(api[_-]?key|token|bearer|authorization)[=:\s]+[a-zA-Z0-9_-]{20,}\b/gi,
  // AWS access keys
  /\b(AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
  // Generic secrets
  /\b(password|secret|private[_-]?key)[=:\s]+\S+/gi,
];

const DEFAULT_REDACTION = '[REDACTED]';

// =============================================================================
// PII Filtering
// =============================================================================

/**
 * Filter PII from a string
 * @param text - Text to filter
 * @param patterns - PII patterns to match (defaults to DEFAULT_PII_PATTERNS)
 * @param replacement - Replacement string (default: '[REDACTED]')
 * @returns Filtered text with PII redacted
 */
export function filterPII(
  text: string,
  patterns: RegExp[] = DEFAULT_PII_PATTERNS,
  replacement: string = DEFAULT_REDACTION
): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let filtered = text;
  for (const pattern of patterns) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    filtered = filtered.replace(pattern, replacement);
  }

  return filtered;
}

/**
 * Recursively filter PII from an object
 * @param obj - Object to filter
 * @param patterns - PII patterns to match
 * @param replacement - Replacement string
 * @returns Filtered object
 */
export function filterPIIFromObject(
  obj: unknown,
  patterns: RegExp[] = DEFAULT_PII_PATTERNS,
  replacement: string = DEFAULT_REDACTION
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return filterPII(obj, patterns, replacement);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => filterPIIFromObject(item, patterns, replacement));
  }

  if (typeof obj === 'object') {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Also filter the key name for sensitive field names
      const sensitiveKeys = [
        'password',
        'secret',
        'token',
        'apiKey',
        'authorization',
        'ssn',
        'creditCard',
      ];
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
        filtered[key] = replacement;
      } else {
        filtered[key] = filterPIIFromObject(value, patterns, replacement);
      }
    }
    return filtered;
  }

  return obj;
}

/**
 * Hash a user ID for safe logging
 * Uses SHA-256 and returns first 16 characters
 * @param userId - User ID to hash
 * @returns Hashed user ID (16 characters)
 */
export function hashUserId(userId: string): string {
  if (!userId) {
    return '';
  }
  const hash = createHash('sha256').update(userId).digest('hex');
  return hash.slice(0, 16);
}

// =============================================================================
// Logger Implementation
// =============================================================================

/**
 * Structured logger with PII filtering
 */
export class Logger implements ILogger {
  private minLevel: LogLevel;
  private readonly includeTimestamps: boolean;
  private readonly jsonFormat: boolean;
  private readonly piiPatterns: RegExp[];
  private readonly redactStackTraces: boolean;
  private readonly baseContext: LogContext;
  private readonly output: (entry: LogEntry) => void;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.includeTimestamps = options.includeTimestamps ?? true;
    this.jsonFormat = options.jsonFormat ?? this.detectJsonFormat();
    this.piiPatterns = options.piiPatterns ?? DEFAULT_PII_PATTERNS;
    this.redactStackTraces = options.redactStackTraces ?? false;
    this.baseContext = options.baseContext ?? {};
    this.output = options.output ?? this.defaultOutput.bind(this);
  }

  private detectJsonFormat(): boolean {
    // Use JSON format in production, pretty format in development
    return process.env['NODE_ENV'] === 'production';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) {
      return undefined;
    }

    const sanitized = filterPIIFromObject(context, this.piiPatterns) as LogContext;

    // Hash user ID if present
    if (sanitized.userId && typeof sanitized.userId === 'string') {
      sanitized.userId = hashUserId(sanitized.userId);
    }

    return sanitized;
  }

  private formatError(error: Error): { name: string; message: string; stack?: string } {
    const formatted: { name: string; message: string; stack?: string } = {
      name: error.name,
      message: filterPII(error.message, this.piiPatterns),
    };

    if (error.stack && !this.redactStackTraces) {
      formatted.stack = filterPII(error.stack, this.piiPatterns);
    } else if (error.stack && this.redactStackTraces) {
      formatted.stack = '[STACK TRACE REDACTED]';
    }

    return formatted;
  }

  private createEntry(
    level: LogLevel,
    message: string,
    error?: Error | null,
    context?: LogContext
  ): LogEntry {
    const mergedContext = { ...this.baseContext, ...context };
    const sanitizedContext = this.sanitizeContext(mergedContext);

    const entry: LogEntry = {
      level,
      message: filterPII(message, this.piiPatterns),
      timestamp: this.includeTimestamps ? this.formatTimestamp() : '',
    };

    if (sanitizedContext && Object.keys(sanitizedContext).length > 0) {
      entry.context = sanitizedContext;
    }

    if (error) {
      entry.error = this.formatError(error);
    }

    return entry;
  }

  private defaultOutput(entry: LogEntry): void {
    const { level } = entry;

    if (this.jsonFormat) {
      const output = JSON.stringify(entry);
      this.writeToConsole(level, output);
    } else {
      // Pretty format for development
      const parts: string[] = [];

      if (entry.timestamp) {
        parts.push(`[${entry.timestamp}]`);
      }

      parts.push(`[${level.toUpperCase().padEnd(5)}]`);

      if (entry.context?.component) {
        parts.push(`[${entry.context.component}]`);
      }

      parts.push(entry.message);

      if (entry.context) {
        const contextWithoutComponent = { ...entry.context };
        delete contextWithoutComponent.component;
        if (Object.keys(contextWithoutComponent).length > 0) {
          parts.push(JSON.stringify(contextWithoutComponent));
        }
      }

      const output = parts.join(' ');
      this.writeToConsole(level, output);

      if (entry.error?.stack) {
        this.writeToConsole(level, entry.error.stack);
      }
    }
  }

  private writeToConsole(level: LogLevel, message: string): void {
    switch (level) {
      case 'debug':
        console.debug(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
      case 'fatal':
        console.error(message);
        break;
    }
  }

  private log(level: LogLevel, message: string, error?: Error | null, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.createEntry(level, message, error, context);
    this.output(entry);
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, null, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, null, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, null, context);
  }

  error(message: string, error?: Error | null, context?: LogContext): void {
    this.log('error', message, error, context);
  }

  fatal(message: string, error?: Error | null, context?: LogContext): void {
    this.log('fatal', message, error, context);
  }

  child(context: LogContext): ILogger {
    return new Logger({
      minLevel: this.minLevel,
      includeTimestamps: this.includeTimestamps,
      jsonFormat: this.jsonFormat,
      piiPatterns: this.piiPatterns,
      redactStackTraces: this.redactStackTraces,
      baseContext: { ...this.baseContext, ...context },
      output: this.output,
    });
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  getLevel(): LogLevel {
    return this.minLevel;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a logger instance
 * @param options - Logger configuration options
 * @returns Logger instance
 */
export function createLogger(options?: LoggerOptions): ILogger {
  return new Logger(options);
}

// Default logger instance (singleton)
let defaultLogger: ILogger | null = null;

/**
 * Get the default logger instance
 * Creates one with default options if not already created
 */
export function getLogger(): ILogger {
  if (!defaultLogger) {
    defaultLogger = createLogger();
  }
  return defaultLogger;
}

/**
 * Set the default logger instance
 * Useful for configuring the logger at application startup
 */
export function setDefaultLogger(logger: ILogger): void {
  defaultLogger = logger;
}

/**
 * Reset the default logger (primarily for testing)
 */
export function resetDefaultLogger(): void {
  defaultLogger = null;
}

// =============================================================================
// Convenience Exports
// =============================================================================

// Export a pre-configured logger for quick use
export const logger = getLogger();
