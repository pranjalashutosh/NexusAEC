/**
 * LLM Client (Tier 3)
 *
 * GPT-4o API integration with retry logic, rate limiting, and streaming support.
 * Used for email summarization, narrative generation, and explanation generation.
 */

import OpenAI from 'openai';

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * LLM message role
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * LLM message
 */
export interface LLMMessage {
  role: MessageRole;
  content: string;
}

/**
 * LLM completion options
 */
export interface LLMCompletionOptions {
  /**
   * Model to use
   * Default: 'gpt-4o'
   */
  model?: string;

  /**
   * Temperature (0-2)
   * Lower = more deterministic, Higher = more creative
   * Default: 0.7
   */
  temperature?: number;

  /**
   * Maximum tokens to generate
   * Default: 1000
   */
  maxTokens?: number;

  /**
   * Top P sampling (0-1)
   * Default: 1
   */
  topP?: number;

  /**
   * Frequency penalty (-2 to 2)
   * Positive = less repetition
   * Default: 0
   */
  frequencyPenalty?: number;

  /**
   * Presence penalty (-2 to 2)
   * Positive = more novel topics
   * Default: 0
   */
  presencePenalty?: number;

  /**
   * Stop sequences
   */
  stop?: string[];

  /**
   * Enable streaming
   * Default: false
   */
  stream?: boolean;
}

/**
 * LLM completion result
 */
export interface LLMCompletionResult {
  /**
   * Generated text
   */
  content: string;

  /**
   * Model used
   */
  model: string;

  /**
   * Tokens used in prompt
   */
  promptTokens: number;

  /**
   * Tokens generated in completion
   */
  completionTokens: number;

  /**
   * Total tokens used
   */
  totalTokens: number;

  /**
   * Finish reason
   */
  finishReason: 'stop' | 'length' | 'content_filter' | 'function_call' | null;

  /**
   * Response time in milliseconds
   */
  responseTimeMs: number;
}

/**
 * Streaming chunk callback
 */
export type StreamChunkCallback = (chunk: string) => void | Promise<void>;

/**
 * Rate limiter options
 */
export interface RateLimiterOptions {
  /**
   * Maximum requests per minute
   * Default: 60
   */
  requestsPerMinute?: number;

  /**
   * Maximum tokens per minute
   * Default: 90000
   */
  tokensPerMinute?: number;
}

/**
 * Retry options
 */
export interface RetryOptions {
  /**
   * Maximum number of retries
   * Default: 3
   */
  maxRetries?: number;

  /**
   * Initial retry delay in milliseconds
   * Default: 1000
   */
  initialRetryDelay?: number;

  /**
   * Maximum retry delay in milliseconds
   * Default: 60000 (1 minute)
   */
  maxRetryDelay?: number;

  /**
   * Exponential backoff multiplier
   * Default: 2
   */
  backoffMultiplier?: number;
}

/**
 * LLM Client options
 */
export interface LLMClientOptions {
  /**
   * OpenAI API key
   */
  apiKey: string;

  /**
   * Default model
   * Default: 'gpt-4o'
   */
  defaultModel?: string;

  /**
   * Default temperature
   * Default: 0.7
   */
  defaultTemperature?: number;

  /**
   * Default max tokens
   * Default: 1000
   */
  defaultMaxTokens?: number;

  /**
   * Rate limiter options
   */
  rateLimiter?: RateLimiterOptions;

  /**
   * Retry options
   */
  retry?: RetryOptions;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Organization ID (optional)
   */
  organization?: string;

  /**
   * Base URL (optional, for custom endpoints)
   */
  baseURL?: string;
}

/**
 * Rate limiter using token bucket algorithm
 */
class RateLimiter {
  private requestTokens: number;
  private completionTokens: number;
  private readonly requestsPerMinute: number;
  private readonly tokensPerMinute: number;
  private lastRefill: number;

  constructor(options: RateLimiterOptions) {
    this.requestsPerMinute = options.requestsPerMinute ?? 60;
    this.tokensPerMinute = options.tokensPerMinute ?? 90000;
    this.requestTokens = this.requestsPerMinute;
    this.completionTokens = this.tokensPerMinute;
    this.lastRefill = Date.now();
  }

