import type { CalendarProximityResult } from './calendar-proximity';
import type { KeywordMatchResult } from './keyword-matcher';
import type { ThreadVelocityResult } from './thread-velocity';
import type { VipDetectionResult } from './vip-detector';
import type { RedFlagSeverity } from '@nexus-aec/shared-types';

/**
 * Configuration options for Red Flag scoring
 */
export interface RedFlagScorerOptions {
  /**
   * Weight for keyword matches (0.0-1.0)
   * Default: 0.8
   */
  keywordWeight?: number;

  /**
   * Weight for VIP detection (0.0-1.0)
   * Default: 0.7
   */
  vipWeight?: number;

  /**
   * Weight for thread velocity (0.0-1.0)
   * Default: 0.9
   */
  velocityWeight?: number;

  /**
   * Weight for calendar proximity (0.0-1.0)
   * Default: 0.6
   */
  calendarWeight?: number;

  /**
   * Minimum score threshold for flagging (0.0-1.0)
   * Default: 0.3
   */
  flagThreshold?: number;

  /**
   * Score threshold for CRITICAL severity (0.0-1.0)
   * Default: 0.9
   */
  criticalThreshold?: number;

  /**
   * Score threshold for HIGH severity (0.0-1.0)
   * Default: 0.7
   */
  highThreshold?: number;

  /**
   * Score threshold for MEDIUM severity (0.0-1.0)
   * Default: 0.5
   */
  mediumThreshold?: number;

  /**
   * Score threshold for LOW severity (0.0-1.0)
   * Default: 0.3
   */
  lowThreshold?: number;
}

/**
 * Input signals for Red Flag scoring
 */
export interface RedFlagSignals {
  /**
   * Keyword match result (optional)
   */
  keywordMatch?: KeywordMatchResult;

  /**
   * VIP detection result (optional)
   */
  vipDetection?: VipDetectionResult;

  /**
   * Thread velocity result (optional)
   */
  threadVelocity?: ThreadVelocityResult;

  /**
   * Calendar proximity result (optional)
   */
  calendarProximity?: CalendarProximityResult;
}

/**
 * Result of Red Flag scoring
 */
export interface RedFlagScore {
  /**
   * Whether email/thread should be flagged
   */
  isFlagged: boolean;

  /**
   * Composite Red Flag score (0.0-1.0)
   */
  score: number;

  /**
   * Severity level
   */
  severity: RedFlagSeverity | null;

  /**
   * Breakdown of signal contributions
   */
  signalBreakdown: SignalContribution[];

  /**
   * Combined reasons from all signals
   */
  reasons: ScoringReason[];
}

/**
 * Contribution from a specific signal
 */
export interface SignalContribution {
  /**
   * Signal type
   */
  signal: 'keyword' | 'vip' | 'velocity' | 'calendar';

  /**
   * Raw score from this signal (0.0-1.0)
   */
  rawScore: number;

  /**
   * Weight applied to this signal
   */
  weight: number;

  /**
   * Weighted contribution to final score
   */
  contribution: number;

  /**
   * Whether this signal was present
   */
  isPresent: boolean;
}

/**
 * Reason for Red Flag scoring
 */
export interface ScoringReason {
  /**
   * Signal that produced this reason
   */
  signal: 'keyword' | 'vip' | 'velocity' | 'calendar';

  /**
   * Type of reason
   */
  type: string;

  /**
   * Description of the reason
   */
  description: string;

  /**
   * Weight/importance (0.0-1.0)
   */
  weight: number;
}

/**
 * Calculate severity based on composite score
 */
