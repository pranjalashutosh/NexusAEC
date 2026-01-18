"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RED_FLAG_PATTERNS = void 0;
exports.getPatternsByCategory = getPatternsByCategory;
exports.getPatternsBySeverity = getPatternsBySeverity;
exports.getPatternsForField = getPatternsForField;
exports.getPatternById = getPatternById;
var types_1 = require("../types");
/**
 * Default red flag patterns for detecting urgent, important, or critical emails
 *
 * These patterns are shipped with the system and used by the keyword-matcher
 * to identify emails requiring immediate attention.
 *
 * Pattern weights are used in composite scoring:
 * - HIGH severity: 0.8-1.0
 * - MEDIUM severity: 0.5-0.7
 * - LOW severity: 0.2-0.4
 */
exports.DEFAULT_RED_FLAG_PATTERNS = [
    // ========================================
    // URGENCY - Time-sensitive keywords
    // ========================================
    {
        id: 'urgency-urgent-keyword',
        pattern: 'urgent',
        type: types_1.PatternType.KEYWORD,
        severity: types_1.Severity.HIGH,
        weight: 0.9,
        category: types_1.RedFlagCategory.URGENCY,
        contextFields: ['subject', 'body'],
        description: 'Detects "urgent" keyword indicating time-sensitive matter',
        caseSensitive: false,
    },
    {
        id: 'urgency-asap-keyword',
        pattern: 'asap',
        type: types_1.PatternType.KEYWORD,
        severity: types_1.Severity.HIGH,
        weight: 0.85,
        category: types_1.RedFlagCategory.URGENCY,
        contextFields: ['subject', 'body'],
        description: 'Detects "ASAP" abbreviation for urgent requests',
        caseSensitive: false,
    },
    {
        id: 'urgency-immediate-keyword',
        pattern: 'immediate',
        type: types_1.PatternType.KEYWORD,
        severity: types_1.Severity.HIGH,
        weight: 0.9,
        category: types_1.RedFlagCategory.URGENCY,
        contextFields: ['subject', 'body'],
        description: 'Detects "immediate" indicating need for instant action',
        caseSensitive: false,
    },
    {
        id: 'urgency-priority-high-regex',
        pattern: /\b(high|top|critical)\s+priority\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 0.85,
        category: types_1.RedFlagCategory.URGENCY,
        contextFields: ['subject', 'body'],
        description: 'Detects high/top/critical priority mentions',
        caseSensitive: false,
    },
    {
        id: 'urgency-time-sensitive-regex',
        pattern: /\btime[- ]sensitive\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 0.8,
        category: types_1.RedFlagCategory.URGENCY,
        contextFields: ['subject', 'body'],
        description: 'Detects "time-sensitive" or "time sensitive" phrases',
        caseSensitive: false,
    },
    // ========================================
    // DEADLINE - Time-bound requests
    // ========================================
    {
        id: 'deadline-keyword',
        pattern: 'deadline',
        type: types_1.PatternType.KEYWORD,
        severity: types_1.Severity.HIGH,
        weight: 0.85,
        category: types_1.RedFlagCategory.DEADLINE,
        contextFields: ['subject', 'body'],
        description: 'Detects "deadline" keyword for time-bound tasks',
        caseSensitive: false,
    },
    {
        id: 'deadline-due-today-regex',
        pattern: /\bdue\s+(today|now|immediately|eod|end of (day|week))\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 0.95,
        category: types_1.RedFlagCategory.DEADLINE,
        contextFields: ['subject', 'body'],
        description: 'Detects immediate due dates (today, now, EOD)',
        caseSensitive: false,
    },
    {
        id: 'deadline-overdue-regex',
        pattern: /\b(overdue|past\s+due|late|missed\s+deadline)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 1.0,
        category: types_1.RedFlagCategory.DEADLINE,
        contextFields: ['subject', 'body'],
        description: 'Detects overdue or missed deadline language',
        caseSensitive: false,
    },
    {
        id: 'deadline-response-needed-regex',
        pattern: /\b(need|require|must have)\s+(your\s+)?(response|reply|answer|feedback)\s+(by|before|asap)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.MEDIUM,
        weight: 0.7,
        category: types_1.RedFlagCategory.DEADLINE,
        contextFields: ['subject', 'body'],
        description: 'Detects requests for timely response',
        caseSensitive: false,
    },
    // ========================================
    // INCIDENT - System issues and outages
    // ========================================
    {
        id: 'incident-keyword',
        pattern: 'incident',
        type: types_1.PatternType.KEYWORD,
        severity: types_1.Severity.HIGH,
        weight: 0.9,
        category: types_1.RedFlagCategory.INCIDENT,
        contextFields: ['subject', 'body'],
        description: 'Detects "incident" keyword for system issues',
        caseSensitive: false,
    },
    {
        id: 'incident-outage-keyword',
        pattern: 'outage',
        type: types_1.PatternType.KEYWORD,
        severity: types_1.Severity.HIGH,
        weight: 0.95,
        category: types_1.RedFlagCategory.OUTAGE,
        contextFields: ['subject', 'body'],
        description: 'Detects "outage" keyword for service disruptions',
        caseSensitive: false,
    },
    {
        id: 'incident-down-regex',
        pattern: /\b(system|service|server|website|application|app|site)\s+(is\s+)?(down|offline|unavailable|not\s+working)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 0.95,
        category: types_1.RedFlagCategory.INCIDENT,
        contextFields: ['subject', 'body'],
        description: 'Detects system/service down notifications',
        caseSensitive: false,
    },
    {
        id: 'incident-production-issue-regex',
        pattern: /\b(production|prod|live)\s+(issue|problem|bug|error|failure)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 0.9,
        category: types_1.RedFlagCategory.INCIDENT,
        contextFields: ['subject', 'body'],
        description: 'Detects production environment issues',
        caseSensitive: false,
    },
    {
        id: 'incident-critical-bug-regex',
        pattern: /\bcritical\s+(bug|issue|error|defect)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 0.9,
        category: types_1.RedFlagCategory.INCIDENT,
        contextFields: ['subject', 'body'],
        description: 'Detects critical bug reports',
        caseSensitive: false,
    },
    // ========================================
    // EMERGENCY - Critical situations
    // ========================================
    {
        id: 'emergency-keyword',
        pattern: 'emergency',
        type: types_1.PatternType.KEYWORD,
        severity: types_1.Severity.HIGH,
        weight: 1.0,
        category: types_1.RedFlagCategory.EMERGENCY,
        contextFields: ['subject', 'body'],
        description: 'Detects "emergency" keyword for critical situations',
        caseSensitive: false,
    },
    {
        id: 'emergency-critical-keyword',
        pattern: 'critical',
        type: types_1.PatternType.KEYWORD,
        severity: types_1.Severity.HIGH,
        weight: 0.9,
        category: types_1.RedFlagCategory.EMERGENCY,
        contextFields: ['subject', 'body'],
        description: 'Detects "critical" keyword for severe issues',
        caseSensitive: false,
    },
    {
        id: 'emergency-alert-regex',
        pattern: /\b(red\s+alert|code\s+red|sev[- ]?1|severity\s+1|p0|priority\s+0)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 1.0,
        category: types_1.RedFlagCategory.EMERGENCY,
        contextFields: ['subject', 'body'],
        description: 'Detects highest severity alerts (Sev1, P0, Code Red)',
        caseSensitive: false,
    },
    {
        id: 'emergency-security-breach-regex',
        pattern: /\b(security\s+)?(breach|hack|compromise|attack|vulnerability|exploit)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 1.0,
        category: types_1.RedFlagCategory.EMERGENCY,
        contextFields: ['subject', 'body'],
        description: 'Detects security incidents and breaches',
        caseSensitive: false,
    },
    // ========================================
    // ESCALATION - Management involvement
    // ========================================
    {
        id: 'escalation-keyword',
        pattern: 'escalation',
        type: types_1.PatternType.KEYWORD,
        severity: types_1.Severity.MEDIUM,
        weight: 0.7,
        category: types_1.RedFlagCategory.ESCALATION,
        contextFields: ['subject', 'body'],
        description: 'Detects "escalation" keyword indicating management involvement',
        caseSensitive: false,
    },
    {
        id: 'escalation-escalate-regex',
        pattern: /\b(escalate|escalating|escalated)\s+(to|this|the\s+issue)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.MEDIUM,
        weight: 0.7,
        category: types_1.RedFlagCategory.ESCALATION,
        contextFields: ['subject', 'body'],
        description: 'Detects escalation action verbs',
        caseSensitive: false,
    },
    {
        id: 'escalation-management-attention-regex',
        pattern: /\b(ceo|cto|cfo|vp|director|executive|management|leadership)\s+(needs|requires|wants|attention)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 0.85,
        category: types_1.RedFlagCategory.ESCALATION,
        contextFields: ['subject', 'body'],
        description: 'Detects executive/management attention requirements',
        caseSensitive: false,
    },
    // ========================================
    // VIP - Important sender indicators
    // ========================================
    {
        id: 'vip-exec-titles-regex',
        pattern: /\b(ceo|cto|cfo|coo|president|vice\s+president|vp|director|head\s+of)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.MEDIUM,
        weight: 0.6,
        category: types_1.RedFlagCategory.VIP,
        contextFields: ['sender', 'body'],
        description: 'Detects executive titles in sender or signature',
        caseSensitive: false,
    },
    {
        id: 'vip-board-member-regex',
        pattern: /\b(board\s+member|board\s+of\s+directors|founder|co-founder)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 0.8,
        category: types_1.RedFlagCategory.VIP,
        contextFields: ['sender', 'body'],
        description: 'Detects board members and founders',
        caseSensitive: false,
    },
    // ========================================
    // Additional Context Patterns
    // ========================================
    {
        id: 'urgency-action-required-regex',
        pattern: /\b(action|attention)\s+(required|needed|requested)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.MEDIUM,
        weight: 0.65,
        category: types_1.RedFlagCategory.URGENCY,
        contextFields: ['subject', 'body'],
        description: 'Detects action/attention required phrases',
        caseSensitive: false,
    },
    {
        id: 'urgency-please-respond-regex',
        pattern: /\bplease\s+(respond|reply|get back)\s+(asap|immediately|urgently|soon)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.MEDIUM,
        weight: 0.6,
        category: types_1.RedFlagCategory.URGENCY,
        contextFields: ['body'],
        description: 'Detects urgent response requests',
        caseSensitive: false,
    },
    {
        id: 'incident-customer-impact-regex',
        pattern: /\b(customer|client|user)s?\s+(affected|impacted|complaining|reporting)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 0.85,
        category: types_1.RedFlagCategory.INCIDENT,
        contextFields: ['body'],
        description: 'Detects customer impact notifications',
        caseSensitive: false,
    },
    {
        id: 'deadline-final-reminder-regex',
        pattern: /\b(final|last|urgent)\s+(reminder|notice|warning)\b/i,
        type: types_1.PatternType.REGEX,
        severity: types_1.Severity.HIGH,
        weight: 0.8,
        category: types_1.RedFlagCategory.DEADLINE,
        contextFields: ['subject', 'body'],
        description: 'Detects final reminder/warning messages',
        caseSensitive: false,
    },
];
/**
 * Get patterns by category
 */
function getPatternsByCategory(category) {
    return exports.DEFAULT_RED_FLAG_PATTERNS.filter(function (p) { return p.category === category; });
}
/**
 * Get patterns by severity
 */
function getPatternsBySeverity(severity) {
    return exports.DEFAULT_RED_FLAG_PATTERNS.filter(function (p) { return p.severity === severity; });
}
/**
 * Get patterns applicable to a specific field
 */
function getPatternsForField(field) {
    return exports.DEFAULT_RED_FLAG_PATTERNS.filter(function (p) {
        return p.contextFields.includes(field);
    });
}
/**
 * Get pattern by ID
 */
function getPatternById(id) {
    return exports.DEFAULT_RED_FLAG_PATTERNS.find(function (p) { return p.id === id; });
}
