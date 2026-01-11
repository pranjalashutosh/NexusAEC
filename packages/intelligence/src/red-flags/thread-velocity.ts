import type { StandardEmail, StandardThread } from '@nexus-aec/shared-types';

/**
 * Configuration options for thread velocity detection
 */
export interface ThreadVelocityOptions {
  /**
   * Time window for high velocity (in hours)
   * Default: 2 hours
   */
  highVelocityWindowHours?: number;

  /**
   * Minimum replies in window to be considered high velocity
   * Default: 4
   */
  highVelocityThreshold?: number;

  /**
   * Weight for high velocity detection (0.0-1.0)
   * Default: 0.7
   */
  highVelocityWeight?: number;

  /**
   * Time window for medium velocity (in hours)
   * Default: 6 hours
   */
  mediumVelocityWindowHours?: number;

  /**
   * Minimum replies in window to be considered medium velocity
   * Default: 3
   */
  mediumVelocityThreshold?: number;

  /**
   * Weight for medium velocity detection (0.0-1.0)
   * Default: 0.5
   */
  mediumVelocityWeight?: number;

  /**
   * Weight for escalation language detection (0.0-1.0)
   * Default: 0.8
   */
  escalationLanguageWeight?: number;
}

/**
 * Result of thread velocity analysis
 */
export interface ThreadVelocityResult {
  /**
   * Whether thread is high velocity
   */
  isHighVelocity: boolean;

  /**
   * Velocity score (0.0-1.0)
   */
  score: number;

  /**
   * Reply frequency (replies per hour)
   */
  replyFrequency: number;

  /**
   * Average time between replies (in minutes)
   */
  avgTimeBetweenReplies: number;

  /**
   * Whether escalation language was detected
   */
  hasEscalationLanguage: boolean;

  /**
   * Escalation phrases found
   */
  escalationPhrases: string[];

  /**
   * Reasons for velocity detection
   */
  reasons: VelocityReason[];

  /**
   * Total message count
   */
  messageCount: number;

  /**
   * Thread timespan (in hours)
   */
  threadTimespanHours: number;
}

/**
 * Reason for velocity detection
 */
export interface VelocityReason {
  /**
   * Type of velocity reason
   */
  type: 'high_velocity' | 'medium_velocity' | 'escalation_language' | 'rapid_back_and_forth';

  /**
   * Description of the reason
   */
  description: string;

  /**
   * Weight contribution (0.0-1.0)
   */
  weight: number;
}

/**
 * Escalation language patterns
 */
const ESCALATION_PATTERNS = [
  /\bescalat(e|ed|ing)\b/i,
  /\bneeds?\s+(immediate|urgent)\s+(attention|response)\b/i,
  /\bloop(ing)?\s+in\s+(management|leadership|exec)\b/i,
  /\bcc['"]?ing\s+(boss|manager|director|vp|ceo|cto)\b/i,
  /\bradioactive\b/i,
  /\bfire\s+drill\b/i,
  /\ball\s+hands\s+on\s+deck\b/i,
  /\bcode\s+red\b/i,
  /\bdefcon\s+\d\b/i,
  /\bwar\s+room\b/i,
  /\bemergency\s+(meeting|call)\b/i,
  /\btaking\s+this\s+offline\b/i,
  /\bneed\s+to\s+discuss\s+(urgently|immediately)\b/i,
  /\bget\s+on\s+a\s+call\s+(now|asap)\b/i,
  /\bthis\s+is\s+(critical|urgent|important)\b/i,
  /\bnot\s+(acceptable|happy|satisfied)\b/i,
  /\b(disappointed|frustrated|concerned)\s+(with|about|by)\b/i,
  /\bstop\s+everything\b/i,
  /\bdrop\s+everything\b/i,
  /\bpriority\s+(zero|one|1|0)\b/i,
];

/**
 * Calculate time difference in hours
 */
function hoursBetween(date1: Date, date2: Date): number {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  return diffMs / (1000 * 60 * 60);
}

/**
 * Calculate time difference in minutes
 */
function minutesBetween(date1: Date, date2: Date): number {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  return diffMs / (1000 * 60);
}

/**
 * Detect escalation language in email
 */
function detectEscalationLanguage(email: StandardEmail): string[] {
  const matches: string[] = [];
  const text = `${email.subject} ${email.body ?? email.snippet ?? ''}`;

  for (const pattern of ESCALATION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      matches.push(match[0]);
    }
  }

  return matches;
}

/**
 * Calculate reply frequency for messages within a time window
 */
function calculateReplyFrequency(
  messages: StandardEmail[],
  windowHours: number,
  now: Date
): number {
  const cutoffTime = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const recentMessages = messages.filter((msg) => msg.receivedAt >= cutoffTime);
  return recentMessages.length;
}

/**
 * ThreadVelocityDetector class for analyzing thread velocity and escalation
 *
 * Provides:
 * - Reply frequency calculation
 * - High-velocity thread detection
 * - Escalation language detection
 * - Time-based thread analysis
 *
 * @example
 * ```typescript
 * const detector = new ThreadVelocityDetector();
 *
 * const result = detector.analyzeThread(thread);
 * if (result.isHighVelocity) {
 *   console.log(`High velocity thread: ${result.replyFrequency} replies/hour`);
 *   console.log(`Escalation detected: ${result.hasEscalationLanguage}`);
 * }
 * ```
 */
export class ThreadVelocityDetector {
  private options: Required<ThreadVelocityOptions>;

