/**
 * @nexus-aec/livekit-agent - Email Tools
 *
 * GPT-4o function calling tools for email actions:
 * - mute_sender
 * - prioritize_vip
 * - create_folder
 * - move_emails
 * - mark_read
 * - flag_followup
 * - create_draft
 * - search_emails
 * - undo_last_action
 * - archive_email
 */

import { isEmailProviderError } from '@nexus-aec/email-providers';
import { createLogger } from '@nexus-aec/logger';

import type {
  UnifiedInboxService,
  SmartDraftService,
  EmailQueryFilters,
} from '@nexus-aec/email-providers';

const logger = createLogger({ baseContext: { component: 'email-tools' } });

// =============================================================================
// Types
// =============================================================================

/**
 * Tool definition for GPT-4o function calling
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<
        string,
        {
          type: string;
          description: string;
          enum?: string[];
        }
      >;
      required: string[];
    };
  };
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  requiresConfirmation?: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Email action context
 */
export interface EmailActionContext {
  emailId: string;
  threadId?: string;
  from?: string;
  subject?: string;
  isVip?: boolean;
}

/**
 * Tool executor function type
 */
export type ToolExecutor = (
  args: Record<string, unknown>,
  context: EmailActionContext
) => Promise<ToolResult>;

// =============================================================================
// Service Registry
// =============================================================================

let _inboxService: UnifiedInboxService | null = null;
let _draftService: SmartDraftService | null = null;

/**
 * Register email services for use by tool executors.
 * Call this after user authenticates and providers are ready.
 */
export function setEmailServices(inbox: UnifiedInboxService, draft?: SmartDraftService): void {
  _inboxService = inbox;
  if (draft !== undefined) {
    _draftService = draft;
  }
  logger.info('Email services registered');
}

/**
 * Clear email services (call on disconnect/shutdown)
 */
export function clearEmailServices(): void {
  _inboxService = null;
  _draftService = null;
  logger.info('Email services cleared');
}

/**
 * Get the inbox service or throw if not initialized
 */
export function getInboxService(): UnifiedInboxService {
  if (!_inboxService) {
    throw new Error(
      'Email services not initialized. Call setEmailServices() after authentication.'
    );
  }
  return _inboxService;
}

// =============================================================================
// Local State (VIP / Mute — no provider equivalent)
// =============================================================================

const vipList = new Set<string>();
const muteList = new Map<string, { until: Date | null }>();

/**
 * Initialize VIP and mute lists from persisted preferences.
 * Called at session start to pre-populate in-memory state.
 */
export function initializeFromPreferences(
  vips: string[],
  muted: Array<{ email: string; expiresAt?: Date | null }>
): void {
  for (const v of vips) {
    vipList.add(v);
  }
  for (const m of muted) {
    muteList.set(m.email, { until: m.expiresAt ?? null });
  }
  logger.info('Initialized email tools from preferences', {
    vipCount: vips.length,
    mutedCount: muted.length,
  });
}

/**
 * Check if a sender email is on the VIP list
 */
export function isVip(email: string): boolean {
  return vipList.has(email);
}

/**
 * Check if a sender email is currently muted
 */
export function isMuted(email: string): boolean {
  const entry = muteList.get(email);
  if (!entry) {
    return false;
  }
  if (entry.until && entry.until < new Date()) {
    muteList.delete(email);
    return false;
  }
  return true;
}

/**
 * Compute mute expiration date
 */
function computeExpiration(duration: string): Date | null {
  if (duration === 'forever') {
    return null;
  }
  const now = new Date();
  switch (duration) {
    case '1_day':
      return new Date(now.getTime() + 86400000);
    case '1_week':
      return new Date(now.getTime() + 7 * 86400000);
    case '1_month':
      return new Date(now.getTime() + 30 * 86400000);
    default:
      return new Date(now.getTime() + 86400000);
  }
}

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Map provider errors to human-friendly voice messages
 */
