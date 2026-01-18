/**
 * @nexus-aec/email-providers - Smart Draft Service
 *
 * Intelligent draft routing and management:
 * - Replies use the original thread's email source
 * - New drafts default to Outlook (or configured default)
 * - Dev Mode fallback to Gmail when Outlook unavailable
 * - Pending review tracking for voice-created drafts
 */

import { parseStandardId } from '../interfaces/email-provider';

import type { EmailProvider } from '../interfaces/email-provider';
import type {
  EmailSource,
  StandardDraft,
  StandardEmail,
  StandardThread,
  CreateDraftInput,
  UpdateDraftInput,
  EmailAddress,
} from '../interfaces/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Smart draft configuration
 */
export interface SmartDraftConfig {
  /** Default provider for new drafts (not replies) */
  defaultSource: EmailSource;
  /** Fallback provider if default is unavailable */
  fallbackSource?: EmailSource;
  /** Enable dev mode (uses fallback more aggressively) */
  devMode?: boolean;
  /** Auto-save drafts after inactivity (ms) */
  autoSaveIntervalMs?: number;
  /** Mark voice-created drafts as pending review by default */
  defaultPendingReview?: boolean;
}

/**
 * Context for creating a smart draft
 */
export interface SmartDraftContext {
  /** If replying, the original email/thread */
  replyTo?: {
    email?: StandardEmail;
    thread?: StandardThread;
  };
  /** Source of the voice command (for attribution) */
  voiceCommandId?: string;
  /** Reason for pending review (e.g., "Contains sensitive information") */
  reviewRationale?: string;
  /** Force a specific provider (overrides smart routing) */
  forceSource?: EmailSource;
}

/**
 * Smart draft input extending standard CreateDraftInput
 */
export interface SmartDraftInput extends Omit<CreateDraftInput, 'threadId' | 'inReplyToMessageId'> {
  /** Additional context for smart routing */
  context?: SmartDraftContext;
}

/**
 * Draft with routing metadata
 */
export interface SmartDraftResult extends StandardDraft {
  /** Why this provider was chosen */
  routingReason: DraftRoutingReason;
  /** The original email being replied to (if reply) */
  replyToEmail?: StandardEmail;
}

/**
 * Reason for draft routing decision
 */
export type DraftRoutingReason =
  | 'REPLY_TO_THREAD' // Reply uses original thread's source
  | 'DEFAULT_PROVIDER' // New draft uses configured default
  | 'FALLBACK_PROVIDER' // Default unavailable, using fallback
  | 'FORCED_PROVIDER' // Explicitly specified in context
  | 'ONLY_AVAILABLE'; // Only one provider available

// =============================================================================
// Smart Draft Service
// =============================================================================

/**
 * SmartDraftService - Intelligent draft creation and routing
 *
 * @example
 * ```typescript
 * const smartDraft = new SmartDraftService(
 *   { OUTLOOK: outlookAdapter, GMAIL: gmailAdapter },
 *   { defaultSource: 'OUTLOOK' }
 * );
 *
 * // Reply - automatically uses the original email's provider
 * const reply = await smartDraft.createReply(
 *   { subject: 'Re: Meeting', to: [...], bodyText: 'Sounds good!' },
 *   { replyTo: { email: originalEmail } }
 * );
 *
 * // New draft - uses Outlook (default)
 * const newDraft = await smartDraft.createDraft({
 *   subject: 'Proposal',
 *   to: [{ email: 'client@example.com' }],
 *   bodyText: 'Please find attached...',
 * });
 * ```
 */
export class SmartDraftService {
  private readonly providers: Map<EmailSource, EmailProvider>;
  private readonly config: Required<SmartDraftConfig>;

  constructor(
    providers:
      | Partial<Record<EmailSource, EmailProvider>>
      | Map<EmailSource, EmailProvider>,
    config: Partial<SmartDraftConfig> = {}
  ) {
    this.providers = providers instanceof Map
      ? providers
      : new Map(
          (Object.entries(providers) as Array<[EmailSource, EmailProvider | undefined]>).filter(
            (entry): entry is [EmailSource, EmailProvider] => Boolean(entry[1])
          )
        );

    this.config = {
      defaultSource: config.defaultSource ?? 'OUTLOOK',
      fallbackSource: config.fallbackSource ?? 'GMAIL',
      devMode: config.devMode ?? false,
      autoSaveIntervalMs: config.autoSaveIntervalMs ?? 30000,
      defaultPendingReview: config.defaultPendingReview ?? true,
    };
  }

  // ===========================================================================
  // Draft Creation
  // ===========================================================================