  /**
   * Refill token buckets based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    const elapsedMinutes = elapsedMs / 60000;

    if (elapsedMinutes > 0) {
      // Refill requests
      this.requestTokens = Math.min(
        this.requestsPerMinute,
        this.requestTokens + this.requestsPerMinute * elapsedMinutes
      );

      // Refill tokens
      this.completionTokens = Math.min(
        this.tokensPerMinute,
        this.completionTokens + this.tokensPerMinute * elapsedMinutes
      );

      this.lastRefill = now;
    }
  }

  /**
   * Wait until rate limit allows the request
   */
  async waitForCapacity(estimatedTokens: number = 1000): Promise<void> {
    while (true) {
      this.refill();

      // Check if we have capacity
      if (this.requestTokens >= 1 && this.completionTokens >= estimatedTokens) {
        // Consume tokens
        this.requestTokens -= 1;
        this.completionTokens -= estimatedTokens;
        return;
      }

      // Calculate wait time
      const requestWaitMs =
        this.requestTokens < 1 ? (1 - this.requestTokens) * (60000 / this.requestsPerMinute) : 0;
      const tokenWaitMs =
        this.completionTokens < estimatedTokens
          ? (estimatedTokens - this.completionTokens) * (60000 / this.tokensPerMinute)
          : 0;

      const waitMs = Math.max(requestWaitMs, tokenWaitMs, 100); // Minimum 100ms wait

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  /**
   * Return tokens after completion (for accurate tracking)
   */
  returnTokens(actualTokens: number, estimatedTokens: number): void {
    const difference = estimatedTokens - actualTokens;
    if (difference > 0) {
      this.completionTokens = Math.min(this.tokensPerMinute, this.completionTokens + difference);
    }
  }
}

/**
 * LLM Client
 *
 * Provides GPT-4o API integration with retry logic, rate limiting, and streaming support.
 *
 * @example
 * ```typescript
 * import { LLMClient } from '@nexus-aec/intelligence';
 *
 * // Initialize client
 * const client = new LLMClient({
 *   apiKey: process.env.OPENAI_API_KEY!,
 *   defaultModel: 'gpt-4o',
 *   rateLimiter: {
 *     requestsPerMinute: 60,
 *     tokensPerMinute: 90000,
 *   },
 *   retry: {
 *     maxRetries: 3,
 *   },
 * });
 *
 * // Generate completion
 * const result = await client.complete([
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Summarize this email thread.' },
 * ]);
 *
 * console.log(result.content);
 *
 * // Stream completion
 * await client.streamComplete(
 *   [{ role: 'user', content: 'Write a briefing script.' }],
 *   (chunk) => {
 *     process.stdout.write(chunk);
 *   }
 * );
 * ```
 */
export class LLMClient {
  private client: OpenAI;
  private defaultModel: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;
  private rateLimiter: RateLimiter | null;
  private retryOptions: Required<RetryOptions>;
  private debug: boolean;

  constructor(options: LLMClientOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      organization: options.organization,
      baseURL: options.baseURL,
    });

    this.defaultModel = options.defaultModel ?? 'gpt-4o';
    this.defaultTemperature = options.defaultTemperature ?? 0.7;
    this.defaultMaxTokens = options.defaultMaxTokens ?? 1000;
    this.debug = options.debug ?? false;

    // Initialize rate limiter if options provided
    this.rateLimiter = options.rateLimiter ? new RateLimiter(options.rateLimiter) : null;

    // Initialize retry options with defaults
    this.retryOptions = {
      maxRetries: options.retry?.maxRetries ?? 3,
      initialRetryDelay: options.retry?.initialRetryDelay ?? 1000,
      maxRetryDelay: options.retry?.maxRetryDelay ?? 60000,
      backoffMultiplier: options.retry?.backoffMultiplier ?? 2,
    };
  }

  /**
   * Generate a completion
   *
   * @param messages - Conversation messages
   * @param options - Completion options
   * @returns Completion result
   */
  async complete(
    messages: LLMMessage[],
    options: LLMCompletionOptions = {}
  ): Promise<LLMCompletionResult> {
    const model = options.model ?? this.defaultModel;
    const temperature = options.temperature ?? this.defaultTemperature;
    const maxTokens = options.maxTokens ?? this.defaultMaxTokens;

    if (this.debug) {
      console.log(`[LLMClient] Generating completion with model: ${model}`);
    }

    // Estimate tokens for rate limiting (rough estimate: ~4 chars per token)
    const estimatedPromptTokens = messages.reduce(
      (sum, msg) => sum + Math.ceil(msg.content.length / 4),
      0
    );
    const estimatedTokens = estimatedPromptTokens + maxTokens;

    // Apply rate limiting
    if (this.rateLimiter) {
      await this.rateLimiter.waitForCapacity(estimatedTokens);
    }

    // Execute with retry
    return this.executeWithRetry(async () => {
      const startTime = Date.now();

      const request = {
        model,
        messages: messages as ChatCompletionMessageParam[],
        temperature,
        max_tokens: maxTokens,
        ...(options.topP !== undefined ? { top_p: options.topP } : {}),
        ...(options.frequencyPenalty !== undefined
          ? { frequency_penalty: options.frequencyPenalty }
          : {}),
        ...(options.presencePenalty !== undefined
          ? { presence_penalty: options.presencePenalty }
          : {}),
        ...(options.stop !== undefined ? { stop: options.stop } : {}),
      };

      const response = await this.client.chat.completions.create(request);

      const responseTimeMs = Date.now() - startTime;

      const choice = response.choices[0];
      if (!choice?.message) {
        throw new Error('No completion generated');
      }

      const result: LLMCompletionResult = {
        content: choice.message.content ?? '',
        model: response.model,
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
        finishReason: choice.finish_reason as LLMCompletionResult['finishReason'],
        responseTimeMs,
      };

      // Return unused tokens to rate limiter
      if (this.rateLimiter && response.usage) {
        this.rateLimiter.returnTokens(response.usage.total_tokens, estimatedTokens);
      }

      if (this.debug) {
        console.log(
          `[LLMClient] Completion generated: ${result.totalTokens} tokens in ${result.responseTimeMs}ms`
        );
      }

      return result;
    });
  }

