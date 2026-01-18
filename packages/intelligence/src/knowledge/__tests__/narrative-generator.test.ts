/**
 * Tests for NarrativeGenerator
 */

import {
  NarrativeGenerator,
  type NarrativeStyle,
  type BriefingInput,
  type BriefingScript,
} from '../narrative-generator';
import type { LLMClient } from '../llm-client';
import type { TopicCluster } from '../../red-flags/topic-clusterer';
import type { RedFlagScore } from '../../red-flags/scorer';
import type { EmailSummary } from '../email-summarizer';
import { Severity } from '../../types';

// Mock LLM client
const createMockLLMClient = (): jest.Mocked<LLMClient> => {
  return {
    complete: jest.fn(),
    streamComplete: jest.fn(),
    getConfig: jest.fn(),
    setConfig: jest.fn(),
  } as any;
};

// Sample test data
const mockCluster: TopicCluster = {
  id: 'cluster-1',
  topic: 'Project Update',
  emailIds: ['email-1', 'email-2'],
  threadIds: ['thread-1'],
  size: 2,
  keywords: ['project', 'milestone', 'deadline'],
  coherence: 0.85,
};

const mockRedFlagScore: RedFlagScore = {
  isFlagged: true,
  score: 0.75,
  severity: Severity.HIGH,
  signalBreakdown: [
    {
      signal: 'keyword',
      rawScore: 0.8,
      weightedScore: 0.64,
      weight: 0.8,
    },
  ],
  reasons: [
    {
      signal: 'keyword',
      reason: 'Contains urgent keyword: "deadline"',
      severity: Severity.HIGH,
    },
  ],
};

const mockSummary: EmailSummary = {
  summary: 'Project milestone 1 completed, moving to milestone 2.',
  mode: 'brief',
  keyPoints: undefined,
  actionItems: undefined,
  participants: ['user@example.com', 'recipient@example.com'],
  messageCount: 2,
  tokensUsed: 70,
  generationTimeMs: 1000,
};