function calculateSeverity(
  score: number,
  options: Required<RedFlagScorerOptions>
): RedFlagSeverity | null {
  if (score < options.lowThreshold) {
    return null;
  } else if (score >= options.criticalThreshold) {
    return 'critical';
  } else if (score >= options.highThreshold) {
    return 'high';
  } else if (score >= options.mediumThreshold) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * RedFlagScorer class for combining multiple signals into composite Red Flag score
 *
 * Provides:
 * - Multi-signal composite scoring
 * - Configurable signal weights
 * - Severity level calculation
 * - Signal breakdown and detailed reasons
 * - Batch scoring support
 *
 * @example
 * ```typescript
 * const scorer = new RedFlagScorer({
 *   keywordWeight: 0.8,
 *   vipWeight: 0.7,
 *   velocityWeight: 0.9,
 * });
 *
 * const score = scorer.scoreEmail({
 *   keywordMatch: keywordResult,
 *   vipDetection: vipResult,
 *   threadVelocity: velocityResult,
 *   calendarProximity: calendarResult,
 * });
 *
 * if (score.isFlagged) {
 *   console.log(`Red Flag: ${score.severity} (score: ${score.score})`);
 *   score.reasons.forEach(reason => {
 *     console.log(`- [${reason.signal}] ${reason.description}`);
 *   });
 * }
 * ```
 */
export class RedFlagScorer {
  private options: Required<RedFlagScorerOptions>;

  constructor(options: RedFlagScorerOptions = {}) {
    this.options = {
      keywordWeight: options.keywordWeight ?? 0.8,
      vipWeight: options.vipWeight ?? 0.7,
      velocityWeight: options.velocityWeight ?? 0.9,
      calendarWeight: options.calendarWeight ?? 0.6,
      flagThreshold: options.flagThreshold ?? 0.3,
      criticalThreshold: options.criticalThreshold ?? 0.9,
      highThreshold: options.highThreshold ?? 0.7,
      mediumThreshold: options.mediumThreshold ?? 0.5,
      lowThreshold: options.lowThreshold ?? 0.3,
    };
  }

  /**
   * Score email with provided signals
   */
  scoreEmail(signals: RedFlagSignals): RedFlagScore {
    const signalBreakdown: SignalContribution[] = [];
    const reasons: ScoringReason[] = [];
    let totalWeightedScore = 0;
    let totalWeight = 0;

    // 1. Keyword matching signal
    if (signals.keywordMatch) {
      // Normalize aggregateWeight to 0-1 range (cap at 1.0)
      const rawScore = Math.min(signals.keywordMatch.aggregateWeight, 1.0);
      const weight = this.options.keywordWeight;
      const contribution = rawScore * weight;

      totalWeightedScore += contribution;
      totalWeight += weight;

      signalBreakdown.push({
        signal: 'keyword',
        rawScore,
        weight,
        contribution,
        isPresent: true,
      });

      // Add keyword reasons
      for (const match of signals.keywordMatch.matches) {
        reasons.push({
          signal: 'keyword',
          type: 'keyword_match',
          description: `Matched pattern: "${match.pattern.id}" in ${match.field}`,
          weight: match.pattern.weight,
        });
      }
    } else {
      signalBreakdown.push({
        signal: 'keyword',
        rawScore: 0,
        weight: this.options.keywordWeight,
        contribution: 0,
        isPresent: false,
      });
    }

    // 2. VIP detection signal
    if (signals.vipDetection) {
      const rawScore = signals.vipDetection.score;
      const weight = this.options.vipWeight;
      const contribution = rawScore * weight;

      totalWeightedScore += contribution;
      totalWeight += weight;

      signalBreakdown.push({
        signal: 'vip',
        rawScore,
        weight,
        contribution,
        isPresent: true,
      });

      // Add VIP reasons
      for (const reason of signals.vipDetection.reasons) {
        reasons.push({
          signal: 'vip',
          type: reason.type,
          description: reason.description,
          weight: reason.weight,
        });
      }
    } else {
      signalBreakdown.push({
        signal: 'vip',
        rawScore: 0,
        weight: this.options.vipWeight,
        contribution: 0,
        isPresent: false,
      });
    }

    // 3. Thread velocity signal
    if (signals.threadVelocity) {
      const rawScore = signals.threadVelocity.score;
      const weight = this.options.velocityWeight;
      const contribution = rawScore * weight;

      totalWeightedScore += contribution;
      totalWeight += weight;

      signalBreakdown.push({
        signal: 'velocity',
        rawScore,
        weight,
        contribution,
        isPresent: true,
      });

      // Add velocity reasons
      for (const reason of signals.threadVelocity.reasons) {
        reasons.push({
          signal: 'velocity',
          type: reason.type,
          description: reason.description,
          weight: reason.weight,
        });
      }
    } else {
      signalBreakdown.push({
        signal: 'velocity',
        rawScore: 0,
        weight: this.options.velocityWeight,
        contribution: 0,
        isPresent: false,
      });
    }

    // 4. Calendar proximity signal
    if (signals.calendarProximity) {
      const rawScore = signals.calendarProximity.score;
      const weight = this.options.calendarWeight;
      const contribution = rawScore * weight;

      totalWeightedScore += contribution;
      totalWeight += weight;

      signalBreakdown.push({
        signal: 'calendar',
        rawScore,
        weight,
        contribution,
        isPresent: true,
      });

      // Add calendar reasons
      for (const reason of signals.calendarProximity.reasons) {
        reasons.push({
          signal: 'calendar',
          type: reason.type,
          description: reason.description,
          weight: reason.weight,
        });
      }
    } else {
      signalBreakdown.push({
        signal: 'calendar',
        rawScore: 0,
        weight: this.options.calendarWeight,
        contribution: 0,
        isPresent: false,
      });
    }

    // Calculate composite score (weighted average)
    // Use only weights from present signals to avoid penalizing missing signals
    const compositeScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

    // Cap at 1.0
    const finalScore = Math.min(compositeScore, 1.0);

    // Calculate severity
    const severity = calculateSeverity(finalScore, this.options);

    return {
      isFlagged: finalScore >= this.options.flagThreshold,
      score: Math.round(finalScore * 100) / 100,
      severity,
      signalBreakdown,
      reasons,
    };
  }

  /**
   * Batch score multiple emails with their signals
   */
  scoreEmails(emailSignals: Map<string, RedFlagSignals>): Map<string, RedFlagScore> {
    const results = new Map<string, RedFlagScore>();

    for (const [emailId, signals] of emailSignals.entries()) {
      const score = this.scoreEmail(signals);
      results.set(emailId, score);
    }

    return results;
  }

  /**
   * Get scoring options
   */
  getOptions(): Required<RedFlagScorerOptions> {
    return { ...this.options };
  }

  /**
   * Update scoring options
   */
  updateOptions(options: Partial<RedFlagScorerOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  /**
   * Get severity for a given score
   */
  getSeverity(score: number): RedFlagSeverity | null {
    return calculateSeverity(score, this.options);
  }

  /**
   * Check if score meets flag threshold
   */
  shouldFlag(score: number): boolean {
    return score >= this.options.flagThreshold;
  }
}
