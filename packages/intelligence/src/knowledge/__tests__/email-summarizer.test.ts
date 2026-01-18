/**
 * Tests for EmailSummarizer
 */

import {
  EmailSummarizer,
  type SummarizationMode,
  type EmailSummary,
} from '../email-summarizer';
import type { LLMClient } from '../llm-client';
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
  email: 'user@example.com',
  name: 'John Doe',
};

const mockEmail: StandardEmail = {
  id: 'email-1',
  threadId: 'thread-1',
  source: 'GMAIL',
  from: mockEmailAddress,
  to: [{ email: 'recipient@example.com', name: 'Jane Smith' }],
  subject: 'Project Update',
  snippet: 'The project is on track...',
  body: 'The project is on track. We completed milestone 1 and are moving to milestone 2.',
  receivedAt: new Date('2024-01-15T10:00:00Z'),
  isRead: false,
  isStarred: false,
  labels: [],
};

const mockThread: StandardThread = {
  id: 'thread-1',
  source: 'GMAIL',
  subject: 'Project Update',
  participants: [
    { email: 'user@example.com', name: 'John Doe' },
    { email: 'recipient@example.com', name: 'Jane Smith' },
  ],
  messageCount: 2,
  messages: [
    mockEmail,
    {
      ...mockEmail,
      id: 'email-2',
      body: 'Thanks for the update. Can you send the report by Friday?',
      receivedAt: new Date('2024-01-15T11:00:00Z'),
    },
  ],
  lastMessageAt: new Date('2024-01-15T11:00:00Z'),
  isRead: false,
};

