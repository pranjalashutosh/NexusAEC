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
import { BriefingSessionTracker } from '../briefing/briefing-session-tracker.js';
import { generateConfirmation, generateDisambiguationPrompt } from '../prompts/briefing-prompts.js';
import { buildSystemPrompt, DEFAULT_SYSTEM_PROMPT_CONTEXT } from '../prompts/system-prompt.js';
import { detectCommand, processTranscript } from '../stt/index.js';
import { EMAIL_TOOLS, executeEmailTool } from '../tools/email-tools.js';
import { KNOWLEDGE_TOOLS, executeKnowledgeTool } from '../tools/knowledge-tools.js';
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

/**
 * Lightweight email reference for GPT-4o context.
 * Extracted from BriefingData so the ReasoningLoop can include email IDs,
 * subjects, and senders in the system prompt.
 */
export interface BriefingEmailRef {
  emailId: string;
  subject: string;
  from: string;
  threadId?: string;
  isFlagged: boolean;
}

/**
 * A briefing topic with email references for the ReasoningLoop.
 */
export interface BriefingTopicRef {
  label: string;
  emails: BriefingEmailRef[];
}

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
  logger.info('Calling OpenAI chat completion', {
    messageCount: messages.length,
    toolCount: tools.length,
    model: config.model,
    lastUserMessage: messages.filter(m => m.role === 'user').slice(-1)[0]?.content?.substring(0, 100),
  });
  const llmStartTime = Date.now();

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

    const llmDurationMs = Date.now() - llmStartTime;
    const choice = response.choices[0];
    const toolCalls = choice?.message?.tool_calls;

    logger.info('OpenAI response received', {
      durationMs: llmDurationMs,
      finishReason: choice?.finish_reason,
      hasContent: !!choice?.message?.content,
      contentLength: choice?.message?.content?.length ?? 0,
      contentPreview: choice?.message?.content?.substring(0, 200),
      toolCallCount: toolCalls?.length ?? 0,
      toolNames: toolCalls?.filter((tc) => tc.type === 'function').map((tc) => tc.type === 'function' ? tc.function.name : tc.type),
    });

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
  private topicRefs: BriefingTopicRef[];
  private tracker: BriefingSessionTracker | null;
  private ttsCallback?: TTSCallback;
  private stateUpdateCallback?: StateUpdateCallback;
  private isProcessing: boolean = false;
  private bargeInDetected: boolean = false;
  private inboxService: unknown = null;
  private sessionHistoryId: string | null = null;

  constructor(
    topicItems: number[] = [5, 3, 2],
    systemPromptContext?: Partial<SystemPromptContext>,
    config?: OpenAIConfig,
    topicRefs?: BriefingTopicRef[],
    tracker?: BriefingSessionTracker,
  ) {
    this.config = config ?? loadOpenAIConfig();
    this.topicRefs = topicRefs ?? [];
    this.tracker = tracker ?? null;
    this.systemPromptContext = {
      ...DEFAULT_SYSTEM_PROMPT_CONTEXT,
      ...systemPromptContext,
    };

    // Build the system prompt
    // If we have a tracker, use its compact reference (only active emails).
    // Otherwise fall back to the static email reference block.
    let systemPrompt = buildSystemPrompt(this.systemPromptContext);
    if (this.tracker) {
      systemPrompt += '\n\n' + this.tracker.buildCompactEmailReference();
    } else if (this.topicRefs.length > 0) {
      systemPrompt += '\n\n' + this.buildEmailReferenceBlock();
    }

    // Set initial emailContext — use tracker if available, else first email in refs
    let initialEmailContext: EmailActionContext | undefined;
    if (this.tracker) {
      const currentEmail = this.tracker.getCurrentEmail();
      if (currentEmail) {
        initialEmailContext = buildEmailContext(currentEmail);
      }
    } else {
      const firstEmail = this.topicRefs[0]?.emails[0];
      if (firstEmail) {
        initialEmailContext = buildEmailContext(firstEmail);
      }
    }

    // Initialize state
    this.state = {
      messages: [{
        role: 'system',
        content: systemPrompt,
      }],
      briefingState: createBriefingState(topicItems),
      ...(initialEmailContext ? { emailContext: initialEmailContext } : {}),
      briefingContext: {
        totalItems: topicItems.reduce((sum, count) => sum + count, 0),
        currentPosition: 0,
        currentTopic: this.topicRefs[0]?.label ?? 'Inbox',
        remainingTopics: this.topicRefs.slice(1).map(t => t.label),
        estimatedMinutesRemaining: Math.ceil(topicItems.reduce((sum, count) => sum + count, 0) * 0.5),
      },
      isSpeaking: false,
      lastSpokenText: '',
    };

    logger.info('Reasoning loop initialized', {
      totalItems: this.state.briefingContext.totalItems,
      topicCount: topicItems.length,
      hasEmailRefs: this.topicRefs.length > 0,
      hasTracker: !!this.tracker,
      initialEmailId: initialEmailContext?.emailId,
    });
  }

  /**
   * Build an EMAIL REFERENCE block for the system prompt.
   * Lists every briefing topic with its emails (ID, subject, sender)
   * so GPT-4o can use them in tool calls.
   */
  private buildEmailReferenceBlock(): string {
    const lines: string[] = ['EMAIL REFERENCE (use these email_id values when calling tools):'];

    for (let t = 0; t < this.topicRefs.length; t++) {
      const topic = this.topicRefs[t]!;
      lines.push(`\nTopic ${t + 1}: "${topic.label}"`);
      for (const email of topic.emails) {
        const flag = email.isFlagged ? ' [FLAGGED]' : '';
        lines.push(`  - email_id: "${email.emailId}" | From: ${email.from} | Subject: ${email.subject}${flag}`);
      }
    }

    return lines.join('\n');
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
    const processStartTime = Date.now();

    try {
      // Add user message to conversation
      this.state.messages.push({ role: 'user', content: text });

      logger.info('Processing user input', {
        text,
        messageCount: this.state.messages.length,
        briefingState: {
          topicIndex: this.state.briefingState.currentTopicIndex,
          itemIndex: this.state.briefingState.currentItemIndex,
          isPaused: this.state.briefingState.isPaused,
        },
        hasPendingConfirmation: !!this.state.pendingConfirmation,
        hasDisambiguation: !!this.state.disambiguationOptions,
      });

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

      logger.info('processUserInput completed', {
        durationMs: Date.now() - processStartTime,
        responseLength: result.responseText.length,
        responsePreview: result.responseText.substring(0, 200),
        actionsTaken: result.actionsTaken.map(a => a.tool),
        shouldEnd: result.shouldEnd,
        chunkCount: result.responseChunks.length,
      });

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
    // Inject dynamic briefing cursor context so GPT-4o knows which email to present
    if (this.tracker) {
      this.state.messages.push({
        role: 'system',
        content: this.tracker.buildCursorContext(),
      });
    }

    // Combine all tools
    const allTools = [...EMAIL_TOOLS, ...NAVIGATION_TOOLS, ...KNOWLEDGE_TOOLS].map((t) => ({
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
      logger.info('GPT-4o requested tool calls', {
        toolCalls: message.tool_calls.map(tc => ({
          name: tc.function.name,
          args: tc.function.arguments.substring(0, 100),
        })),
      });

      // Push the assistant message WITH tool_calls to conversation history.
      // OpenAI requires every 'tool' message to follow an 'assistant' message
      // that contains the corresponding tool_calls.
      this.state.messages.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: message.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      });

      return await this.handleToolCalls(message.tool_calls);
    }

    // Handle text response
    const responseText = message.content ?? '';
    logger.info('GPT-4o returned text response (no tools)', {
      responseLength: responseText.length,
      responseText: responseText.substring(0, 300),
    });
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

      logger.info('Executing tool', { toolName, args, toolCallId: toolCall.id });

      // Check if it's an email tool
      if (EMAIL_TOOLS.some((t) => t.function.name === toolName)) {
        // If GPT-4o provided an email_id, update emailContext by looking up the reference
        const argEmailId = args['email_id'] as string | undefined;
        if (argEmailId) {
          const ref = this.findEmailRef(argEmailId);
          if (ref) {
            this.state.emailContext = buildEmailContext(ref);
            logger.info('Updated emailContext from tool args', { emailId: ref.emailId, subject: ref.subject });
          } else {
            // GPT-4o provided an ID we don't have a ref for — still set it
            this.state.emailContext = {
              emailId: argEmailId,
              ...(this.state.emailContext?.from ? { from: this.state.emailContext.from } : {}),
              ...(this.state.emailContext?.subject ? { subject: this.state.emailContext.subject } : {}),
            };
          }
        }

        const emailCtx = this.state.emailContext ?? { emailId: argEmailId ?? 'current' };
        const result = await executeEmailTool(
          toolName,
          args,
          emailCtx,
        );

        actionsTaken.push({ tool: toolName, result });

        // Handle confirmation requirement
        if (result.requiresConfirmation) {
          this.state.pendingConfirmation = {
            action: toolName,
            args,
            context: emailCtx,
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

        // Track email action in BriefingSessionTracker
        if (result.success && !result.requiresConfirmation && this.tracker) {
          const actionedEmailId = (args['email_id'] as string) ?? emailCtx.emailId;

          if (toolName === 'archive_email' || toolName === 'mark_read') {
            this.tracker.markActioned(actionedEmailId, toolName);

            // If the actioned email was the current one, advance cursor
            const currentEmail = this.tracker.getCurrentEmail();
            if (!currentEmail || currentEmail.emailId === actionedEmailId) {
              const nextEmail = this.tracker.advance();
              if (nextEmail) {
                this.state.emailContext = buildEmailContext(nextEmail);
              }
            }
          } else if (toolName === 'flag_followup') {
            // Flagging records the action but keeps the email in the briefing
            this.tracker.markActioned(actionedEmailId, 'flagged');
          }
        }
      }
      // Check if it's a navigation tool
      else if (NAVIGATION_TOOLS.some((t) => t.function.name === toolName)) {
        const result = executeNavigationTool(toolName, args, this.state.briefingState);

        actionsTaken.push({ tool: toolName, result });

        // Update briefing state
        if (result.success) {
          this.state.briefingState = updateBriefingState(this.state.briefingState, result);

          // Advance tracker cursor to match navigation and update emailContext
          if (this.tracker) {
            let nextEmail: BriefingEmailRef | null = null;

            if (result.action === 'skip_topic') {
              nextEmail = this.tracker.skipTopic();
            } else if (result.action === 'next_item') {
              nextEmail = this.tracker.advance();
            } else if (result.action === 'go_back') {
              nextEmail = this.tracker.goBack();
            }

            if (nextEmail) {
              this.state.emailContext = buildEmailContext(nextEmail);
            }
          }
        }

        // Handle special navigation actions
        if (result.action === 'stop') {
          shouldEnd = true;
        } else if (result.action === 'repeat') {
          responseText = this.state.lastSpokenText;
        }

        // Enrich message with progress if tracker is available
        const progress = this.tracker?.getProgress();
        const progressSuffix = progress
          ? ` [${progress.emailsBriefed + progress.emailsActioned}/${progress.totalEmails} handled]`
          : '';
        responseText += result.message + progressSuffix + ' ';

        // Add tool result to messages
        this.state.messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
      // Check if it's a knowledge tool
      else if (KNOWLEDGE_TOOLS.some((t) => t.function.name === toolName)) {
        const result = await executeKnowledgeTool(toolName, args);

        actionsTaken.push({ tool: toolName, result });
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
      // User confirmed — the action was ALREADY executed when the tool was first called.
      // Do NOT re-execute. Just acknowledge the confirmation.
      const confirmResult: ToolResult = {
        success: true,
        message: 'Done.',
        riskLevel: 'high',
      };
      const confirmMessage = generateConfirmation(pending.action, 'high');
      delete this.state.pendingConfirmation;

      return this.createTextResult(
        confirmMessage,
        [{ tool: pending.action, result: confirmResult }]
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

    logger.info('createTextResult', {
      originalLength: text.length,
      originalPreview: text.substring(0, 200),
      processedLength: processedText.length,
      chunkCount: chunks.length,
      chunks: chunks.map((c, i) => `[${i}] ${c.substring(0, 60)}`),
      hasTtsCallback: !!this.ttsCallback,
      actionsTaken: actionsTaken.map(a => a.tool),
      shouldEnd,
    });

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
      logger.info('TTS callback invoked for all chunks', { totalChunks: chunks.length });
    } else if (!this.ttsCallback) {
      logger.warn('No TTS callback registered — chunks will only be returned in result');
    }

    return {
      responseText: text,
      responseChunks: chunks,
      actionsTaken,
      shouldEnd,
      state: this.state,
    };
  }

  // ===========================================================================
  // Real-Time Inbox Awareness
  // ===========================================================================

  /**
   * Set the inbox service and historyId for mid-session new-email detection.
   * Called once at session start from agent.ts.
   */
  setInboxAwareness(inboxService: unknown, historyId: string): void {
    this.inboxService = inboxService;
    this.sessionHistoryId = historyId;
    logger.info('Inbox awareness configured', { historyId });
  }

  /**
   * Check Gmail History API for new emails since session started.
   * Returns whether new emails were detected. If so, injects an alert
   * into the conversation for GPT-4o to surface on the next turn.
   */
  async checkForNewEmails(): Promise<{ hasNew: boolean }> {
    if (!this.inboxService || !this.sessionHistoryId) return { hasNew: false };

    try {
      // Duck-type check for Gmail provider with fetchHistory
      const service = this.inboxService as { getProvider?: (source: string) => unknown };
      if (!service.getProvider) return { hasNew: false };

      const gmailProvider = service.getProvider('GMAIL') as {
        fetchHistory?: (historyId: string) => Promise<{ hasChanges: boolean; currentHistoryId: string }>;
      } | undefined;

      if (!gmailProvider?.fetchHistory) return { hasNew: false };

      const { hasChanges, currentHistoryId } = await gmailProvider.fetchHistory(this.sessionHistoryId);

      if (hasChanges) {
        this.sessionHistoryId = currentHistoryId;

        // Inject alert into conversation so GPT-4o mentions it
        this.state.messages.push({
          role: 'system',
          content: 'ALERT: New emails have arrived since this briefing started. '
            + 'After finishing the current email, let the user know: '
            + '"New emails have come in. Want me to check them after we finish this topic?"',
        });

        logger.info('New emails detected mid-session', {
          previousHistoryId: this.sessionHistoryId,
          newHistoryId: currentHistoryId,
        });

        return { hasNew: true };
      }
    } catch (error) {
      logger.warn('Failed to check for new emails', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { hasNew: false };
  }

  /**
   * Look up an email reference by ID across all briefing topics.
   */
  private findEmailRef(emailId: string): BriefingEmailRef | undefined {
    for (const topic of this.topicRefs) {
      const found = topic.emails.find(e => e.emailId === emailId);
      if (found) return found;
    }
    return undefined;
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
  config?: OpenAIConfig,
  topicRefs?: BriefingTopicRef[],
  tracker?: BriefingSessionTracker,
): ReasoningLoop {
  return new ReasoningLoop(topicItems, systemPromptContext, config, topicRefs, tracker);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build an EmailActionContext from a BriefingEmailRef, omitting undefined
 * optional fields to satisfy exactOptionalPropertyTypes.
 */
function buildEmailContext(ref: BriefingEmailRef): EmailActionContext {
  const ctx: EmailActionContext = { emailId: ref.emailId };
  if (ref.from) ctx.from = ref.from;
  if (ref.subject) ctx.subject = ref.subject;
  if (ref.threadId) ctx.threadId = ref.threadId;
  return ctx;
}

// =============================================================================
// Re-export types (already exported above)
// =============================================================================
