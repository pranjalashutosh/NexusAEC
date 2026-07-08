/**
 * Graph A · fetch-inbox
 *
 * Ports the paginated 24h-unread fetch from livekit-agent's `briefing-pipeline`
 * (§1): 50 emails/page, up to 10 pages / 500 emails. Ordering reuses
 * intelligence's `presortEmails` (VIP → replied-to → recency) so Graph A
 * produces the same pre-sort as the legacy pipeline.
 *
 * PRD Rule 60: provider emails (incl. a ~100-char `bodyPreview`) flow to the
 * caller transiently; only derived metadata + summaries are ever persisted
 * downstream (see `write-queue`).
 */

import { presortEmails, type EmailMetadata } from '@nexus-aec/intelligence';

import type { StandardEmail, UnifiedInboxService } from '@nexus-aec/email-providers';

/** The single inbox capability Graph A needs — keeps test fakes tiny. */
export type InboxFetchService = Pick<UnifiedInboxService, 'fetchUnread'>;

export interface FetchInboxOptions {
  /** Only include emails received after this instant. Default: 24h ago. */
  since?: Date;
  /** Hard cap on fetched emails. Default: 500. */
  maxEmails?: number;
}

const PAGE_SIZE = 50;
const MAX_PAGES = 10;
const DEFAULT_MAX_EMAILS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fetch unread emails within the window, paginating exactly like the legacy
 * pipeline (stops on the page cap, the email cap, an empty page, or no cursor).
 */
export async function fetchUnreadEmails(
  inboxService: InboxFetchService,
  options: FetchInboxOptions = {}
): Promise<StandardEmail[]> {
  const maxEmails = options.maxEmails ?? DEFAULT_MAX_EMAILS;
  const since = options.since ?? new Date(Date.now() - DAY_MS);

  const emails: StandardEmail[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES && emails.length < maxEmails; page++) {
    const fetchSize = Math.min(PAGE_SIZE, maxEmails - emails.length);
    const result = await inboxService.fetchUnread(
      { after: since },
      { pageSize: fetchSize, ...(pageToken ? { pageToken } : {}) }
    );

    emails.push(...result.items);
    pageToken = result.nextPageToken;

    if (!pageToken || result.items.length === 0) {
      break;
    }
  }

  return emails;
}

/**
 * Convert a provider email to intelligence `EmailMetadata` (Rule 60: metadata +
 * a ~100-char preview, never the full body). Mirrors the legacy mapping.
 */
export function toEmailMetadata(email: StandardEmail, vipEmails: string[]): EmailMetadata {
  const fromLower = email.from.email.toLowerCase();
  return {
    id: email.id,
    subject: email.subject,
    from: email.from.email,
    snippet: email.bodyPreview ?? email.subject,
    receivedAt: new Date(email.receivedAt),
    ...(email.threadId ? { threadId: email.threadId } : {}),
    isVip: vipEmails.some((v) => v.toLowerCase() === fromLower),
  };
}

/**
 * Convert + presort provider emails by the legacy heuristic
 * (VIP → replied-to → recency), yielding `EmailMetadata` ready for batching.
 */
export function presortForBriefing(emails: StandardEmail[], vipEmails: string[]): EmailMetadata[] {
  const metadata = emails.map((e) => toEmailMetadata(e, vipEmails));
  return presortEmails(metadata, vipEmails);
}
