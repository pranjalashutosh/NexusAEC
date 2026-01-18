/**
 * Feedback Learner (Tier 3)
 *
 * Processes user feedback to adjust red flag scoring weights over time.
 * Learns from user corrections to improve accuracy.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Feedback type
 */
export type FeedbackType =
  | 'correct' // User agrees with flagging
  | 'false_positive' // Incorrectly flagged as urgent
  | 'false_negative' // Should have been flagged but wasn't
  | 'too_high' // Flagged but severity too high
  | 'too_low'; // Flagged but severity too low

/**
 * User feedback record
 */
export interface FeedbackRecord {
  /**
   * Unique feedback ID
   */
  id: string;

  /**
   * Email ID
   */
  emailId: string;

  /**
   * Feedback type
   */
  type: FeedbackType;

  /**
   * Original score (0.0-1.0)
   */
  originalScore: number;

  /**
   * Signal contributions at time of scoring
   */
  signals: {
    keyword?: number;
    vip?: number;
    velocity?: number;
    calendar?: number;
  };

  /**
   * User's expected score (optional)
   */
  expectedScore?: number;

  /**
   * Feedback timestamp
   */
  timestamp: Date;

  /**
   * Optional note from user
   */
  note?: string;
}

/**
 * Signal weight adjustments
 */
export interface WeightAdjustments {
  /**
   * Keyword signal weight adjustment
   */
  keyword: number;

  /**
   * VIP signal weight adjustment
   */
  vip: number;

  /**
   * Velocity signal weight adjustment
   */
  velocity: number;

  /**
   * Calendar signal weight adjustment
   */
  calendar: number;
}

/**
 * Learning statistics
 */
export interface LearningStats {
  /**
   * Total feedback received
   */
  totalFeedback: number;

  /**
   * Correct predictions
   */
  correctCount: number;

  /**
   * False positives
   */
  falsePositiveCount: number;

  /**
   * False negatives
   */
  falseNegativeCount: number;

  /**
   * Too high severity
   */
  tooHighCount: number;

  /**
   * Too low severity
   */
  tooLowCount: number;

  /**
   * Accuracy (correct / total)
   */
  accuracy: number;

  /**
   * Precision (correct / (correct + false_positive))
   */
  precision: number;

  /**
   * Current weight adjustments
   */
  weightAdjustments: WeightAdjustments;

  /**
   * Last updated
   */
  lastUpdated: Date;
}

/**
 * Feedback learner options
 */
export interface FeedbackLearnerOptions {
  /**
   * Storage directory path
   */
  storagePath: string;

  /**
   * Learning rate (0.0-1.0)
   * Default: 0.1 (conservative learning)
   */
  learningRate?: number;

  /**
   * Minimum feedback count before adjusting weights
   * Default: 10
   */
  minFeedbackCount?: number;

  /**
   * Maximum weight adjustment magnitude
   * Default: 0.3
   */
  maxAdjustment?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Feedback Learner
 *
 * Learns from user feedback to adjust red flag scoring weights over time.
 * Uses a simple gradient descent-like approach to improve accuracy.
 *
 * @example
 * ```typescript
 * import { FeedbackLearner } from '@nexus-aec/intelligence';
 *
 * const learner = new FeedbackLearner({
 *   storagePath: './data/feedback',
 *   learningRate: 0.1,
 *   minFeedbackCount: 10,
 * });
 *
 * await learner.initialize();
 *
 * // Record user feedback
 * await learner.recordFeedback({
 *   emailId: 'email-123',
 *   type: 'false_positive',
 *   originalScore: 0.85,
 *   signals: {
 *     keyword: 0.9,
 *     vip: 0.0,
 *     velocity: 0.8,
 *     calendar: 0.0,
 *   },
 * });
 *
 * // Get recommended weight adjustments
 * const adjustments = await learner.getWeightAdjustments();
 * console.log('Adjust keyword weight by:', adjustments.keyword);
 *
 * // Get learning statistics
 * const stats = await learner.getStats();
 * console.log(`Accuracy: ${(stats.accuracy * 100).toFixed(1)}%`);
 * ```
 */
export class FeedbackLearner {
  private storagePath: string;
  private learningRate: number;
  private minFeedbackCount: number;
  private maxAdjustment: number;
  private debug: boolean;
  private feedbackFile: string;
  private statsFile: string;
  private feedback: FeedbackRecord[];
  private stats: LearningStats;

