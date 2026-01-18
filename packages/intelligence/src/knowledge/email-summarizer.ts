/**
 * Email Summarizer (Tier 3)
 *
 * Generates concise summaries of email threads using GPT-4o.
 * Supports different summarization modes for various use cases.
 */

import type { LLMClient, LLMMessage } from './llm-client';
import type { StandardEmail, StandardThread } from '@nexus-aec/shared-types';

/**
 * Summarization mode
 */
export type SummarizationMode = 'brief' | 'detailed' | 'action-items' | 'key-points';

/**
 * Summary result
 */
export interface EmailSummary {
  /**
   * Generated summary text
   */
  summary: string;

  /**
   * Summarization mode used
   */
  mode: SummarizationMode;

  /**
   * Key points extracted (for key-points mode)
   */
  keyPoints?: string[];

  /**
   * Action items extracted (for action-items mode)
   */
  actionItems?: Array<{
    action: string;
    assignee?: string;
    dueDate?: string;
  }>;

  /**
   * Participants in the thread
   */
  participants: string[];

  /**
   * Number of messages summarized
   */
  messageCount: number;

  /**
   * Token usage
   */
  tokensUsed: number;

  /**
   * Generation time in milliseconds
   */
  generationTimeMs: number;
}

/**
 * Email summarization options
 */
export interface EmailSummarizerOptions {
  /**
   * LLM client instance
   */
  llmClient: LLMClient;

  /**
   * Default summarization mode
   * Default: 'brief'
   */
  defaultMode?: SummarizationMode;

  /**
   * Maximum number of messages to include in context
   * Older messages will be truncated if exceeded
   * Default: 20
   */
  maxMessagesInContext?: number;

  /**
   * Include email metadata (timestamps, participants) in summary
   * Default: true
   */
  includeMetadata?: boolean;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Email Summarizer
 *
 * Generates concise summaries of email threads using GPT-4o.
 * Supports multiple summarization modes for different use cases.
 *
 * @example
 * ```typescript
 * import { EmailSummarizer, LLMClient } from '@nexus-aec/intelligence';
 *
 * // Initialize LLM client
 * const llmClient = new LLMClient({
 *   apiKey: process.env.OPENAI_API_KEY!,
 * });
 *
 * // Initialize summarizer
 * const summarizer = new EmailSummarizer({
 *   llmClient,
 *   defaultMode: 'brief',
 * });
 *
 * // Summarize email thread
 * const summary = await summarizer.summarizeThread(thread, {
 *   mode: 'action-items',
 * });
 *
 * console.log(summary.summary);
 * if (summary.actionItems) {
 *   summary.actionItems.forEach(item => {
 *     console.log(`- ${item.action}`);
 *   });
 * }
 * ```
 */
export class EmailSummarizer {
  private llmClient: LLMClient;
  private defaultMode: SummarizationMode;
  private maxMessagesInContext: number;
  private includeMetadata: boolean;
  private debug: boolean;

  constructor(options: EmailSummarizerOptions) {
    this.llmClient = options.llmClient;
    this.defaultMode = options.defaultMode ?? 'brief';
    this.maxMessagesInContext = options.maxMessagesInContext ?? 20;
    this.includeMetadata = options.includeMetadata ?? true;
    this.debug = options.debug ?? false;
  }

