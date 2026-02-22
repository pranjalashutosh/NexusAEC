/**
 * Unit tests for @nexus-aec/logger
 */

import {
  createLogger,
  getLogger,
  resetDefaultLogger,
  filterPII,
  filterPIIFromObject,
  hashUserId,
  DEFAULT_PII_PATTERNS,
  Logger,
  LogEntry,
  LogLevel,
} from './index';

describe('@nexus-aec/logger', () => {
  beforeEach(() => {
    resetDefaultLogger();
  });

  describe('filterPII', () => {
    it('should filter email addresses', () => {
      const text = 'Contact john.doe@example.com for more info';
      const filtered = filterPII(text);
      expect(filtered).toBe('Contact [REDACTED] for more info');
      expect(filtered).not.toContain('john.doe@example.com');
    });

    it('should filter multiple email addresses', () => {
      const text = 'Send to alice@test.com and bob@company.org';
      const filtered = filterPII(text);
      expect(filtered).toBe('Send to [REDACTED] and [REDACTED]');
    });

    it('should filter phone numbers', () => {
      const text = 'Call me at 555-123-4567 or (555) 987-6543';
      const filtered = filterPII(text);
      expect(filtered).not.toContain('555-123-4567');
      expect(filtered).not.toContain('(555) 987-6543');
    });

    it('should filter SSN', () => {
      const text = 'SSN: 123-45-6789';
      const filtered = filterPII(text);
      expect(filtered).not.toContain('123-45-6789');
    });

    it('should filter credit card numbers', () => {
      const text = 'Card: 4111-1111-1111-1111';
      const filtered = filterPII(text);
      expect(filtered).not.toContain('4111-1111-1111-1111');
    });

    it('should filter IP addresses', () => {
      const text = 'Connected from 192.168.1.100';
      const filtered = filterPII(text);
      expect(filtered).toBe('Connected from [REDACTED]');
    });

    it('should filter API keys', () => {
      const text = 'Using api_key=sk_test_abcdefghij1234567890';
      const filtered = filterPII(text);
      expect(filtered).not.toContain('sk_test_abcdefghij1234567890');
    });

    it('should filter AWS access keys', () => {
      const text = 'AWS key: AKIAIOSFODNN7EXAMPLE';
      const filtered = filterPII(text);
      expect(filtered).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('should handle empty strings', () => {
      expect(filterPII('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(filterPII(null as unknown as string)).toBe(null);
      expect(filterPII(undefined as unknown as string)).toBe(undefined);
    });

    it('should use custom replacement string', () => {
      const text = 'Email: test@example.com';
      const filtered = filterPII(text, DEFAULT_PII_PATTERNS, '***');
      expect(filtered).toBe('Email: ***');
    });

    it('should use custom patterns', () => {
      const customPatterns = [/secret-\d+/g];
      const text = 'The secret-12345 is hidden';
      const filtered = filterPII(text, customPatterns);
      expect(filtered).toBe('The [REDACTED] is hidden');
    });
  });

  describe('filterPIIFromObject', () => {
    it('should filter PII from nested objects', () => {
      const obj = {
        user: {
          email: 'test@example.com',
          name: 'John Doe',
        },
        ip: '192.168.1.1',
      };

      const filtered = filterPIIFromObject(obj) as typeof obj;
      expect(filtered.user.email).toBe('[REDACTED]');
      expect(filtered.user.name).toBe('John Doe');
      expect(filtered.ip).toBe('[REDACTED]');
    });

    it('should filter sensitive field names', () => {
      const obj = {
        username: 'john',
        password: 'secret123',
        apiKey: 'abc123',
        token: 'xyz789',
      };

      const filtered = filterPIIFromObject(obj) as typeof obj;
      expect(filtered.username).toBe('john');
      expect(filtered.password).toBe('[REDACTED]');
      expect(filtered.apiKey).toBe('[REDACTED]');
      expect(filtered.token).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const arr = ['test@example.com', 'normal text', '192.168.1.1'];
      const filtered = filterPIIFromObject(arr) as string[];
      expect(filtered[0]).toBe('[REDACTED]');
      expect(filtered[1]).toBe('normal text');
      expect(filtered[2]).toBe('[REDACTED]');
    });

    it('should handle null and undefined', () => {
      expect(filterPIIFromObject(null)).toBeNull();
      expect(filterPIIFromObject(undefined)).toBeUndefined();
    });

    it('should preserve non-string primitives', () => {
      const obj = {
        count: 42,
        active: true,
        ratio: 3.14,
      };

      const filtered = filterPIIFromObject(obj) as typeof obj;
      expect(filtered.count).toBe(42);
      expect(filtered.active).toBe(true);
      expect(filtered.ratio).toBe(3.14);
    });
  });

  describe('hashUserId', () => {
    it('should hash user ID', () => {
      const userId = 'user-123-abc';
      const hashed = hashUserId(userId);

      expect(hashed).toHaveLength(16);
      expect(hashed).not.toBe(userId);
    });

    it('should produce consistent hashes', () => {
      const userId = 'consistent-user';
      const hash1 = hashUserId(userId);
      const hash2 = hashUserId(userId);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different users', () => {
      const hash1 = hashUserId('user1');
      const hash2 = hashUserId('user2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      expect(hashUserId('')).toBe('');
    });
  });

  describe('createLogger', () => {
    it('should create a logger with default options', () => {
      const logger = createLogger();
      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.fatal).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('should respect minimum log level', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        minLevel: 'warn',
        output: (entry) => entries.push(entry),
      });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(entries).toHaveLength(2);
      expect(entries[0]!.level).toBe('warn');
      expect(entries[1]!.level).toBe('error');
    });

    it('should filter PII from messages', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        output: (entry) => entries.push(entry),
      });

      logger.info('User email is test@example.com');

      expect(entries[0]!.message).toBe('User email is [REDACTED]');
    });

    it('should filter PII from context', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        output: (entry) => entries.push(entry),
      });

      logger.info('User action', {
        email: 'user@example.com',
        action: 'login',
      });

      expect(entries[0]!.context?.email).toBe('[REDACTED]');
      expect(entries[0]!.context?.action).toBe('login');
    });

    it('should hash userId in context', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        output: (entry) => entries.push(entry),
      });

      logger.info('User action', {
        userId: 'user-123-secret',
      });

      expect(entries[0]!.context?.userId).not.toBe('user-123-secret');
      expect(entries[0]!.context?.userId).toHaveLength(16);
    });

    it('should include error information', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        output: (entry) => entries.push(entry),
      });

      const error = new Error('Something went wrong');
      logger.error('Operation failed', error);

      expect(entries[0]!.error).toBeDefined();
      expect(entries[0]!.error?.name).toBe('Error');
      expect(entries[0]!.error?.message).toBe('Something went wrong');
      expect(entries[0]!.error?.stack).toBeDefined();
    });

    it('should filter PII from error messages', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        output: (entry) => entries.push(entry),
      });

      const error = new Error('Failed for user test@example.com');
      logger.error('Operation failed', error);

      expect(entries[0]!.error?.message).toBe('Failed for user [REDACTED]');
    });

    it('should redact stack traces when configured', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        redactStackTraces: true,
        output: (entry) => entries.push(entry),
      });

      const error = new Error('Test error');
      logger.error('Operation failed', error);

      expect(entries[0]!.error?.stack).toBe('[STACK TRACE REDACTED]');
    });

    it('should include timestamps by default', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        output: (entry) => entries.push(entry),
      });

      logger.info('Test message');

      expect(entries[0]!.timestamp).toBeDefined();
      expect(entries[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should allow disabling timestamps', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        includeTimestamps: false,
        output: (entry) => entries.push(entry),
      });

      logger.info('Test message');

      expect(entries[0]!.timestamp).toBe('');
    });
  });

  describe('child logger', () => {
    it('should create child logger with inherited context', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        output: (entry) => entries.push(entry),
      });

      const childLogger = logger.child({ component: 'AuthService', requestId: 'req-123' });
      childLogger.info('Processing request');

      expect(entries[0]!.context?.component).toBe('AuthService');
      expect(entries[0]!.context?.requestId).toBe('req-123');
    });

    it('should allow child to add more context', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        output: (entry) => entries.push(entry),
      });

      const childLogger = logger.child({ component: 'AuthService' });
      childLogger.info('Action', { action: 'login' });

      expect(entries[0]!.context?.component).toBe('AuthService');
      expect(entries[0]!.context?.action).toBe('login');
    });

    it('should inherit log level from parent', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        minLevel: 'warn',
        output: (entry) => entries.push(entry),
      });

      const childLogger = logger.child({ component: 'Test' });
      childLogger.debug('Debug message');
      childLogger.info('Info message');
      childLogger.warn('Warn message');

      expect(entries).toHaveLength(1);
      expect(entries[0]!.level).toBe('warn');
    });
  });

  describe('setLevel/getLevel', () => {
    it('should change log level dynamically', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        minLevel: 'error',
        output: (entry) => entries.push(entry),
      });

      expect(logger.getLevel()).toBe('error');

      logger.info('Should not appear');
      expect(entries).toHaveLength(0);

      logger.setLevel('debug');
      expect(logger.getLevel()).toBe('debug');

      logger.info('Should appear');
      expect(entries).toHaveLength(1);
    });
  });

  describe('getLogger (singleton)', () => {
    it('should return the same instance', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();
      expect(logger1).toBe(logger2);
    });

    it('should reset after resetDefaultLogger', () => {
      const logger1 = getLogger();
      resetDefaultLogger();
      const logger2 = getLogger();
      expect(logger1).not.toBe(logger2);
    });
  });

  describe('log levels', () => {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];

    it.each(levels)('should log at %s level', (level) => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        minLevel: 'debug',
        output: (entry) => entries.push(entry),
      });

      const logMethod = logger[level].bind(logger);
      if (level === 'error' || level === 'fatal') {
        logMethod(`${level} message`, null);
      } else {
        logMethod(`${level} message`);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0]!.level).toBe(level);
      expect(entries[0]!.message).toBe(`${level} message`);
    });
  });

  describe('JSON format', () => {
    it('should output valid JSON when jsonFormat is true', () => {
      let jsonOutput = '';
      const logger = createLogger({
        jsonFormat: true,
        output: (entry) => {
          jsonOutput = JSON.stringify(entry);
        },
      });

      logger.info('Test message', { key: 'value' });

      const parsed = JSON.parse(jsonOutput);
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('Test message');
      expect(parsed.context.key).toBe('value');
    });
  });
});