  constructor(options: FeedbackLearnerOptions) {
    this.storagePath = options.storagePath;
    this.learningRate = options.learningRate ?? 0.1;
    this.minFeedbackCount = options.minFeedbackCount ?? 10;
    this.maxAdjustment = options.maxAdjustment ?? 0.3;
    this.debug = options.debug ?? false;
    this.feedbackFile = path.join(this.storagePath, 'feedback.json');
    this.statsFile = path.join(this.storagePath, 'stats.json');
    this.feedback = [];
    this.stats = this.createEmptyStats();
  }

  /**
   * Initialize the learner
   */
  async initialize(): Promise<void> {
    if (this.debug) {
      console.log('[FeedbackLearner] Initializing...');
    }

    // Ensure storage directory exists
    await fs.mkdir(this.storagePath, { recursive: true });

    // Load existing feedback and stats
    try {
      await this.loadFeedback();
      await this.loadStats();
    } catch (error) {
      if (this.debug) {
        console.log('[FeedbackLearner] No existing data, starting fresh');
      }
      await this.save();
    }

    if (this.debug) {
      console.log(
        `[FeedbackLearner] Initialized with ${this.feedback.length} feedback records`
      );
    }
  }

  /**
   * Record user feedback
   */
  async recordFeedback(
    feedback: Omit<FeedbackRecord, 'id' | 'timestamp'>
  ): Promise<FeedbackRecord> {
    const record: FeedbackRecord = {
      ...feedback,
      id: this.generateId(),
      timestamp: new Date(),
    };

    this.feedback.push(record);

    // Update stats
    this.updateStats(record);

    // Recompute weight adjustments if we have enough data
    if (this.feedback.length >= this.minFeedbackCount) {
      this.computeWeightAdjustments();
    }

    await this.save();

    if (this.debug) {
      console.log(
        `[FeedbackLearner] Recorded ${record.type} feedback for email ${record.emailId}`
      );
    }

    return record;
  }