describe('EmailSummarizer', () => {
  let mockLLMClient: jest.Mocked<LLMClient>;
  let summarizer: EmailSummarizer;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();

    summarizer = new EmailSummarizer({
      llmClient: mockLLMClient,
      defaultMode: 'brief',
      debug: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided options', () => {
      expect(summarizer).toBeInstanceOf(EmailSummarizer);
      const config = summarizer.getConfig();
      expect(config.defaultMode).toBe('brief');
      expect(config.maxMessagesInContext).toBe(20);
      expect(config.includeMetadata).toBe(true);
    });

    it('should use custom options', () => {
      const customSummarizer = new EmailSummarizer({
        llmClient: mockLLMClient,
        defaultMode: 'detailed',
        maxMessagesInContext: 10,
        includeMetadata: false,
      });

      const config = customSummarizer.getConfig();
      expect(config.defaultMode).toBe('detailed');
      expect(config.maxMessagesInContext).toBe(10);
      expect(config.includeMetadata).toBe(false);
    });
  });

  describe('summarizeThread', () => {
    it('should summarize thread in brief mode', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Project is on track, milestone 1 completed, moving to milestone 2.',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 1000,
      });

      const result = await summarizer.summarizeThread(mockThread, { mode: 'brief' });

      expect(result.summary).toBe(
        'Project is on track, milestone 1 completed, moving to milestone 2.'
      );
      expect(result.mode).toBe('brief');
      expect(result.messageCount).toBe(2);
      expect(result.tokensUsed).toBe(70);
      expect(result.participants).toEqual(['user@example.com', 'recipient@example.com']);
      expect(mockLLMClient.complete).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
          }),
          expect.objectContaining({
            role: 'user',
          }),
        ]),
        expect.objectContaining({
          temperature: 0.3,
          maxTokens: 200,
        })
      );
    });

    it('should summarize thread in detailed mode', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content:
          'The project team provided an update on progress. Milestone 1 has been successfully completed. The team is now transitioning to milestone 2. A report is requested by Friday.',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 40,
        totalTokens: 90,
        finishReason: 'stop',
        responseTimeMs: 1200,
      });

      const result = await summarizer.summarizeThread(mockThread, { mode: 'detailed' });

      expect(result.summary).toContain('Milestone 1');
      expect(result.mode).toBe('detailed');
      expect(mockLLMClient.complete).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          maxTokens: 500,
        })
      );
    });

    it('should extract action items', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content:
          '- Action: Send project report\n  Assignee: John Doe\n  Due: Friday\n\n- Action: Review milestone 2 plan\n  Assignee: Jane Smith',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 30,
        totalTokens: 80,
        finishReason: 'stop',
        responseTimeMs: 1100,
      });

      const result = await summarizer.summarizeThread(mockThread, { mode: 'action-items' });

      expect(result.mode).toBe('action-items');
      expect(result.actionItems).toBeDefined();
      expect(result.actionItems).toHaveLength(2);
      expect(result.actionItems![0]).toEqual({
        action: 'Send project report',
        assignee: 'John Doe',
        dueDate: 'Friday',
      });
      expect(result.actionItems![1]).toEqual({
        action: 'Review milestone 2 plan',
        assignee: 'Jane Smith',
        dueDate: undefined,
      });
    });

    it('should extract key points', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content:
          '- Milestone 1 completed successfully\n- Moving to milestone 2\n- Report requested by Friday',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
        finishReason: 'stop',
        responseTimeMs: 1050,
      });

      const result = await summarizer.summarizeThread(mockThread, { mode: 'key-points' });

      expect(result.mode).toBe('key-points');
      expect(result.keyPoints).toBeDefined();
      expect(result.keyPoints).toHaveLength(3);
      expect(result.keyPoints![0]).toBe('Milestone 1 completed successfully');
      expect(result.keyPoints![1]).toBe('Moving to milestone 2');
      expect(result.keyPoints![2]).toBe('Report requested by Friday');
    });

    it('should use default mode when not specified', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Brief summary',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 10,
        totalTokens: 60,
        finishReason: 'stop',
        responseTimeMs: 900,
      });

      const result = await summarizer.summarizeThread(mockThread);

      expect(result.mode).toBe('brief'); // Default mode
    });

    it('should handle long threads by truncating messages', async () => {
      const longThread: StandardThread = {
        ...mockThread,
        messageCount: 25,
        messages: Array.from({ length: 25 }, (_, i) => ({
          ...mockEmail,
          id: `email-${i}`,
        })),
      };

      mockLLMClient.complete.mockResolvedValue({
        content: 'Summary of long thread',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        finishReason: 'stop',
        responseTimeMs: 1500,
      });

      const result = await summarizer.summarizeThread(longThread);

      expect(result.messageCount).toBe(20); // Truncated to maxMessagesInContext
    });
  });

  describe('summarizeEmail', () => {
    it('should summarize single email in brief mode', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Project update: milestone 1 done, moving to milestone 2.',
        model: 'gpt-4o',
        promptTokens: 40,
        completionTokens: 15,
        totalTokens: 55,
        finishReason: 'stop',
        responseTimeMs: 800,
      });

      const result = await summarizer.summarizeEmail(mockEmail, { mode: 'brief' });

      expect(result.summary).toBe('Project update: milestone 1 done, moving to milestone 2.');
      expect(result.mode).toBe('brief');
      expect(result.messageCount).toBe(1);
      expect(result.participants).toEqual(['user@example.com', 'recipient@example.com']);
      expect(mockLLMClient.complete).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          temperature: 0.3,
          maxTokens: 150,
        })
      );
    });

    it('should extract action items from single email', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: '- Action: Complete milestone 2\n  Due: Next week',
        model: 'gpt-4o',
        promptTokens: 40,
        completionTokens: 20,
        totalTokens: 60,
        finishReason: 'stop',
        responseTimeMs: 850,
      });

      const result = await summarizer.summarizeEmail(mockEmail, { mode: 'action-items' });

      expect(result.actionItems).toBeDefined();
      expect(result.actionItems).toHaveLength(1);
      expect(result.actionItems![0]).toEqual({
        action: 'Complete milestone 2',
        assignee: undefined,
        dueDate: 'Next week',
      });
    });

    it('should use default mode for single email', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Brief summary',
        model: 'gpt-4o',
        promptTokens: 40,
        completionTokens: 10,
        totalTokens: 50,
        finishReason: 'stop',
        responseTimeMs: 750,
      });

      const result = await summarizer.summarizeEmail(mockEmail);

      expect(result.mode).toBe('brief');
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = summarizer.getConfig();

      expect(config).toEqual({
        defaultMode: 'brief',
        maxMessagesInContext: 20,
        includeMetadata: true,
      });
    });
  });

  describe('setConfig', () => {
    it('should update defaultMode', () => {
      summarizer.setConfig({ defaultMode: 'detailed' });

      const config = summarizer.getConfig();
      expect(config.defaultMode).toBe('detailed');
    });

    it('should update maxMessagesInContext', () => {
      summarizer.setConfig({ maxMessagesInContext: 15 });

      const config = summarizer.getConfig();
      expect(config.maxMessagesInContext).toBe(15);
    });

    it('should update includeMetadata', () => {
      summarizer.setConfig({ includeMetadata: false });

      const config = summarizer.getConfig();
      expect(config.includeMetadata).toBe(false);
    });

    it('should update multiple config values', () => {
      summarizer.setConfig({
        defaultMode: 'action-items',
        maxMessagesInContext: 10,
        includeMetadata: false,
      });

      const config = summarizer.getConfig();
      expect(config.defaultMode).toBe('action-items');
      expect(config.maxMessagesInContext).toBe(10);
      expect(config.includeMetadata).toBe(false);
    });
  });

  describe('action items extraction', () => {
    it('should handle action items with different formats', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content:
          '* Send report to team\n• Review documentation\n- Complete testing by Monday',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
        finishReason: 'stop',
        responseTimeMs: 900,
      });

      const result = await summarizer.summarizeEmail(mockEmail, { mode: 'action-items' });

      expect(result.actionItems).toHaveLength(3);
      expect(result.actionItems![0].action).toBe('Send report to team');
      expect(result.actionItems![1].action).toBe('Review documentation');
      expect(result.actionItems![2].action).toBe('Complete testing by Monday');
    });

    it('should handle unstructured action items', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Complete the project documentation',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 10,
        totalTokens: 60,
        finishReason: 'stop',
        responseTimeMs: 850,
      });

      const result = await summarizer.summarizeEmail(mockEmail, { mode: 'action-items' });

      expect(result.actionItems).toHaveLength(1);
      expect(result.actionItems![0].action).toBe('Complete the project documentation');
    });
  });

  describe('key points extraction', () => {
    it('should handle key points with numbered lists', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content:
          '1. First key point\n2. Second key point\n3. Third key point',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        finishReason: 'stop',
        responseTimeMs: 900,
      });

      const result = await summarizer.summarizeEmail(mockEmail, { mode: 'key-points' });

      expect(result.keyPoints).toHaveLength(3);
      expect(result.keyPoints![0]).toBe('First key point');
      expect(result.keyPoints![1]).toBe('Second key point');
      expect(result.keyPoints![2]).toBe('Third key point');
    });

    it('should handle unstructured key points', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Project is progressing well with no major blockers',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 15,
        totalTokens: 65,
        finishReason: 'stop',
        responseTimeMs: 850,
      });

      const result = await summarizer.summarizeEmail(mockEmail, { mode: 'key-points' });

      expect(result.keyPoints).toHaveLength(1);
      expect(result.keyPoints![0]).toBe('Project is progressing well with no major blockers');
    });
  });

  describe('debug logging', () => {
    it('should log when debug is enabled', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const debugSummarizer = new EmailSummarizer({
        llmClient: mockLLMClient,
        debug: true,
      });

      mockLLMClient.complete.mockResolvedValue({
        content: 'Summary',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 10,
        totalTokens: 60,
        finishReason: 'stop',
        responseTimeMs: 900,
      });

      await debugSummarizer.summarizeEmail(mockEmail);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailSummarizer] Summarizing email')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailSummarizer] Generated summary')
      );

      consoleLogSpy.mockRestore();
    });

    it('should not log when debug is disabled', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      mockLLMClient.complete.mockResolvedValue({
        content: 'Summary',
        model: 'gpt-4o',
        promptTokens: 50,
        completionTokens: 10,
        totalTokens: 60,
        finishReason: 'stop',
        responseTimeMs: 900,
      });

      await summarizer.summarizeEmail(mockEmail);

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[EmailSummarizer]')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should propagate LLM errors', async () => {
      mockLLMClient.complete.mockRejectedValue(new Error('LLM API error'));

      await expect(summarizer.summarizeEmail(mockEmail)).rejects.toThrow('LLM API error');
    });
  });
});
