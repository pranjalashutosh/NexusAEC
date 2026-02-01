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

import type { OpenAIConfig } from '../config.js';
import type { EmailActionContext } from '../tools/email-tools.js';

const logger = createLogger({ baseContext: { component: 'reasoning-llm' } });

// =============================================================================
// ReasoningLLMStream
// =============================================================================

/**
 * LLM stream that delegates to the ReasoningLoop.
 *
 * When the voice pipeline calls this stream, it:
 * 1. Extracts the latest user message from ChatContext
 * 2. Passes it to ReasoningLoop.processUserInput()
 * 3. Pushes the response as ChatChunk objects for TTS to speak
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
   */
  protected async run(): Promise<void> {
    // Extract the latest user message from the ChatContext
    const items = this.chatCtx.items;
    const lastUserMessage = this.findLastUserMessage(items);

    if (!lastUserMessage) {
      logger.warn('No user message found in ChatContext');
      this.output.put({
        id: `chunk-${Date.now()}`,
        delta: {
          role: 'assistant',
          content: "I didn't catch that. Could you repeat?",
        },
      });
      this.output.close();
      return;
    }

    logger.debug('Processing user input via ReasoningLoop', {
      userText: lastUserMessage,
    });

    try {
      // Process through our ReasoningLoop
      const result = await this.reasoningLoop.processUserInput(lastUserMessage);

      // Push the response text as a ChatChunk
      if (result.responseText) {
        this.output.put({
          id: `chunk-${Date.now()}`,
          delta: {
            role: 'assistant',
            content: result.responseText,
          },
        });
      }

      // Log actions taken
      if (result.actionsTaken.length > 0) {
        logger.info('Actions taken by ReasoningLoop', {
          actions: result.actionsTaken.map((a) => a.tool),
        });
      }

      // If the session should end, log it
      if (result.shouldEnd) {
        logger.info('ReasoningLoop indicated session should end');
      }
    } catch (error) {
      logger.error('ReasoningLoop processing error', error instanceof Error ? error : null);
      this.output.put({
        id: `chunk-error-${Date.now()}`,
        delta: {
          role: 'assistant',
          content: "I'm sorry, I encountered an error. Let me try again.",
        },
      });
    }

    this.output.close();
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
  ) {
    super();
    this.openaiConfig = openaiConfig;
    this.reasoningLoop = createReasoningLoop(
      topicItems,
      systemPromptContext,
      openaiConfig,
    );

    logger.info('ReasoningLLM initialized', {
      model: openaiConfig.model,
      topicItems,
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
