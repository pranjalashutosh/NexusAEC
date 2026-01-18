"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternType = exports.RedFlagCategory = exports.Severity = void 0;
/**
 * Severity level for red flag patterns
 */
var Severity;
(function (Severity) {
    Severity["HIGH"] = "HIGH";
    Severity["MEDIUM"] = "MEDIUM";
    Severity["LOW"] = "LOW";
})(Severity || (exports.Severity = Severity = {}));
/**
 * Category of red flag pattern
 */
var RedFlagCategory;
(function (RedFlagCategory) {
    RedFlagCategory["URGENCY"] = "urgency";
    RedFlagCategory["INCIDENT"] = "incident";
    RedFlagCategory["DEADLINE"] = "deadline";
    RedFlagCategory["ESCALATION"] = "escalation";
    RedFlagCategory["VIP"] = "vip";
    RedFlagCategory["OUTAGE"] = "outage";
    RedFlagCategory["EMERGENCY"] = "emergency";
})(RedFlagCategory || (exports.RedFlagCategory = RedFlagCategory = {}));
/**
 * Pattern type indicator
 */
var PatternType;
(function (PatternType) {
    PatternType["KEYWORD"] = "keyword";
    PatternType["REGEX"] = "regex";
})(PatternType || (exports.PatternType = PatternType = {}));