  /**
   * Generate a streaming completion
   *
   * @param messages - Conversation messages
   * @param onChunk - Callback for each chunk
   * @param options - Completion options
   * @returns Completion result
   */
  async streamComplete(
    messages: LLMMessage[],
    onChunk: StreamChunkCallback,
    options: LLMCompletionOptions = {}
  ): Promise<LLMCompletionResult> {
    const model = options.model ?? this.defaultModel;
    const temperature = options.temperature ?? this.defaultTemperature;
    const maxTokens = options.maxTokens ?? this.defaultMaxTokens;

    if (this.debug) {
      console.log(`[LLMClient] Generating streaming completion with model: ${model}`);
    }

    // Estimate tokens for rate limiting
    const estimatedPromptTokens = messages.reduce(
      (sum, msg) => sum + Math.ceil(msg.content.length / 4),
      0
    );
    const estimatedTokens = estimatedPromptTokens + maxTokens;

    // Apply rate limiting
    if (this.rateLimiter) {
      await this.rateLimiter.waitForCapacity(estimatedTokens);
    }

    // Execute with retry
    return this.executeWithRetry(async () => {
      const startTime = Date.now();
      let fullContent = '';
      let finishReason: LLMCompletionResult['finishReason'] = null;

      const request = {
        model,
        messages: messages as ChatCompletionMessageParam[],
        temperature,
        max_tokens: maxTokens,
        ...(options.topP !== undefined ? { top_p: options.topP } : {}),
        ...(options.frequencyPenalty !== undefined
          ? { frequency_penalty: options.frequencyPenalty }
          : {}),
        ...(options.presencePenalty !== undefined
          ? { presence_penalty: options.presencePenalty }
          : {}),
        ...(options.stop !== undefined ? { stop: options.stop } : {}),
        stream: true,
      } as const;

      const stream = await this.client.chat.completions.create(request);

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          await onChunk(delta.content);
        }

        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason as LLMCompletionResult['finishReason'];
        }
      }

      const responseTimeMs = Date.now() - startTime;

      // Estimate token usage (since streaming doesn't provide usage stats)
      const promptTokens = estimatedPromptTokens;
      const completionTokens = Math.ceil(fullContent.length / 4);
      const totalTokens = promptTokens + completionTokens;

      const result: LLMCompletionResult = {
        content: fullContent,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        finishReason,
        responseTimeMs,
      };

      // Return unused tokens to rate limiter
      if (this.rateLimiter) {
        this.rateLimiter.returnTokens(totalTokens, estimatedTokens);
      }

      if (this.debug) {
        console.log(
          `[LLMClient] Streaming completion generated: ~${result.totalTokens} tokens in ${result.responseTimeMs}ms`
        );
      }

      return result;
    });
  }

  /**
   * Execute a function with retry logic
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    let retryDelay = this.retryOptions.initialRetryDelay;

    for (let attempt = 0; attempt <= this.retryOptions.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const isRetryable = this.isRetryableError(lastError);

        if (!isRetryable || attempt === this.retryOptions.maxRetries) {
          // Don't retry or max retries reached
          throw lastError;
        }

        if (this.debug) {
          console.log(
            `[LLMClient] Retry ${attempt + 1}/${this.retryOptions.maxRetries} after ${retryDelay}ms: ${lastError.message}`
          );
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        // Exponential backoff
        retryDelay = Math.min(
          retryDelay * this.retryOptions.backoffMultiplier,
          this.retryOptions.maxRetryDelay
        );
      }
    }

    throw lastError;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Retryable errors
    const retryablePatterns = [
      'rate limit',
      'timeout',
      'network',
      'econnreset',
      'enotfound',
      'econnrefused',
      'etimedout',
      '429',
      '500',
      '502',
      '503',
      '504',
    ];

    return retryablePatterns.some((pattern) => message.includes(pattern));
  }

  /**
   * Get current configuration
   */
  getConfig(): {
    defaultModel: string;
    defaultTemperature: number;
    defaultMaxTokens: number;
    retryOptions: Required<RetryOptions>;
    hasRateLimiter: boolean;
  } {
    return {
      defaultModel: this.defaultModel,
      defaultTemperature: this.defaultTemperature,
      defaultMaxTokens: this.defaultMaxTokens,
      retryOptions: this.retryOptions,
      hasRateLimiter: this.rateLimiter !== null,
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: {
    defaultModel?: string;
    defaultTemperature?: number;
    defaultMaxTokens?: number;
  }): void {
    if (config.defaultModel !== undefined) {
      this.defaultModel = config.defaultModel;
    }
    if (config.defaultTemperature !== undefined) {
      this.defaultTemperature = config.defaultTemperature;
    }
    if (config.defaultMaxTokens !== undefined) {
      this.defaultMaxTokens = config.defaultMaxTokens;
    }
  }
}
