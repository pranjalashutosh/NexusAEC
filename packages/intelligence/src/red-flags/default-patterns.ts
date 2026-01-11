import {
  RedFlagPattern,
  Severity,
  RedFlagCategory,
  PatternType,
} from '../types';

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
export const DEFAULT_RED_FLAG_PATTERNS: RedFlagPattern[] = [
  // ========================================
  // URGENCY - Time-sensitive keywords
  // ========================================
  {
    id: 'urgency-urgent-keyword',
    pattern: 'urgent',
    type: PatternType.KEYWORD,
    severity: Severity.HIGH,
    weight: 0.9,
    category: RedFlagCategory.URGENCY,
    contextFields: ['subject', 'body'],
    description: 'Detects "urgent" keyword indicating time-sensitive matter',
    caseSensitive: false,
  },
  {
    id: 'urgency-asap-keyword',
    pattern: 'asap',
    type: PatternType.KEYWORD,
    severity: Severity.HIGH,
    weight: 0.85,
    category: RedFlagCategory.URGENCY,
    contextFields: ['subject', 'body'],
    description: 'Detects "ASAP" abbreviation for urgent requests',
    caseSensitive: false,
  },
  {
    id: 'urgency-immediate-keyword',
    pattern: 'immediate',
    type: PatternType.KEYWORD,
    severity: Severity.HIGH,
    weight: 0.9,
    category: RedFlagCategory.URGENCY,
    contextFields: ['subject', 'body'],
    description: 'Detects "immediate" indicating need for instant action',
    caseSensitive: false,
  },
  {
    id: 'urgency-priority-high-regex',
    pattern: /\b(high|top|critical)\s+priority\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 0.85,
    category: RedFlagCategory.URGENCY,
    contextFields: ['subject', 'body'],
    description: 'Detects high/top/critical priority mentions',
    caseSensitive: false,
  },
  {
    id: 'urgency-time-sensitive-regex',
    pattern: /\btime[- ]sensitive\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 0.8,
    category: RedFlagCategory.URGENCY,
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
    type: PatternType.KEYWORD,
    severity: Severity.HIGH,
    weight: 0.85,
    category: RedFlagCategory.DEADLINE,
    contextFields: ['subject', 'body'],
    description: 'Detects "deadline" keyword for time-bound tasks',
    caseSensitive: false,
  },
  {
    id: 'deadline-due-today-regex',
    pattern: /\bdue\s+(today|now|immediately|eod|end of (day|week))\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 0.95,
    category: RedFlagCategory.DEADLINE,
    contextFields: ['subject', 'body'],
    description: 'Detects immediate due dates (today, now, EOD)',
    caseSensitive: false,
  },
  {
    id: 'deadline-overdue-regex',
    pattern: /\b(overdue|past\s+due|late|missed\s+deadline)\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 1.0,
    category: RedFlagCategory.DEADLINE,
    contextFields: ['subject', 'body'],
    description: 'Detects overdue or missed deadline language',
    caseSensitive: false,
  },
  {
    id: 'deadline-response-needed-regex',
    pattern: /\b(need|require|must have)\s+(your\s+)?(response|reply|answer|feedback)\s+(by|before|asap)\b/i,
    type: PatternType.REGEX,
    severity: Severity.MEDIUM,
    weight: 0.7,
    category: RedFlagCategory.DEADLINE,
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
    type: PatternType.KEYWORD,
    severity: Severity.HIGH,
    weight: 0.9,
    category: RedFlagCategory.INCIDENT,
    contextFields: ['subject', 'body'],
    description: 'Detects "incident" keyword for system issues',
    caseSensitive: false,
  },
  {
    id: 'incident-outage-keyword',
    pattern: 'outage',
    type: PatternType.KEYWORD,
    severity: Severity.HIGH,
    weight: 0.95,
    category: RedFlagCategory.OUTAGE,
    contextFields: ['subject', 'body'],
    description: 'Detects "outage" keyword for service disruptions',
    caseSensitive: false,
  },
  {
    id: 'incident-down-regex',
    pattern: /\b(system|service|server|website|application|app|site)\s+(is\s+)?(down|offline|unavailable|not\s+working)\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 0.95,
    category: RedFlagCategory.INCIDENT,
    contextFields: ['subject', 'body'],
    description: 'Detects system/service down notifications',
    caseSensitive: false,
  },
  {
    id: 'incident-production-issue-regex',
    pattern: /\b(production|prod|live)\s+(issue|problem|bug|error|failure)\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 0.9,
    category: RedFlagCategory.INCIDENT,
    contextFields: ['subject', 'body'],
    description: 'Detects production environment issues',
    caseSensitive: false,
  },
  {
    id: 'incident-critical-bug-regex',
    pattern: /\bcritical\s+(bug|issue|error|defect)\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 0.9,
    category: RedFlagCategory.INCIDENT,
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
    type: PatternType.KEYWORD,
    severity: Severity.HIGH,
    weight: 1.0,
    category: RedFlagCategory.EMERGENCY,
    contextFields: ['subject', 'body'],
    description: 'Detects "emergency" keyword for critical situations',
    caseSensitive: false,
  },
  {
    id: 'emergency-critical-keyword',
    pattern: 'critical',
    type: PatternType.KEYWORD,
    severity: Severity.HIGH,
    weight: 0.9,
    category: RedFlagCategory.EMERGENCY,
    contextFields: ['subject', 'body'],
    description: 'Detects "critical" keyword for severe issues',
    caseSensitive: false,
  },
  {
    id: 'emergency-alert-regex',
    pattern: /\b(red\s+alert|code\s+red|sev[- ]?1|severity\s+1|p0|priority\s+0)\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 1.0,
    category: RedFlagCategory.EMERGENCY,
    contextFields: ['subject', 'body'],
    description: 'Detects highest severity alerts (Sev1, P0, Code Red)',
    caseSensitive: false,
  },
  {
    id: 'emergency-security-breach-regex',
    pattern: /\b(security\s+)?(breach|hack|compromise|attack|vulnerability|exploit)\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 1.0,
    category: RedFlagCategory.EMERGENCY,
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
    type: PatternType.KEYWORD,
    severity: Severity.MEDIUM,
    weight: 0.7,
    category: RedFlagCategory.ESCALATION,
    contextFields: ['subject', 'body'],
    description: 'Detects "escalation" keyword indicating management involvement',
    caseSensitive: false,
  },
  {
    id: 'escalation-escalate-regex',
    pattern: /\b(escalate|escalating|escalated)\s+(to|this|the\s+issue)\b/i,
    type: PatternType.REGEX,
    severity: Severity.MEDIUM,
    weight: 0.7,
    category: RedFlagCategory.ESCALATION,
    contextFields: ['subject', 'body'],
    description: 'Detects escalation action verbs',
    caseSensitive: false,
  },
  {
    id: 'escalation-management-attention-regex',
    pattern: /\b(ceo|cto|cfo|vp|director|executive|management|leadership)\s+(needs|requires|wants|attention)\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 0.85,
    category: RedFlagCategory.ESCALATION,
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
    type: PatternType.REGEX,
    severity: Severity.MEDIUM,
    weight: 0.6,
    category: RedFlagCategory.VIP,
    contextFields: ['sender', 'body'],
    description: 'Detects executive titles in sender or signature',
    caseSensitive: false,
  },
  {
    id: 'vip-board-member-regex',
    pattern: /\b(board\s+member|board\s+of\s+directors|founder|co-founder)\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 0.8,
    category: RedFlagCategory.VIP,
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
    type: PatternType.REGEX,
    severity: Severity.MEDIUM,
    weight: 0.65,
    category: RedFlagCategory.URGENCY,
    contextFields: ['subject', 'body'],
    description: 'Detects action/attention required phrases',
    caseSensitive: false,
  },
  {
    id: 'urgency-please-respond-regex',
    pattern: /\bplease\s+(respond|reply|get back)\s+(asap|immediately|urgently|soon)\b/i,
    type: PatternType.REGEX,
    severity: Severity.MEDIUM,
    weight: 0.6,
    category: RedFlagCategory.URGENCY,
    contextFields: ['body'],
    description: 'Detects urgent response requests',
    caseSensitive: false,
  },
  {
    id: 'incident-customer-impact-regex',
    pattern: /\b(customer|client|user)s?\s+(affected|impacted|complaining|reporting)\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 0.85,
    category: RedFlagCategory.INCIDENT,
    contextFields: ['body'],
    description: 'Detects customer impact notifications',
    caseSensitive: false,
  },
  {
    id: 'deadline-final-reminder-regex',
    pattern: /\b(final|last|urgent)\s+(reminder|notice|warning)\b/i,
    type: PatternType.REGEX,
    severity: Severity.HIGH,
    weight: 0.8,
    category: RedFlagCategory.DEADLINE,
    contextFields: ['subject', 'body'],
    description: 'Detects final reminder/warning messages',
    caseSensitive: false,
  },
];

/**
 * Get patterns by category
 */
export function getPatternsByCategory(
  category: RedFlagCategory
): RedFlagPattern[] {
  return DEFAULT_RED_FLAG_PATTERNS.filter((p) => p.category === category);
}

/**
 * Get patterns by severity
 */
export function getPatternsBySeverity(severity: Severity): RedFlagPattern[] {
  return DEFAULT_RED_FLAG_PATTERNS.filter((p) => p.severity === severity);
}

/**
 * Get patterns applicable to a specific field
 */
export function getPatternsForField(
  field: 'subject' | 'body' | 'sender'
): RedFlagPattern[] {
  return DEFAULT_RED_FLAG_PATTERNS.filter((p) =>
    p.contextFields.includes(field)
  );
}

/**
 * Get pattern by ID
 */
export function getPatternById(id: string): RedFlagPattern | undefined {
  return DEFAULT_RED_FLAG_PATTERNS.find((p) => p.id === id);
}
