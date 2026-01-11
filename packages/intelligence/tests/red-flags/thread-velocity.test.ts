import type { StandardEmail, StandardThread } from '@nexus-aec/shared-types';
import {
  ThreadVelocityDetector,
  type ThreadVelocityOptions,
} from '../../src/red-flags/thread-velocity';

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

// Helper to create test thread
function createTestThread(overrides: Partial<StandardThread> = {}): StandardThread {
  return {
    id: 'test-thread-1',
    source: 'GMAIL',
    subject: 'Test Thread',
    participants: [{ email: 'user1@example.com' }, { email: 'user2@example.com' }],
    messageCount: 1,
    messages: [createTestEmail()],
    lastMessageAt: new Date(),
    isRead: false,
    ...overrides,
  };
}

describe('ThreadVelocityDetector', () => {
  describe('Constructor and Configuration', () => {
    it('should create detector with default options', () => {
      const detector = new ThreadVelocityDetector();
      expect(detector).toBeInstanceOf(ThreadVelocityDetector);

      const options = detector.getOptions();
      expect(options.highVelocityWindowHours).toBe(2);
      expect(options.highVelocityThreshold).toBe(4);
    });

    it('should create detector with custom options', () => {
      const customOptions: ThreadVelocityOptions = {
        highVelocityWindowHours: 3,
        highVelocityThreshold: 5,
        escalationLanguageWeight: 0.9,
      };
      const detector = new ThreadVelocityDetector(customOptions);

      const options = detector.getOptions();
      expect(options.highVelocityWindowHours).toBe(3);
      expect(options.highVelocityThreshold).toBe(5);
      expect(options.escalationLanguageWeight).toBe(0.9);
    });

    it('should update options dynamically', () => {
      const detector = new ThreadVelocityDetector();
      detector.updateOptions({ highVelocityThreshold: 10 });

      const options = detector.getOptions();
      expect(options.highVelocityThreshold).toBe(10);
    });
  });

  describe('Reply Frequency Calculation', () => {
    it('should calculate reply frequency for high-velocity thread', () => {
      const now = new Date();
      const emails = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 90 * 60 * 1000) }), // 90 min ago
        createTestEmail({ id: 'msg-2', receivedAt: new Date(now.getTime() - 60 * 60 * 1000) }), // 60 min ago
        createTestEmail({ id: 'msg-3', receivedAt: new Date(now.getTime() - 30 * 60 * 1000) }), // 30 min ago
        createTestEmail({ id: 'msg-4', receivedAt: now }),
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      expect(result.isHighVelocity).toBe(true);
      expect(result.messageCount).toBe(4);
      expect(result.replyFrequency).toBeGreaterThan(0);
      expect(result.reasons.some((r) => r.type === 'high_velocity')).toBe(true);
    });

    it('should calculate average time between replies', () => {
      const now = new Date();
      const emails = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 60 * 60 * 1000) }), // 60 min ago
        createTestEmail({ id: 'msg-2', receivedAt: new Date(now.getTime() - 30 * 60 * 1000) }), // 30 min ago
        createTestEmail({ id: 'msg-3', receivedAt: now }),
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      expect(result.avgTimeBetweenReplies).toBe(30); // Average of 30 min between each
    });

    it('should handle single message thread', () => {
      const emails = [createTestEmail()];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      expect(result.isHighVelocity).toBe(false);
      expect(result.score).toBe(0);
      expect(result.messageCount).toBe(1);
      expect(result.replyFrequency).toBe(0);
    });

    it('should handle empty thread', () => {
      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails([]);

      expect(result.isHighVelocity).toBe(false);
      expect(result.score).toBe(0);
      expect(result.messageCount).toBe(0);
    });
  });

  describe('High Velocity Detection', () => {
    it('should detect high velocity in 2-hour window', () => {
      const now = new Date();
      const emails = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 110 * 60 * 1000) }),
        createTestEmail({ id: 'msg-2', receivedAt: new Date(now.getTime() - 90 * 60 * 1000) }),
        createTestEmail({ id: 'msg-3', receivedAt: new Date(now.getTime() - 60 * 60 * 1000) }),
        createTestEmail({ id: 'msg-4', receivedAt: new Date(now.getTime() - 30 * 60 * 1000) }),
        createTestEmail({ id: 'msg-5', receivedAt: now }),
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      expect(result.isHighVelocity).toBe(true);
      const highVelocity = result.reasons.find((r) => r.type === 'high_velocity');
      expect(highVelocity).toBeDefined();
      expect(highVelocity?.weight).toBe(0.7);
    });

    it('should not detect high velocity when below threshold', () => {
      const now = new Date();
      const emails = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 110 * 60 * 1000) }),
        createTestEmail({ id: 'msg-2', receivedAt: new Date(now.getTime() - 90 * 60 * 1000) }),
        createTestEmail({ id: 'msg-3', receivedAt: now }),
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      const highVelocity = result.reasons.find((r) => r.type === 'high_velocity');
      expect(highVelocity).toBeUndefined();
    });

    it('should use custom high velocity threshold', () => {
      const now = new Date();
      const emails = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 110 * 60 * 1000) }),
        createTestEmail({ id: 'msg-2', receivedAt: now }),
      ];

      const detector = new ThreadVelocityDetector({ highVelocityThreshold: 2 });
      const result = detector.analyzeEmails(emails);

      const highVelocity = result.reasons.find((r) => r.type === 'high_velocity');
      expect(highVelocity).toBeDefined();
    });
  });

  describe('Medium Velocity Detection', () => {
    it('should detect medium velocity in 6-hour window', () => {
      const now = new Date();
      const emails = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 5.5 * 60 * 60 * 1000) }),
        createTestEmail({ id: 'msg-2', receivedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000) }),
        createTestEmail({ id: 'msg-3', receivedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) }),
        createTestEmail({ id: 'msg-4', receivedAt: now }),
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      const mediumVelocity = result.reasons.find((r) => r.type === 'medium_velocity');
      expect(mediumVelocity).toBeDefined();
      expect(mediumVelocity?.weight).toBe(0.5);
    });

    it('should prefer high velocity over medium velocity', () => {
      const now = new Date();
      const emails = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 110 * 60 * 1000) }),
        createTestEmail({ id: 'msg-2', receivedAt: new Date(now.getTime() - 90 * 60 * 1000) }),
        createTestEmail({ id: 'msg-3', receivedAt: new Date(now.getTime() - 60 * 60 * 1000) }),
        createTestEmail({ id: 'msg-4', receivedAt: new Date(now.getTime() - 30 * 60 * 1000) }),
        createTestEmail({ id: 'msg-5', receivedAt: now }),
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      const highVelocity = result.reasons.find((r) => r.type === 'high_velocity');
      const mediumVelocity = result.reasons.find((r) => r.type === 'medium_velocity');

      expect(highVelocity).toBeDefined();
      expect(mediumVelocity).toBeUndefined();
    });
  });

  describe('Rapid Back-and-Forth Detection', () => {
    it('should detect rapid back-and-forth (< 15 min avg)', () => {
      const now = new Date();
      const emails = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 30 * 60 * 1000) }), // 30 min ago
        createTestEmail({ id: 'msg-2', receivedAt: new Date(now.getTime() - 20 * 60 * 1000) }), // 20 min ago (10 min gap)
        createTestEmail({ id: 'msg-3', receivedAt: new Date(now.getTime() - 10 * 60 * 1000) }), // 10 min ago (10 min gap)
        createTestEmail({ id: 'msg-4', receivedAt: now }), // now (10 min gap)
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      const rapidBackAndForth = result.reasons.find((r) => r.type === 'rapid_back_and_forth');
      expect(rapidBackAndForth).toBeDefined();
      expect(result.avgTimeBetweenReplies).toBe(10);
    });

    it('should require at least 3 messages for rapid back-and-forth', () => {
      const now = new Date();
      const emails = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 5 * 60 * 1000) }),
        createTestEmail({ id: 'msg-2', receivedAt: now }),
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      const rapidBackAndForth = result.reasons.find((r) => r.type === 'rapid_back_and_forth');
      expect(rapidBackAndForth).toBeUndefined();
    });

    it('should not detect rapid back-and-forth for slow threads', () => {
      const now = new Date();
      const emails = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 60 * 60 * 1000) }), // 60 min ago
        createTestEmail({ id: 'msg-2', receivedAt: new Date(now.getTime() - 40 * 60 * 1000) }), // 40 min ago (20 min gap)
        createTestEmail({ id: 'msg-3', receivedAt: now }), // now (40 min gap)
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      const rapidBackAndForth = result.reasons.find((r) => r.type === 'rapid_back_and_forth');
      expect(rapidBackAndForth).toBeUndefined();
    });
  });

  describe('Escalation Language Detection', () => {
    it('should detect "escalate" keyword', () => {
      const email = createTestEmail({
        subject: 'Need to escalate this issue',
        body: 'This problem needs to be escalated to management immediately.',
      });

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails([email, createTestEmail()]);

      expect(result.hasEscalationLanguage).toBe(true);
      expect(result.escalationPhrases.length).toBeGreaterThan(0);
      const escalation = result.reasons.find((r) => r.type === 'escalation_language');
      expect(escalation).toBeDefined();
    });

    it('should detect "looping in management" phrase', () => {
      const email = createTestEmail({
        body: 'Looping in management on this issue.',
      });

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails([email, createTestEmail()]);

      expect(result.hasEscalationLanguage).toBe(true);
    });

    it('should detect "need immediate attention" phrase', () => {
      const email = createTestEmail({
        body: 'This needs immediate attention from the team.',
      });

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails([email, createTestEmail()]);

      expect(result.hasEscalationLanguage).toBe(true);
    });

    it('should detect "code red" phrase', () => {
      const email = createTestEmail({
        subject: 'CODE RED: Production down',
      });

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails([email, createTestEmail()]);

      expect(result.hasEscalationLanguage).toBe(true);
    });

    it('should detect "emergency meeting" phrase', () => {
      const email = createTestEmail({
        body: 'We need to have an emergency meeting about this.',
      });

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails([email, createTestEmail()]);

      expect(result.hasEscalationLanguage).toBe(true);
    });

    it('should detect "stop everything" phrase', () => {
      const email = createTestEmail({
        body: 'Stop everything and focus on this critical issue.',
      });

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails([email, createTestEmail()]);

      expect(result.hasEscalationLanguage).toBe(true);
    });

    it('should not detect escalation in normal emails', () => {
      const email = createTestEmail({
        subject: 'Weekly sync meeting',
        body: 'Looking forward to our regular meeting this week.',
      });

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails([email, createTestEmail()]);

      expect(result.hasEscalationLanguage).toBe(false);
      expect(result.escalationPhrases).toHaveLength(0);
    });

    it('should deduplicate escalation phrases', () => {
      const email1 = createTestEmail({
        id: 'msg-1',
        body: 'Need to escalate this issue.',
      });
      const email2 = createTestEmail({
        id: 'msg-2',
        body: 'Still need to escalate this.',
      });

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails([email1, email2]);

      // Should deduplicate "escalate"
      const escalateCount = result.escalationPhrases.filter((p) => p.includes('escalat')).length;
      expect(escalateCount).toBe(1);
    });
  });

  describe('Combined Scoring', () => {
    it('should combine velocity and escalation signals', () => {
      const now = new Date();
      const emails = [
        createTestEmail({
          id: 'msg-1',
          receivedAt: new Date(now.getTime() - 110 * 60 * 1000),
          subject: 'Issue report',
        }),
        createTestEmail({
          id: 'msg-2',
          receivedAt: new Date(now.getTime() - 90 * 60 * 1000),
          subject: 'RE: Issue report',
        }),
        createTestEmail({
          id: 'msg-3',
          receivedAt: new Date(now.getTime() - 60 * 60 * 1000),
          subject: 'RE: Issue report',
          body: 'Need to escalate this immediately!',
        }),
        createTestEmail({
          id: 'msg-4',
          receivedAt: new Date(now.getTime() - 30 * 60 * 1000),
          subject: 'RE: Issue report',
        }),
        createTestEmail({
          id: 'msg-5',
          receivedAt: now,
          subject: 'RE: Issue report',
        }),
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      expect(result.isHighVelocity).toBe(true);
      expect(result.hasEscalationLanguage).toBe(true);
      expect(result.score).toBe(1.0); // Multiple signals combined
      expect(result.reasons.length).toBeGreaterThan(1);
    });

    it('should cap score at 1.0', () => {
      const now = new Date();
      const emails = [
        createTestEmail({
          id: 'msg-1',
          receivedAt: new Date(now.getTime() - 15 * 60 * 1000),
          body: 'Code red! Emergency meeting! Escalating to CEO!',
        }),
        createTestEmail({
          id: 'msg-2',
          receivedAt: new Date(now.getTime() - 10 * 60 * 1000),
        }),
        createTestEmail({
          id: 'msg-3',
          receivedAt: new Date(now.getTime() - 5 * 60 * 1000),
        }),
        createTestEmail({ id: 'msg-4', receivedAt: now }),
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      expect(result.score).toBeLessThanOrEqual(1.0);
    });

    it('should use 0.6 threshold for isHighVelocity flag', () => {
      const now = new Date();
      const emails = [
        createTestEmail({
          id: 'msg-1',
          receivedAt: new Date(now.getTime() - 5.5 * 60 * 60 * 1000),
        }),
        createTestEmail({
          id: 'msg-2',
          receivedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
          body: 'This is critical and needs immediate attention.',
        }),
        createTestEmail({
          id: 'msg-3',
          receivedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        }),
        createTestEmail({ id: 'msg-4', receivedAt: now }),
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      // Medium velocity (0.5) + part of escalation (0.8) should exceed 0.6
      expect(result.score).toBeGreaterThanOrEqual(0.6);
      expect(result.isHighVelocity).toBe(true);
    });
  });

  describe('Thread Analysis', () => {
    it('should analyze StandardThread', () => {
      const now = new Date();
      const messages = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 110 * 60 * 1000) }),
        createTestEmail({ id: 'msg-2', receivedAt: new Date(now.getTime() - 90 * 60 * 1000) }),
        createTestEmail({ id: 'msg-3', receivedAt: new Date(now.getTime() - 60 * 60 * 1000) }),
        createTestEmail({ id: 'msg-4', receivedAt: now }),
      ];

      const thread = createTestThread({ messages });

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeThread(thread);

      expect(result.messageCount).toBe(4);
      expect(result.isHighVelocity).toBe(true);
    });

    it('should calculate thread timespan', () => {
      const now = new Date();
      const emails = [
        createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000) }),
        createTestEmail({ id: 'msg-2', receivedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000) }),
        createTestEmail({ id: 'msg-3', receivedAt: now }),
      ];

      const detector = new ThreadVelocityDetector();
      const result = detector.analyzeEmails(emails);

      expect(result.threadTimespanHours).toBe(6);
    });
  });

  describe('Batch Analysis', () => {
    it('should analyze multiple threads', () => {
      const now = new Date();

      const thread1 = createTestThread({
        id: 'thread-1',
        messages: [
          createTestEmail({ id: 'msg-1', receivedAt: new Date(now.getTime() - 110 * 60 * 1000) }),
          createTestEmail({ id: 'msg-2', receivedAt: new Date(now.getTime() - 90 * 60 * 1000) }),
          createTestEmail({ id: 'msg-3', receivedAt: new Date(now.getTime() - 60 * 60 * 1000) }),
          createTestEmail({ id: 'msg-4', receivedAt: now }),
        ],
      });

      const thread2 = createTestThread({
        id: 'thread-2',
        messages: [
          createTestEmail({ id: 'msg-5', receivedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }),
          createTestEmail({ id: 'msg-6', receivedAt: now }),
        ],
      });

      const detector = new ThreadVelocityDetector();
      const results = detector.analyzeThreads([thread1, thread2]);

      expect(results.size).toBe(2);
      expect(results.get('thread-1')?.isHighVelocity).toBe(true);
      expect(results.get('thread-2')?.isHighVelocity).toBe(false);
    });

    it('should handle empty thread list', () => {
      const detector = new ThreadVelocityDetector();
      const results = detector.analyzeThreads([]);

      expect(results.size).toBe(0);
    });
  });
});
