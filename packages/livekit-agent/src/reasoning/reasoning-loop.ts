/**
 * @nexus-aec/livekit-agent - Reasoning Loop
 *
 * Orchestrates the STT → GPT-4o → TTS cycle for voice interactions.
 * 
 * Features:
 * - Process user speech transcripts
 * - Call GPT-4o with tools for reasoning
 * - Handle tool calls (email actions, navigation)
 * - Generate TTS response
 * - Handle barge-in (interruption)
 * - Connect to ShadowProcessor for state updates
 */

import { createLogger } from '@nexus-aec/logger';

import { loadOpenAIConfig } from '../config.js';
import { generateConfirmation, generateDisambiguationPrompt } from '../prompts/briefing-prompts.js';
import { buildSystemPrompt, DEFAULT_SYSTEM_PROMPT_CONTEXT } from '../prompts/system-prompt.js';
import { detectCommand, processTranscript } from '../stt/index.js';
import { EMAIL_TOOLS, executeEmailTool } from '../tools/email-tools.js';
import {
  createBriefingState,
  executeNavigationTool,
  NAVIGATION_TOOLS,
  updateBriefingState,
} from '../tools/navigation-tools.js';
import { preprocessTextForTTS, splitTextForStreaming } from '../tts/index.js';

import type { OpenAIConfig } from '../config.js';
import type { BriefingContext } from '../prompts/briefing-prompts.js';
import type { SystemPromptContext } from '../prompts/system-prompt.js';
import type { TranscriptEvent } from '../stt/index.js';
import type { EmailActionContext, ToolResult } from '../tools/email-tools.js';
import type { BriefingState, NavigationResult } from '../tools/navigation-tools.js';

const logger = createLogger({ baseContext: { component: 'reasoning-loop' } });

// =============================================================================
// Types
// =============================================================================

/**
 * Message in the conversation
 */
export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/**
 * Reasoning loop state
 */
export interface ReasoningState {
  /** Conversation history */
  messages: ConversationMessage[];
  /** Current briefing state */
  briefingState: BriefingState;
  /** Current email context */
  emailContext?: EmailActionContext;
  /** Briefing context */
  briefingContext: BriefingContext;
  /** Is currently speaking (for barge-in detection) */
  isSpeaking: boolean;
  /** Last spoken text (for repeat functionality) */
  lastSpokenText: string;
  /** Pending confirmation */
  pendingConfirmation?: {
    action: string;
    args: Record<string, unknown>;
    context: EmailActionContext;
  };
  /** Disambiguation options */
  disambiguationOptions?: Array<{ label: string; description: string }>;
}

/**
 * Reasoning loop result
 */
export interface ReasoningResult {
  /** Text to speak via TTS */
  responseText: string;
  /** Chunks for streaming TTS */
  responseChunks: string[];
  /** Actions taken */
  actionsTaken: Array<{
    tool: string;
    result: ToolResult | NavigationResult;
  }>;
  /** Should end conversation */
  shouldEnd: boolean;
  /** Updated state */
  state: ReasoningState;
}

/**
 * Barge-in event
 */
export interface BargeInEvent {
  /** When the interruption was detected */
  timestamp: number;
  /** Partial transcript that triggered barge-in */
  partialTranscript?: string;
}

/**
 * Callback for TTS output
 */
export type TTSCallback = (text: string, isFinal: boolean) => void;

/**
 * Callback for state updates (to ShadowProcessor)
 */
export type StateUpdateCallback = (state: ReasoningState) => void;

// =============================================================================
// OpenAI Client
// =============================================================================

/**
 * Simple OpenAI chat completion interface
 * In production, this would use the actual OpenAI SDK
 */
interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
}

/**
 * Call OpenAI chat completion API
 * This is a simplified interface - actual implementation would use OpenAI SDK
 */
async function callChatCompletion(
  messages: ConversationMessage[],
  tools: Array<{ type: 'function'; function: Record<string, unknown> }>,
  config: OpenAIConfig
): Promise<ChatCompletionResponse> {
  // In production, this would call the actual OpenAI API
  // For now, return a mock response for development
  logger.debug('Calling chat completion', {
    messageCount: messages.length,
    toolCount: tools.length,
    model: config.model,
  });

  // This is a placeholder - actual implementation would use fetch or OpenAI SDK
  const response = await mockChatCompletion(messages, tools);
  return response;
}

/**
 * Mock chat completion for development/testing
 */
