/**
 * @nexus-aec/livekit-agent - Briefing Session Tracker
 *
 * Central state machine that tracks every email's lifecycle during a
 * briefing session: pending → briefed → actioned → skipped.
 *
 * Unifies topicRefs, BriefingState, and emailContext into one coherent
 * object so the ReasoningLoop always knows which email is current,
 * which have been handled, and what comes next.
 */

import { createLogger } from '@nexus-aec/logger';

import type { BriefedEmailStore } from './briefed-email-store.js';
import type { BriefingEmailRef, BriefingTopicRef } from '../reasoning/reasoning-loop.js';
import type { SenderProfileStore, ProfileAction } from '@nexus-aec/intelligence';

const logger = createLogger({ baseContext: { component: 'briefing-tracker' } });

// =============================================================================
// Types
// =============================================================================

export type EmailStatus = 'pending' | 'briefed' | 'actioned' | 'skipped';

export interface EmailState {
  ref: BriefingEmailRef;
  topicIndex: number;
  itemIndex: number;
  status: EmailStatus;
  actionTaken?: string;
  briefedAt?: Date;
  actionedAt?: Date;
}

export interface BriefingProgress {
  currentTopicIndex: number;
  currentItemIndex: number;
  currentEmail: BriefingEmailRef | null;
  currentTopicLabel: string;
  totalTopics: number;
  totalEmails: number;
  emailsBriefed: number;
  emailsActioned: number;
  emailsSkipped: number;
  emailsRemaining: number;
}

// =============================================================================
// BriefingSessionTracker
// =============================================================================

export class BriefingSessionTracker {
  private emailMap: Map<string, EmailState>;
  private topics: BriefingTopicRef[];
  private cursor: { topicIndex: number; itemIndex: number };
  private history: Array<{ topicIndex: number; itemIndex: number }>;
  private store: BriefedEmailStore | null;
  private userId: string | null;
  private senderProfileStore: SenderProfileStore | null;

  constructor(
    topics: BriefingTopicRef[],
    store?: BriefedEmailStore,
    userId?: string,
    senderProfileStore?: SenderProfileStore
  ) {
    this.topics = topics;
    this.emailMap = new Map();
    this.cursor = { topicIndex: 0, itemIndex: 0 };
    this.history = [];
    this.store = store ?? null;
    this.userId = userId ?? null;
    this.senderProfileStore = senderProfileStore ?? null;

    // Index every email across all topics
    for (let t = 0; t < topics.length; t++) {
      const topic = topics[t]!;
      for (let i = 0; i < topic.emails.length; i++) {
        const ref = topic.emails[i]!;
        this.emailMap.set(ref.emailId, {
          ref,
          topicIndex: t,
          itemIndex: i,
          status: 'pending',
        });
      }
    }

    logger.info('BriefingSessionTracker initialized', {
      topicCount: topics.length,
      totalEmails: this.emailMap.size,
      topicSizes: topics.map((t) => t.emails.length),
    });
  }

  // ===========================================================================
  // Progressive Loading
  // ===========================================================================

  /**
   * Add new topics (or merge emails into existing topics) for progressive loading.
   * Used when paginated email fetches bring in additional batches.
   */
  addTopics(newTopics: BriefingTopicRef[]): void {
    for (const newTopic of newTopics) {
      // Check if a topic with this label already exists
      const existing = this.topics.find((t) => t.label === newTopic.label);

      if (existing) {
        // Merge new emails into existing topic
        for (const email of newTopic.emails) {
          if (!this.emailMap.has(email.emailId)) {
            existing.emails.push(email);
            this.emailMap.set(email.emailId, {
              ref: email,
              topicIndex: this.topics.indexOf(existing),
              itemIndex: existing.emails.length - 1,
              status: 'pending',
            });
          }
        }
      } else {
        // Add as a new topic
        const topicIndex = this.topics.length;
        this.topics.push(newTopic);
        for (let i = 0; i < newTopic.emails.length; i++) {
          const email = newTopic.emails[i]!;
          if (!this.emailMap.has(email.emailId)) {
            this.emailMap.set(email.emailId, {
              ref: email,
              topicIndex,
              itemIndex: i,
              status: 'pending',
            });
          }
        }
      }
    }

    logger.info('Topics added to tracker', {
      newTopicCount: newTopics.length,
      totalTopics: this.topics.length,
      totalEmails: this.emailMap.size,
    });
  }

  // ===========================================================================
  // Cursor Operations
  // ===========================================================================

  /**
   * Get the email at the current cursor position.
   * Returns null if the briefing is complete.
   */
  getCurrentEmail(): BriefingEmailRef | null {
    const topic = this.topics[this.cursor.topicIndex];
    if (!topic) {
      return null;
    }

    const email = topic.emails[this.cursor.itemIndex];
    return email ?? null;
  }

