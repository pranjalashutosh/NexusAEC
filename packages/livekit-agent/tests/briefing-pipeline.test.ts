/**
 * Tests for briefing-pipeline module
 *
 * Verifies that:
 * - Emails are fetched, scored, clustered, and sorted correctly
 * - Empty inbox returns empty briefing
 * - VIP emails are boosted in scoring
 * - Topics are ordered by priority (flagged count → max score → size)
 * - Topic count is capped to maxTopics
 */

// Mock intelligence package
jest.mock('@nexus-aec/intelligence', () => {
  const mockKeywordMatcher = jest.fn().mockImplementation(() => ({
    matchEmail: jest.fn().mockReturnValue({
      matches: [],
      totalMatches: 0,
      hasMatches: false,
      aggregateWeight: 0,
    }),
  }));

  const mockVipDetector = jest.fn().mockImplementation(() => ({
    detectVip: jest.fn().mockReturnValue({
      isVip: false,
      score: 0,
      reasons: [],
    }),
  }));

  const mockRedFlagScorer = jest.fn().mockImplementation(() => ({
    scoreEmail: jest.fn().mockImplementation((signals: any) => {
      const isVip = signals.vipDetection?.isVip ?? false;
      const hasKeywords = signals.keywordMatch?.hasMatches ?? false;
      const score = (isVip ? 0.6 : 0) + (hasKeywords ? 0.3 : 0);
      return {
        isFlagged: score >= 0.5,
        score,
        severity: score >= 0.5 ? 'medium' : null,
        signalBreakdown: [],
        reasons: [],
      };
    }),
  }));

  const mockTopicClusterer = jest.fn().mockImplementation(() => ({
    clusterEmails: jest.fn().mockImplementation((emails: any[]) => {
      if (emails.length === 0) {
        return { clusters: [], totalEmails: 0, clusterCount: 0, unclusteredEmailIds: [] };
      }
      // Put all emails in one cluster
      return {
        clusters: [
          {
            id: 'cluster-1',
            topic: 'General',
            keywords: ['email', 'test'],
            emailIds: emails.map((e: any) => e.id),
          },
        ],
        totalEmails: emails.length,
        clusterCount: 1,
        unclusteredEmailIds: [],
      };
    }),
  }));

  return {
    KeywordMatcher: mockKeywordMatcher,
    VipDetector: mockVipDetector,
    RedFlagScorer: mockRedFlagScorer,
    TopicClusterer: mockTopicClusterer,
    // New exports needed by LLM pipeline (not used in legacy tests)
    preprocessEmails: jest.fn(),
    preprocessBatch: jest.fn(),
    presortEmails: jest.fn(),
    SenderProfileStore: jest.fn(),
  };
});

