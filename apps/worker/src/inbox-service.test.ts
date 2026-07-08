import { buildInboxService } from './inbox-service';

import type { CredentialResolver } from './inbox-service';
import type { EmailProviderConfig } from '@nexus-aec/email-providers';

const config: EmailProviderConfig = {
  userId: 'u1',
  tokens: {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    tokenType: 'Bearer',
    scope: '',
  },
} as unknown as EmailProviderConfig;

describe('buildInboxService', () => {
  it('returns null when the user has no connected providers', async () => {
    const resolve: CredentialResolver = async () => [];

    expect(await buildInboxService('u1', resolve)).toBeNull();
  });

  it('builds a unified inbox exposing fetchUnread when providers exist', async () => {
    const resolve: CredentialResolver = async () => [{ source: 'GMAIL', config }];

    const inbox = await buildInboxService('u1', resolve);

    expect(inbox).not.toBeNull();
    expect(typeof inbox?.fetchUnread).toBe('function');
  });
});