describe('NarrativeGenerator', () => {
  let mockLLMClient: jest.Mocked<LLMClient>;
  let generator: NarrativeGenerator;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();

    generator = new NarrativeGenerator({
      llmClient: mockLLMClient,
      defaultStyle: 'conversational',
      debug: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided options', () => {
      expect(generator).toBeInstanceOf(NarrativeGenerator);
      const config = generator.getConfig();
      expect(config.defaultStyle).toBe('conversational');
      expect(config.maxTopics).toBe(10);
      expect(config.includeOpening).toBe(true);
      expect(config.includeClosing).toBe(true);
    });

    it('should use custom options', () => {
      const customGenerator = new NarrativeGenerator({
        llmClient: mockLLMClient,
        defaultStyle: 'formal',
        maxTopics: 5,
        includeOpening: false,
        includeClosing: false,
      });

      const config = customGenerator.getConfig();
      expect(config.defaultStyle).toBe('formal');
      expect(config.maxTopics).toBe(5);
      expect(config.includeOpening).toBe(false);
      expect(config.includeClosing).toBe(false);
    });
  });

  describe('generateBriefing', () => {
    it('should generate briefing with all sections', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map([['email-1', mockRedFlagScore]]),
        summaries: new Map([['thread-1', mockSummary]]),
        userName: 'John',
        currentTime: new Date('2024-01-15T10:00:00Z'),
      };

      const result = await generator.generateBriefing(input);

      expect(result.segments.length).toBeGreaterThanOrEqual(3); // opening + topic + closing
      expect(result.topicCount).toBe(1);
      expect(result.style).toBe('conversational');
      expect(result.totalSeconds).toBeGreaterThan(0);
      expect(result.tokensUsed).toBeGreaterThan(0);

      // Verify sections exist
      const types = result.segments.map((s) => s.type);
      expect(types).toContain('opening');
      expect(types).toContain('topic');
      expect(types).toContain('closing');
    });

    it('should generate briefing in formal style', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Formal content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map(),
        summaries: new Map([['thread-1', mockSummary]]),
      };

      const result = await generator.generateBriefing(input, { style: 'formal' });

      expect(result.style).toBe('formal');
      expect(mockLLMClient.complete).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('formal'),
          }),
        ]),
        expect.anything()
      );
    });

    it('should generate briefing in executive style', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Brief content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map(),
        summaries: new Map([['thread-1', mockSummary]]),
      };

      const result = await generator.generateBriefing(input, { style: 'executive' });

      expect(result.style).toBe('executive');
    });

    it('should handle multiple clusters', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const cluster2: TopicCluster = {
        ...mockCluster,
        id: 'cluster-2',
        topic: 'Budget Review',
      };

      const input: BriefingInput = {
        clusters: [mockCluster, cluster2],
        redFlagScores: new Map(),
        summaries: new Map([
          ['thread-1', mockSummary],
          ['thread-2', mockSummary],
        ]),
      };

      const result = await generator.generateBriefing(input);

      expect(result.topicCount).toBe(2);
      const topicSegments = result.segments.filter((s) => s.type === 'topic');
      expect(topicSegments.length).toBe(2);

      // Should have transitions
      const transitions = result.segments.filter((s) => s.type === 'transition');
      expect(transitions.length).toBeGreaterThan(0);
    });

    it('should prioritize red-flagged clusters', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const normalCluster: TopicCluster = {
        ...mockCluster,
        id: 'cluster-normal',
        topic: 'Normal Topic',
        emailIds: ['email-3', 'email-4'],
        threadIds: ['thread-2'],
      };

      const urgentCluster: TopicCluster = {
        ...mockCluster,
        id: 'cluster-urgent',
        topic: 'Urgent Topic',
        emailIds: ['email-1', 'email-2'],
        threadIds: ['thread-1'],
      };

      const input: BriefingInput = {
        clusters: [normalCluster, urgentCluster],
        redFlagScores: new Map([
          ['email-1', mockRedFlagScore], // urgent cluster has this email
        ]),
        summaries: new Map([
          ['thread-1', mockSummary],
          ['thread-2', mockSummary],
        ]),
      };

      const result = await generator.generateBriefing(input);

      // First topic should be the urgent one
      const firstTopic = result.segments.find((s) => s.type === 'topic');
      expect(firstTopic?.topicId).toBe('cluster-urgent');
    });

    it('should respect maxTopics limit', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const limitedGenerator = new NarrativeGenerator({
        llmClient: mockLLMClient,
        maxTopics: 2,
      });

      const clusters = Array.from({ length: 5 }, (_, i) => ({
        ...mockCluster,
        id: `cluster-${i}`,
      }));

      const input: BriefingInput = {
        clusters,
        redFlagScores: new Map(),
        summaries: new Map([['thread-1', mockSummary]]),
      };

      const result = await limitedGenerator.generateBriefing(input);

      expect(result.topicCount).toBe(2);
      const topicSegments = result.segments.filter((s) => s.type === 'topic');
      expect(topicSegments.length).toBe(2);
    });

    it('should skip opening when disabled', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const noOpeningGenerator = new NarrativeGenerator({
        llmClient: mockLLMClient,
        includeOpening: false,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map(),
        summaries: new Map([['thread-1', mockSummary]]),
      };

      const result = await noOpeningGenerator.generateBriefing(input);

      const openings = result.segments.filter((s) => s.type === 'opening');
      expect(openings.length).toBe(0);
    });

    it('should skip closing when disabled', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const noClosingGenerator = new NarrativeGenerator({
        llmClient: mockLLMClient,
        includeClosing: false,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map(),
        summaries: new Map([['thread-1', mockSummary]]),
      };

      const result = await noClosingGenerator.generateBriefing(input);

      const closings = result.segments.filter((s) => s.type === 'closing');
      expect(closings.length).toBe(0);
    });

    it('should use default style when not specified', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map(),
        summaries: new Map([['thread-1', mockSummary]]),
      };

      const result = await generator.generateBriefing(input);

      expect(result.style).toBe('conversational');
    });

    it('should include red flag count in result', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map([
          ['email-1', mockRedFlagScore],
          ['email-2', { ...mockRedFlagScore, isFlagged: false }],
        ]),
        summaries: new Map([['thread-1', mockSummary]]),
      };

      const result = await generator.generateBriefing(input);

      expect(result.redFlagCount).toBeGreaterThan(0);
    });

    it('should estimate reading time for segments', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'This is a test content with multiple words that should take some time to read.',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map(),
        summaries: new Map([['thread-1', mockSummary]]),
      };

      const result = await generator.generateBriefing(input);

      result.segments.forEach((segment) => {
        expect(segment.estimatedSeconds).toBeGreaterThan(0);
      });
      expect(result.totalSeconds).toBeGreaterThan(0);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = generator.getConfig();

      expect(config).toEqual({
        defaultStyle: 'conversational',
        maxTopics: 10,
        includeOpening: true,
        includeClosing: true,
      });
    });
  });

  describe('setConfig', () => {
    it('should update defaultStyle', () => {
      generator.setConfig({ defaultStyle: 'formal' });

      const config = generator.getConfig();
      expect(config.defaultStyle).toBe('formal');
    });

    it('should update maxTopics', () => {
      generator.setConfig({ maxTopics: 5 });

      const config = generator.getConfig();
      expect(config.maxTopics).toBe(5);
    });

    it('should update includeOpening', () => {
      generator.setConfig({ includeOpening: false });

      const config = generator.getConfig();
      expect(config.includeOpening).toBe(false);
    });

    it('should update includeClosing', () => {
      generator.setConfig({ includeClosing: false });

      const config = generator.getConfig();
      expect(config.includeClosing).toBe(false);
    });

    it('should update multiple config values', () => {
      generator.setConfig({
        defaultStyle: 'executive',
        maxTopics: 3,
        includeOpening: false,
        includeClosing: false,
      });

      const config = generator.getConfig();
      expect(config.defaultStyle).toBe('executive');
      expect(config.maxTopics).toBe(3);
      expect(config.includeOpening).toBe(false);
      expect(config.includeClosing).toBe(false);
    });
  });

  describe('narrative styles', () => {
    const styles: NarrativeStyle[] = ['formal', 'conversational', 'executive', 'concise'];

    styles.forEach((style) => {
      it(`should generate briefing in ${style} style`, async () => {
        mockLLMClient.complete.mockResolvedValue({
          content: `${style} content`,
          model: 'gpt-4o',
          promptTokens: 50,
          completionTokens: 20,
          totalTokens: 70,
          finishReason: 'stop',
          responseTimeMs: 1000,
        });

        const input: BriefingInput = {
          clusters: [mockCluster],
          redFlagScores: new Map(),
          summaries: new Map([['thread-1', mockSummary]]),
        };

        const result = await generator.generateBriefing(input, { style });

        expect(result.style).toBe(style);
        expect(mockLLMClient.complete).toHaveBeenCalled();
      });
    });
  });

  describe('debug logging', () => {
    it('should log when debug is enabled', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const debugGenerator = new NarrativeGenerator({
        llmClient: mockLLMClient,
        debug: true,
      });

      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map(),
        summaries: new Map([['thread-1', mockSummary]]),
      };

      await debugGenerator.generateBriefing(input);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NarrativeGenerator] Generating briefing')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NarrativeGenerator] Generated')
      );

      consoleLogSpy.mockRestore();
    });

    it('should not log when debug is disabled', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map(),
        summaries: new Map([['thread-1', mockSummary]]),
      };

      await generator.generateBriefing(input);

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[NarrativeGenerator]')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should propagate LLM errors', async () => {
      mockLLMClient.complete.mockRejectedValue(new Error('LLM API error'));

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map(),
        summaries: new Map([['thread-1', mockSummary]]),
      };

      await expect(generator.generateBriefing(input)).rejects.toThrow('LLM API error');
    });
  });

  describe('edge cases', () => {
    it('should handle empty clusters', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const input: BriefingInput = {
        clusters: [],
        redFlagScores: new Map(),
        summaries: new Map(),
      };

      const result = await generator.generateBriefing(input);

      expect(result.topicCount).toBe(0);
      const topicSegments = result.segments.filter((s) => s.type === 'topic');
      expect(topicSegments.length).toBe(0);
    });

    it('should handle missing summaries', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Generated content',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map(),
        summaries: new Map(), // No summaries
      };

      const result = await generator.generateBriefing(input);

      expect(result.topicCount).toBe(1);
    });

    it('should handle different time of day', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Good morning',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const input: BriefingInput = {
        clusters: [mockCluster],
        redFlagScores: new Map(),
        summaries: new Map([['thread-1', mockSummary]]),
        currentTime: new Date('2024-01-15T08:00:00Z'), // Morning
      };

      await generator.generateBriefing(input);

      // Should include time of day in the opening prompt
      expect(mockLLMClient.complete).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringMatching(/Time of day: (morning|afternoon|evening)/),
          }),
        ]),
        expect.anything()
      );
    });
  });
});
