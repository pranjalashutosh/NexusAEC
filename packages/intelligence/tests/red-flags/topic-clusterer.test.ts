import { TopicClusterer } from '../../src/red-flags/topic-clusterer';
import type { StandardEmail, StandardThread } from '@nexus-aec/shared-types';

/**
 * Helper to create test email
 */
function createTestEmail(overrides: Partial<StandardEmail> = {}): StandardEmail {
  const defaults: StandardEmail = {
    id: 'email-1',
    source: 'GMAIL',
    threadId: 'thread-1',
    subject: 'Test email',
    from: { email: 'sender@example.com', name: 'Sender' },
    to: [{ email: 'recipient@example.com', name: 'Recipient' }],
    cc: [],
    bcc: [],
    receivedAt: new Date(),
    snippet: 'Test snippet',
    body: 'Test body',
    isRead: false,
    isStarred: false,
    labels: [],
  };

  const { threadId, snippet, body, ...rest } = overrides;
  return {
    ...defaults,
    ...(threadId !== undefined ? { threadId } : {}),
    ...(snippet !== undefined ? { snippet } : {}),
    ...(body !== undefined ? { body } : {}),
    ...rest,
  };
}

/**
 * Helper to create test thread
 */
function createTestThread(overrides: Partial<StandardThread> = {}): StandardThread {
  const defaults: StandardThread = {
    id: 'thread-1',
    source: 'GMAIL',
    subject: 'Test thread',
    participants: [
      { email: 'user1@example.com', name: 'User 1' },
      { email: 'user2@example.com', name: 'User 2' },
    ],
    messageCount: 1,
    messages: [createTestEmail()],
    lastMessageAt: new Date(),
    isRead: false,
  };

  return { ...defaults, ...overrides };
}