function handleProviderError(error: unknown, actionDescription: string): ToolResult {
  if (isEmailProviderError(error)) {
    switch (error.code) {
      case 'AUTH_EXPIRED':
      case 'AUTH_INVALID':
        return {
          success: false,
          message: 'Your email session has expired. Please reconnect your email account.',
          riskLevel: 'high',
        };
      case 'RATE_LIMITED':
        return {
          success: false,
          message: "I'm being rate limited by the email provider. I'll try again in a moment.",
          riskLevel: 'low',
        };
      case 'NOT_FOUND':
        return {
          success: false,
          message: "I couldn't find that email. It may have been moved or deleted.",
          riskLevel: 'low',
        };
      case 'NETWORK_ERROR':
        return {
          success: false,
          message: "I'm having trouble reaching the email server. Please check your connection.",
          riskLevel: 'medium',
        };
      default:
        break;
    }
  }

  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('Email services not initialized')) {
    return {
      success: false,
      message: 'Email is not connected yet. Please connect your email account first.',
      riskLevel: 'medium',
    };
  }

  logger.error(
    `Failed to ${actionDescription}`,
    error instanceof Error ? error : new Error(message)
  );
  return {
    success: false,
    message: `Failed to ${actionDescription}. Please try again.`,
    riskLevel: 'low',
  };
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const muteSenderTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'mute_sender',
    description:
      'Mute all future emails from a sender. User will not receive notifications for emails from this sender.',
    parameters: {
      type: 'object',
      properties: {
        sender_email: {
          type: 'string',
          description: 'Email address of the sender to mute',
        },
        duration: {
          type: 'string',
          description: 'How long to mute the sender',
          enum: ['1_day', '1_week', '1_month', 'forever'],
        },
      },
      required: ['sender_email'],
    },
  },
};

export const prioritizeVipTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'prioritize_vip',
    description:
      'Add a sender to the VIP list. Their emails will be prioritized in future briefings.',
    parameters: {
      type: 'object',
      properties: {
        sender_email: {
          type: 'string',
          description: 'Email address of the sender to add as VIP',
        },
        sender_name: {
          type: 'string',
          description: 'Name of the sender for reference',
        },
      },
      required: ['sender_email'],
    },
  },
};

export const createFolderTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_folder',
    description: 'Create a new email folder for organizing emails.',
    parameters: {
      type: 'object',
      properties: {
        folder_name: {
          type: 'string',
          description: 'Name for the new folder',
        },
        parent_folder: {
          type: 'string',
          description: 'Optional parent folder path',
        },
      },
      required: ['folder_name'],
    },
  },
};

export const moveEmailsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'move_emails',
    description: 'Move one or more emails to a specific folder.',
    parameters: {
      type: 'object',
      properties: {
        email_ids: {
          type: 'string',
          description: 'Comma-separated list of email IDs to move',
        },
        target_folder: {
          type: 'string',
          description: 'Destination folder name or path',
        },
      },
      required: ['email_ids', 'target_folder'],
    },
  },
};

export const markReadTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'mark_read',
    description: 'Mark one or more emails as read.',
    parameters: {
      type: 'object',
      properties: {
        email_ids: {
          type: 'string',
          description: 'Comma-separated list of email IDs to mark as read',
        },
      },
      required: ['email_ids'],
    },
  },
};

export const flagFollowupTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'flag_followup',
    description: 'Flag an email for follow-up with optional due date.',
    parameters: {
      type: 'object',
      properties: {
        email_id: {
          type: 'string',
          description: 'Email ID to flag',
        },
        due_date: {
          type: 'string',
          description:
            'Optional due date for follow-up (e.g., "tomorrow", "next_week", "end_of_day")',
          enum: ['today', 'tomorrow', 'this_week', 'next_week', 'no_date'],
        },
        note: {
          type: 'string',
          description: 'Optional note to add to the flag',
        },
      },
      required: ['email_id'],
    },
  },
};