async function mockChatCompletion(
  messages: ConversationMessage[],
  _tools: Array<{ type: 'function'; function: Record<string, unknown> }>
): Promise<ChatCompletionResponse> {
  // Get the last user message
  const lastUserMessage = messages
    .filter((m) => m.role === 'user')
    .pop();

  const userText = lastUserMessage?.content?.toLowerCase() ?? '';

  // Simple mock responses based on user input
  let responseContent = "I'm here to help with your email briefing.";
  let toolCalls: ChatCompletionResponse['choices'][0]['message']['tool_calls'] = undefined;

  // Detect intents and mock responses
  if (userText.includes('skip') || userText.includes('next topic')) {
    toolCalls = [{
      id: 'call_1',
      type: 'function',
      function: {
        name: 'skip_topic',
        arguments: '{}',
      },
    }];
    responseContent = '';
  } else if (userText.includes('next')) {
    toolCalls = [{
      id: 'call_1',
      type: 'function',
      function: {
        name: 'next_item',
        arguments: '{}',
      },
    }];
    responseContent = '';
  } else if (userText.includes('flag') || userText.includes('follow up')) {
    toolCalls = [{
      id: 'call_1',
      type: 'function',
      function: {
        name: 'flag_followup',
        arguments: '{"due_date": "tomorrow"}',
      },
    }];
    responseContent = '';
  } else if (userText.includes('mute')) {
    toolCalls = [{
      id: 'call_1',
      type: 'function',
      function: {
        name: 'mute_sender',
        arguments: '{"sender_email": "example@email.com"}',
      },
    }];
    responseContent = '';
  } else if (userText.includes('repeat')) {
    toolCalls = [{
      id: 'call_1',
      type: 'function',
      function: {
        name: 'repeat_that',
        arguments: '{}',
      },
    }];
    responseContent = '';
  } else if (userText.includes('pause')) {
    toolCalls = [{
      id: 'call_1',
      type: 'function',
      function: {
        name: 'pause_briefing',
        arguments: '{}',
      },
    }];
    responseContent = '';
  } else if (userText.includes('stop') || userText.includes('done')) {
    toolCalls = [{
      id: 'call_1',
      type: 'function',
      function: {
        name: 'stop_briefing',
        arguments: '{}',
      },
    }];
    responseContent = '';
  } else if (userText.includes('yes') || userText.includes('confirm')) {
    responseContent = 'Done.';
  } else if (userText.includes('no') || userText.includes('cancel')) {
    responseContent = "Okay, cancelled.";
  }

  const message: ChatCompletionResponse['choices'][0]['message'] = {
    role: 'assistant',
    content: responseContent || null,
  };

  if (toolCalls) {
    message.tool_calls = toolCalls;
  }

  return {
    choices: [{
      message,
      finish_reason: toolCalls ? 'tool_calls' : 'stop',
    }],
  };
}

// =============================================================================
// Reasoning Loop Class
// =============================================================================

/**
 * Main reasoning loop for voice interactions
 */
export class ReasoningLoop {
  private config: OpenAIConfig;
  private systemPromptContext: SystemPromptContext;
  private state: ReasoningState;
  private ttsCallback?: TTSCallback;
  private stateUpdateCallback?: StateUpdateCallback;
  private isProcessing: boolean = false;
  private bargeInDetected: boolean = false;

  constructor(
    topicItems: number[] = [5, 3, 2],
    systemPromptContext?: Partial<SystemPromptContext>,
    config?: OpenAIConfig
  ) {
    this.config = config ?? loadOpenAIConfig();
    this.systemPromptContext = {
      ...DEFAULT_SYSTEM_PROMPT_CONTEXT,
      ...systemPromptContext,
    };

    // Initialize state
    this.state = {
      messages: [{
        role: 'system',
        content: buildSystemPrompt(this.systemPromptContext),
      }],
      briefingState: createBriefingState(topicItems),
      briefingContext: {
        totalItems: topicItems.reduce((sum, count) => sum + count, 0),
        currentPosition: 0,
        currentTopic: 'Inbox',
        remainingTopics: ['VIP', 'Flagged', 'Updates'],
        estimatedMinutesRemaining: Math.ceil(topicItems.reduce((sum, count) => sum + count, 0) * 0.5),
      },
      isSpeaking: false,
      lastSpokenText: '',
    };

    logger.info('Reasoning loop initialized', {
      totalItems: this.state.briefingContext.totalItems,
      topicCount: topicItems.length,
    });
  }

