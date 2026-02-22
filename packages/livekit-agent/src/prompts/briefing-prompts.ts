/**
 * @nexus-aec/livekit-agent - Briefing Prompts
 *
 * Templates for generating podcast-style briefings including:
 * - Topic transitions
 * - Email summaries
 * - Red-flag callouts
 * - Thread summaries
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Email summary input
 */
export interface EmailSummaryInput {
  from: string;
  subject: string;
  snippet: string;
  timestamp: Date;
  isFromVip: boolean;
  hasAttachments: boolean;
  threadLength?: number;
  redFlagScore?: number;
  redFlagReasons?: string[];
}

/**
 * Topic for briefing
 */
export interface BriefingTopicPrompt {
  name: string;
  itemCount: number;
  priority: 'high' | 'medium' | 'low';
  description?: string;
}

/**
 * Briefing context
 */
export interface BriefingContext {
  totalItems: number;
  currentPosition: number;
  currentTopic: string;
  remainingTopics: string[];
  estimatedMinutesRemaining: number;
}

// =============================================================================
// Topic Transition Prompts
// =============================================================================

/**
 * Generate a topic transition prompt
 */
export function generateTopicTransition(
  fromTopic: string | null,
  toTopic: BriefingTopicPrompt,
  _context: BriefingContext
): string {
  if (!fromTopic) {
    // First topic
    return `Let's start with ${toTopic.name}. You have ${toTopic.itemCount} ${toTopic.itemCount === 1 ? 'item' : 'items'} here.`;
  }

  // Transition between topics
  const urgencyNote = toTopic.priority === 'high' ? 'This is high priority. ' : '';

  return `Moving on to ${toTopic.name}. ${urgencyNote}${toTopic.itemCount} ${toTopic.itemCount === 1 ? 'item' : 'items'} to cover.`;
}

/**
 * Generate progress update
 */
export function generateProgressUpdate(context: BriefingContext): string {
  const remaining = context.totalItems - context.currentPosition;

  if (remaining === 0) {
    return "That's everything for now.";
  }

  if (remaining <= 3) {
    return `Almost done. ${remaining} more ${remaining === 1 ? 'item' : 'items'}.`;
  }

  if (context.estimatedMinutesRemaining <= 2) {
    return `About ${remaining} items left, roughly ${context.estimatedMinutesRemaining} minutes.`;
  }

  return `${remaining} items remaining, about ${context.estimatedMinutesRemaining} minutes.`;
}

// =============================================================================
// Email Summary Prompts
// =============================================================================

/**
 * Generate email summary prompt for GPT-4o
 */
export function generateEmailSummaryPrompt(email: EmailSummaryInput): string {
  const vipNote = email.isFromVip ? '[VIP] ' : '';
  const attachmentNote = email.hasAttachments ? ' (has attachments)' : '';
  const threadNote =
    email.threadLength && email.threadLength > 1
      ? ` [${email.threadLength} messages in thread]`
      : '';
  const timeAgo = getTimeAgo(email.timestamp);

  return `Summarize this email for verbal briefing. Be concise (max 2 sentences).

FROM: ${vipNote}${email.from}
SUBJECT: ${email.subject}${attachmentNote}${threadNote}
RECEIVED: ${timeAgo}
CONTENT PREVIEW: ${email.snippet}

Format your response as natural speech, not a list. Lead with the key point.`;
}

/**
 * Generate red flag callout prompt
 */
export function generateRedFlagPrompt(email: EmailSummaryInput): string {
  if (!email.redFlagScore || email.redFlagScore < 0.5) {
    return '';
  }

  const reasons = email.redFlagReasons?.length
    ? email.redFlagReasons.join(', ')
    : 'requires attention';

  if (email.redFlagScore >= 0.8) {
    return `[URGENT CALLOUT] This needs immediate attention. ${reasons}. What would you like to do?`;
  }

  if (email.redFlagScore >= 0.6) {
    return `[ATTENTION] Worth noting: ${reasons}.`;
  }

  return `[NOTE] ${reasons}.`;
}

/**
 * Generate thread summary prompt
 */
export function generateThreadSummaryPrompt(
  subject: string,
  participants: string[],
  messageCount: number,
  latestSnippet: string
): string {
  return `Summarize this email thread for verbal briefing. Focus on: current status, any decisions made, and what needs the user's attention.

THREAD: ${subject}
PARTICIPANTS: ${participants.join(', ')}
MESSAGES: ${messageCount}
LATEST MESSAGE: ${latestSnippet}

Keep it under 3 sentences. Start with the current state, then any action needed.`;
}