export const createDraftTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_draft',
    description:
      'Create a draft email. For replies, provide in_reply_to with the email ID. For new emails, provide to with the recipient email address and subject.',
    parameters: {
      type: 'object',
      properties: {
        in_reply_to: {
          type: 'string',
          description: 'Email ID this is replying to (for replies only)',
        },
        to: {
          type: 'string',
          description:
            'Recipient email address (for new emails). Use this when composing a new email rather than replying.',
        },
        subject: {
          type: 'string',
          description: 'Email subject line (for new emails)',
        },
        body: {
          type: 'string',
          description: 'Draft body content',
        },
        tone: {
          type: 'string',
          description: 'Tone for the response',
          enum: ['formal', 'friendly', 'brief', 'detailed'],
        },
      },
      required: ['body'],
    },
  },
};

export const searchEmailsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_emails',
    description: 'Search for emails matching specific criteria.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (keywords, phrases)',
        },
        from: {
          type: 'string',
          description: 'Filter by sender email or name',
        },
        date_range: {
          type: 'string',
          description: 'Date range for search',
          enum: ['today', 'yesterday', 'this_week', 'this_month', 'all_time'],
        },
        has_attachment: {
          type: 'string',
          description: 'Filter for emails with attachments',
          enum: ['true', 'false'],
        },
      },
      required: ['query'],
    },
  },
};

export const undoLastActionTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'undo_last_action',
    description: 'Undo the most recent email action (if possible).',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

export const archiveEmailTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'archive_email',
    description: 'Archive an email to remove it from inbox while keeping it.',
    parameters: {
      type: 'object',
      properties: {
        email_id: {
          type: 'string',
          description: 'Email ID to archive',
        },
      },
      required: ['email_id'],
    },
  },
};

export const batchActionTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'batch_action',
    description:
      'Apply an action to multiple emails at once. Use this when the user says things like "archive all LinkedIn" or "mark all newsletters as read".',
    parameters: {
      type: 'object',
      properties: {
        email_ids: {
          type: 'string',
          description: 'Comma-separated list of email IDs to act on',
        },
        action: {
          type: 'string',
          description: 'Action to perform on all listed emails',
          enum: ['archive', 'mark_read', 'flag'],
        },
      },
      required: ['email_ids', 'action'],
    },
  },
};

// =============================================================================
// All Email Tools
// =============================================================================

export const EMAIL_TOOLS: ToolDefinition[] = [
  muteSenderTool,
  prioritizeVipTool,
  createFolderTool,
  moveEmailsTool,
  markReadTool,
  flagFollowupTool,
  createDraftTool,
  searchEmailsTool,
  undoLastActionTool,
  archiveEmailTool,
  batchActionTool,
];

export function getEmailTool(name: string): ToolDefinition | undefined {
  return EMAIL_TOOLS.find((t) => t.function.name === name);
}

// =============================================================================
// Action History (for undo)
// =============================================================================

const actionHistory: Array<{
  action: string;
  args: Record<string, unknown>;
  context: EmailActionContext;
  timestamp: Date;
  reversible: boolean;
}> = [];

const MAX_HISTORY_SIZE = 50;

function recordAction(
  action: string,
  args: Record<string, unknown>,
  context: EmailActionContext,
  reversible: boolean
): void {
  actionHistory.push({
    action,
    args,
    context,
    timestamp: new Date(),
    reversible,
  });

  while (actionHistory.length > MAX_HISTORY_SIZE) {
    actionHistory.shift();
  }
}

// =============================================================================
// Tool Executors
// =============================================================================

/**
 * Execute mute_sender — local-only (no provider equivalent)
 */
