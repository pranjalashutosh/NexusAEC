import type { StandardEmail } from '@nexus-aec/shared-types';
import { KeywordMatcher, type KeywordMatcherOptions } from '../../src/red-flags/keyword-matcher';
import { DEFAULT_RED_FLAG_PATTERNS } from '../../src/red-flags/default-patterns';
import { Severity, RedFlagCategory, PatternType, type RedFlagPattern } from '../../src/types';

// Helper to create test emails
function createTestEmail(overrides: Partial<StandardEmail> = {}): StandardEmail {
  return {
    id: 'test-email-1',
    threadId: 'test-thread-1',
    source: 'GMAIL',
    from: { email: 'sender@example.com', name: 'Test Sender' },
    to: [{ email: 'recipient@example.com', name: 'Test Recipient' }],
    subject: 'Test Subject',
    snippet: 'Test snippet',
    body: 'Test body content',
    receivedAt: new Date(),
    isRead: false,
    isStarred: false,
    labels: [],
    ...overrides,
  };
}

describe('KeywordMatcher', () => {
  describe('Constructor and Configuration', () => {
    it('should create matcher with default options', () => {
      const matcher = new KeywordMatcher();
      expect(matcher).toBeInstanceOf(KeywordMatcher);
      expect(matcher.getPatterns()).toEqual(DEFAULT_RED_FLAG_PATTERNS);
    });

    it('should create matcher with custom patterns', () => {
      const customPattern: RedFlagPattern = {
        id: 'custom-test-pattern',
        pattern: 'custom',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.8,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Custom test pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [customPattern] });
      expect(matcher.getPatterns()).toEqual([customPattern]);
    });

    it('should create matcher with fuzzy matching disabled', () => {
      const matcher = new KeywordMatcher({ enableFuzzyMatching: false });
      expect(matcher).toBeInstanceOf(KeywordMatcher);
    });

    it('should create matcher with custom fuzzy threshold', () => {
      const matcher = new KeywordMatcher({ fuzzyMatchThreshold: 0.9 });
      expect(matcher).toBeInstanceOf(KeywordMatcher);
    });
  });

  describe('Exact Keyword Matching', () => {
    it('should match exact keyword in subject (case-insensitive)', () => {
      const pattern: RedFlagPattern = {
        id: 'test-urgent',
        pattern: 'urgent',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Test urgent pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({ subject: 'This is URGENT please respond' });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(true);
      expect(result.totalMatches).toBe(1);
      expect(result.matches[0].pattern.id).toBe('test-urgent');
      expect(result.matches[0].field).toBe('subject');
      expect(result.matches[0].matchedText).toBe('URGENT');
    });

    it('should match exact keyword in body', () => {
      const pattern: RedFlagPattern = {
        id: 'test-asap',
        pattern: 'asap',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.85,
        category: RedFlagCategory.URGENCY,
        contextFields: ['body'],
        description: 'Test ASAP pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({ body: 'Please respond ASAP to this request' });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(true);
      expect(result.totalMatches).toBe(1);
      expect(result.matches[0].field).toBe('body');
    });

    it('should match exact keyword in sender', () => {
      const pattern: RedFlagPattern = {
        id: 'test-ceo',
        pattern: 'ceo',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.8,
        category: RedFlagCategory.VIP,
        contextFields: ['sender'],
        description: 'Test CEO pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({
        from: { email: 'john@example.com', name: 'John Smith CEO' },
      });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(true);
      expect(result.totalMatches).toBe(1);
      expect(result.matches[0].field).toBe('sender');
    });

    it('should not match when keyword is not present', () => {
      const pattern: RedFlagPattern = {
        id: 'test-urgent',
        pattern: 'urgent',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Test urgent pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({ subject: 'Normal email subject' });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(false);
      expect(result.totalMatches).toBe(0);
      expect(result.matches).toEqual([]);
      expect(result.aggregateWeight).toBe(0);
    });

    it('should handle case-sensitive matching when specified', () => {
      const pattern: RedFlagPattern = {
        id: 'test-case-sensitive',
        pattern: 'URGENT',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Case-sensitive test',
        caseSensitive: true,
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email1 = createTestEmail({ subject: 'This is URGENT' });
      const email2 = createTestEmail({ subject: 'This is urgent' });

      const result1 = matcher.matchEmail(email1);
      const result2 = matcher.matchEmail(email2);

      expect(result1.hasMatches).toBe(true);
      expect(result2.hasMatches).toBe(false);
    });
  });

  describe('Regex Pattern Matching', () => {
    it('should match regex pattern in subject', () => {
      const pattern: RedFlagPattern = {
        id: 'test-high-priority',
        pattern: /\bhigh\s+priority\b/i,
        type: PatternType.REGEX,
        severity: Severity.HIGH,
        weight: 0.85,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Test high priority pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({ subject: 'This is high priority task' });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(true);
      expect(result.totalMatches).toBe(1);
      expect(result.matches[0].matchedText).toBe('high priority');
    });

    it('should match complex regex with groups', () => {
      const pattern: RedFlagPattern = {
        id: 'test-due-date',
        pattern: /\bdue\s+(today|tomorrow|eod)\b/i,
        type: PatternType.REGEX,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.DEADLINE,
        contextFields: ['body'],
        description: 'Test due date pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({ body: 'This task is due today' });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(true);
      expect(result.matches[0].matchedText).toBe('due today');
    });

    it('should not match when regex does not match', () => {
      const pattern: RedFlagPattern = {
        id: 'test-regex',
        pattern: /\bsystem\s+down\b/i,
        type: PatternType.REGEX,
        severity: Severity.HIGH,
        weight: 0.95,
        category: RedFlagCategory.INCIDENT,
        contextFields: ['body'],
        description: 'Test system down',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({ body: 'Everything is working fine' });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(false);
    });
  });

  describe('Fuzzy Matching', () => {
    it('should match with minor typo (fuzzy match)', () => {
      const pattern: RedFlagPattern = {
        id: 'test-urgent',
        pattern: 'urgent',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Test urgent pattern',
      };

      const matcher = new KeywordMatcher({
        patterns: [pattern],
        enableFuzzyMatching: true,
        fuzzyMatchThreshold: 0.8,
        maxFuzzyDistance: 2,
      });

      const email = createTestEmail({ subject: 'This is urget please respond' }); // typo: urget

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(true);
      expect(result.totalMatches).toBe(1);
    });

    it('should not match when typo exceeds threshold', () => {
      const pattern: RedFlagPattern = {
        id: 'test-urgent',
        pattern: 'urgent',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Test urgent pattern',
      };

      const matcher = new KeywordMatcher({
        patterns: [pattern],
        enableFuzzyMatching: true,
        fuzzyMatchThreshold: 0.8,
        maxFuzzyDistance: 1, // Only allow 1 character difference
      });

      const email = createTestEmail({ subject: 'This is urgt please respond' }); // typo: urgt (2 chars off)

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(false);
    });

    it('should not fuzzy match when disabled', () => {
      const pattern: RedFlagPattern = {
        id: 'test-urgent',
        pattern: 'urgent',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Test urgent pattern',
      };

      const matcher = new KeywordMatcher({
        patterns: [pattern],
        enableFuzzyMatching: false,
      });

      const email = createTestEmail({ subject: 'This is urget please respond' });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(false);
    });
  });

  describe('Multiple Matches', () => {
    it('should find multiple matches from same pattern in different fields', () => {
      const pattern: RedFlagPattern = {
        id: 'test-urgent',
        pattern: 'urgent',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject', 'body'],
        description: 'Test urgent pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({
        subject: 'URGENT: Please review',
        body: 'This is urgent, please respond immediately',
      });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(true);
      expect(result.totalMatches).toBe(2); // One in subject, one in body
      expect(result.matches[0].field).toBe('subject');
      expect(result.matches[1].field).toBe('body');
    });

    it('should find matches from multiple different patterns', () => {
      const pattern1: RedFlagPattern = {
        id: 'test-urgent',
        pattern: 'urgent',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Test urgent pattern',
      };

      const pattern2: RedFlagPattern = {
        id: 'test-asap',
        pattern: 'asap',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.85,
        category: RedFlagCategory.URGENCY,
        contextFields: ['body'],
        description: 'Test ASAP pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern1, pattern2] });
      const email = createTestEmail({
        subject: 'URGENT: Please review',
        body: 'Please respond ASAP',
      });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(true);
      expect(result.totalMatches).toBe(2);
      expect(result.aggregateWeight).toBe(0.9 + 0.85); // Sum of both weights
    });

    it('should not double-count weight for same pattern matched multiple times', () => {
      const pattern: RedFlagPattern = {
        id: 'test-urgent',
        pattern: 'urgent',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject', 'body'],
        description: 'Test urgent pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({
        subject: 'URGENT: Please review',
        body: 'This is urgent, please respond',
      });

      const result = matcher.matchEmail(email);

      expect(result.totalMatches).toBe(2);
      expect(result.aggregateWeight).toBe(0.9); // Weight counted only once
    });
  });

  describe('Context Field Matching', () => {
    it('should only check specified context fields', () => {
      const pattern: RedFlagPattern = {
        id: 'test-subject-only',
        pattern: 'urgent',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'], // Only subject
        description: 'Test subject-only pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({
        subject: 'Normal subject',
        body: 'This is urgent, please respond', // Has keyword but not in subject
      });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(false);
    });

    it('should fall back to snippet if body is not available', () => {
      const pattern: RedFlagPattern = {
        id: 'test-body',
        pattern: 'urgent',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['body'],
        description: 'Test body pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({
        body: undefined,
        snippet: 'This is urgent message',
      });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(true);
      expect(result.matches[0].field).toBe('body');
    });

    it('should extract sender field correctly', () => {
      const pattern: RedFlagPattern = {
        id: 'test-sender',
        pattern: 'director',
        type: PatternType.KEYWORD,
        severity: Severity.MEDIUM,
        weight: 0.7,
        category: RedFlagCategory.VIP,
        contextFields: ['sender'],
        description: 'Test sender pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const email = createTestEmail({
        from: { email: 'jane@example.com', name: 'Jane Doe, Director of Engineering' },
      });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(true);
      expect(result.matches[0].field).toBe('sender');
    });
  });

  describe('Pattern Management', () => {
    it('should get configured patterns', () => {
      const pattern: RedFlagPattern = {
        id: 'test-pattern',
        pattern: 'test',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Test pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern] });
      const patterns = matcher.getPatterns();

      expect(patterns).toEqual([pattern]);
    });

    it('should set new patterns', () => {
      const matcher = new KeywordMatcher();
      const initialCount = matcher.getPatterns().length;

      const newPattern: RedFlagPattern = {
        id: 'new-pattern',
        pattern: 'new',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'New pattern',
      };

      matcher.setPatterns([newPattern]);
      const patterns = matcher.getPatterns();

      expect(patterns.length).toBe(1);
      expect(patterns[0].id).toBe('new-pattern');
    });

    it('should add patterns to existing patterns', () => {
      const initialPattern: RedFlagPattern = {
        id: 'initial-pattern',
        pattern: 'initial',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Initial pattern',
      };

      const matcher = new KeywordMatcher({ patterns: [initialPattern] });

      const newPattern: RedFlagPattern = {
        id: 'added-pattern',
        pattern: 'added',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.8,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Added pattern',
      };

      matcher.addPatterns([newPattern]);
      const patterns = matcher.getPatterns();

      expect(patterns.length).toBe(2);
      expect(patterns[0].id).toBe('initial-pattern');
      expect(patterns[1].id).toBe('added-pattern');
    });
  });

  describe('matchEmailWithPatterns', () => {
    it('should match email with specific patterns only', () => {
      const pattern1: RedFlagPattern = {
        id: 'pattern-1',
        pattern: 'urgent',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.9,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Pattern 1',
      };

      const pattern2: RedFlagPattern = {
        id: 'pattern-2',
        pattern: 'asap',
        type: PatternType.KEYWORD,
        severity: Severity.HIGH,
        weight: 0.85,
        category: RedFlagCategory.URGENCY,
        contextFields: ['subject'],
        description: 'Pattern 2',
      };

      const matcher = new KeywordMatcher({ patterns: [pattern1, pattern2] });
      const email = createTestEmail({ subject: 'URGENT and ASAP' });

      // Match with only pattern1
      const result = matcher.matchEmailWithPatterns(email, [pattern1]);

      expect(result.hasMatches).toBe(true);
      expect(result.totalMatches).toBe(1);
      expect(result.matches[0].pattern.id).toBe('pattern-1');
      expect(result.aggregateWeight).toBe(0.9);
    });
  });

  describe('Integration with DEFAULT_RED_FLAG_PATTERNS', () => {
    it('should match default patterns from database', () => {
      const matcher = new KeywordMatcher(); // Uses DEFAULT_RED_FLAG_PATTERNS
      const email = createTestEmail({
        subject: 'URGENT: System outage detected',
        body: 'We have a critical incident that needs immediate attention',
      });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(true);
      expect(result.totalMatches).toBeGreaterThan(0);
      expect(result.aggregateWeight).toBeGreaterThan(0);
    });

    it('should handle email with no red flags', () => {
      const matcher = new KeywordMatcher();
      const email = createTestEmail({
        subject: 'Weekly team sync',
        body: 'Looking forward to our regular meeting this week',
      });

      const result = matcher.matchEmail(email);

      expect(result.hasMatches).toBe(false);
      expect(result.totalMatches).toBe(0);
      expect(result.aggregateWeight).toBe(0);
    });
  });
});
