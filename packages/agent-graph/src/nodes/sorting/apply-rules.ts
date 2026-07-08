/**
 * Graph A · apply-rules
 *
 * Ports the three legacy briefing filters (livekit-agent `briefing-pipeline`
 * §2) into a pure function over provider emails:
 *   1. Briefed-ID exclusion (emails actioned/briefed in past sessions).
 *   2. Muted senders.
 *   3. `[rule]` knowledge filters ("never show X", "block Y", …).
 *
 * `extractFilterRules` is a verbatim port so parity holds against the legacy
 * preprocessor (task 2.10).
 */

import type { StandardEmail } from '@nexus-aec/email-providers';

export interface FilterRules {
  blockedDomains: string[];
  blockedKeywords: string[];
}

export interface ApplyRulesOptions {
  /** Email IDs actioned/briefed in previous sessions (skipped emails return). */
  excludeEmailIds?: Set<string>;
  /** Muted sender addresses. */
  mutedSenders?: string[];
  /** User knowledge entries scanned for `[rule]`-style block patterns. */
  knowledgeEntries?: string[];
}

/**
 * Parse user knowledge entries for blocking intent ("never show X", "skip all
 * X", "block X", "hide X", "don't bring X", "no X emails", "exclude X").
 * Verbatim port of the legacy `extractFilterRules`.
 */
export function extractFilterRules(knowledgeEntries: string[]): FilterRules {
  const blockedDomains: string[] = [];
  const blockedKeywords: string[] = [];

  // Scan ALL entries — blocking intent can appear in any category.
  const blockPatterns =
    /(?:never\s+(?:show|include|bring)|skip\s+all|block|hide|exclude|don't\s+(?:show|bring|include)|no\s+\S+\s+emails|filter\s+out)\s+(.+)/i;

  for (const entry of knowledgeEntries) {
    // Strip any [category] prefix (e.g. [rule], [preference], [feedback]).
    const content = entry.replace(/^\[\w+\]\s*/i, '');
    const match = content.match(blockPatterns);
    if (!match?.[1]) {
      continue;
    }

    const target = match[1]
      .replace(/\s*(emails?|messages?|notifications?|in\s+briefings?|from\s+briefings?)\s*/gi, '')
      .trim()
      .toLowerCase();

    if (target.length === 0) {
      continue;
    }

    // A dotted/@ target is a domain filter; otherwise a keyword filter.
    if (target.includes('.') || target.includes('@')) {
      blockedDomains.push(target);
    } else {
      blockedKeywords.push(target);
    }
  }

  return { blockedDomains, blockedKeywords };
}

/** True when an email matches any block rule (domain on sender, keyword anywhere). */
function matchesBlockRule(email: StandardEmail, rules: FilterRules): boolean {
  const fromLower = email.from.email.toLowerCase();
  const subjectLower = email.subject.toLowerCase();
  const previewLower = (email.bodyPreview ?? '').toLowerCase();
  const searchable = `${fromLower} ${subjectLower} ${previewLower}`;

  for (const domain of rules.blockedDomains) {
    if (fromLower.includes(domain)) {
      return true;
    }
  }
  for (const keyword of rules.blockedKeywords) {
    if (searchable.includes(keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Apply briefed-ID exclusion, muted senders, and knowledge `[rule]` filters,
 * returning the emails that survive (order preserved).
 */
export function applyRules(
  emails: StandardEmail[],
  options: ApplyRulesOptions = {}
): StandardEmail[] {
  let kept = emails;

  const excludeIds = options.excludeEmailIds;
  if (excludeIds && excludeIds.size > 0) {
    kept = kept.filter((e) => !excludeIds.has(e.id));
  }

  const mutedSenders = options.mutedSenders ?? [];
  if (mutedSenders.length > 0) {
    const mutedSet = new Set(mutedSenders.map((s) => s.toLowerCase()));
    kept = kept.filter((e) => !mutedSet.has(e.from.email.toLowerCase()));
  }

  const knowledgeEntries = options.knowledgeEntries ?? [];
  if (knowledgeEntries.length > 0) {
    const rules = extractFilterRules(knowledgeEntries);
    if (rules.blockedDomains.length > 0 || rules.blockedKeywords.length > 0) {
      kept = kept.filter((e) => !matchesBlockRule(e, rules));
    }
  }

  return kept;
}
