/**
 * Tests for ExplanationGenerator
 */

import {
  ExplanationGenerator,
  type ExplanationStyle,
  type RedFlagExplanation,
} from '../explanation-generator';
import type { LLMClient } from '../llm-client';
import type { RedFlagScore, SignalContribution, ScoringReason } from '../../red-flags/scorer';
import type { StandardEmail, StandardThread, EmailAddress } from '@nexus-aec/shared-types';

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
const mockEmailAddress: EmailAddress = {
  email: 'vip@example.com',
  name: 'Important Client',
};

const mockEmail: StandardEmail = {
  id: 'email-1',
  threadId: 'thread-1',
  source: 'GMAIL',
  from: mockEmailAddress,
  to: [{ email: 'user@example.com', name: 'User' }],
  subject: 'URGENT: Project Deadline Tomorrow',
  snippet: 'We need to finalize the contract by tomorrow...',
  body: 'We need to finalize the contract by tomorrow. This is critical for the project timeline.',
  receivedAt: new Date('2024-01-15T10:00:00Z'),
  isRead: false,
  isStarred: false,
  labels: [],
};

const mockThread: StandardThread = {
  id: 'thread-1',
  source: 'GMAIL',
  subject: 'Project Deadline',
  participants: [mockEmailAddress, { email: 'user@example.com', name: 'User' }],
  messageCount: 5,
  messages: [mockEmail],
  lastMessageAt: new Date('2024-01-15T10:00:00Z'),
  isRead: false,
};

const mockSignalBreakdown: SignalContribution[] = [
  {
    signal: 'keyword',
    rawScore: 0.9,
    weight: 0.8,
    contribution: 0.72,
    isPresent: true,
  },
  {
    signal: 'vip',
    rawScore: 1.0,
    weight: 0.7,
    contribution: 0.7,
    isPresent: true,
  },
  {
    signal: 'velocity',
    rawScore: 0.6,
    weight: 0.9,
    contribution: 0.54,
    isPresent: true,
  },
  {
    signal: 'calendar',
    rawScore: 0.0,
    weight: 0.6,
    contribution: 0.0,
    isPresent: false,
  },
];

const mockReasons: ScoringReason[] = [
  {
    signal: 'keyword',
    type: 'urgency',
    description: 'Contains urgent keyword: "URGENT"',
    weight: 0.8,
  },
  {
    signal: 'vip',
    type: 'sender',
    description: 'Email from VIP contact: Important Client',
    weight: 0.7,
  },
  {
    signal: 'velocity',
    type: 'thread_activity',
    description: 'High thread velocity: 5 messages in 2 hours',
    weight: 0.6,
  },
];

const mockRedFlagScore: RedFlagScore = {
  isFlagged: true,
  score: 0.75, // Below 0.8 threshold so it's HIGH, not critical
  severity: 'high',
  signalBreakdown: mockSignalBreakdown,
  reasons: mockReasons,
};