  /**
   * Create a smart draft with intelligent routing
   */
  async createDraft(input: SmartDraftInput): Promise<SmartDraftResult> {
    const { source, reason } = this.determineSource(input.context);

    const provider = this.providers.get(source);
    if (!provider) {
      throw new SmartDraftError(`Provider not available: ${source}`, 'PROVIDER_UNAVAILABLE');
    }

    // Build the draft input
    const reviewRationale = input.context?.reviewRationale ?? input.reviewRationale;

    const draftInput: CreateDraftInput = {
      subject: input.subject,
      to: input.to,
      ...(input.cc && input.cc.length > 0 && { cc: input.cc }),
      ...(input.bcc && input.bcc.length > 0 && { bcc: input.bcc }),
      ...(input.bodyText && { bodyText: input.bodyText }),
      ...(input.bodyHtml && { bodyHtml: input.bodyHtml }),
      isPendingReview: input.isPendingReview ?? this.config.defaultPendingReview,
      ...(reviewRationale && { reviewRationale }),
    };

    // Add reply context if this is a reply
    if (input.context?.replyTo) {
      const { email, thread } = input.context.replyTo;

      if (email) {
        draftInput.inReplyToMessageId = email.providerMessageId;
        draftInput.threadId = email.threadId;
      } else if (thread) {
        draftInput.threadId = thread.id;
      }
    }

    const draft = await provider.createDraft(draftInput);

    return {
      ...draft,
      routingReason: reason,
      ...(input.context?.replyTo?.email && { replyToEmail: input.context.replyTo.email }),
    };
  }

  /**
   * Create a reply draft (convenience method)
   */
  async createReply(
    originalEmail: StandardEmail,
    replyContent: {
      bodyText?: string;
      bodyHtml?: string;
      ccAll?: boolean; // Include all original recipients in CC
    },
    options?: {
      reviewRationale?: string;
      forceSource?: EmailSource;
    }
  ): Promise<SmartDraftResult> {
    // Build recipients for reply
    const to: EmailAddress[] = [originalEmail.from];

    // If "reply all", add other recipients to CC
    let cc: EmailAddress[] = [];
    if (replyContent.ccAll) {
      // Add original TO recipients (except self) and original CC
      cc = [
        ...originalEmail.to.filter((r) => r.email !== originalEmail.from.email),
        ...originalEmail.cc,
      ];
    }

    // Build reply subject
    const subject = originalEmail.subject.toLowerCase().startsWith('re:')
      ? originalEmail.subject
      : `Re: ${originalEmail.subject}`;

    return this.createDraft({
      subject,
      to,
      cc,
      ...(replyContent.bodyText !== undefined && { bodyText: replyContent.bodyText }),
      ...(replyContent.bodyHtml !== undefined && { bodyHtml: replyContent.bodyHtml }),
      context: {
        replyTo: { email: originalEmail },
        ...(options?.reviewRationale && { reviewRationale: options.reviewRationale }),
        ...(options?.forceSource && { forceSource: options.forceSource }),
      },
    });
  }

  /**
   * Create a forward draft (convenience method)
   */
  async createForward(
    originalEmail: StandardEmail,
    forwardContent: {
      to: EmailAddress[];
      cc?: EmailAddress[];
      additionalText?: string;
    },
    options?: {
      reviewRationale?: string;
      forceSource?: EmailSource;
    }
  ): Promise<SmartDraftResult> {
    // Build forward subject
    const subject = originalEmail.subject.toLowerCase().startsWith('fwd:')
      ? originalEmail.subject
      : `Fwd: ${originalEmail.subject}`;

    // Build forward body with original message
    const forwardHeader = this.buildForwardHeader(originalEmail);
    const bodyText = forwardContent.additionalText
      ? `${forwardContent.additionalText}\n\n${forwardHeader}\n\n${originalEmail.bodyText ?? originalEmail.bodyPreview}`
      : `${forwardHeader}\n\n${originalEmail.bodyText ?? originalEmail.bodyPreview}`;

    return this.createDraft({
      subject,
      to: forwardContent.to,
      ...(forwardContent.cc && forwardContent.cc.length > 0 && { cc: forwardContent.cc }),
      bodyText,
      context: {
        replyTo: { email: originalEmail },
        ...(options?.reviewRationale && { reviewRationale: options.reviewRationale }),
        ...(options?.forceSource && { forceSource: options.forceSource }),
      },
    });
  }

  // ===========================================================================
  // Draft Updates
  // ===========================================================================

  /**
   * Update an existing draft
   */
  async updateDraft(draftId: string, updates: UpdateDraftInput): Promise<StandardDraft> {
    const provider = this.getProviderForId(draftId);
    if (!provider) {
      throw new SmartDraftError('Provider not found for draft', 'PROVIDER_UNAVAILABLE');
    }

    return provider.updateDraft(draftId, updates);
  }

  /**
   * Mark a draft as reviewed (no longer pending)
   */
  async markReviewed(draftId: string): Promise<StandardDraft> {
    return this.updateDraft(draftId, { isPendingReview: false });
  }

  /**
   * Delete a draft
   */
  async deleteDraft(draftId: string): Promise<void> {
    const provider = this.getProviderForId(draftId);
    if (!provider) {return;}

    await provider.deleteDraft(draftId);
  }