  /**
   * Get all feedback records
   */
  async getFeedback(options: {
    type?: FeedbackType;
    limit?: number;
    offset?: number;
  } = {}): Promise<FeedbackRecord[]> {
    let filtered = [...this.feedback];

    if (options.type) {
      filtered = filtered.filter((f) => f.type === options.type);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const offset = options.offset ?? 0;
    const limit = options.limit ?? filtered.length;

    return filtered.slice(offset, offset + limit);
  }

  /**
   * Get recommended weight adjustments
   */
  async getWeightAdjustments(): Promise<WeightAdjustments> {
    return { ...this.stats.weightAdjustments };
  }

  /**
   * Get learning statistics
   */
  async getStats(): Promise<LearningStats> {
    return {
      ...this.stats,
      weightAdjustments: { ...this.stats.weightAdjustments },
    };
  }

  /**
   * Clear all feedback and reset learning
   */
  async clear(): Promise<void> {
    this.feedback = [];
    this.stats = this.createEmptyStats();
    await this.save();

    if (this.debug) {
      console.log('[FeedbackLearner] Cleared all feedback');
    }
  }

  /**
   * Update statistics with new feedback
   */
  private updateStats(record: FeedbackRecord): void {
    this.stats.totalFeedback++;

    switch (record.type) {
      case 'correct':
        this.stats.correctCount++;
        break;
      case 'false_positive':
        this.stats.falsePositiveCount++;
        break;
      case 'false_negative':
        this.stats.falseNegativeCount++;
        break;
      case 'too_high':
        this.stats.tooHighCount++;
        break;
      case 'too_low':
        this.stats.tooLowCount++;
        break;
    }

    // Update accuracy and precision
    this.stats.accuracy = this.stats.correctCount / this.stats.totalFeedback;

    const predictedPositive = this.stats.correctCount + this.stats.falsePositiveCount;
    this.stats.precision = predictedPositive > 0 ? this.stats.correctCount / predictedPositive : 0;

    this.stats.lastUpdated = new Date();
  }

  /**
   * Compute weight adjustments based on feedback
   */
  private computeWeightAdjustments(): void {
    // Initialize adjustment accumulators
    const adjustments = {
      keyword: 0,
      vip: 0,
      velocity: 0,
      calendar: 0,
    };

    const counts = {
      keyword: 0,
      vip: 0,
      velocity: 0,
      calendar: 0,
    };

    // Analyze feedback to determine adjustments
    for (const record of this.feedback) {
      const error = this.computeError(record);

      // For each signal that contributed, adjust based on error
      for (const [signal, contribution] of Object.entries(record.signals)) {
        if (contribution !== undefined && contribution > 0) {
          const key = signal as keyof WeightAdjustments;
          // Negative error means we over-predicted, should decrease weight
          // Positive error means we under-predicted, should increase weight
          adjustments[key] += error * contribution * this.learningRate;
          counts[key]++;
        }
      }
    }

    // Average adjustments and clamp to max
    for (const signal of ['keyword', 'vip', 'velocity', 'calendar'] as const) {
      if (counts[signal] > 0) {
        let adj = adjustments[signal] / counts[signal];

        // Clamp to max adjustment
        adj = Math.max(-this.maxAdjustment, Math.min(this.maxAdjustment, adj));

        this.stats.weightAdjustments[signal] = adj;
      }
    }

    if (this.debug) {
      console.log('[FeedbackLearner] Computed weight adjustments:', this.stats.weightAdjustments);
    }
  }

  /**
   * Compute error for a feedback record
   */
  private computeError(record: FeedbackRecord): number {
    switch (record.type) {
      case 'correct':
        return 0; // No error

      case 'false_positive':
        // We predicted too high, error is negative
        return -record.originalScore;

      case 'false_negative':
        // We predicted too low, error is positive (should have been ~1.0)
        return 1.0 - record.originalScore;

      case 'too_high':
        // We predicted somewhat too high
        if (record.expectedScore !== undefined) {
          return record.expectedScore - record.originalScore;
        }
        return -0.2; // Default adjustment

      case 'too_low':
        // We predicted somewhat too low
        if (record.expectedScore !== undefined) {
          return record.expectedScore - record.originalScore;
        }
        return 0.2; // Default adjustment

      default:
        return 0;
    }
  }

  /**
   * Save feedback and stats to disk
   */
  private async save(): Promise<void> {
    await fs.writeFile(this.feedbackFile, JSON.stringify(this.feedback, null, 2));
    await fs.writeFile(this.statsFile, JSON.stringify(this.stats, null, 2));
  }

  /**
   * Load feedback from disk
   */
  private async loadFeedback(): Promise<void> {
    const data = await fs.readFile(this.feedbackFile, 'utf8');
    const parsed = JSON.parse(data);
    this.feedback = parsed.map((f: any) => ({
      ...f,
      timestamp: new Date(f.timestamp),
    }));
  }

  /**
   * Load stats from disk
   */
  private async loadStats(): Promise<void> {
    const data = await fs.readFile(this.statsFile, 'utf8');
    const parsed = JSON.parse(data);
    this.stats = {
      ...parsed,
      lastUpdated: new Date(parsed.lastUpdated),
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `feedback-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Create empty statistics
   */
  private createEmptyStats(): LearningStats {
    return {
      totalFeedback: 0,
      correctCount: 0,
      falsePositiveCount: 0,
      falseNegativeCount: 0,
      tooHighCount: 0,
      tooLowCount: 0,
      accuracy: 0,
      precision: 0,
      weightAdjustments: {
        keyword: 0,
        vip: 0,
        velocity: 0,
        calendar: 0,
      },
      lastUpdated: new Date(),
    };
  }
}