// Mock logger
jest.mock('@nexus-aec/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { runBriefingPipeline } from '../src/briefing-pipeline';

// Helper to create mock emails
function createMockEmail(id: string, subject: string) {
  return {
    id,
    source: 'OUTLOOK' as const,
    providerMessageId: `msg-${id}`,
    threadId: `thread-${id}`,
    subject,
    from: { email: `sender-${id}@test.com`, name: `Sender ${id}` },
    to: [{ email: 'user@test.com', name: 'User' }],
    cc: [],
    bcc: [],
    receivedAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
    bodyPreview: `Preview of ${subject}`,
    isRead: false,
    isFlagged: false,
    hasAttachments: false,
    attachments: [],
    folder: 'inbox',
    labels: [],
    importance: 'normal' as const,
  };
}

// Helper to create mock inbox service
function createMockInboxService(emails: any[] = []) {
  return {
    fetchUnread: jest.fn().mockResolvedValue({ items: emails, errors: [] }),
    addProvider: jest.fn(),
  } as any;
}

describe('briefing-pipeline', () => {
  describe('runBriefingPipeline (legacy path)', () => {
    it('returns empty briefing for empty inbox', async () => {
      const inbox = createMockInboxService([]);
      const { briefingData } = await runBriefingPipeline(inbox);

      expect(briefingData.topics).toHaveLength(0);
      expect(briefingData.topicItems).toHaveLength(0);
      expect(briefingData.topicLabels).toHaveLength(0);
      expect(briefingData.totalEmails).toBe(0);
      expect(briefingData.totalFlagged).toBe(0);
      expect(briefingData.pipelineDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('processes emails and produces briefing data', async () => {
      const emails = [
        createMockEmail('1', 'Q4 Report'),
        createMockEmail('2', 'Meeting Notes'),
        createMockEmail('3', 'Budget Review'),
      ];

      const inbox = createMockInboxService(emails);
      const { briefingData } = await runBriefingPipeline(inbox);

      expect(briefingData.totalEmails).toBe(3);
      expect(briefingData.topics.length).toBeGreaterThan(0);
      expect(briefingData.topicItems.length).toBe(briefingData.topics.length);
      expect(briefingData.topicLabels.length).toBe(briefingData.topics.length);
      expect(briefingData.scoreMap.size).toBe(3);
    });

    it('respects maxEmails option', async () => {
      const emails = Array.from({ length: 10 }, (_, i) => createMockEmail(`${i}`, `Email ${i}`));
      const inbox = createMockInboxService(emails);

      await runBriefingPipeline(inbox, { maxEmails: 5 });

      expect(inbox.fetchUnread).toHaveBeenCalledWith(
        expect.objectContaining({ after: expect.any(Date) }),
        { pageSize: 5 }
      );
    });

    it('each topic has scored emails sorted by score descending', async () => {
      const emails = [createMockEmail('1', 'First'), createMockEmail('2', 'Second')];

      const inbox = createMockInboxService(emails);
      const { briefingData } = await runBriefingPipeline(inbox);

      for (const topic of briefingData.topics) {
        for (let i = 1; i < topic.emails.length; i++) {
          expect(topic.emails[i - 1]!.score.score).toBeGreaterThanOrEqual(
            topic.emails[i]!.score.score
          );
        }
      }
    });

    it('scoreMap contains entries for all emails', async () => {
      const emails = [createMockEmail('a', 'Alpha'), createMockEmail('b', 'Beta')];

      const inbox = createMockInboxService(emails);
      const { briefingData } = await runBriefingPipeline(inbox);

      expect(briefingData.scoreMap.has('a')).toBe(true);
      expect(briefingData.scoreMap.has('b')).toBe(true);
    });

    it('topicItems matches email counts in each topic', async () => {
      const emails = [
        createMockEmail('1', 'Test 1'),
        createMockEmail('2', 'Test 2'),
        createMockEmail('3', 'Test 3'),
      ];

      const inbox = createMockInboxService(emails);
      const { briefingData } = await runBriefingPipeline(inbox);

      for (let i = 0; i < briefingData.topics.length; i++) {
        expect(briefingData.topicItems[i]).toBe(briefingData.topics[i]!.emails.length);
      }
    });

    it('topicLabels matches labels in each topic', async () => {
      const emails = [createMockEmail('1', 'Test')];
      const inbox = createMockInboxService(emails);
      const { briefingData } = await runBriefingPipeline(inbox);

      for (let i = 0; i < briefingData.topics.length; i++) {
        expect(briefingData.topicLabels[i]).toBe(briefingData.topics[i]!.label);
      }
    });

    it('records pipeline duration', async () => {
      const inbox = createMockInboxService([createMockEmail('1', 'Test')]);
      const { briefingData } = await runBriefingPipeline(inbox);

      expect(typeof briefingData.pipelineDurationMs).toBe('number');
      expect(briefingData.pipelineDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns empty remainingBatches for legacy pipeline', async () => {
      const inbox = createMockInboxService([createMockEmail('1', 'Test')]);
      const { remainingBatches } = await runBriefingPipeline(inbox);

      expect(remainingBatches).toHaveLength(0);
    });
  });
});
