/**
 * @nexus-aec/livekit-agent - Reasoning LLM Adapter
 *
 * Custom LLM implementation that wraps the NexusAEC ReasoningLoop
 * into the LiveKit Agents LLM interface.
 *
 * This adapter bridges our ReasoningLoop (which handles GPT-4o tool calling,
 * briefing state, confirmations, etc.) with the LiveKit voice pipeline
 * (STT → LLM → TTS).
 */

import { llm, DEFAULT_API_CONNECT_OPTIONS } from '@livekit/agents';
import type { APIConnectOptions } from '@livekit/agents';

import { createLogger } from '@nexus-aec/logger';

import { ReasoningLoop, createReasoningLoop } from '../reasoning/reasoning-loop.js';

import type { BriefingTopicRef } from '../reasoning/reasoning-loop.js';
import type { OpenAIConfig } from '../config.js';
import type { EmailActionContext } from '../tools/email-tools.js';

const logger = createLogger({ baseContext: { component: 'reasoning-llm' } });

// =============================================================================
// Text Chunking Utility
// =============================================================================

/**
 * Split text into sentence-sized chunks for incremental streaming.
 *
 * The LiveKit voice pipeline (and particularly the TTS engine) expects
 * text to arrive in small incremental chunks — similar to how the OpenAI
 * streaming API delivers token-by-token. Pushing one giant chunk can
 * cause the pipeline's TransformStream/tee/ReadableStream plumbing to
 * stall or the worker heartbeat to expire ("job is unresponsive").
 *
 * This function splits at sentence boundaries so each chunk is a
 * complete, speakable phrase.
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 0) {
      chunks.push(trimmed);
    }
  }

  // If no sentence boundaries found, return the full text as one chunk
  if (chunks.length === 0 && text.trim().length > 0) {
    chunks.push(text.trim());
  }

  return chunks;
}

// =============================================================================
// ReasoningLLMStream
// =============================================================================

/**
 * LLM stream that delegates to the ReasoningLoop.
 *
 * When the voice pipeline calls this stream, it:
 * 1. Extracts the latest user message from ChatContext
 * 2. Passes it to ReasoningLoop.processUserInput()
 * 3. Pushes the response as incremental ChatChunk objects for TTS to speak
 *
 * IMPORTANT: Chunks must be pushed to `this.queue` (not `this.output`).
 * The SDK's internal monitorMetrics() reads from `queue`, collects metrics,
 * and forwards to `output` which is consumed by `next()`.
 * The framework closes `queue` automatically when `run()` completes.
 *
 * Text is split into sentence-sized chunks to match the streaming behavior
 * of standard LLM plugins (e.g., OpenAI) which push token-by-token.
 */
class ReasoningLLMStream extends llm.LLMStream {
  private reasoningLoop: ReasoningLoop;

  constructor(
    parentLlm: llm.LLM,
    reasoningLoop: ReasoningLoop,
    options: {
      chatCtx: llm.ChatContext;
      toolCtx?: llm.ToolContext;
      connOptions: APIConnectOptions;
    },
  ) {
    super(parentLlm, options);
    this.reasoningLoop = reasoningLoop;
  }