// =============================================================================
// Action Confirmation Prompts
// =============================================================================

/**
 * Confirmation prompt templates by risk level
 */
export const CONFIRMATION_TEMPLATES = {
  // Low risk - just acknowledge
  low: {
    markRead: 'Marked as read.',
    skip: 'Skipped.',
    next: 'Moving on.',
    archive: 'Archived.',
  },

  // Medium risk - confirm action taken
  medium: {
    flag: 'Flagged for follow-up.',
    flagWithContext: (from: string) => `Flagged ${from}'s email for follow-up.`,
    moveToFolder: (folder: string) => `Moved to ${folder}.`,
    addVip: (name: string) => `Added ${name} to your VIP list.`,
  },

  // High risk - confirm before acting
  high: {
    sendEmail: (to: string) => `I'll send this to ${to}. Should I go ahead?`,
    deleteEmail: 'This will delete the email. Are you sure?',
    muteVip: (name: string) => `${name} is a VIP. Still mute them?`,
    createDraft: (subject: string) =>
      `I've drafted a reply about ${subject}. Want me to read it back?`,
  },
};

/**
 * Generate confirmation message
 */
export function generateConfirmation(
  action: string,
  riskLevel: 'low' | 'medium' | 'high',
  context?: Record<string, string>
): string {
  const templates = CONFIRMATION_TEMPLATES[riskLevel];

  if (typeof templates[action as keyof typeof templates] === 'function') {
    const template = templates[action as keyof typeof templates] as (arg: string) => string;
    return template(context?.['arg'] ?? '');
  }

  return (templates[action as keyof typeof templates] as string) ?? 'Done.';
}

// =============================================================================
// Disambiguation Prompts
// =============================================================================

/**
 * Generate disambiguation prompt
 */
export function generateDisambiguationPrompt(
  options: Array<{ label: string; description: string }>,
  context?: string
): string {
  if (options.length === 0) {
    return "I'm not sure what you meant. Could you clarify?";
  }

  const firstOption = options[0];
  if (options.length === 1 && firstOption) {
    return `Did you mean ${firstOption.label}?`;
  }

  const optionText = options.map((opt, i) => `${i + 1}. ${opt.label}`).join(', or ');

  const contextNote = context ? `For "${context}": ` : '';

  return `${contextNote}Which one? ${optionText}?`;
}

// =============================================================================
// Briefing Structure Prompts
// =============================================================================

/**
 * Opening briefing prompt
 */
export function generateBriefingOpening(context: BriefingContext, userName?: string): string {
  const name = userName ? `${userName}, ` : '';
  const topicList = context.remainingTopics.slice(0, 3).join(', ');
  const moreNote =
    context.remainingTopics.length > 3
      ? ` and ${context.remainingTopics.length - 3} more topics`
      : '';

  return `${name}you have ${context.totalItems} items to catch up on. Topics include: ${topicList}${moreNote}. Let's dive in.`;
}

/**
 * Closing briefing prompt
 */
export function generateBriefingClosing(actionsCount: number, flaggedCount: number): string {
  if (actionsCount === 0 && flaggedCount === 0) {
    return "That's your inbox for now. Nothing needed from you.";
  }

  const actionNote =
    actionsCount > 0
      ? `You took ${actionsCount} ${actionsCount === 1 ? 'action' : 'actions'}. `
      : '';
  const flagNote =
    flaggedCount > 0
      ? `${flaggedCount} ${flaggedCount === 1 ? 'item' : 'items'} flagged for follow-up.`
      : '';

  return `That's your briefing. ${actionNote}${flagNote} I'll update you if anything urgent comes in.`;
}

/**
 * Pause briefing prompt
 */
export function generatePausePrompt(context: BriefingContext): string {
  return `Pausing the briefing. You have ${context.totalItems - context.currentPosition} items left. Just say "resume" when you're ready.`;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return 'just now';
  }
  if (diffMins < 60) {
    return `${diffMins} minutes ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  }
  if (diffDays === 1) {
    return 'yesterday';
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  return date.toLocaleDateString();
}

// =============================================================================
// Exports
// =============================================================================

export { getTimeAgo };