export async function executeMuteSender(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const senderEmail = args['sender_email'] as string;
  const duration = (args['duration'] as string) ?? 'forever';

  logger.info('Executing mute_sender', { senderEmail, duration, context });

  if (context.isVip) {
    return {
      success: false,
      message: `${context.from ?? senderEmail} is on your VIP list. Are you sure you want to mute them?`,
      requiresConfirmation: true,
      riskLevel: 'high',
    };
  }

  const wasMuted = muteList.has(senderEmail);
  const until = computeExpiration(duration);
  muteList.set(senderEmail, { until });

  recordAction('mute_sender', { ...args, _wasMuted: wasMuted }, context, true);

  return {
    success: true,
    message: `Muted ${context.from ?? senderEmail} for ${duration.replace('_', ' ')}.`,
    riskLevel: 'medium',
  };
}

/**
 * Execute prioritize_vip — local-only (no provider equivalent)
 */
export async function executePrioritizeVip(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const senderEmail = args['sender_email'] as string;
  const senderName = (args['sender_name'] as string) ?? context.from ?? senderEmail;

  logger.info('Executing prioritize_vip', { senderEmail, senderName, context });

  const wasVip = vipList.has(senderEmail);
  vipList.add(senderEmail);

  recordAction('prioritize_vip', { ...args, _wasVip: wasVip }, context, true);

  return {
    success: true,
    message: wasVip
      ? `${senderName} is already on your VIP list.`
      : `Added ${senderName} to your VIP list.`,
    riskLevel: 'medium',
  };
}

/**
 * Execute mark_read — calls inbox.markRead()
 */
export async function executeMarkRead(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const emailIds = (args['email_ids'] as string)?.split(',').map((s) => s.trim()) ?? [
    context.emailId,
  ];

  logger.info('Executing mark_read', { emailIds, context });

  try {
    const inbox = getInboxService();
    const result = await inbox.markRead(emailIds);

    if (!result.allSucceeded) {
      logger.warn('Partial markRead failure', { errors: result.errors });
    }

    recordAction('mark_read', { email_ids: emailIds.join(',') }, context, true);

    return {
      success: true,
      message:
        emailIds.length === 1 ? 'Marked as read.' : `Marked ${emailIds.length} emails as read.`,
      riskLevel: 'low',
    };
  } catch (error) {
    return handleProviderError(error, 'mark as read');
  }
}

/**
 * Execute flag_followup — calls inbox.flagEmails()
 */
export async function executeFlagFollowup(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const emailId = (args['email_id'] as string) ?? context.emailId;
  const dueDate = (args['due_date'] as string) ?? 'no_date';

  logger.info('Executing flag_followup', { emailId, dueDate, context });

  try {
    const inbox = getInboxService();
    await inbox.flagEmails([emailId]);

    recordAction('flag_followup', { email_id: emailId, due_date: dueDate }, context, true);

    const dueDateText = dueDate !== 'no_date' ? ` for ${dueDate.replace('_', ' ')}` : '';
    return {
      success: true,
      message: `Flagged for follow-up${dueDateText}.`,
      riskLevel: 'medium',
    };
  } catch (error) {
    return handleProviderError(error, 'flag email');
  }
}

/**
 * Execute create_draft — uses SmartDraftService or falls back to inbox.createDraft()
 */
