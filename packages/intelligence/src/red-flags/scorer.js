"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedFlagScorer = void 0;
/**
 * Calculate severity based on composite score
 */
function calculateSeverity(score, options) {
    if (score < options.lowThreshold) {
        return null;
    }
    else if (score >= options.criticalThreshold) {
        return 'critical';
    }
    else if (score >= options.highThreshold) {
        return 'high';
    }
    else if (score >= options.mediumThreshold) {
        return 'medium';
    }
    else {
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
var RedFlagScorer = /** @class */ (function () {
    function RedFlagScorer(options) {
        if (options === void 0) { options = {}; }
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        this.options = {
            keywordWeight: (_a = options.keywordWeight) !== null && _a !== void 0 ? _a : 0.8,
            vipWeight: (_b = options.vipWeight) !== null && _b !== void 0 ? _b : 0.7,
            velocityWeight: (_c = options.velocityWeight) !== null && _c !== void 0 ? _c : 0.9,
            calendarWeight: (_d = options.calendarWeight) !== null && _d !== void 0 ? _d : 0.6,
            flagThreshold: (_e = options.flagThreshold) !== null && _e !== void 0 ? _e : 0.3,
            criticalThreshold: (_f = options.criticalThreshold) !== null && _f !== void 0 ? _f : 0.9,
            highThreshold: (_g = options.highThreshold) !== null && _g !== void 0 ? _g : 0.7,
            mediumThreshold: (_h = options.mediumThreshold) !== null && _h !== void 0 ? _h : 0.5,
            lowThreshold: (_j = options.lowThreshold) !== null && _j !== void 0 ? _j : 0.3,
        };
    }
    /**
     * Score email with provided signals
     */
    RedFlagScorer.prototype.scoreEmail = function (signals) {
        var signalBreakdown = [];
        var reasons = [];
        var totalWeightedScore = 0;
        var totalWeight = 0;
        // 1. Keyword matching signal
        if (signals.keywordMatch) {
            // Normalize aggregateWeight to 0-1 range (cap at 1.0)
            var rawScore = Math.min(signals.keywordMatch.aggregateWeight, 1.0);
            var weight = this.options.keywordWeight;
            var contribution = rawScore * weight;
            totalWeightedScore += contribution;
            totalWeight += weight;
            signalBreakdown.push({
                signal: 'keyword',
                rawScore: rawScore,
                weight: weight,
                contribution: contribution,
                isPresent: true,
            });
            // Add keyword reasons
            for (var _i = 0, _a = signals.keywordMatch.matches; _i < _a.length; _i++) {
                var match = _a[_i];
                reasons.push({
                    signal: 'keyword',
                    type: 'keyword_match',
                    description: "Matched pattern: \"".concat(match.pattern.id, "\" in ").concat(match.field),
                    weight: match.pattern.weight,
                });
            }
        }
        else {
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
            var rawScore = signals.vipDetection.score;
            var weight = this.options.vipWeight;
            var contribution = rawScore * weight;
            totalWeightedScore += contribution;
            totalWeight += weight;
            signalBreakdown.push({
                signal: 'vip',
                rawScore: rawScore,
                weight: weight,
                contribution: contribution,
                isPresent: true,
            });
            // Add VIP reasons
            for (var _b = 0, _c = signals.vipDetection.reasons; _b < _c.length; _b++) {
                var reason = _c[_b];
                reasons.push({
                    signal: 'vip',
                    type: reason.type,
                    description: reason.description,
                    weight: reason.weight,
                });
            }
        }
        else {
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
            var rawScore = signals.threadVelocity.score;
            var weight = this.options.velocityWeight;
            var contribution = rawScore * weight;
            totalWeightedScore += contribution;
            totalWeight += weight;
            signalBreakdown.push({
                signal: 'velocity',
                rawScore: rawScore,
                weight: weight,
                contribution: contribution,
                isPresent: true,
            });
            // Add velocity reasons
            for (var _d = 0, _e = signals.threadVelocity.reasons; _d < _e.length; _d++) {
                var reason = _e[_d];
                reasons.push({
                    signal: 'velocity',
                    type: reason.type,
                    description: reason.description,
                    weight: reason.weight,
                });
            }
        }
        else {
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
            var rawScore = signals.calendarProximity.score;
            var weight = this.options.calendarWeight;
            var contribution = rawScore * weight;
            totalWeightedScore += contribution;
            totalWeight += weight;
            signalBreakdown.push({
                signal: 'calendar',
                rawScore: rawScore,
                weight: weight,
                contribution: contribution,
                isPresent: true,
            });
            // Add calendar reasons
            for (var _f = 0, _g = signals.calendarProximity.reasons; _f < _g.length; _f++) {
                var reason = _g[_f];
                reasons.push({
                    signal: 'calendar',
                    type: reason.type,
                    description: reason.description,
                    weight: reason.weight,
                });
            }
        }
        else {
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
        var compositeScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
        // Cap at 1.0
        var finalScore = Math.min(compositeScore, 1.0);
        // Calculate severity
        var severity = calculateSeverity(finalScore, this.options);
        return {
            isFlagged: finalScore >= this.options.flagThreshold,
            score: Math.round(finalScore * 100) / 100,
            severity: severity,
            signalBreakdown: signalBreakdown,
            reasons: reasons,
        };
    };
    /**
     * Batch score multiple emails with their signals
     */
    RedFlagScorer.prototype.scoreEmails = function (emailSignals) {
        var results = new Map();
        for (var _i = 0, _a = emailSignals.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], emailId = _b[0], signals = _b[1];
            var score = this.scoreEmail(signals);
            results.set(emailId, score);
        }
        return results;
    };
    /**
     * Get scoring options
     */
    RedFlagScorer.prototype.getOptions = function () {
        return __assign({}, this.options);
    };
    /**
     * Update scoring options
     */
    RedFlagScorer.prototype.updateOptions = function (options) {
        this.options = __assign(__assign({}, this.options), options);
    };
    /**
     * Get severity for a given score
     */
    RedFlagScorer.prototype.getSeverity = function (score) {
        return calculateSeverity(score, this.options);
    };
    /**
     * Check if score meets flag threshold
     */
    RedFlagScorer.prototype.shouldFlag = function (score) {
        return score >= this.options.flagThreshold;
    };
    return RedFlagScorer;
}());
exports.RedFlagScorer = RedFlagScorer;