  /**
   * Set TTS callback for streaming output
   */
  setTTSCallback(callback: TTSCallback): void {
    this.ttsCallback = callback;
  }

  /**
   * Set state update callback (for ShadowProcessor)
   */
  setStateUpdateCallback(callback: StateUpdateCallback): void {
    this.stateUpdateCallback = callback;
  }

  /**
   * Process a transcript from STT
   */
  async processTranscript(event: TranscriptEvent): Promise<ReasoningResult> {
    // Check if we should process this transcript
    const processed = processTranscript(event);
    
    if (!processed.shouldProcess) {
      logger.debug('Skipping low-quality transcript', {
        confidence: processed.confidence,
        text: processed.text,
      });
      return this.createEmptyResult();
    }

    // Handle barge-in if we're currently speaking
    if (this.state.isSpeaking) {
      await this.handleBargeIn({ timestamp: Date.now(), partialTranscript: processed.text });
    }

    // Process the user input
    return this.processUserInput(processed.text);
  }

  /**
   * Process user text input
   */
  async processUserInput(text: string): Promise<ReasoningResult> {
    if (this.isProcessing) {
      logger.warn('Already processing, queuing input', { text });
      // In production, implement proper queuing
      return this.createEmptyResult();
    }

    this.isProcessing = true;

    try {
      // Add user message to conversation
      this.state.messages.push({ role: 'user', content: text });

      // Handle pending confirmation
      if (this.state.pendingConfirmation) {
        return await this.handleConfirmation(text);
      }

      // Handle disambiguation
      if (this.state.disambiguationOptions) {
        return await this.handleDisambiguation(text);
      }

      // Call GPT-4o for reasoning
      const result = await this.callLLM();

      // Notify state update
      if (this.stateUpdateCallback) {
        this.stateUpdateCallback(this.state);
      }

      return result;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Call LLM and process response
   */
  private async callLLM(): Promise<ReasoningResult> {
    // Combine all tools
    const allTools = [...EMAIL_TOOLS, ...NAVIGATION_TOOLS].map((t) => ({
      type: 'function' as const,
      function: t.function as unknown as Record<string, unknown>,
    }));

    // Call chat completion
    const response = await callChatCompletion(
      this.state.messages,
      allTools,
      this.config
    );

    const choice = response.choices[0];
    const message = choice?.message;

    if (!message) {
      logger.error('No message in response');
      return this.createErrorResult('I had trouble understanding. Could you repeat that?');
    }

    // Handle tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      return await this.handleToolCalls(message.tool_calls);
    }

    // Handle text response
    const responseText = message.content ?? '';
    return this.createTextResult(responseText);
  }

  /**
   * Handle tool calls from GPT-4o
   */
  private async handleToolCalls(
    toolCalls: NonNullable<ChatCompletionResponse['choices'][0]['message']['tool_calls']>
  ): Promise<ReasoningResult> {
    const actionsTaken: ReasoningResult['actionsTaken'] = [];
    let responseText = '';
    let shouldEnd = false;

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

      logger.info('Executing tool', { toolName, args });

      // Check if it's an email tool
      if (EMAIL_TOOLS.some((t) => t.function.name === toolName)) {
        const result = await executeEmailTool(
          toolName,
          args,
          this.state.emailContext ?? { emailId: 'current' }
        );

        actionsTaken.push({ tool: toolName, result });

        // Handle confirmation requirement
        if (result.requiresConfirmation) {
          this.state.pendingConfirmation = {
            action: toolName,
            args,
            context: this.state.emailContext ?? { emailId: 'current' },
          };
          responseText = result.message;
        } else {
          responseText += result.message + ' ';
        }

        // Add tool result to messages
        this.state.messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
      // Check if it's a navigation tool
      else if (NAVIGATION_TOOLS.some((t) => t.function.name === toolName)) {
        const result = executeNavigationTool(toolName, args, this.state.briefingState);

        actionsTaken.push({ tool: toolName, result });

        // Update briefing state
        if (result.success) {
          this.state.briefingState = updateBriefingState(this.state.briefingState, result);
        }

        // Handle special navigation actions
        if (result.action === 'stop') {
          shouldEnd = true;
        } else if (result.action === 'repeat') {
          responseText = this.state.lastSpokenText;
        }

        responseText += result.message + ' ';

        // Add tool result to messages
        this.state.messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
    }

    return this.createTextResult(responseText.trim(), actionsTaken, shouldEnd);
  }

  /**
   * Handle confirmation response
   */
  private async handleConfirmation(text: string): Promise<ReasoningResult> {
    const command = detectCommand(text);
    const pending = this.state.pendingConfirmation;

    if (!pending) {
      return this.createTextResult("I'm not sure what you're confirming.");
    }

    if (command.possibleIntent === 'confirmation') {
      // User confirmed - execute the action
      const result = await executeEmailTool(pending.action, pending.args, pending.context);
      delete this.state.pendingConfirmation;

        const confirmMessage = generateConfirmation(pending.action, result.riskLevel);
        return this.createTextResult(
          confirmMessage,
        [{ tool: pending.action, result }]
      );
    } else {
      // User cancelled
      delete this.state.pendingConfirmation;
      return this.createTextResult("Okay, cancelled.");
    }
  }

  /**
   * Handle disambiguation response
   */
  private async handleDisambiguation(text: string): Promise<ReasoningResult> {
    // Try to match user input to options
    const options = this.state.disambiguationOptions;
    
    if (!options || options.length === 0) {
      return this.createTextResult("I'm not sure what you're referring to.");
    }

    const lowerText = text.toLowerCase();

    // Check for number selection
    const numberMatch = text.match(/\b(\d+)\b/);
    if (numberMatch && numberMatch[1]) {
      const index = parseInt(numberMatch[1], 10) - 1;
      const selectedOption = options[index];
      if (index >= 0 && selectedOption) {
        delete this.state.disambiguationOptions;
        return this.processUserInput(selectedOption.label);
      }
    }

    // Check for text match
    for (const option of options) {
      if (lowerText.includes(option.label.toLowerCase())) {
        delete this.state.disambiguationOptions;
        return this.processUserInput(option.label);
      }
    }

    // No match - ask again
    return this.createTextResult(
      generateDisambiguationPrompt(options, text)
    );
  }

  /**
   * Handle barge-in (interruption)
   */
  async handleBargeIn(event: BargeInEvent): Promise<void> {
    logger.info('Barge-in detected', { timestamp: event.timestamp });

    this.bargeInDetected = true;
    this.state.isSpeaking = false;

    // Notify TTS to stop
    if (this.ttsCallback) {
      this.ttsCallback('', true); // Empty string signals stop
    }
  }

  /**
   * Check if barge-in was detected
   */
  wasBargeInDetected(): boolean {
    const detected = this.bargeInDetected;
    this.bargeInDetected = false; // Reset after check
    return detected;
  }

  /**
   * Set speaking state
   */
  setSpeaking(isSpeaking: boolean): void {
    this.state.isSpeaking = isSpeaking;
  }

  /**
   * Update email context
   */
  setEmailContext(context: EmailActionContext): void {
    this.state.emailContext = context;
  }

  /**
   * Get current state
   */
  getState(): ReasoningState {
    return this.state;
  }

  /**
   * Create empty result (no action needed)
   */
  private createEmptyResult(): ReasoningResult {
    return {
      responseText: '',
      responseChunks: [],
      actionsTaken: [],
      shouldEnd: false,
      state: this.state,
    };
  }

  /**
   * Create error result
   */
  private createErrorResult(message: string): ReasoningResult {
    return this.createTextResult(message);
  }

  /**
   * Create text result with TTS chunks
   */
  private createTextResult(
    text: string,
    actionsTaken: ReasoningResult['actionsTaken'] = [],
    shouldEnd: boolean = false
  ): ReasoningResult {
    // Preprocess for TTS
    const processedText = preprocessTextForTTS(text);
    const chunks = splitTextForStreaming(processedText);

    // Store for repeat functionality
    if (text) {
      this.state.lastSpokenText = text;
    }

    // Add assistant message
    if (text) {
      this.state.messages.push({ role: 'assistant', content: text });
    }

    // Stream to TTS callback
    if (this.ttsCallback && chunks.length > 0) {
      this.state.isSpeaking = true;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk !== undefined) {
          this.ttsCallback(chunk, i === chunks.length - 1);
        }
      }
    }

    return {
      responseText: text,
      responseChunks: chunks,
      actionsTaken,
      shouldEnd,
      state: this.state,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new reasoning loop instance
 */
export function createReasoningLoop(
  topicItems?: number[],
  systemPromptContext?: Partial<SystemPromptContext>,
  config?: OpenAIConfig
): ReasoningLoop {
  return new ReasoningLoop(topicItems, systemPromptContext, config);
}

// =============================================================================
// Re-export types (already exported above)
// =============================================================================