export async function executeCreateDraft(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const inReplyTo = args['in_reply_to'] as string | undefined;
  const toAddress = args['to'] as string | undefined;
  const subject = args['subject'] as string | undefined;
  const body = args['body'] as string;
  const tone = (args['tone'] as string) ?? 'friendly';
  const isNewEmail = !inReplyTo && toAddress;

  logger.info('Executing create_draft', {
    inReplyTo,
    toAddress,
    subject,
    tone,
    isNewEmail,
    context,
  });

  try {
    const inbox = getInboxService();

    // --- Reply path: in_reply_to is provided ---
    if (inReplyTo) {
      const originalEmail = await inbox.fetchEmail(inReplyTo);

      if (_draftService && originalEmail) {
        const draft = await _draftService.createReply(originalEmail, {
          bodyText: body,
        });
        return {
          success: true,
          message: `I've drafted a ${tone} reply. Would you like me to read it back before saving?`,
          data: { draftId: draft.id, draftBody: body, inReplyTo },
          requiresConfirmation: true,
          riskLevel: 'high',
        };
      }

      // Fallback: create reply draft via UnifiedInboxService
      const replyTo = originalEmail?.from?.email ?? context.from;
      const replySubject = originalEmail?.subject
        ? `Re: ${originalEmail.subject}`
        : context.subject
          ? `Re: ${context.subject}`
          : 'Re:';

      const draft = await inbox.createDraft({
        subject: replySubject,
        to: replyTo ? [{ email: replyTo }] : [],
        bodyText: body,
        inReplyToMessageId: inReplyTo,
        isPendingReview: true,
        reviewRationale: 'Created via voice command',
      });

      return {
        success: true,
        message: `I've drafted a ${tone} reply. Would you like me to read it back before saving?`,
        data: { draftId: draft.id, draftBody: body, inReplyTo },
        requiresConfirmation: true,
        riskLevel: 'high',
      };
    }

    // --- New email path: 'to' address is provided ---
    const recipientEmail = toAddress ?? context.from;
    if (!recipientEmail) {
      return {
        success: false,
        message: 'I need a recipient email address. Who should I send this to?',
        riskLevel: 'low',
      };
    }

    const draft = await inbox.createDraft({
      subject: subject ?? '(No subject)',
      to: [{ email: recipientEmail }],
      bodyText: body,
      isPendingReview: true,
      reviewRationale: 'Created via voice command',
    });

    const actionLabel = isNewEmail ? 'new email' : 'reply';
    return {
      success: true,
      message: `I've drafted a ${tone} ${actionLabel} to ${recipientEmail}. Would you like me to read it back before saving?`,
      data: { draftId: draft.id, draftBody: body, to: recipientEmail, subject },
      requiresConfirmation: true,
      riskLevel: 'high',
    };
  } catch (error) {
    return handleProviderError(error, 'create draft');
  }
}

/**
 * Execute archive_email — calls inbox.archiveEmails()
 */
export async function executeArchiveEmail(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const emailId = (args['email_id'] as string) ?? context.emailId;

  logger.info('Executing archive_email', { emailId, context });

  try {
    const inbox = getInboxService();
    await inbox.archiveEmails([emailId]);

    recordAction('archive_email', { email_id: emailId }, context, true);

    return {
      success: true,
      message: 'Archived.',
      riskLevel: 'low',
    };
  } catch (error) {
    return handleProviderError(error, 'archive email');
  }
}

/**
 * Execute create_folder — calls inbox.createFolder()
 */
export async function executeCreateFolder(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const folderName = args['folder_name'] as string;
  const parentFolder = args['parent_folder'] as string | undefined;

  logger.info('Executing create_folder', { folderName, parentFolder, context });

  try {
    const inbox = getInboxService();
    const sources = inbox.getActiveSources();
    const source = sources[0];
    if (!source) {
      return { success: false, message: 'No email provider connected.', riskLevel: 'low' };
    }

    const folder = await inbox.createFolder(folderName, source, parentFolder);

    recordAction('create_folder', { folder_name: folderName, folder_id: folder.id }, context, true);

    return {
      success: true,
      message: `Created folder "${folderName}".`,
      data: { folderId: folder.id },
      riskLevel: 'medium',
    };
  } catch (error) {
    return handleProviderError(error, 'create folder');
  }
}

/**
 * Execute move_emails — resolves folder name, then calls inbox.moveToFolder()
 */