  constructor(options: ThreadVelocityOptions = {}) {
    this.options = {
      highVelocityWindowHours: options.highVelocityWindowHours ?? 2,
      highVelocityThreshold: options.highVelocityThreshold ?? 4,
      highVelocityWeight: options.highVelocityWeight ?? 0.7,
      mediumVelocityWindowHours: options.mediumVelocityWindowHours ?? 6,
      mediumVelocityThreshold: options.mediumVelocityThreshold ?? 3,
      mediumVelocityWeight: options.mediumVelocityWeight ?? 0.5,
      escalationLanguageWeight: options.escalationLanguageWeight ?? 0.8,
    };
  }

  /**
   * Analyze thread velocity from StandardThread
   */
  analyzeThread(thread: StandardThread): ThreadVelocityResult {
    return this.analyzeEmails(thread.messages);
  }

  /**
   * Analyze thread velocity from array of emails
   */
  analyzeEmails(emails: StandardEmail[]): ThreadVelocityResult {
    const reasons: VelocityReason[] = [];
    let score = 0;

    // Need at least 2 messages for velocity analysis
    if (emails.length < 2) {
      return {
        isHighVelocity: false,
        score: 0,
        replyFrequency: 0,
        avgTimeBetweenReplies: 0,
        hasEscalationLanguage: false,
        escalationPhrases: [],
        reasons: [],
        messageCount: emails.length,
        threadTimespanHours: 0,
      };
    }

    // Sort messages by time
    const sortedEmails = [...emails].sort(
      (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()
    );

    const firstMessage = sortedEmails[0];
    const lastMessage = sortedEmails[sortedEmails.length - 1];

    if (!firstMessage || !lastMessage) {
      return {
        isHighVelocity: false,
        score: 0,
        replyFrequency: 0,
        avgTimeBetweenReplies: 0,
        hasEscalationLanguage: false,
        escalationPhrases: [],
        reasons: [],
        messageCount: emails.length,
        threadTimespanHours: 0,
      };
    }

    // Calculate thread timespan
    const threadTimespanHours = hoursBetween(firstMessage.receivedAt, lastMessage.receivedAt);

    // Calculate average time between replies
    let totalMinutesBetweenReplies = 0;
    for (let i = 1; i < sortedEmails.length; i++) {
      const prev = sortedEmails[i - 1];
      const curr = sortedEmails[i];
      if (prev && curr) {
        totalMinutesBetweenReplies += minutesBetween(prev.receivedAt, curr.receivedAt);
      }
    }
    const avgTimeBetweenReplies = totalMinutesBetweenReplies / (sortedEmails.length - 1);

    // Calculate overall reply frequency (replies per hour)
    const replyFrequency = threadTimespanHours > 0 ? emails.length / threadTimespanHours : 0;

    // Check for high velocity in recent window
    const now = lastMessage.receivedAt;
    const highVelocityCount = calculateReplyFrequency(
      sortedEmails,
      this.options.highVelocityWindowHours,
      now
    );

    if (highVelocityCount >= this.options.highVelocityThreshold) {
      score += this.options.highVelocityWeight;
      reasons.push({
        type: 'high_velocity',
        description: `${highVelocityCount} replies in ${this.options.highVelocityWindowHours} hours`,
        weight: this.options.highVelocityWeight,
      });
    } else {
      // Check for medium velocity
      const mediumVelocityCount = calculateReplyFrequency(
        sortedEmails,
        this.options.mediumVelocityWindowHours,
        now
      );

      if (mediumVelocityCount >= this.options.mediumVelocityThreshold) {
        score += this.options.mediumVelocityWeight;
        reasons.push({
          type: 'medium_velocity',
          description: `${mediumVelocityCount} replies in ${this.options.mediumVelocityWindowHours} hours`,
          weight: this.options.mediumVelocityWeight,
        });
      }
    }

    // Check for rapid back-and-forth (avg reply time < 15 minutes)
    if (avgTimeBetweenReplies < 15 && emails.length >= 3) {
      const rapidWeight = 0.6;
      score += rapidWeight;
      reasons.push({
        type: 'rapid_back_and_forth',
        description: `Rapid back-and-forth: avg ${Math.round(avgTimeBetweenReplies)} min between replies`,
        weight: rapidWeight,
      });
    }

    // Detect escalation language
    const allEscalationPhrases: string[] = [];
    for (const email of sortedEmails) {
      const phrases = detectEscalationLanguage(email);
      allEscalationPhrases.push(...phrases);
    }

    const hasEscalationLanguage = allEscalationPhrases.length > 0;
    if (hasEscalationLanguage) {
      score += this.options.escalationLanguageWeight;
      const uniquePhrases = [...new Set(allEscalationPhrases)];
      reasons.push({
        type: 'escalation_language',
        description: `Escalation language detected: "${uniquePhrases.slice(0, 3).join('", "')}"`,
        weight: this.options.escalationLanguageWeight,
      });
    }

    // Cap score at 1.0
    score = Math.min(score, 1.0);

    return {
      isHighVelocity: score >= 0.6,
      score,
      replyFrequency,
      avgTimeBetweenReplies: Math.round(avgTimeBetweenReplies * 10) / 10,
      hasEscalationLanguage,
      escalationPhrases: [...new Set(allEscalationPhrases)],
      reasons,
      messageCount: emails.length,
      threadTimespanHours: Math.round(threadTimespanHours * 10) / 10,
    };
  }

  /**
   * Batch analyze multiple threads
   */
  analyzeThreads(threads: StandardThread[]): Map<string, ThreadVelocityResult> {
    const results = new Map<string, ThreadVelocityResult>();

    for (const thread of threads) {
      const result = this.analyzeThread(thread);
      results.set(thread.id, result);
    }

    return results;
  }

  /**
   * Get detection options
   */
  getOptions(): Required<ThreadVelocityOptions> {
    return { ...this.options };
  }

  /**
   * Update detection options
   */
  updateOptions(options: Partial<ThreadVelocityOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }
}
