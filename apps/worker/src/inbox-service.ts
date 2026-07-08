/**
 * Build a `UnifiedInboxService` for one user from resolved provider
 * credentials. The credential resolver is injected so the adapter-construction
 * logic stays unit-testable and free of token-storage specifics.
 */

import { GmailAdapter, OutlookAdapter, UnifiedInboxService } from '@nexus-aec/email-providers';

import type { InboxFetchService } from '@nexus-aec/agent-graph';
import type { EmailProviderConfig, EmailSource } from '@nexus-aec/email-providers';

export interface ProviderCredentials {
  source: EmailSource;
  config: EmailProviderConfig;
}

/** Resolve a user's connected-provider credentials (Gmail/Outlook). */
export type CredentialResolver = (userId: string) => Promise<ProviderCredentials[]>;

/**
 * Build a unified inbox for a user. Returns null when the user has no connected
 * providers (the caller treats that as a no-op sort).
 */
export async function buildInboxService(
  userId: string,
  resolve: CredentialResolver
): Promise<InboxFetchService | null> {
  const credentials = await resolve(userId);
  const providers = credentials.map((c) =>
    c.source === 'GMAIL' ? new GmailAdapter(c.config) : new OutlookAdapter(c.config)
  );
  if (providers.length === 0) {
    return null;
  }
  return new UnifiedInboxService(providers, {
    continueOnError: true,
    defaultPageSize: 50,
    requestTimeoutMs: 15000,
  });
}