export async function executeMoveEmails(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const emailIds =
    (args['email_ids'] as string)
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const targetFolder = args['target_folder'] as string;

  logger.info('Executing move_emails', { emailIds, targetFolder, context });

  if (emailIds.length === 0) {
    return { success: false, message: 'No email IDs provided.', riskLevel: 'low' };
  }

  try {
    const inbox = getInboxService();
    const { folders } = await inbox.fetchFolders();
    const matchedFolder = folders.find(
      (f) => f.name.toLowerCase() === targetFolder.toLowerCase() || f.id === targetFolder
    );

    if (!matchedFolder) {
      return {
        success: false,
        message: `Folder "${targetFolder}" not found. Would you like me to create it?`,
        requiresConfirmation: true,
        riskLevel: 'medium',
      };
    }

    await inbox.moveToFolder(emailIds, matchedFolder.id);

    // Move is not reversible (unknown source folder)
    recordAction(
      'move_emails',
      {
        email_ids: emailIds.join(','),
        target_folder: matchedFolder.id,
      },
      context,
      false
    );

    return {
      success: true,
      message:
        emailIds.length === 1
          ? `Moved to "${matchedFolder.name}".`
          : `Moved ${emailIds.length} emails to "${matchedFolder.name}".`,
      riskLevel: 'low',
    };
  } catch (error) {
    return handleProviderError(error, 'move emails');
  }
}

/**
 * Execute search_emails — calls inbox.fetchUnread() with filters
 */
export async function executeSearchEmails(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const query = args['query'] as string;
  const from = args['from'] as string | undefined;
  const dateRange = args['date_range'] as string | undefined;
  const hasAttachment = args['has_attachment'] as string | undefined;

  logger.info('Executing search_emails', { query, from, dateRange, hasAttachment, context });

  try {
    const inbox = getInboxService();

    const filters: EmailQueryFilters = { query };
    if (from) {
      filters.from = from;
    }
    if (hasAttachment === 'true') {
      filters.hasAttachments = true;
    }
    if (dateRange) {
      const now = new Date();
      switch (dateRange) {
        case 'today':
          filters.after = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'yesterday': {
          const y = new Date(now);
          y.setDate(y.getDate() - 1);
          filters.after = new Date(y.getFullYear(), y.getMonth(), y.getDate());
          filters.before = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        }
        case 'this_week': {
          const w = new Date(now);
          w.setDate(w.getDate() - now.getDay());
          filters.after = w;
          break;
        }
        case 'this_month':
          filters.after = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        // 'all_time' — no date filter
      }
    }

    const result = await inbox.fetchUnread(filters, { pageSize: 10 });

    return {
      success: true,
      message:
        result.items.length === 0
          ? 'No emails found matching your search.'
          : `Found ${result.items.length} email${result.items.length > 1 ? 's' : ''}. ${result.items
              .slice(0, 3)
              .map((e) => `"${e.subject}" from ${e.from.name ?? e.from.email}`)
              .join('; ')}.`,
      data: {
        count: result.items.length,
        emails: result.items.slice(0, 5).map((e) => ({
          id: e.id,
          subject: e.subject,
          from: e.from.email,
          receivedAt: e.receivedAt,
        })),
      },
      riskLevel: 'low',
    };
  } catch (error) {
    return handleProviderError(error, 'search emails');
  }
}

/**
 * Execute undo_last_action — dispatches reverse provider calls
 */
