/**
 * @nexus-aec/livekit-agent - Transition Generator
 *
 * Template-based transitions between emails during briefing.
 * Replaces the follow-up LLM call that was adding ~1.5s latency
 * per email transition.
 *
 * Cuts LLM calls per email from 2 to 1.
 */

import type { BriefingEmailRef } from '../reasoning/reasoning-loop.js';

// =============================================================================
// Action Acknowledgments
// =============================================================================

const ACTION_ACKS: Record<string, string> = {
  archive_email: 'Archived.',
  mark_read: 'Marked as read.',
  flag_followup: 'Flagged for follow-up.',
  next_item: '',
  skip_topic: '',
  mute_sender: 'Muted.',
  create_draft: 'Draft saved.',
};

// =============================================================================
// Transition Generator
// =============================================================================

/**
 * Generate a natural transition from the completed action to the next email.
 * Returns a voice-friendly string ready for TTS.
 */
export function generateTransition(
  completedAction: string,
  nextEmail: BriefingEmailRef | null,
  progress: { handled: number; total: number }
): string {
  const ack = ACTION_ACKS[completedAction] ?? 'Done.';

  if (!nextEmail) {
    const countNote = progress.total > 0 ? ` ${progress.handled} emails covered.` : '';
    return `${ack} That wraps up your briefing.${countNote}`;
  }

  const priorityLabel = nextEmail.priority === 'high' ? " This one's important." : '';

  const summary = nextEmail.summary
    ? nextEmail.summary
    : `${nextEmail.subject} from ${nextEmail.from}`;

  return `${ack} Next up: ${summary}${priorityLabel}`.trim();
}
