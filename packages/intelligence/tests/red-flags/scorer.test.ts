import { RedFlagScorer } from '../../src/red-flags/scorer';
import type {
  RedFlagSignals,
  KeywordMatchResult,
  VipDetectionResult,
  ThreadVelocityResult,
  CalendarProximityResult,
} from '../../src';
import { Severity, RedFlagCategory, PatternType } from '../../src';

/**
 * Helper to create keyword match result
 */
function createKeywordResult(overrides: Partial<KeywordMatchResult> = {}): KeywordMatchResult {
  const defaults: KeywordMatchResult = {
    hasMatches: true,
    aggregateWeight: 0.8,
    totalMatches: 1,
    matches: [
      {
        pattern: {
          id: 'urgent-keyword',
          type: PatternType.KEYWORD,
          pattern: 'urgent',
          severity: Severity.HIGH,
          category: RedFlagCategory.URGENCY,
          weight: 0.8,
          contextFields: ['subject', 'body'],
          description: 'Urgent keyword detected',
        },
        field: 'subject',
        position: 0,
        matchedText: 'urgent',
      },
    ],
  };

  return { ...defaults, ...overrides };
}

/**
 * Helper to create VIP detection result
 */
function createVipResult(overrides: Partial<VipDetectionResult> = {}): VipDetectionResult {
  const defaults: VipDetectionResult = {
    isVip: true,
    score: 0.8,
    reasons: [
      {
        type: 'explicit_vip',
        description: 'Sender is in VIP list',
        weight: 0.8,
      },
    ],
  };

  return { ...defaults, ...overrides };
}

/**
 * Helper to create thread velocity result
 */
function createVelocityResult(overrides: Partial<ThreadVelocityResult> = {}): ThreadVelocityResult {
  const defaults: ThreadVelocityResult = {
    isHighVelocity: true,
    score: 0.9,
    replyFrequency: 5,
    avgTimeBetweenReplies: 10,
    hasEscalationLanguage: true,
    escalationPhrases: ['escalate'],
    reasons: [
      {
        type: 'high_velocity',
        description: '5 replies in 2 hours',
        weight: 0.7,
      },
      {
        type: 'escalation_language',
        description: 'Escalation language detected',
        weight: 0.8,
      },
    ],
    messageCount: 5,
    threadTimespanHours: 2,
  };

  return { ...defaults, ...overrides };
}

/**
 * Helper to create calendar proximity result
 */
function createCalendarResult(
  overrides: Partial<CalendarProximityResult> = {}
): CalendarProximityResult {
  const defaults: CalendarProximityResult = {
    hasProximity: true,
    score: 0.7,
    relevantEvents: [],
    reasons: [
      {
        type: 'time_proximity',
        description: 'Event in 2 hours',
        weight: 0.6,
        eventId: 'event-1',
      },
    ],
  };

  return { ...defaults, ...overrides };
}