describe('ExplanationGenerator', () => {
  let mockLLMClient: jest.Mocked<LLMClient>;
  let generator: ExplanationGenerator;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();

    generator = new ExplanationGenerator({
      llmClient: mockLLMClient,
      defaultStyle: 'detailed',
      debug: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided options', () => {
      expect(generator).toBeInstanceOf(ExplanationGenerator);
      const config = generator.getConfig();
      expect(config.defaultStyle).toBe('detailed');
      expect(config.includeSuggestedAction).toBe(true);
    });

    it('should use custom options', () => {
      const customGenerator = new ExplanationGenerator({
        llmClient: mockLLMClient,
        defaultStyle: 'concise',
        includeSuggestedAction: false,
      });

      const config = customGenerator.getConfig();
      expect(config.defaultStyle).toBe('concise');
      expect(config.includeSuggestedAction).toBe(false);
    });
  });

  describe('explain', () => {
    it('should generate detailed explanation', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: `This email requires immediate attention due to multiple urgency indicators. The message contains urgent language and is from an important client. The high thread activity suggests an ongoing critical conversation.

Key Factors:
- Contains urgent keyword: "URGENT"
- Email from VIP contact: Important Client
- High thread velocity: 5 messages in 2 hours

Suggested Action: Review and respond within the next hour.`,
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 80,
        totalTokens: 180,
        finishReason: 'stop',
        responseTimeMs: 1500,
      });

      const result = await generator.explain(mockRedFlagScore, mockEmail);

      expect(result.explanation).toContain('immediate attention');
      expect(result.keyFactors.length).toBeGreaterThan(0);
      expect(result.urgencyLevel).toContain('High priority');
      expect(result.style).toBe('detailed');
      expect(result.tokensUsed).toBe(180);
      expect(result.generationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should generate concise explanation', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: `Urgent email from VIP requiring immediate response.

- Contains urgent keyword
- From important client`,
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 40,
        totalTokens: 140,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const result = await generator.explain(mockRedFlagScore, mockEmail, { style: 'concise' });

      expect(result.style).toBe('concise');
      expect(result.explanation).toBeTruthy();
      expect(mockLLMClient.complete).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          maxTokens: 200,
        })
      );
    });

    it('should generate technical explanation', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: `Priority score: 85%. Keyword signal: 90% (weight 0.8), VIP signal: 100% (weight 0.7).

- Keyword match: "URGENT"
- VIP detection: Important Client
- Velocity: 5 messages/2h`,
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        finishReason: 'stop',
        responseTimeMs: 1200,
      });

      const result = await generator.explain(mockRedFlagScore, mockEmail, {
        style: 'technical',
      });

      expect(result.style).toBe('technical');
      expect(result.explanation).toBeTruthy();
    });

    it('should generate casual explanation', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: `Hey, this one needs your attention soon. It's from that important client and they used urgent language, plus there's been a lot of back-and-forth recently.

- Urgent keyword in subject
- VIP sender
- Active conversation`,
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 60,
        totalTokens: 160,
        finishReason: 'stop',
        responseTimeMs: 1300,
      });

      const result = await generator.explain(mockRedFlagScore, mockEmail, { style: 'casual' });

      expect(result.style).toBe('casual');
      expect(result.explanation).toBeTruthy();
    });

    it('should include thread context when provided', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: `Important thread with 5 messages requiring attention.

- VIP sender
- Urgent keywords
- High activity`,
        model: 'gpt-4o',
        promptTokens: 120,
        completionTokens: 40,
        totalTokens: 160,
        finishReason: 'stop',
        responseTimeMs: 1100,
      });

      await generator.explain(mockRedFlagScore, mockEmail, { thread: mockThread });

      expect(mockLLMClient.complete).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Thread: 5 messages'),
          }),
        ]),
        expect.anything()
      );
    });

    it('should use default style when not specified', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Explanation content\n- Factor 1',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 40,
        totalTokens: 140,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const result = await generator.explain(mockRedFlagScore, mockEmail);

      expect(result.style).toBe('detailed');
    });

    it('should parse explanation with suggested action', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: `This is an urgent email requiring attention.

Key Factors:
- Urgent keyword detected
- VIP sender

Suggested Action: Respond within 1 hour`,
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        finishReason: 'stop',
        responseTimeMs: 1100,
      });

      const result = await generator.explain(mockRedFlagScore, mockEmail);

      expect(result.suggestedAction).toBeTruthy();
      expect(result.suggestedAction).toContain('Respond');
    });

    it('should handle different bullet formats', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: `Explanation text

Factors:
* Factor with asterisk
• Factor with bullet
- Factor with dash`,
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 40,
        totalTokens: 140,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const result = await generator.explain(mockRedFlagScore, mockEmail);

      expect(result.keyFactors.length).toBe(3);
      expect(result.keyFactors[0]).toBe('Factor with asterisk');
      expect(result.keyFactors[1]).toBe('Factor with bullet');
      expect(result.keyFactors[2]).toBe('Factor with dash');
    });

    it('should fallback to reasons if no factors parsed', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'This email is urgent and needs attention.',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        finishReason: 'stop',
        responseTimeMs: 900,
      });

      const result = await generator.explain(mockRedFlagScore, mockEmail);

      expect(result.keyFactors.length).toBeGreaterThan(0);
      expect(result.keyFactors[0]).toBe(mockReasons[0].description);
    });
  });

  describe('explainBasic', () => {
    it('should generate basic explanation for critical severity', () => {
      const criticalScore: RedFlagScore = {
        ...mockRedFlagScore,
        severity: 'high',
        score: 0.95, // Score >= 0.8 triggers critical level
      };

      const result = generator.explainBasic(criticalScore, mockEmail);

      expect(result.explanation).toContain('immediate attention');
      expect(result.explanation).toContain('95%');
      expect(result.keyFactors.length).toBeGreaterThan(0);
      expect(result.urgencyLevel).toContain('Critical');
      expect(result.tokensUsed).toBe(0);
    });

    it('should generate basic explanation for high severity', () => {
      const result = generator.explainBasic(mockRedFlagScore, mockEmail);

      expect(result.explanation).toContain('high priority');
      expect(result.keyFactors.length).toBeGreaterThan(0);
      expect(result.urgencyLevel).toContain('High priority');
    });

    it('should generate basic explanation for medium severity', () => {
      const mediumScore: RedFlagScore = {
        ...mockRedFlagScore,
        severity: 'medium',
        score: 0.55,
      };

      const result = generator.explainBasic(mediumScore, mockEmail);

      expect(result.explanation).toContain('medium priority');
      expect(result.urgencyLevel).toContain('Medium priority');
    });

    it('should generate basic explanation for low severity', () => {
      const lowScore: RedFlagScore = {
        ...mockRedFlagScore,
        severity: 'low',
        score: 0.35,
      };

      const result = generator.explainBasic(lowScore, mockEmail);

      expect(result.explanation).toContain('low priority');
      expect(result.urgencyLevel).toContain('Low priority');
    });

    it('should handle unflagged emails', () => {
      const unflaggedScore: RedFlagScore = {
        isFlagged: false,
        score: 0.2,
        severity: null,
        signalBreakdown: [],
        reasons: [],
      };

      const result = generator.explainBasic(unflaggedScore, mockEmail);

      expect(result.explanation).toContain('does not require immediate attention');
      expect(result.urgencyLevel).toBe('Normal priority');
    });

    it('should limit key factors to 3', () => {
      const manyReasons: ScoringReason[] = [
        ...mockReasons,
        { signal: 'calendar', type: 'proximity', description: 'Near calendar event', weight: 0.5 },
        { signal: 'keyword', type: 'deadline', description: 'Deadline mention', weight: 0.6 },
      ];

      const scoreWithManyReasons: RedFlagScore = {
        ...mockRedFlagScore,
        reasons: manyReasons,
      };

      const result = generator.explainBasic(scoreWithManyReasons, mockEmail);

      expect(result.keyFactors.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = generator.getConfig();

      expect(config).toEqual({
        defaultStyle: 'detailed',
        includeSuggestedAction: true,
      });
    });
  });

  describe('setConfig', () => {
    it('should update defaultStyle', () => {
      generator.setConfig({ defaultStyle: 'concise' });

      const config = generator.getConfig();
      expect(config.defaultStyle).toBe('concise');
    });

    it('should update includeSuggestedAction', () => {
      generator.setConfig({ includeSuggestedAction: false });

      const config = generator.getConfig();
      expect(config.includeSuggestedAction).toBe(false);
    });

    it('should update multiple config values', () => {
      generator.setConfig({
        defaultStyle: 'technical',
        includeSuggestedAction: false,
      });

      const config = generator.getConfig();
      expect(config.defaultStyle).toBe('technical');
      expect(config.includeSuggestedAction).toBe(false);
    });
  });

  describe('explanation styles', () => {
    const styles: ExplanationStyle[] = ['detailed', 'concise', 'technical', 'casual'];

    styles.forEach((style) => {
      it(`should generate explanation in ${style} style`, async () => {
        mockLLMClient.complete.mockResolvedValue({
          content: `${style} explanation\n- Factor 1`,
          model: 'gpt-4o',
          promptTokens: 100,
          completionTokens: 40,
          totalTokens: 140,
          finishReason: 'stop',
          responseTimeMs: 1000,
        });

        const result = await generator.explain(mockRedFlagScore, mockEmail, { style });

        expect(result.style).toBe(style);
        expect(mockLLMClient.complete).toHaveBeenCalled();
      });
    });
  });

  describe('debug logging', () => {
    it('should log when debug is enabled', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const debugGenerator = new ExplanationGenerator({
        llmClient: mockLLMClient,
        debug: true,
      });

      mockLLMClient.complete.mockResolvedValue({
        content: 'Explanation\n- Factor',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 40,
        totalTokens: 140,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      await debugGenerator.explain(mockRedFlagScore, mockEmail);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ExplanationGenerator] Generating explanation')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ExplanationGenerator] Generated explanation')
      );

      consoleLogSpy.mockRestore();
    });

    it('should not log when debug is disabled', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      mockLLMClient.complete.mockResolvedValue({
        content: 'Explanation\n- Factor',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 40,
        totalTokens: 140,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      await generator.explain(mockRedFlagScore, mockEmail);

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[ExplanationGenerator]')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should propagate LLM errors', async () => {
      mockLLMClient.complete.mockRejectedValue(new Error('LLM API error'));

      await expect(generator.explain(mockRedFlagScore, mockEmail)).rejects.toThrow(
        'LLM API error'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty reasons list', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Email flagged for attention\n- General urgency',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 30,
        totalTokens: 130,
        finishReason: 'stop',
        responseTimeMs: 900,
      });

      const scoreNoReasons: RedFlagScore = {
        ...mockRedFlagScore,
        reasons: [],
      };

      const result = await generator.explain(scoreNoReasons, mockEmail);

      expect(result.explanation).toBeTruthy();
      // With no reasons, key factors come from LLM response
      expect(result.keyFactors).toBeDefined();
      expect(Array.isArray(result.keyFactors)).toBe(true);
    });

    it('should handle malformed LLM response', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Random text without structure',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        finishReason: 'stop',
        responseTimeMs: 800,
      });

      const result = await generator.explain(mockRedFlagScore, mockEmail);

      expect(result.explanation).toBeTruthy();
      // Should fallback to reasons
      expect(result.keyFactors.length).toBeGreaterThan(0);
    });

    it('should handle null severity', () => {
      const noSeverityScore: RedFlagScore = {
        isFlagged: true,
        score: 0.4,
        severity: null,
        signalBreakdown: [],
        reasons: mockReasons,
      };

      const result = generator.explainBasic(noSeverityScore, mockEmail);

      expect(result.urgencyLevel).toBe('Flagged for attention');
    });
  });
});