  /**
   * Send a draft
   */
  async sendDraft(draftId: string): Promise<string> {
    const provider = this.getProviderForId(draftId);
    if (!provider) {
      throw new SmartDraftError('Provider not found for draft', 'PROVIDER_UNAVAILABLE');
    }

    return provider.sendDraft(draftId);
  }

  // ===========================================================================
  // Pending Review Management
  // ===========================================================================

  /**
   * Fetch all drafts pending review from all providers
   */
  async fetchPendingReview(): Promise<StandardDraft[]> {
    const allDrafts: StandardDraft[] = [];

    await Promise.all(
      Array.from(this.providers.values()).map(async (provider) => {
        try {
          const { items } = await provider.fetchDrafts({ pageSize: 100 });
          allDrafts.push(...items.filter((d) => d.isPendingReview));
        } catch {
          // Ignore provider errors for this aggregation
        }
      })
    );

    // Sort by creation date (oldest first - review queue order)
    allDrafts.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return allDrafts;
  }

  /**
   * Get count of drafts pending review
   */
  async getPendingReviewCount(): Promise<number> {
    const pending = await this.fetchPendingReview();
    return pending.length;
  }

  // ===========================================================================
  // Provider Management
  // ===========================================================================

  /**
   * Check if a specific provider is available
   */
  hasProvider(source: EmailSource): boolean {
    return this.providers.has(source);
  }

  /**
   * Get available provider sources
   */
  getAvailableSources(): EmailSource[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get the configured default source
   */
  getDefaultSource(): EmailSource {
    return this.config.defaultSource;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Determine which provider to use for a draft
   */
  private determineSource(context?: SmartDraftContext): {
    source: EmailSource;
    reason: DraftRoutingReason;
  } {
    // 1. Forced provider (explicit override)
    if (context?.forceSource && this.providers.has(context.forceSource)) {
      return { source: context.forceSource, reason: 'FORCED_PROVIDER' };
    }

    // 2. Reply - use original email's source
    if (context?.replyTo?.email) {
      const originalSource = context.replyTo.email.source;
      if (this.providers.has(originalSource)) {
        return { source: originalSource, reason: 'REPLY_TO_THREAD' };
      }
    }

    // 3. Reply to thread - use thread's source
    if (context?.replyTo?.thread) {
      const threadSource = context.replyTo.thread.source;
      if (this.providers.has(threadSource)) {
        return { source: threadSource, reason: 'REPLY_TO_THREAD' };
      }
    }

    // 4. Default provider (if available)
    if (this.providers.has(this.config.defaultSource)) {
      // In dev mode, check if we should prefer fallback
      if (this.config.devMode && this.config.fallbackSource) {
        // Could add logic here to prefer fallback in certain dev scenarios
      }
      return { source: this.config.defaultSource, reason: 'DEFAULT_PROVIDER' };
    }

    // 5. Fallback provider
    if (this.config.fallbackSource && this.providers.has(this.config.fallbackSource)) {
      return { source: this.config.fallbackSource, reason: 'FALLBACK_PROVIDER' };
    }

    // 6. Any available provider
    const availableSources = Array.from(this.providers.keys());
    if (availableSources.length > 0) {
      return { source: availableSources[0]!, reason: 'ONLY_AVAILABLE' };
    }

    throw new SmartDraftError('No email provider available', 'PROVIDER_UNAVAILABLE');
  }

  /**
   * Get provider for a standard ID
   */
  private getProviderForId(id: string): EmailProvider | undefined {
    const parsed = parseStandardId(id);
    if (!parsed) {return undefined;}
    return this.providers.get(parsed.source);
  }

  /**
   * Build forward header text
   */
  private buildForwardHeader(email: StandardEmail): string {
    const lines = [
      '---------- Forwarded message ----------',
      `From: ${this.formatEmailAddress(email.from)}`,
      `Date: ${email.sentAt}`,
      `Subject: ${email.subject}`,
      `To: ${email.to.map((r) => this.formatEmailAddress(r)).join(', ')}`,
    ];

    if (email.cc.length > 0) {
      lines.push(`Cc: ${email.cc.map((r) => this.formatEmailAddress(r)).join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Format email address for display
   */
  private formatEmailAddress(addr: EmailAddress): string {
    if (addr.name) {
      return `${addr.name} <${addr.email}>`;
    }
    return addr.email;
  }
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Smart draft error
 */
export class SmartDraftError extends Error {
  constructor(
    message: string,
    public readonly code: SmartDraftErrorCode,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'SmartDraftError';
  }
}

/**
 * Smart draft error codes
 */
export type SmartDraftErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'DRAFT_NOT_FOUND'
  | 'INVALID_INPUT';

/**
 * Type guard for SmartDraftError
 */
export function isSmartDraftError(error: unknown): error is SmartDraftError {
  return error instanceof SmartDraftError;
}