describe('RedFlagScorer', () => {
  describe('Constructor and Configuration', () => {
    it('should create scorer with default options', () => {
      const scorer = new RedFlagScorer();
      const options = scorer.getOptions();

      expect(options.keywordWeight).toBe(0.8);
      expect(options.vipWeight).toBe(0.7);
      expect(options.velocityWeight).toBe(0.9);
      expect(options.calendarWeight).toBe(0.6);
      expect(options.flagThreshold).toBe(0.3);
      expect(options.criticalThreshold).toBe(0.9);
      expect(options.highThreshold).toBe(0.7);
      expect(options.mediumThreshold).toBe(0.5);
      expect(options.lowThreshold).toBe(0.3);
    });

    it('should create scorer with custom options', () => {
      const scorer = new RedFlagScorer({
        keywordWeight: 0.9,
        vipWeight: 0.5,
        flagThreshold: 0.4,
      });

      const options = scorer.getOptions();
      expect(options.keywordWeight).toBe(0.9);
      expect(options.vipWeight).toBe(0.5);
      expect(options.flagThreshold).toBe(0.4);
      expect(options.velocityWeight).toBe(0.9); // Default
    });

    it('should update options dynamically', () => {
      const scorer = new RedFlagScorer();

      scorer.updateOptions({ keywordWeight: 1.0 });

      const options = scorer.getOptions();
      expect(options.keywordWeight).toBe(1.0);
      expect(options.vipWeight).toBe(0.7); // Unchanged
    });
  });

  describe('Single Signal Scoring', () => {
    it('should score with keyword signal only', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({ aggregateWeight: 0.8 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBeCloseTo(0.8, 1);
      expect(result.isFlagged).toBe(true);
      expect(result.signalBreakdown).toHaveLength(4);
      expect(result.signalBreakdown[0]?.signal).toBe('keyword');
      expect(result.signalBreakdown[0]?.isPresent).toBe(true);
    });

    it('should score with VIP signal only', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        vipDetection: createVipResult({ score: 0.6 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBeCloseTo(0.6, 1);
      expect(result.isFlagged).toBe(true);
      expect(result.signalBreakdown[1]?.signal).toBe('vip');
      expect(result.signalBreakdown[1]?.isPresent).toBe(true);
    });

    it('should score with velocity signal only', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        threadVelocity: createVelocityResult({ score: 0.9 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBeCloseTo(0.9, 1);
      expect(result.isFlagged).toBe(true);
      expect(result.signalBreakdown[2]?.signal).toBe('velocity');
      expect(result.signalBreakdown[2]?.isPresent).toBe(true);
    });

    it('should score with calendar signal only', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        calendarProximity: createCalendarResult({ score: 0.7 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBeCloseTo(0.7, 1);
      expect(result.isFlagged).toBe(true);
      expect(result.signalBreakdown[3]?.signal).toBe('calendar');
      expect(result.signalBreakdown[3]?.isPresent).toBe(true);
    });
  });

  describe('Multi-Signal Combination', () => {
    it('should combine keyword and VIP signals', () => {
      const scorer = new RedFlagScorer({
        keywordWeight: 0.8,
        vipWeight: 0.7,
      });

      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({ aggregateWeight: 0.8 }),
        vipDetection: createVipResult({ score: 0.6 }),
      };

      const result = scorer.scoreEmail(signals);

      // Weighted average: (0.8 * 0.8 + 0.6 * 0.7) / (0.8 + 0.7) = 1.06 / 1.5 = 0.707
      expect(result.score).toBeCloseTo(0.71, 1);
      expect(result.isFlagged).toBe(true);

      const presentSignals = result.signalBreakdown.filter((s) => s.isPresent);
      expect(presentSignals).toHaveLength(2);
    });

    it('should combine all four signals', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({ aggregateWeight: 0.8 }),
        vipDetection: createVipResult({ score: 0.7 }),
        threadVelocity: createVelocityResult({ score: 0.9 }),
        calendarProximity: createCalendarResult({ score: 0.6 }),
      };

      const result = scorer.scoreEmail(signals);

      // All signals present should result in high composite score
      expect(result.score).toBeGreaterThan(0.7);
      expect(result.isFlagged).toBe(true);

      const presentSignals = result.signalBreakdown.filter((s) => s.isPresent);
      expect(presentSignals).toHaveLength(4);
    });

    it('should handle varying signal weights', () => {
      const scorer = new RedFlagScorer({
        keywordWeight: 1.0,
        vipWeight: 0.5,
        velocityWeight: 1.0,
        calendarWeight: 0.3,
      });

      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({ aggregateWeight: 0.8 }),
        vipDetection: createVipResult({ score: 0.8 }),
        threadVelocity: createVelocityResult({ score: 0.8 }),
        calendarProximity: createCalendarResult({ score: 0.8 }),
      };

      const result = scorer.scoreEmail(signals);

      // Higher weights for keyword and velocity should dominate
      expect(result.score).toBeGreaterThan(0.7);

      const keywordContribution = result.signalBreakdown.find((s) => s.signal === 'keyword');
      const vipContribution = result.signalBreakdown.find((s) => s.signal === 'vip');

      expect(keywordContribution?.contribution).toBeGreaterThan(vipContribution?.contribution ?? 0);
    });
  });

  describe('Severity Calculation', () => {
    it('should calculate CRITICAL severity for score >= 0.9', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        threadVelocity: createVelocityResult({ score: 1.0 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBeGreaterThanOrEqual(0.9);
      expect(result.severity).toBe('critical');
    });

    it('should calculate HIGH severity for score >= 0.7', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({ aggregateWeight: 0.8 }),
        vipDetection: createVipResult({ score: 0.7 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBeGreaterThanOrEqual(0.7);
      expect(result.score).toBeLessThan(0.9);
      expect(result.severity).toBe('high');
    });

    it('should calculate MEDIUM severity for score >= 0.5', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        vipDetection: createVipResult({ score: 0.6 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBeGreaterThanOrEqual(0.5);
      expect(result.score).toBeLessThan(0.7);
      expect(result.severity).toBe('medium');
    });

    it('should calculate LOW severity for score >= 0.3', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        calendarProximity: createCalendarResult({ score: 0.4 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBeGreaterThanOrEqual(0.3);
      expect(result.score).toBeLessThan(0.5);
      expect(result.severity).toBe('low');
    });

    it('should return null severity for score < 0.3', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        calendarProximity: createCalendarResult({ score: 0.2 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBeLessThan(0.3);
      expect(result.severity).toBeNull();
      expect(result.isFlagged).toBe(false);
    });

    it('should use custom severity thresholds', () => {
      const scorer = new RedFlagScorer({
        criticalThreshold: 0.95,
        highThreshold: 0.8,
        mediumThreshold: 0.6,
        lowThreshold: 0.4,
      });

      expect(scorer.getSeverity(0.96)).toBe('critical');
      expect(scorer.getSeverity(0.85)).toBe('high');
      expect(scorer.getSeverity(0.65)).toBe('medium');
      expect(scorer.getSeverity(0.45)).toBe('low');
      expect(scorer.getSeverity(0.35)).toBeNull();
    });
  });

  describe('Signal Breakdown', () => {
    it('should provide detailed signal breakdown', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({ aggregateWeight: 0.8 }),
        vipDetection: createVipResult({ score: 0.7 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.signalBreakdown).toHaveLength(4);

      const keywordSignal = result.signalBreakdown.find((s) => s.signal === 'keyword');
      expect(keywordSignal).toBeDefined();
      expect(keywordSignal?.rawScore).toBe(0.8);
      expect(keywordSignal?.weight).toBe(0.8);
      expect(keywordSignal?.contribution).toBeCloseTo(0.64, 2);
      expect(keywordSignal?.isPresent).toBe(true);

      const vipSignal = result.signalBreakdown.find((s) => s.signal === 'vip');
      expect(vipSignal).toBeDefined();
      expect(vipSignal?.rawScore).toBe(0.7);
      expect(vipSignal?.weight).toBe(0.7);
      expect(vipSignal?.contribution).toBeCloseTo(0.49, 2);
      expect(vipSignal?.isPresent).toBe(true);
    });

    it('should mark absent signals in breakdown', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({ aggregateWeight: 0.8 }),
      };

      const result = scorer.scoreEmail(signals);

      const vipSignal = result.signalBreakdown.find((s) => s.signal === 'vip');
      expect(vipSignal?.isPresent).toBe(false);
      expect(vipSignal?.rawScore).toBe(0);
      expect(vipSignal?.contribution).toBe(0);

      const velocitySignal = result.signalBreakdown.find((s) => s.signal === 'velocity');
      expect(velocitySignal?.isPresent).toBe(false);
    });
  });

  describe('Reasons Aggregation', () => {
    it('should aggregate reasons from all signals', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({
          matches: [
            {
              pattern: {
                id: 'urgent',
                name: 'Urgent',
                type: PatternType.KEYWORD,
                pattern: 'urgent',
                severity: Severity.HIGH,
                category: RedFlagCategory.URGENCY,
                weight: 0.8,
                contextFields: ['subject'],
                description: 'Urgent keyword',
              },
              field: 'subject',
              position: 0,
              matchedText: 'urgent',
            },
          ],
        }),
        vipDetection: createVipResult({
          reasons: [
            {
              type: 'explicit_vip',
              description: 'Sender is VIP',
              weight: 0.8,
            },
          ],
        }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.reasons.length).toBeGreaterThanOrEqual(2);

      const keywordReason = result.reasons.find((r) => r.signal === 'keyword');
      expect(keywordReason).toBeDefined();
      expect(keywordReason?.type).toBe('keyword_match');

      const vipReason = result.reasons.find((r) => r.signal === 'vip');
      expect(vipReason).toBeDefined();
      expect(vipReason?.type).toBe('explicit_vip');
    });

    it('should handle signals with multiple reasons', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        threadVelocity: createVelocityResult({
          reasons: [
            {
              type: 'high_velocity',
              description: '5 replies in 2 hours',
              weight: 0.7,
            },
            {
              type: 'escalation_language',
              description: 'Escalation detected',
              weight: 0.8,
            },
          ],
        }),
      };

      const result = scorer.scoreEmail(signals);

      const velocityReasons = result.reasons.filter((r) => r.signal === 'velocity');
      expect(velocityReasons).toHaveLength(2);
    });

    it('should handle empty reasons from signals', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({ matches: [] }),
      };

      const result = scorer.scoreEmail(signals);

      const keywordReasons = result.reasons.filter((r) => r.signal === 'keyword');
      expect(keywordReasons).toHaveLength(0);
    });
  });

  describe('Batch Scoring', () => {
    it('should score multiple emails', () => {
      const scorer = new RedFlagScorer();
      const emailSignals = new Map<string, RedFlagSignals>([
        [
          'email-1',
          {
            keywordMatch: createKeywordResult({ aggregateWeight: 0.8 }),
          },
        ],
        [
          'email-2',
          {
            vipDetection: createVipResult({ score: 0.7 }),
          },
        ],
        [
          'email-3',
          {
            threadVelocity: createVelocityResult({ score: 0.9 }),
          },
        ],
      ]);

      const results = scorer.scoreEmails(emailSignals);

      expect(results.size).toBe(3);
      expect(results.get('email-1')).toBeDefined();
      expect(results.get('email-2')).toBeDefined();
      expect(results.get('email-3')).toBeDefined();
    });

    it('should handle empty batch', () => {
      const scorer = new RedFlagScorer();
      const emailSignals = new Map<string, RedFlagSignals>();

      const results = scorer.scoreEmails(emailSignals);

      expect(results.size).toBe(0);
    });
  });

  describe('Utility Methods', () => {
    it('should check if score should be flagged', () => {
      const scorer = new RedFlagScorer({ flagThreshold: 0.5 });

      expect(scorer.shouldFlag(0.6)).toBe(true);
      expect(scorer.shouldFlag(0.5)).toBe(true);
      expect(scorer.shouldFlag(0.4)).toBe(false);
    });

    it('should get severity for arbitrary score', () => {
      const scorer = new RedFlagScorer();

      expect(scorer.getSeverity(0.95)).toBe('critical');
      expect(scorer.getSeverity(0.75)).toBe('high');
      expect(scorer.getSeverity(0.55)).toBe('medium');
      expect(scorer.getSeverity(0.35)).toBe('low');
      expect(scorer.getSeverity(0.25)).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle no signals provided', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {};

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBe(0);
      expect(result.isFlagged).toBe(false);
      expect(result.severity).toBeNull();
      expect(result.signalBreakdown).toHaveLength(4);
      expect(result.reasons).toHaveLength(0);
    });

    it('should handle signals with zero scores', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({ aggregateWeight: 0, hasMatches: false, matches: [] }),
        vipDetection: createVipResult({ score: 0, isVip: false, reasons: [] }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBe(0);
      expect(result.isFlagged).toBe(false);
    });

    it('should cap composite score at 1.0', () => {
      const scorer = new RedFlagScorer({
        keywordWeight: 1.0,
        vipWeight: 1.0,
        velocityWeight: 1.0,
        calendarWeight: 1.0,
      });

      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({ aggregateWeight: 1.0 }),
        vipDetection: createVipResult({ score: 1.0 }),
        threadVelocity: createVelocityResult({ score: 1.0 }),
        calendarProximity: createCalendarResult({ score: 1.0 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBeLessThanOrEqual(1.0);
      expect(result.score).toBe(1.0);
    });

    it('should handle very low scores', () => {
      const scorer = new RedFlagScorer();
      const signals: RedFlagSignals = {
        calendarProximity: createCalendarResult({ score: 0.05 }),
      };

      const result = scorer.scoreEmail(signals);

      expect(result.score).toBeLessThan(0.3);
      expect(result.isFlagged).toBe(false);
      expect(result.severity).toBeNull();
    });

    it('should use weighted average only for present signals', () => {
      const scorer = new RedFlagScorer({
        keywordWeight: 0.8,
        vipWeight: 0.2,
      });

      // Only keyword signal present with score 0.5
      const signals: RedFlagSignals = {
        keywordMatch: createKeywordResult({ aggregateWeight: 0.5 }),
      };

      const result = scorer.scoreEmail(signals);

      // Score should be 0.5, not penalized by absent VIP signal
      expect(result.score).toBeCloseTo(0.5, 1);
    });
  });
});