  /**
   * Advance the cursor to the next pending email.
   * Skips over emails that are already briefed, actioned, or skipped.
   * Returns the new current email, or null if the briefing is complete.
   */
  advance(): BriefingEmailRef | null {
    // Mark current email as briefed if it's still pending (internal + Redis)
    // DO NOT mark as read in Gmail/Outlook — only the user saying "mark as read" does that
    const current = this.getCurrentEmail();
    if (current) {
      const state = this.emailMap.get(current.emailId);
      if (state && state.status === 'pending') {
        this.markBriefed(current.emailId);
      }
    }

    // Save current position to history
    this.history.push({ ...this.cursor });

    // Find the next pending email
    return this.advanceCursorToNextPending();
  }

  /**
   * Skip the current topic and move to the first pending email in the next topic.
   * All remaining pending emails in the current topic are marked as skipped.
   * Returns the new current email, or null if the briefing is complete.
   */
  skipTopic(): BriefingEmailRef | null {
    // Mark all remaining pending emails in this topic as skipped (internal + Redis)
    // DO NOT mark as read in Gmail/Outlook — skipping is internal only
    const currentTopic = this.topics[this.cursor.topicIndex];
    if (currentTopic) {
      for (const email of currentTopic.emails) {
        const state = this.emailMap.get(email.emailId);
        if (state && state.status === 'pending') {
          this.markSkipped(email.emailId);
        }
      }
    }

    // Save current position to history
    this.history.push({ ...this.cursor });

    // Move to the next topic
    const nextTopicIndex = this.cursor.topicIndex + 1;
    if (nextTopicIndex >= this.topics.length) {
      this.cursor = { topicIndex: this.topics.length, itemIndex: 0 };
      return null;
    }

    this.cursor = { topicIndex: nextTopicIndex, itemIndex: 0 };

    // Find the first pending email in the new topic (or beyond)
    const email = this.getCurrentEmail();
    if (email) {
      const state = this.emailMap.get(email.emailId);
      if (state && state.status === 'pending') {
        return email;
      }
    }

    return this.advanceCursorToNextPending();
  }

  /**
   * Go back to the previous cursor position.
   * Returns the email at the restored position, or null if no history.
   */
  goBack(): BriefingEmailRef | null {
    if (this.history.length === 0) {
      logger.warn('No history to go back to');
      return null;
    }

    const previous = this.history.pop()!;
    this.cursor = previous;

    return this.getCurrentEmail();
  }

  // ===========================================================================
  // Status Updates
  // ===========================================================================

