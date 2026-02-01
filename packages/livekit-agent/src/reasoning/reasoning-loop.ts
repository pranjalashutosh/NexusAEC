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
import OpenAI from 'openai';

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
 * Call OpenAI chat completion API with tool support
 */
async function callChatCompletion(
  messages: ConversationMessage[],
  tools: Array<{ type: 'function'; function: Record<string, unknown> }>,
  config: OpenAIConfig
): Promise<ChatCompletionResponse> {
  logger.debug('Calling OpenAI chat completion', {
    messageCount: messages.length,
    toolCount: tools.length,
    model: config.model,
  });

  // Initialize OpenAI client
  const openai = new OpenAI({ apiKey: config.apiKey });

  // Build messages array for OpenAI API
  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map((msg) => {
    if (msg.role === 'system') {
      return { role: 'system' as const, content: msg.content };
    }
    if (msg.role === 'user') {
      return { role: 'user' as const, content: msg.content };
    }
    if (msg.role === 'tool' && msg.tool_call_id) {
      return {
        role: 'tool' as const,
        content: msg.content,
        tool_call_id: msg.tool_call_id,
      };
    }
    // Assistant message
    const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
      role: 'assistant' as const,
      content: msg.content,
    };
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      assistantMsg.tool_calls = msg.tool_calls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));
    }
    return assistantMsg;
  });

  // Build tools array for OpenAI API (only if we have tools)
  const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((tool) => ({
    type: 'function' as const,
    function: tool.function as unknown as OpenAI.FunctionDefinition,
  }));

  // Build request params, conditionally including tools
  const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model: config.model,
    messages: openaiMessages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
  };

  // Only add tools if we have any (avoids undefined with exactOptionalPropertyTypes)
  if (openaiTools.length > 0) {
    requestParams.tools = openaiTools;
  }

  try {
    const response = await openai.chat.completions.create(requestParams);

    const choice = response.choices[0];
    const toolCalls = choice?.message?.tool_calls;

    // Build the response, handling tool_calls explicitly
    const responseMessage: ChatCompletionResponse['choices'][0]['message'] = {
      role: 'assistant',
      content: choice?.message?.content ?? null,
    };

    if (toolCalls && toolCalls.length > 0) {
      responseMessage.tool_calls = toolCalls
        .filter((tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: 'function' } =>
          tc.type === 'function'
        )
        .map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
    }

    return {
      choices: [{
        message: responseMessage,
        finish_reason: choice?.finish_reason ?? 'stop',
      }],
    };
  } catch (error) {
    logger.error('OpenAI API error', error instanceof Error ? error : null);
    throw error;
  }
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
