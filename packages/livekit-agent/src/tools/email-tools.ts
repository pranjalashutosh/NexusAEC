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
 */

import { createLogger } from '@nexus-aec/logger';

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
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
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
// Tool Definitions
// =============================================================================

/**
 * Mute sender tool definition
 */
export const muteSenderTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'mute_sender',
    description: 'Mute all future emails from a sender. User will not receive notifications for emails from this sender.',
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

/**
 * Prioritize VIP tool definition
 */
export const prioritizeVipTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'prioritize_vip',
    description: 'Add a sender to the VIP list. Their emails will be prioritized in future briefings.',
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

/**
 * Create folder tool definition
 */
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

/**
 * Move emails tool definition
 */
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

/**
 * Mark read tool definition
 */
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

/**
 * Flag for follow-up tool definition
 */
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
          description: 'Optional due date for follow-up (e.g., "tomorrow", "next_week", "end_of_day")',
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

/**
 * Create draft tool definition
 */
export const createDraftTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_draft',
    description: 'Create a draft email reply. This will prepare a response but NOT send it.',
    parameters: {
      type: 'object',
      properties: {
        in_reply_to: {
          type: 'string',
          description: 'Email ID this is replying to',
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
      required: ['in_reply_to', 'body'],
    },
  },
};

/**
 * Search emails tool definition
 */
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

/**
 * Undo last action tool definition
 */
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

/**
 * Archive email tool definition
 */
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

// =============================================================================
// All Email Tools
// =============================================================================

/**
 * All email tool definitions
 */
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
];

/**
 * Get tool by name
 */
export function getEmailTool(name: string): ToolDefinition | undefined {
  return EMAIL_TOOLS.find((t) => t.function.name === name);
}

// =============================================================================
// Tool Executors
// =============================================================================

/**
 * Action history for undo functionality
 */
const actionHistory: Array<{
  action: string;
  args: Record<string, unknown>;
  context: EmailActionContext;
  timestamp: Date;
  reversible: boolean;
}> = [];

/**
 * Maximum actions to keep in history
 */
const MAX_HISTORY_SIZE = 50;

/**
 * Record an action in history
 */
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

  // Trim history if too large
  while (actionHistory.length > MAX_HISTORY_SIZE) {
    actionHistory.shift();
  }
}

/**
 * Execute mute_sender
 */
export async function executeMuteSender(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const senderEmail = args['sender_email'] as string;
  const duration = (args['duration'] as string) ?? 'forever';

  logger.info('Executing mute_sender', { senderEmail, duration, context });

  // Check if muting a VIP
  if (context.isVip) {
    return {
      success: false,
      message: `${context.from ?? senderEmail} is on your VIP list. Are you sure you want to mute them?`,
      requiresConfirmation: true,
      riskLevel: 'high',
    };
  }

  // Record for undo
  recordAction('mute_sender', args, context, true);

  // TODO: Actually mute via email provider
  return {
    success: true,
    message: `Muted ${context.from ?? senderEmail} for ${duration.replace('_', ' ')}.`,
    riskLevel: 'medium',
  };
}

/**
 * Execute prioritize_vip
 */
export async function executePrioritizeVip(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const senderEmail = args['sender_email'] as string;
  const senderName = (args['sender_name'] as string) ?? context.from ?? senderEmail;

  logger.info('Executing prioritize_vip', { senderEmail, senderName, context });

  // Record for undo
  recordAction('prioritize_vip', args, context, true);

  // TODO: Actually add to VIP list
  return {
    success: true,
    message: `Added ${senderName} to your VIP list.`,
    riskLevel: 'medium',
  };
}

/**
 * Execute mark_read
 */
export async function executeMarkRead(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const emailIds = (args['email_ids'] as string)?.split(',') ?? [context.emailId];

  logger.info('Executing mark_read', { emailIds, context });

  // Record for undo
  recordAction('mark_read', args, context, true);

  // TODO: Actually mark as read via email provider
  return {
    success: true,
    message: emailIds.length === 1 ? 'Marked as read.' : `Marked ${emailIds.length} emails as read.`,
    riskLevel: 'low',
  };
}

/**
 * Execute flag_followup
 */
export async function executeFlagFollowup(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const emailId = (args['email_id'] as string) ?? context.emailId;
  const dueDate = (args['due_date'] as string) ?? 'no_date';
  const note = args['note'] as string | undefined;

  logger.info('Executing flag_followup', { emailId, dueDate, note, context });

  // Record for undo
  recordAction('flag_followup', args, context, true);

  // TODO: Actually flag via email provider
  const dueDateText = dueDate !== 'no_date' ? ` for ${dueDate.replace('_', ' ')}` : '';
  return {
    success: true,
    message: `Flagged for follow-up${dueDateText}.`,
    riskLevel: 'medium',
  };
}

/**
 * Execute create_draft
 */
export async function executeCreateDraft(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const inReplyTo = (args['in_reply_to'] as string) ?? context.emailId;
  const body = args['body'] as string;
  const tone = (args['tone'] as string) ?? 'friendly';

  logger.info('Executing create_draft', { inReplyTo, tone, context });

  // This requires confirmation before sending
  return {
    success: true,
    message: `I've drafted a ${tone} reply. Would you like me to read it back before saving?`,
    data: { draftBody: body, inReplyTo },
    requiresConfirmation: true,
    riskLevel: 'high',
  };
}

/**
 * Execute archive_email
 */
export async function executeArchiveEmail(
  args: Record<string, unknown>,
  context: EmailActionContext
): Promise<ToolResult> {
  const emailId = (args['email_id'] as string) ?? context.emailId;

  logger.info('Executing archive_email', { emailId, context });

  // Record for undo
  recordAction('archive_email', args, context, true);

  // TODO: Actually archive via email provider
  return {
    success: true,
    message: 'Archived.',
    riskLevel: 'low',
  };
}

/**
 * Execute undo_last_action
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

  // TODO: Actually reverse the action
  return {
    success: true,
    message: `Undid ${lastAction.action.replace('_', ' ')}.`,
    riskLevel: 'low',
  };
}

// =============================================================================
// Tool Executor Registry
// =============================================================================

/**
 * Map of tool names to executors
 */
export const EMAIL_TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  mute_sender: executeMuteSender,
  prioritize_vip: executePrioritizeVip,
  mark_read: executeMarkRead,
  flag_followup: executeFlagFollowup,
  create_draft: executeCreateDraft,
  archive_email: executeArchiveEmail,
  undo_last_action: executeUndoLastAction,
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