  /**
   * Main stream execution.
   * Called by the LiveKit framework when it needs an LLM response.
   *
   * Pushes ChatChunk objects to `this.queue`. The framework's monitorMetrics()
   * bridge forwards them to `this.output` for consumption by the voice pipeline.
   * Do NOT call this.queue.close() — the framework handles that.
   */
  protected async run(): Promise<void> {
    const runStartTime = Date.now();
    const items = this.chatCtx.items;
    const lastUserMessage = this.findLastUserMessage(items);

    logger.info('ReasoningLLMStream.run() started', {
      chatCtxItemCount: items.length,
      chatCtxItems: items.map((item, i) => {
        if ('role' in item) {
          const msg = item as llm.ChatMessage;
          return `[${i}] ${msg.role}: ${msg.textContent?.substring(0, 50) ?? '(no text)'}`;
        }
        return `[${i}] (unknown item type)`;
      }),
    });

    if (!lastUserMessage) {
      logger.warn('No user message found in ChatContext, producing empty response');
      this.queue.put({
        id: `chunk-${Date.now()}`,
        delta: {
          role: 'assistant',
          content: "I didn't catch that. Could you repeat?",
        },
      });
      return;
    }

    logger.info('Processing user input via ReasoningLoop', {
      userText: lastUserMessage.substring(0, 200),
    });

    try {
      // Process through our ReasoningLoop
      const llmCallStart = Date.now();
      const result = await this.reasoningLoop.processUserInput(lastUserMessage);
      const llmCallDuration = Date.now() - llmCallStart;

      logger.info('ReasoningLoop.processUserInput() returned', {
        durationMs: llmCallDuration,
        hasResponseText: !!result.responseText,
        responseLength: result.responseText?.length ?? 0,
        responsePreview: result.responseText?.substring(0, 300),
        actionsTaken: result.actionsTaken.map((a) => a.tool),
        shouldEnd: result.shouldEnd,
      });

      // Push the response text as incremental ChatChunks (sentence-by-sentence)
      // IMPORTANT: We add small async delays between chunks to simulate real LLM
      // streaming. Without delays, all chunks arrive synchronously in the same
      // microtask, which can confuse the SDK's SegmentSynchronizer — it expects
      // streaming behavior and may stall after barge-in if chunks arrive instantly.
      if (result.responseText) {
        const sentences = splitIntoSentences(result.responseText);
        logger.info('Streaming response as chunks to LLM queue', {
          responseLength: result.responseText.length,
          chunkCount: sentences.length,
          chunks: sentences.map((s, i) => `[${i}] ${s.substring(0, 80)}`),
        });

        for (let i = 0; i < sentences.length; i++) {
          const sentence = sentences[i];
          this.queue.put({
            id: `chunk-${Date.now()}-${i}`,
            delta: {
              role: 'assistant',
              content: sentence!,
            },
          });

          // Yield control between chunks to simulate streaming and give the
          // SDK's SegmentSynchronizer time to process each chunk
          if (i < sentences.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }

        logger.info('All chunks pushed to LLM queue', {
          totalChunks: sentences.length,
          totalRunDurationMs: Date.now() - runStartTime,
        });
      } else {
        logger.warn('ReasoningLoop produced empty response — nothing to push to queue');
      }

      // Log actions taken
      if (result.actionsTaken.length > 0) {
        logger.info('Actions taken by ReasoningLoop', {
          actions: result.actionsTaken.map((a) => ({
            tool: a.tool,
            success: 'success' in a.result ? a.result.success : undefined,
            message: 'message' in a.result ? (a.result.message as string)?.substring(0, 100) : undefined,
          })),
        });
      }

      // If the session should end, log it
      if (result.shouldEnd) {
        logger.info('ReasoningLoop indicated session should end');
      }

      logger.info('ReasoningLLMStream.run() completing normally', {
        totalDurationMs: Date.now() - runStartTime,
      });
    } catch (error) {
      logger.error('ReasoningLoop processing error', error instanceof Error ? error : null, {
        durationMs: Date.now() - runStartTime,
        userText: lastUserMessage.substring(0, 100),
      });
      this.queue.put({
        id: `chunk-error-${Date.now()}`,
        delta: {
          role: 'assistant',
          content: "I'm sorry, I encountered an error. Let me try again.",
        },
      });
    }
  }

  /**
   * Find the last user message from ChatContext items
   */
  private findLastUserMessage(items: llm.ChatItem[]): string | null {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item && 'role' in item && item.role === 'user') {
        const msg = item as llm.ChatMessage;
        return msg.textContent ?? null;
      }
    }
    return null;
  }
}

// =============================================================================
// ReasoningLLM
// =============================================================================

/**
 * Custom LLM implementation that uses the NexusAEC ReasoningLoop.
 *
 * This plugs into the LiveKit voice pipeline as the "brain":
 *   Deepgram STT → [ReasoningLLM] → ElevenLabs TTS
 *
 * The ReasoningLoop internally calls GPT-4o with tool definitions
 * and handles the full conversation flow (briefing state, tools, confirmations).
 */
export class ReasoningLLM extends llm.LLM {
  private reasoningLoop: ReasoningLoop;
  private openaiConfig: OpenAIConfig;

  constructor(
    openaiConfig: OpenAIConfig,
    topicItems: number[] = [5, 3, 2],
    systemPromptContext?: Record<string, string>,
    topicRefs?: BriefingTopicRef[],
  ) {
    super();
    this.openaiConfig = openaiConfig;
    this.reasoningLoop = createReasoningLoop(
      topicItems,
      systemPromptContext,
      openaiConfig,
      topicRefs,
    );

    logger.info('ReasoningLLM initialized', {
      model: openaiConfig.model,
      topicItems,
      hasTopicRefs: (topicRefs?.length ?? 0) > 0,
    });
  }

  label(): string {
    return 'nexus-reasoning-llm';
  }

  override get model(): string {
    return this.openaiConfig.model;
  }

  /**
   * Create an LLM stream that processes through the ReasoningLoop.
   */
  chat({
    chatCtx,
    toolCtx,
    connOptions,
  }: {
    chatCtx: llm.ChatContext;
    toolCtx?: llm.ToolContext;
    connOptions?: APIConnectOptions;
    parallelToolCalls?: boolean;
    toolChoice?: llm.ToolChoice;
    extraKwargs?: Record<string, unknown>;
  }): llm.LLMStream {
    logger.info('ReasoningLLM.chat() called — creating new LLMStream', {
      chatCtxItemCount: chatCtx.items.length,
      hasToolCtx: !!toolCtx,
    });
    const streamOptions: {
      chatCtx: llm.ChatContext;
      toolCtx?: llm.ToolContext;
      connOptions: APIConnectOptions;
    } = {
      chatCtx,
      connOptions: connOptions ?? DEFAULT_API_CONNECT_OPTIONS,
    };
    if (toolCtx !== undefined) {
      streamOptions.toolCtx = toolCtx;
    }
    return new ReasoningLLMStream(this, this.reasoningLoop, streamOptions);
  }

  /**
   * Get the underlying ReasoningLoop for direct access
   * (e.g., to set email context, handle barge-in, etc.)
   */
  getReasoningLoop(): ReasoningLoop {
    return this.reasoningLoop;
  }

  /**
   * Set the email context for the current email being discussed
   */
  setEmailContext(context: EmailActionContext): void {
    this.reasoningLoop.setEmailContext(context);
  }

  /**
   * Handle barge-in (user interrupting the agent)
   */
  async handleBargeIn(): Promise<void> {
    await this.reasoningLoop.handleBargeIn({ timestamp: Date.now() });
  }
}