  /**
   * Summarize an email thread
   *
   * @param thread - Email thread to summarize
   * @param options - Summarization options
   * @returns Summary result
   */
  async summarizeThread(
    thread: StandardThread,
    options: { mode?: SummarizationMode } = {}
  ): Promise<EmailSummary> {
    const mode = options.mode ?? this.defaultMode;

    if (this.debug) {
      console.log(
        `[EmailSummarizer] Summarizing thread: ${thread.subject} (${thread.messages.length} messages, mode: ${mode})`
      );
    }

    const startTime = Date.now();

    // Prepare messages for summarization
    const messages = this.prepareMessages(thread.messages);

    // Build prompt based on mode
    const prompt = this.buildPrompt(thread, messages, mode);

    // Generate summary using LLM
    const llmMessages: LLMMessage[] = [
      {
        role: 'system',
        content: this.getSystemPrompt(mode),
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const result = await this.llmClient.complete(llmMessages, {
      temperature: 0.3, // Lower temperature for more factual summaries
      maxTokens: mode === 'brief' ? 200 : mode === 'detailed' ? 500 : 400,
    });

    const generationTimeMs = Date.now() - startTime;

    // Parse the result based on mode
    const summary = this.parseSummary(result.content, mode, thread);

    if (this.debug) {
      console.log(
        `[EmailSummarizer] Generated summary in ${generationTimeMs}ms (${result.totalTokens} tokens)`
      );
    }

    return {
      ...summary,
      mode,
      participants: thread.participants.map((p) => p.email),
      messageCount: messages.length,
      tokensUsed: result.totalTokens,
      generationTimeMs,
    };
  }

  /**
   * Summarize a single email
   *
   * @param email - Email to summarize
   * @param options - Summarization options
   * @returns Summary result
   */
  async summarizeEmail(
    email: StandardEmail,
    options: { mode?: SummarizationMode } = {}
  ): Promise<EmailSummary> {
    const mode = options.mode ?? this.defaultMode;

    if (this.debug) {
      console.log(`[EmailSummarizer] Summarizing email: ${email.subject} (mode: ${mode})`);
    }

    const startTime = Date.now();

    // Build prompt for single email
    const prompt = this.buildSingleEmailPrompt(email, mode);

    const llmMessages: LLMMessage[] = [
      {
        role: 'system',
        content: this.getSystemPrompt(mode),
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const result = await this.llmClient.complete(llmMessages, {
      temperature: 0.3,
      maxTokens: mode === 'brief' ? 150 : mode === 'detailed' ? 400 : 300,
    });

    const generationTimeMs = Date.now() - startTime;

    // Parse the result
    const summary = this.parseSummary(result.content, mode, null, email);

    if (this.debug) {
      console.log(
        `[EmailSummarizer] Generated summary in ${generationTimeMs}ms (${result.totalTokens} tokens)`
      );
    }

    return {
      ...summary,
      mode,
      participants: [email.from.email, ...email.to.map((t) => t.email)],
      messageCount: 1,
      tokensUsed: result.totalTokens,
      generationTimeMs,
    };
  }

  /**
   * Get system prompt based on mode
   */
  private getSystemPrompt(mode: SummarizationMode): string {
    const basePrompt = 'You are an executive assistant that summarizes email conversations.';

    switch (mode) {
      case 'brief':
        return `${basePrompt} Provide ultra-concise summaries in 1-2 sentences that capture the core message.`;

      case 'detailed':
        return `${basePrompt} Provide detailed summaries that capture key points, decisions, and context.`;

      case 'action-items':
        return `${basePrompt} Extract and list action items, tasks, and next steps from the conversation. Format as a bulleted list with action, assignee (if mentioned), and deadline (if mentioned).`;

      case 'key-points':
        return `${basePrompt} Extract the key points and important information from the conversation. Format as a bulleted list.`;

      default:
        return basePrompt;
    }
  }

  /**
   * Build prompt for thread summarization
   */
  private buildPrompt(
    thread: StandardThread,
    messages: StandardEmail[],
    mode: SummarizationMode
  ): string {
    const parts: string[] = [];

    // Add thread metadata if enabled
    if (this.includeMetadata) {
      parts.push(`Subject: ${thread.subject}`);
      parts.push(`Participants: ${thread.participants.map((p) => p.name || p.email).join(', ')}`);
      parts.push(`Messages: ${messages.length}`);
      parts.push('');
    }

    // Add conversation
    parts.push('Conversation:');
    parts.push('---');

    messages.forEach((msg, index) => {
      const fromName = msg.from.name || msg.from.email;
      const timestamp = this.includeMetadata ? ` (${this.formatDate(msg.receivedAt)})` : '';

      parts.push(`[${index + 1}] ${fromName}${timestamp}:`);
      parts.push(msg.body || msg.snippet);
      parts.push('');
    });

    parts.push('---');

    // Add mode-specific instructions
    switch (mode) {
      case 'brief':
        parts.push('Provide a brief 1-2 sentence summary of this email thread.');
        break;

      case 'detailed':
        parts.push(
          'Provide a detailed summary covering the main points, decisions made, and any important context.'
        );
        break;

      case 'action-items':
        parts.push(
          'Extract all action items, tasks, and next steps. Format each as:\n- Action: [description]\n  Assignee: [person if mentioned]\n  Due: [date if mentioned]'
        );
        break;

      case 'key-points':
        parts.push('Extract and list the key points from this conversation as bullet points.');
        break;
    }

    return parts.join('\n');
  }

  /**
   * Build prompt for single email summarization
   */
  private buildSingleEmailPrompt(email: StandardEmail, mode: SummarizationMode): string {
    const parts: string[] = [];

    if (this.includeMetadata) {
      parts.push(`From: ${email.from.name || email.from.email}`);
      parts.push(`To: ${email.to.map((t) => t.name || t.email).join(', ')}`);
      parts.push(`Subject: ${email.subject}`);
      parts.push(`Date: ${this.formatDate(email.receivedAt)}`);
      parts.push('');
    }

    parts.push('Email content:');
    parts.push('---');
    parts.push(email.body || email.snippet);
    parts.push('---');

    // Add mode-specific instructions
    switch (mode) {
      case 'brief':
        parts.push('Provide a brief 1-2 sentence summary of this email.');
        break;

      case 'detailed':
        parts.push('Provide a detailed summary of the email content and its key points.');
        break;

      case 'action-items':
        parts.push(
          'Extract all action items and tasks mentioned. Format each as:\n- Action: [description]\n  Assignee: [person if mentioned]\n  Due: [date if mentioned]'
        );
        break;

      case 'key-points':
        parts.push('Extract and list the key points from this email as bullet points.');
        break;
    }

    return parts.join('\n');
  }

  /**
   * Parse summary result based on mode
   */
  private parseSummary(
    content: string,
    mode: SummarizationMode,
    _thread?: StandardThread | null,
    _email?: StandardEmail
  ): Pick<EmailSummary, 'summary' | 'keyPoints' | 'actionItems'> {
    const summary = content.trim();

    if (mode === 'key-points') {
      // Extract bullet points
      const keyPoints = this.extractBulletPoints(content);
      return { summary, keyPoints };
    }

    if (mode === 'action-items') {
      // Extract action items
      const actionItems = this.extractActionItems(content);
      return { summary, actionItems };
    }

    return { summary };
  }

  /**
   * Extract bullet points from content
   */
  private extractBulletPoints(content: string): string[] {
    const lines = content.split('\n');
    const points: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Match lines starting with -, *, •, or numbers
      if (/^[-*•\d]+\.?\s+/.test(trimmed)) {
        points.push(trimmed.replace(/^[-*•\d]+\.?\s+/, ''));
      }
    }

    return points.length > 0 ? points : [content.trim()];
  }

  /**
   * Extract action items from content
   */
  private extractActionItems(content: string): Array<{
    action: string;
    assignee?: string;
    dueDate?: string;
  }> {
    const items: Array<{ action: string; assignee?: string; dueDate?: string }> = [];
    const lines = content.split('\n');

    let currentAction: string | null = null;
    let currentAssignee: string | undefined;
    let currentDueDate: string | undefined;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if it's an action line
      if (/^[-*•]/.test(trimmed) || /^Action:/i.test(trimmed)) {
        // Save previous action if exists
        if (currentAction) {
          items.push({
            action: currentAction,
            ...(currentAssignee ? { assignee: currentAssignee } : {}),
            ...(currentDueDate ? { dueDate: currentDueDate } : {}),
          });
        }

        // Start new action
        currentAction = trimmed
          .replace(/^[-*•]\s*/, '')
          .replace(/^Action:\s*/i, '')
          .trim();
        currentAssignee = undefined;
        currentDueDate = undefined;
      } else if (/^Assignee:/i.test(trimmed) && currentAction) {
        currentAssignee = trimmed.replace(/^Assignee:\s*/i, '').trim();
      } else if (/^Due:/i.test(trimmed) && currentAction) {
        currentDueDate = trimmed.replace(/^Due:\s*/i, '').trim();
      }
    }

    // Save last action
    if (currentAction) {
      items.push({
        action: currentAction,
        ...(currentAssignee ? { assignee: currentAssignee } : {}),
        ...(currentDueDate ? { dueDate: currentDueDate } : {}),
      });
    }

    // If no structured items found, treat whole content as one action
    if (items.length === 0 && content.trim()) {
      items.push({ action: content.trim() });
    }

    return items;
  }

  /**
   * Prepare messages for summarization (truncate if needed)
   */
  private prepareMessages(messages: StandardEmail[]): StandardEmail[] {
    if (messages.length <= this.maxMessagesInContext) {
      return messages;
    }

    if (this.debug) {
      console.log(
        `[EmailSummarizer] Truncating ${messages.length} messages to ${this.maxMessagesInContext}`
      );
    }

    // Keep most recent messages
    return messages.slice(-this.maxMessagesInContext);
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): {
    defaultMode: SummarizationMode;
    maxMessagesInContext: number;
    includeMetadata: boolean;
  } {
    return {
      defaultMode: this.defaultMode,
      maxMessagesInContext: this.maxMessagesInContext,
      includeMetadata: this.includeMetadata,
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: {
    defaultMode?: SummarizationMode;
    maxMessagesInContext?: number;
    includeMetadata?: boolean;
  }): void {
    if (config.defaultMode !== undefined) {
      this.defaultMode = config.defaultMode;
    }
    if (config.maxMessagesInContext !== undefined) {
      this.maxMessagesInContext = config.maxMessagesInContext;
    }
    if (config.includeMetadata !== undefined) {
      this.includeMetadata = config.includeMetadata;
    }
  }
}