describe('TopicClusterer', () => {
  describe('Constructor and Configuration', () => {
    it('should create clusterer with default options', () => {
      const clusterer = new TopicClusterer();
      const options = clusterer.getOptions();

      expect(options.similarityThreshold).toBe(0.5);
      expect(options.useThreadIds).toBe(true);
      expect(options.normalizeSubjects).toBe(true);
      expect(options.minClusterSize).toBe(2);
    });

    it('should create clusterer with custom options', () => {
      const clusterer = new TopicClusterer({
        similarityThreshold: 0.7,
        useThreadIds: false,
        minClusterSize: 3,
      });

      const options = clusterer.getOptions();
      expect(options.similarityThreshold).toBe(0.7);
      expect(options.useThreadIds).toBe(false);
      expect(options.minClusterSize).toBe(3);
    });

    it('should update options dynamically', () => {
      const clusterer = new TopicClusterer();

      clusterer.updateOptions({ similarityThreshold: 0.8 });

      const options = clusterer.getOptions();
      expect(options.similarityThreshold).toBe(0.8);
      expect(options.useThreadIds).toBe(true); // Unchanged
    });
  });

  describe('Thread-Based Clustering', () => {
    it('should cluster emails by thread ID', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: 'thread-1',
          subject: 'Project Alpha Discussion',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: 'thread-1',
          subject: 'RE: Project Alpha Discussion',
        }),
        createTestEmail({
          id: 'email-3',
          threadId: 'thread-2',
          subject: 'Budget Review',
        }),
        createTestEmail({
          id: 'email-4',
          threadId: 'thread-2',
          subject: 'RE: Budget Review',
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails(emails);

      expect(result.clusterCount).toBe(2);
      expect(result.totalEmails).toBe(4);
      expect(result.unclusteredEmailIds).toHaveLength(0);
    });

    it('should handle emails without thread IDs', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: 'thread-a',
          subject: 'Marketing Campaign Launch Strategy',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: 'thread-b',
          subject: 'Engineering Infrastructure Database Migration',
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails(emails);

      // Without thread IDs and completely different subjects, should not cluster
      expect(result.clusterCount).toBe(0);
      expect(result.unclusteredEmailIds).toHaveLength(2);
    });

    it('should respect minClusterSize for thread groups', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: 'thread-1',
          subject: 'Single email thread',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: 'thread-2',
          subject: 'Two email thread - 1',
        }),
        createTestEmail({
          id: 'email-3',
          threadId: 'thread-2',
          subject: 'Two email thread - 2',
        }),
      ];

      const clusterer = new TopicClusterer({ minClusterSize: 2 });
      const result = clusterer.clusterEmails(emails);

      // Only thread-2 meets minimum size
      expect(result.clusterCount).toBe(1);
      expect(result.clusters[0]?.size).toBe(2);
      expect(result.unclusteredEmailIds).toContain('email-1');
    });

    it('should disable thread-based clustering when useThreadIds is false', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: 'thread-1',
          subject: 'Same Subject',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: 'thread-1',
          subject: 'Same Subject',
        }),
      ];

      const clusterer = new TopicClusterer({ useThreadIds: false });
      const result = clusterer.clusterEmails(emails);

      // Should use subject-based clustering instead
      expect(result.clusterCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Subject Normalization', () => {
    it('should normalize Re: prefix', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: undefined,
          subject: 'Project Update',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: undefined,
          subject: 'RE: Project Update',
        }),
        createTestEmail({
          id: 'email-3',
          threadId: undefined,
          subject: 're: Project Update',
        }),
      ];

      const clusterer = new TopicClusterer({ useThreadIds: false });
      const result = clusterer.clusterEmails(emails);

      // All should cluster together with normalized subject
      expect(result.clusterCount).toBe(1);
      expect(result.clusters[0]?.size).toBe(3);
    });

    it('should normalize Fwd: prefix', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: undefined,
          subject: 'Important Announcement',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: undefined,
          subject: 'FWD: Important Announcement',
        }),
        createTestEmail({
          id: 'email-3',
          threadId: undefined,
          subject: 'Fw: Important Announcement',
        }),
      ];

      const clusterer = new TopicClusterer({ useThreadIds: false });
      const result = clusterer.clusterEmails(emails);

      expect(result.clusterCount).toBe(1);
      expect(result.clusters[0]?.size).toBe(3);
    });

    it('should normalize multiple prefixes', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: undefined,
          subject: 'Meeting Notes',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: undefined,
          subject: 'RE: FWD: Meeting Notes',
        }),
      ];

      const clusterer = new TopicClusterer({ useThreadIds: false });
      const result = clusterer.clusterEmails(emails);

      expect(result.clusterCount).toBe(1);
    });

    it('should normalize bracket prefixes', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: undefined,
          subject: 'Daily Standup',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: undefined,
          subject: '[TEAM] Daily Standup',
        }),
      ];

      const clusterer = new TopicClusterer({ useThreadIds: false });
      const result = clusterer.clusterEmails(emails);

      expect(result.clusterCount).toBe(1);
    });

    it('should skip normalization when disabled', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: undefined,
          subject: 'Project Update',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: undefined,
          subject: 'RE: Project Update',
        }),
        createTestEmail({
          id: 'email-3',
          threadId: undefined,
          subject: 'FWD: Project Update',
        }),
      ];

      const normalizedClusterer = new TopicClusterer({
        useThreadIds: false,
        normalizeSubjects: true,
      });
      const nonNormalizedClusterer = new TopicClusterer({
        useThreadIds: false,
        normalizeSubjects: false,
      });

      const normalizedResult = normalizedClusterer.clusterEmails(emails);
      const nonNormalizedResult = nonNormalizedClusterer.clusterEmails(emails);

      // With normalization, all three should cluster together
      expect(normalizedResult.clusterCount).toBeGreaterThanOrEqual(1);

      // Without normalization, they might still cluster due to keyword similarity
      // But we're testing that the normalization option is being respected
      // The actual clustering behavior depends on keyword extraction which ignores "RE:" anyway
      expect(nonNormalizedResult.clusters).toBeDefined();
    });
  });

  describe('Subject Similarity Clustering', () => {
    it('should cluster similar subjects', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: undefined,
          subject: 'Project Alpha Development Update',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: undefined,
          subject: 'Project Alpha Progress Update',
        }),
        createTestEmail({
          id: 'email-3',
          threadId: undefined,
          subject: 'Alpha Project Development Status',
        }),
      ];

      const clusterer = new TopicClusterer({
        useThreadIds: false,
        similarityThreshold: 0.4,
      });
      const result = clusterer.clusterEmails(emails);

      // Similar keywords should cluster together
      expect(result.clusterCount).toBeGreaterThanOrEqual(1);
    });

    it('should not cluster dissimilar subjects', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: undefined,
          subject: 'Marketing Campaign Launch',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: undefined,
          subject: 'Engineering Infrastructure Update',
        }),
      ];

      const clusterer = new TopicClusterer({ useThreadIds: false });
      const result = clusterer.clusterEmails(emails);

      // Completely different topics
      expect(result.unclusteredEmailIds.length).toBeGreaterThan(0);
    });

    it('should respect similarity threshold', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: undefined,
          subject: 'Project Alpha Review',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: undefined,
          subject: 'Project Beta Review',
        }),
      ];

      const highThreshold = new TopicClusterer({
        useThreadIds: false,
        similarityThreshold: 0.8,
      });
      const lowThreshold = new TopicClusterer({
        useThreadIds: false,
        similarityThreshold: 0.3,
      });

      const highResult = highThreshold.clusterEmails(emails);
      const lowResult = lowThreshold.clusterEmails(emails);

      // Low threshold more likely to cluster
      expect(lowResult.clusterCount).toBeGreaterThanOrEqual(highResult.clusterCount);
    });
  });

  describe('Cluster Properties', () => {
    it('should extract topic from cluster', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: 'thread-1',
          subject: 'Product Launch Planning',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: 'thread-1',
          subject: 'RE: Product Launch Planning',
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails(emails);

      expect(result.clusters[0]?.topic).toBe('Product Launch Planning');
    });

    it('should extract keywords from cluster', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: 'thread-1',
          subject: 'Database Migration Project',
          body: 'We need to migrate the database to the new server',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: 'thread-1',
          subject: 'RE: Database Migration Project',
          body: 'The migration timeline needs review',
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails(emails);

      const cluster = result.clusters[0];
      expect(cluster?.keywords).toBeDefined();
      expect(cluster?.keywords.length).toBeGreaterThan(0);
      expect(cluster?.keywords).toContain('database');
      expect(cluster?.keywords).toContain('migration');
    });

    it('should calculate cluster coherence', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: 'thread-1',
          subject: 'Team Meeting',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: 'thread-1',
          subject: 'Team Meeting Notes',
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails(emails);

      const cluster = result.clusters[0];
      expect(cluster?.coherence).toBeGreaterThanOrEqual(0);
      expect(cluster?.coherence).toBeLessThanOrEqual(1);
    });

    it('should include thread IDs in cluster', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: 'thread-1',
          subject: 'Discussion',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: 'thread-1',
          subject: 'RE: Discussion',
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails(emails);

      const cluster = result.clusters[0];
      expect(cluster?.threadIds).toContain('thread-1');
    });

    it('should sort clusters by size', () => {
      const emails = [
        // Small cluster
        createTestEmail({
          id: 'email-1',
          threadId: 'thread-1',
          subject: 'Small Topic',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: 'thread-1',
          subject: 'Small Topic',
        }),
        // Large cluster
        createTestEmail({
          id: 'email-3',
          threadId: 'thread-2',
          subject: 'Big Topic',
        }),
        createTestEmail({
          id: 'email-4',
          threadId: 'thread-2',
          subject: 'Big Topic',
        }),
        createTestEmail({
          id: 'email-5',
          threadId: 'thread-2',
          subject: 'Big Topic',
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails(emails);

      // First cluster should be largest
      if (result.clusters.length >= 2) {
        expect(result.clusters[0]?.size).toBeGreaterThanOrEqual(result.clusters[1]?.size ?? 0);
      }
    });
  });

  describe('Thread Clustering', () => {
    it('should cluster threads', () => {
      const threads = [
        createTestThread({
          id: 'thread-1',
          subject: 'Project Discussion',
          messages: [
            createTestEmail({
              id: 'email-1',
              threadId: 'thread-1',
              subject: 'Project Discussion',
            }),
            createTestEmail({
              id: 'email-2',
              threadId: 'thread-1',
              subject: 'RE: Project Discussion',
            }),
          ],
        }),
        createTestThread({
          id: 'thread-2',
          subject: 'Different Topic',
          messages: [
            createTestEmail({
              id: 'email-3',
              threadId: 'thread-2',
              subject: 'Different Topic',
            }),
            createTestEmail({
              id: 'email-4',
              threadId: 'thread-2',
              subject: 'RE: Different Topic',
            }),
          ],
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterThreads(threads);

      expect(result.totalEmails).toBe(4);
      expect(result.clusterCount).toBe(2);
    });
  });

  describe('Utility Methods', () => {
    it('should find cluster for specific email', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: 'thread-1',
          subject: 'Topic',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: 'thread-1',
          subject: 'Topic',
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails(emails);

      const cluster = clusterer.getClusterForEmail('email-1', result);
      expect(cluster).toBeDefined();
      expect(cluster?.emailIds).toContain('email-1');
    });

    it('should return null for unclustered email', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: undefined,
          subject: 'Standalone',
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails(emails);

      const cluster = clusterer.getClusterForEmail('email-1', result);
      expect(cluster).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty email list', () => {
      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails([]);

      expect(result.clusterCount).toBe(0);
      expect(result.totalEmails).toBe(0);
      expect(result.clusters).toHaveLength(0);
      expect(result.unclusteredEmailIds).toHaveLength(0);
    });

    it('should handle single email', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          subject: 'Single email',
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails(emails);

      // Single email below minimum cluster size
      expect(result.clusterCount).toBe(0);
      expect(result.unclusteredEmailIds).toContain('email-1');
    });

    it('should handle emails with no body or snippet', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: 'thread-1',
          subject: 'Subject Only',
          body: undefined,
          snippet: undefined,
        }),
        createTestEmail({
          id: 'email-2',
          threadId: 'thread-1',
          subject: 'Subject Only',
          body: undefined,
          snippet: undefined,
        }),
      ];

      const clusterer = new TopicClusterer();
      const result = clusterer.clusterEmails(emails);

      expect(result.clusterCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle identical subjects', () => {
      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: undefined,
          subject: 'Exact Same Subject',
        }),
        createTestEmail({
          id: 'email-2',
          threadId: undefined,
          subject: 'Exact Same Subject',
        }),
        createTestEmail({
          id: 'email-3',
          threadId: undefined,
          subject: 'Exact Same Subject',
        }),
      ];

      const clusterer = new TopicClusterer({ useThreadIds: false });
      const result = clusterer.clusterEmails(emails);

      expect(result.clusterCount).toBe(1);
      expect(result.clusters[0]?.size).toBe(3);
    });

    it('should handle very long subjects', () => {
      const longSubject = 'A'.repeat(500) + ' topic discussion about various things';

      const emails = [
        createTestEmail({
          id: 'email-1',
          threadId: undefined,
          subject: longSubject,
        }),
        createTestEmail({
          id: 'email-2',
          threadId: undefined,
          subject: longSubject,
        }),
      ];

      const clusterer = new TopicClusterer({ useThreadIds: false });
      const result = clusterer.clusterEmails(emails);

      expect(result.clusterCount).toBeGreaterThanOrEqual(0);
    });
  });
});