export async function executeUndoLastAction(
  _args: Record<string, unknown>,
  _context: EmailActionContext
): Promise<ToolResult> {
  const lastAction = actionHistory.pop();

  if (!lastAction) {
    return {
      success: false,
      message: "There's nothing to undo.",
      riskLevel: 'low',
    };
  }

  if (!lastAction.reversible) {
    return {
      success: false,
      message: `Cannot undo ${lastAction.action}. That action is not reversible.`,
      riskLevel: 'low',
    };
  }

  logger.info('Executing undo', { lastAction });

  try {
    switch (lastAction.action) {
      case 'mark_read': {
        const ids = (lastAction.args['email_ids'] as string)?.split(',').map((s) => s.trim()) ?? [];
        const inbox = getInboxService();
        await inbox.markUnread(ids);
        return { success: true, message: 'Undid mark as read.', riskLevel: 'low' };
      }
      case 'flag_followup': {
        const id = lastAction.args['email_id'] as string;
        const inbox = getInboxService();
        await inbox.unflagEmails([id]);
        return { success: true, message: 'Removed follow-up flag.', riskLevel: 'low' };
      }
      case 'archive_email': {
        const id = lastAction.args['email_id'] as string;
        const inbox = getInboxService();
        const { folders } = await inbox.fetchFolders();
        const inboxFolder = folders.find((f) => f.systemType === 'inbox');
        if (inboxFolder) {
          await inbox.moveToFolder([id], inboxFolder.id);
        }
        return { success: true, message: 'Moved back to inbox.', riskLevel: 'low' };
      }
      case 'mute_sender': {
        const email = lastAction.args['sender_email'] as string;
        muteList.delete(email);
        return { success: true, message: `Unmuted ${email}.`, riskLevel: 'low' };
      }
      case 'prioritize_vip': {
        const email = lastAction.args['sender_email'] as string;
        const wasVip = lastAction.args['_wasVip'] as boolean;
        if (!wasVip) {
          vipList.delete(email);
        }
        return { success: true, message: `Removed ${email} from VIP list.`, riskLevel: 'low' };
      }
      case 'create_folder': {
        const folderId = lastAction.args['folder_id'] as string;
        if (folderId) {
          const inbox = getInboxService();
          await inbox.deleteFolder(folderId);
        }
        return { success: true, message: 'Deleted the folder.', riskLevel: 'low' };
      }
      default:
        return {
          success: true,
          message: `Undid ${lastAction.action.replace('_', ' ')}.`,
          riskLevel: 'low',
        };
    }
  } catch (error) {
    return handleProviderError(error, `undo ${lastAction.action}`);
  }
}

/**
 * Execute batch_action — applies a single action to multiple emails at once.
 * Leverages Gmail's batchModifyMessages for efficiency.
 */
export async function executeBatchAction(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const emailIds =
    (args['email_ids'] as string)
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const action = args['action'] as string;

  logger.info('Executing batch_action', { emailIds, action, context });

  if (emailIds.length === 0) {
    return { success: false, message: 'No email IDs provided.', riskLevel: 'low' };
  }

  try {
    const inbox = getInboxService();

    switch (action) {
      case 'archive':
        await inbox.archiveEmails(emailIds);
        break;
      case 'mark_read':
        await inbox.markRead(emailIds);
        break;
      case 'flag':
        await inbox.flagEmails(emailIds);
        break;
      default:
        return {
          success: false,
          message: `Unknown batch action: ${action}`,
          riskLevel: 'low',
        };
    }

    recordAction('batch_action', { email_ids: emailIds.join(','), action }, context, false);

    const actionLabel = action === 'mark_read' ? 'marked as read' : `${action}d`;
    return {
      success: true,
      message: `${emailIds.length} emails ${actionLabel}.`,
      riskLevel: 'low',
    };
  } catch (error) {
    return handleProviderError(error, `batch ${action}`);
  }
}

// =============================================================================
// Tool Executor Registry
// =============================================================================

export const EMAIL_TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  mute_sender: executeMuteSender,
  prioritize_vip: executePrioritizeVip,
  mark_read: executeMarkRead,
  flag_followup: executeFlagFollowup,
  create_draft: executeCreateDraft,
  archive_email: executeArchiveEmail,
  undo_last_action: executeUndoLastAction,
  create_folder: executeCreateFolder,
  move_emails: executeMoveEmails,
  search_emails: executeSearchEmails,
  batch_action: executeBatchAction,
};

/**
 * Execute an email tool by name
 */
export async function executeEmailTool(
  toolName: string,
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const executor = EMAIL_TOOL_EXECUTORS[toolName];

  if (!executor) {
    logger.warn('Unknown email tool', { toolName });
    return {
      success: false,
      message: `Unknown action: ${toolName}`,
      riskLevel: 'low',
    };
  }

  try {
    return await executor(args, context);
  } catch (error) {
    logger.error('Tool execution error', error instanceof Error ? error : new Error(String(error)));
    return {
      success: false,
      message: `Failed to ${toolName.replace('_', ' ')}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      riskLevel: 'low',
    };
  }
}