  /**
   * Mark an email as briefed (cursor passed it, user heard the summary).
   */
  markBriefed(emailId: string): void {
    const state = this.emailMap.get(emailId);
    if (!state) {
      logger.warn('markBriefed: unknown emailId', { emailId });
      return;
    }
    state.status = 'briefed';
    state.briefedAt = new Date();

    // Persist to Redis (fire-and-forget)
    if (this.store && this.userId) {
      this.store.markBriefed(this.userId, emailId).catch((err) => {
        logger.warn('Failed to persist briefed status', {
          emailId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Record briefed-without-action as mild negative signal for personalization
    if (this.senderProfileStore && this.userId) {
      this.senderProfileStore
        .recordAction(this.userId, state.ref.from, 'skipped', state.ref.priority)
        .catch(() => {}); // fire-and-forget
    }

    logger.info('Email marked as briefed', { emailId });
  }

  /**
   * Mark an email as actioned (user archived, flagged, etc.).
   * If it's the current email, the caller should advance the cursor.
   */
  markActioned(emailId: string, action: string): void {
    const state = this.emailMap.get(emailId);
    if (!state) {
      logger.warn('markActioned: unknown emailId', { emailId });
      return;
    }
    state.status = 'actioned';
    state.actionTaken = action;
    state.actionedAt = new Date();

    // Persist to Redis (fire-and-forget)
    if (this.store && this.userId) {
      this.store.markActioned(this.userId, emailId, action).catch((err) => {
        logger.warn('Failed to persist actioned status', {
          emailId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Record sender engagement for personalization
    if (this.senderProfileStore && this.userId) {
      const profileAction = mapToolToProfileAction(action);
      this.senderProfileStore
        .recordAction(this.userId, state.ref.from, profileAction, state.ref.priority)
        .catch(() => {}); // fire-and-forget
    }

    logger.info('Email marked as actioned', { emailId, action });
  }

  /**
   * Mark an email as skipped (user explicitly skipped it).
   */
  markSkipped(emailId: string): void {
    const state = this.emailMap.get(emailId);
    if (!state) {
      logger.warn('markSkipped: unknown emailId', { emailId });
      return;
    }
    state.status = 'skipped';

    // Persist to Redis (fire-and-forget)
    if (this.store && this.userId) {
      this.store.markSkipped(this.userId, emailId).catch((err) => {
        logger.warn('Failed to persist skipped status', {
          emailId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Record skip as implicit negative signal for personalization
    if (this.senderProfileStore && this.userId) {
      this.senderProfileStore
        .recordAction(this.userId, state.ref.from, 'skipped', state.ref.priority)
        .catch(() => {}); // fire-and-forget
    }

    logger.info('Email marked as skipped', { emailId });
  }

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get a full progress snapshot.
   */
  getProgress(): BriefingProgress {
    let briefed = 0;
    let actioned = 0;
    let skipped = 0;

    for (const state of this.emailMap.values()) {
      if (state.status === 'briefed') {
        briefed++;
      } else if (state.status === 'actioned') {
        actioned++;
      } else if (state.status === 'skipped') {
        skipped++;
      }
    }

    const total = this.emailMap.size;
    const remaining = total - briefed - actioned - skipped;
    const currentEmail = this.getCurrentEmail();
    const currentTopicLabel = this.topics[this.cursor.topicIndex]?.label ?? 'Complete';

    return {
      currentTopicIndex: this.cursor.topicIndex,
      currentItemIndex: this.cursor.itemIndex,
      currentEmail,
      currentTopicLabel,
      totalTopics: this.topics.length,
      totalEmails: total,
      emailsBriefed: briefed,
      emailsActioned: actioned,
      emailsSkipped: skipped,
      emailsRemaining: remaining,
    };
  }

  /**
   * Get all pending (active) emails in the current topic.
   */
  getActiveEmailsInCurrentTopic(): BriefingEmailRef[] {
    const topic = this.topics[this.cursor.topicIndex];
    if (!topic) {
      return [];
    }

    return topic.emails.filter((e) => {
      const state = this.emailMap.get(e.emailId);
      return state && state.status === 'pending';
    });
  }

  /**
   * Check if the briefing is complete (no more pending emails).
   */
  isComplete(): boolean {
    for (const state of this.emailMap.values()) {
      if (state.status === 'pending') {
        return false;
      }
    }
    return true;
  }

  /**
   * Get all email IDs that have been briefed or actioned (for persistence).
   */
  getHandledEmailIds(): Array<{ emailId: string; status: EmailStatus; action?: string }> {
    const handled: Array<{ emailId: string; status: EmailStatus; action?: string }> = [];
    for (const [emailId, state] of this.emailMap) {
      if (state.status !== 'pending') {
        const entry: { emailId: string; status: EmailStatus; action?: string } = {
          emailId,
          status: state.status,
        };
        if (state.actionTaken) {
          entry.action = state.actionTaken;
        }
        handled.push(entry);
      }
    }
    return handled;
  }

  /**
   * Flush all handled emails to Redis in a single batch.
   * Called at end-of-session to ensure nothing is lost.
   * Individual markBriefed/markActioned/markSkipped calls already persist
   * incrementally, but this is a safety net for any that were missed.
   */
  async flushToStore(): Promise<void> {
    if (!this.store || !this.userId) {
      return;
    }

    const handled = this.getHandledEmailIds();
    if (handled.length === 0) {
      return;
    }

    const records = handled.map((h) => ({
      emailId: h.emailId,
      record: {
        status: h.status as 'briefed' | 'actioned' | 'skipped',
        ...(h.action ? { action: h.action } : {}),
        timestamp: Date.now(),
      },
    }));

    await this.store.markBatch(this.userId, records);

    logger.info('Flushed briefing state to store', {
      userId: this.userId,
      totalFlushed: records.length,
      briefed: handled.filter((h) => h.status === 'briefed').length,
      actioned: handled.filter((h) => h.status === 'actioned').length,
      skipped: handled.filter((h) => h.status === 'skipped').length,
    });
  }

  // ===========================================================================
  // Context Injection for GPT-4o
  // ===========================================================================

  /**
   * Build a dynamic cursor context string to inject before each LLM call.
   * This tells GPT-4o exactly which email to present.
   */
  buildCursorContext(): string {
    const progress = this.getProgress();
    const currentEmail = progress.currentEmail;

    if (!currentEmail) {
      return [
        'CURRENT BRIEFING POSITION:',
        'Briefing complete. All emails have been covered.',
        `Summary: ${progress.emailsBriefed} briefed, ${progress.emailsActioned} actioned, ${progress.emailsSkipped} skipped.`,
        '',
        'NEXT: Summarize the briefing session and ask if the user needs anything else.',
      ].join('\n');
    }

    const topicEmailCount = this.topics[progress.currentTopicIndex]?.emails.length ?? 0;
    const activeInTopic = this.getActiveEmailsInCurrentTopic().length;
    const flagLabel = currentEmail.isFlagged ? ' [FLAGGED]' : '';

    const priorityLabel = currentEmail.priority ? ` [${currentEmail.priority.toUpperCase()}]` : '';
    const summaryLine = currentEmail.summary ? `Summary: ${currentEmail.summary}` : '';

    return [
      'CURRENT BRIEFING POSITION:',
      `Topic ${progress.currentTopicIndex + 1} of ${progress.totalTopics}: "${progress.currentTopicLabel}"`,
      `Email ${progress.currentItemIndex + 1} of ${topicEmailCount} in this topic (${activeInTopic} remaining)`,
      `Current email: "${currentEmail.subject}" from ${currentEmail.from}${flagLabel}${priorityLabel} (email_id: ${currentEmail.emailId})`,
      ...(summaryLine ? [summaryLine] : []),
      `Progress: ${progress.emailsBriefed + progress.emailsActioned} of ${progress.totalEmails} handled, ${progress.emailsRemaining} remaining`,
      '',
      summaryLine
        ? 'NEXT: Read the summary to the user naturally (do NOT read verbatim). Then ask what action to take.'
        : 'NEXT: Present THIS email to the user. Summarize its subject and sender, then ask what action to take.',
    ].join('\n');
  }

  /**
   * Build a compact email reference block containing only active (pending) emails.
   * Replaces the static EMAIL REFERENCE block that was baked into the system prompt.
   */
  buildCompactEmailReference(): string {
    const currentTopicIdx = this.cursor.topicIndex;
    const lines: string[] = ['REMAINING EMAILS (active, not yet briefed):'];
    let hasEmails = false;

    for (let t = 0; t < this.topics.length; t++) {
      const topic = this.topics[t]!;
      const activeEmails = topic.emails.filter((e) => {
        const state = this.emailMap.get(e.emailId);
        return state && state.status === 'pending';
      });

      if (activeEmails.length === 0) {
        continue;
      }

      hasEmails = true;

      if (t === currentTopicIdx) {
        // Current topic: show full detail
        lines.push(`\nCURRENT TOPIC: "${topic.label}" (${activeEmails.length} emails)`);
        for (const email of activeEmails) {
          const flag = email.isFlagged ? ' [FLAGGED]' : '';
          const prio = email.priority ? ` [${email.priority.toUpperCase()}]` : '';
          const summary = email.summary ? ` | "${email.summary}"` : '';
          lines.push(
            `  - email_id: "${email.emailId}" | From: ${email.from} | Subject: ${email.subject}${flag}${prio}${summary}`
          );
        }
      } else {
        // Other topics: one-line summary
        const highCount = activeEmails.filter((e) => e.priority === 'high').length;
        const highLabel = highCount > 0 ? `, ${highCount} high-priority` : '';
        lines.push(`\n  - "${topic.label}" (${activeEmails.length} emails${highLabel})`);
      }
    }

    if (!hasEmails) {
      lines.push('\n(All emails have been briefed or actioned)');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  /**
   * Get the current cursor position (for testing / debugging).
   */
  getCursor(): { topicIndex: number; itemIndex: number } {
    return { ...this.cursor };
  }

  /**
   * Advance the cursor to the next pending email, starting from the
   * position AFTER the current cursor. Skips actioned/briefed/skipped emails.
   */
  private advanceCursorToNextPending(): BriefingEmailRef | null {
    let { topicIndex, itemIndex } = this.cursor;

    // Move to next item first
    itemIndex++;

    while (topicIndex < this.topics.length) {
      const topic = this.topics[topicIndex]!;

      while (itemIndex < topic.emails.length) {
        const email = topic.emails[itemIndex]!;
        const state = this.emailMap.get(email.emailId);

        if (state && state.status === 'pending') {
          this.cursor = { topicIndex, itemIndex };
          return email;
        }

        itemIndex++;
      }

      // Move to next topic
      topicIndex++;
      itemIndex = 0;
    }

    // No more pending emails — briefing is complete
    this.cursor = { topicIndex: this.topics.length, itemIndex: 0 };
    logger.info('Briefing complete — no more pending emails');
    return null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Map a tool action name to a SenderProfileStore action type.
 */
function mapToolToProfileAction(toolAction: string): ProfileAction {
  const map: Record<string, ProfileAction> = {
    archive_email: 'archived',
    mark_read: 'markRead',
    flag_followup: 'flagged',
    flagged: 'flagged',
    create_draft: 'replied',
    mute_sender: 'archived',
  };
  return map[toolAction] ?? 'skipped';
}
