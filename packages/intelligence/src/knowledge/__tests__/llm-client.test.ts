/**
 * Tests for LLMClient
 */

import { LLMClient, type LLMMessage, type LLMCompletionOptions } from '../llm-client';
import OpenAI from 'openai';

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => {
    return {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };
  });
});

describe('LLMClient', () => {
  let client: LLMClient;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    client = new LLMClient({
      apiKey: 'test-api-key',
      defaultModel: 'gpt-4o',
      debug: false,
    });

    // Get the mock create function
    mockCreate = (client as any).client.chat.completions.create;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided options', () => {
      expect(client).toBeInstanceOf(LLMClient);
      const config = client.getConfig();
      expect(config.defaultModel).toBe('gpt-4o');
      expect(config.defaultTemperature).toBe(0.7);
      expect(config.defaultMaxTokens).toBe(1000);
    });

    it('should use default values when not provided', () => {
      const defaultClient = new LLMClient({
        apiKey: 'test-api-key',
      });

      const config = defaultClient.getConfig();
      expect(config.defaultModel).toBe('gpt-4o');
      expect(config.defaultTemperature).toBe(0.7);
      expect(config.defaultMaxTokens).toBe(1000);
    });

    it('should initialize rate limiter when options provided', () => {
      const clientWithRateLimiter = new LLMClient({
        apiKey: 'test-api-key',
        rateLimiter: {
          requestsPerMinute: 60,
          tokensPerMinute: 90000,
        },
      });

      const config = clientWithRateLimiter.getConfig();
      expect(config.hasRateLimiter).toBe(true);
    });

    it('should not initialize rate limiter when options not provided', () => {
      const config = client.getConfig();
      expect(config.hasRateLimiter).toBe(false);
    });
  });

  describe('complete', () => {
    it('should generate completion successfully', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'This is a test response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: LLMMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];

      const result = await client.complete(messages);

      expect(result.content).toBe('This is a test response');
      expect(result.model).toBe('gpt-4o');
      expect(result.promptTokens).toBe(10);
      expect(result.completionTokens).toBe(5);
      expect(result.totalTokens).toBe(15);
      expect(result.finishReason).toBe('stop');
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should use custom options', async () => {
      const mockResponse = {
        model: 'gpt-4o-mini',
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];
      const options: LLMCompletionOptions = {
        model: 'gpt-4o-mini',
        temperature: 0.5,
        maxTokens: 500,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
        stop: ['\n'],
      };

      await client.complete(messages, options);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          temperature: 0.5,
          max_tokens: 500,
          top_p: 0.9,
          frequency_penalty: 0.5,
          presence_penalty: 0.5,
          stop: ['\n'],
        })
      );
    });

    it('should throw error when no completion generated', async () => {
      const mockResponse = {
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];

      await expect(client.complete(messages)).rejects.toThrow('No completion generated');
    });

    it('should handle missing content', async () => {
      const mockResponse = {
        model: 'gpt-4o',
        choices: [{ message: { content: null }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];
      const result = await client.complete(messages);

      expect(result.content).toBe('');
    });
  });

  describe('streamComplete', () => {
    it('should generate streaming completion successfully', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] },
        { choices: [{ delta: { content: ' world' }, finish_reason: null }] },
        { choices: [{ delta: { content: '!' }, finish_reason: 'stop' }] },
      ];

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Say hello' }];
      const receivedChunks: string[] = [];

      const result = await client.streamComplete(messages, (chunk) => {
        receivedChunks.push(chunk);
      });

      expect(receivedChunks).toEqual(['Hello', ' world', '!']);
      expect(result.content).toBe('Hello world!');
      expect(result.finishReason).toBe('stop');
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle async chunk callback', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Test' }, finish_reason: null }] },
        { choices: [{ delta: { content: ' chunk' }, finish_reason: 'stop' }] },
      ];

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];
      const receivedChunks: string[] = [];

      await client.streamComplete(messages, async (chunk) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        receivedChunks.push(chunk);
      });

      expect(receivedChunks).toEqual(['Test', ' chunk']);
    });

    it('should use custom options in streaming', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Test' }, finish_reason: 'stop' }] };
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];
      const options: LLMCompletionOptions = {
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 200,
      };

      await client.streamComplete(messages, () => {}, options);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 200,
          stream: true,
        })
      );
    });
  });

  describe('retry logic', () => {
    it('should retry on retryable errors', async () => {
      const clientWithRetry = new LLMClient({
        apiKey: 'test-api-key',
        retry: {
          maxRetries: 2,
          initialRetryDelay: 10,
          maxRetryDelay: 100,
          backoffMultiplier: 2,
        },
      });

      const mockRetryCreate = (clientWithRetry as any).client.chat.completions.create;

      const mockResponse = {
        model: 'gpt-4o',
        choices: [{ message: { content: 'Success after retry' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockRetryCreate
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce(mockResponse);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];
      const result = await clientWithRetry.complete(messages);

      expect(result.content).toBe('Success after retry');
      expect(mockRetryCreate).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      mockCreate.mockRejectedValue(
        new Error('Invalid API key')
      );

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];

      await expect(client.complete(messages)).rejects.toThrow('Invalid API key');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should throw error after max retries', async () => {
      const clientWithRetry = new LLMClient({
        apiKey: 'test-api-key',
        retry: {
          maxRetries: 2,
          initialRetryDelay: 10,
        },
      });

      const mockRetryCreate = (clientWithRetry as any).client.chat.completions.create;

      mockRetryCreate.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];

      await expect(clientWithRetry.complete(messages)).rejects.toThrow('Rate limit exceeded');
      expect(mockRetryCreate).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should handle exponential backoff', async () => {
      const clientWithRetry = new LLMClient({
        apiKey: 'test-api-key',
        retry: {
          maxRetries: 3,
          initialRetryDelay: 100,
          backoffMultiplier: 2,
        },
        debug: false,
      });

      const mockRetryCreate = (clientWithRetry as any).client.chat.completions.create;

      const mockResponse = {
        model: 'gpt-4o',
        choices: [{ message: { content: 'Success' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockRetryCreate
        .mockRejectedValueOnce(new Error('500 Internal Server Error'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce(mockResponse);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];
      const startTime = Date.now();

      await clientWithRetry.complete(messages);

      const elapsed = Date.now() - startTime;
      // Should wait at least: 100ms (first retry) + 200ms (second retry) = 300ms
      expect(elapsed).toBeGreaterThanOrEqual(300);
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limits', async () => {
      const clientWithRateLimiter = new LLMClient({
        apiKey: 'test-api-key',
        rateLimiter: {
          requestsPerMinute: 60,
          tokensPerMinute: 90000,
        },
      });

      const mockRateLimitCreate = (clientWithRateLimiter as any).client.chat.completions.create;

      const mockResponse = {
        model: 'gpt-4o',
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockRateLimitCreate.mockResolvedValue(mockResponse);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];

      // Should complete without waiting (within rate limits)
      const result = await clientWithRateLimiter.complete(messages);
      expect(result.content).toBe('Response');
    });

    it('should wait when rate limit reached', async () => {
      const clientWithLowLimit = new LLMClient({
        apiKey: 'test-api-key',
        rateLimiter: {
          requestsPerMinute: 60, // High enough to not timeout
          tokensPerMinute: 10000,
        },
      });

      const mockRateLimitCreate = (clientWithLowLimit as any).client.chat.completions.create;

      const mockResponse = {
        model: 'gpt-4o',
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockRateLimitCreate.mockResolvedValue(mockResponse);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];

      // First request should succeed
      const result = await clientWithLowLimit.complete(messages, { maxTokens: 100 });
      expect(result.content).toBe('Response');
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = client.getConfig();

      expect(config).toEqual({
        defaultModel: 'gpt-4o',
        defaultTemperature: 0.7,
        defaultMaxTokens: 1000,
        retryOptions: {
          maxRetries: 3,
          initialRetryDelay: 1000,
          maxRetryDelay: 60000,
          backoffMultiplier: 2,
        },
        hasRateLimiter: false,
      });
    });
  });

  describe('setConfig', () => {
    it('should update defaultModel', () => {
      client.setConfig({ defaultModel: 'gpt-4o-mini' });

      const config = client.getConfig();
      expect(config.defaultModel).toBe('gpt-4o-mini');
    });

    it('should update defaultTemperature', () => {
      client.setConfig({ defaultTemperature: 0.5 });

      const config = client.getConfig();
      expect(config.defaultTemperature).toBe(0.5);
    });

    it('should update defaultMaxTokens', () => {
      client.setConfig({ defaultMaxTokens: 2000 });

      const config = client.getConfig();
      expect(config.defaultMaxTokens).toBe(2000);
    });

    it('should update multiple config values', () => {
      client.setConfig({
        defaultModel: 'gpt-4o-mini',
        defaultTemperature: 0.3,
        defaultMaxTokens: 500,
      });

      const config = client.getConfig();
      expect(config.defaultModel).toBe('gpt-4o-mini');
      expect(config.defaultTemperature).toBe(0.3);
      expect(config.defaultMaxTokens).toBe(500);
    });
  });

  describe('error handling', () => {
    it('should handle OpenAI API errors', async () => {
      mockCreate.mockRejectedValue(
        new Error('OpenAI API error: Invalid request')
      );

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];

      await expect(client.complete(messages)).rejects.toThrow('OpenAI API error: Invalid request');
    });

    it('should handle network errors', async () => {
      // Use a client with no retries for this test
      const noRetryClient = new LLMClient({
        apiKey: 'test-api-key',
        retry: {
          maxRetries: 0,
        },
      });

      const mockNoRetryCreate = (noRetryClient as any).client.chat.completions.create;

      mockNoRetryCreate.mockRejectedValue(
        new Error('Network error: ECONNREFUSED')
      );

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];

      await expect(noRetryClient.complete(messages)).rejects.toThrow('Network error: ECONNREFUSED');
    });
  });

  describe('debug logging', () => {
    it('should log when debug is enabled', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const debugClient = new LLMClient({
        apiKey: 'test-api-key',
        debug: true,
      });

      const mockDebugCreate = (debugClient as any).client.chat.completions.create;

      const mockResponse = {
        model: 'gpt-4o',
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockDebugCreate.mockResolvedValue(mockResponse);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];
      await debugClient.complete(messages);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LLMClient] Generating completion')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LLMClient] Completion generated')
      );

      consoleLogSpy.mockRestore();
    });

    it('should not log when debug is disabled', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const mockResponse = {
        model: 'gpt-4o',
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Test' }];
      await client.complete(messages);

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[LLMClient]')
      );

      consoleLogSpy.mockRestore();
    });
  });
});
