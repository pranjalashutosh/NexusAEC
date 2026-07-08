import { applyRules, extractFilterRules } from './apply-rules';

import type { StandardEmail } from '@nexus-aec/email-providers';

function email(o: {
  id: string;
  from?: string;
  subject?: string;
  bodyPreview?: string;
}): StandardEmail {
  return {
    id: o.id,
    from: { email: o.from ?? 'sender@example.com' },
    subject: o.subject ?? 'Subject',
    bodyPreview: o.bodyPreview ?? 'preview',
    receivedAt: '2026-07-01T00:00:00.000Z',
    threadId: `thread-${o.id}`,
  } as unknown as StandardEmail;
}

describe('extractFilterRules', () => {
  it('parses "never show X" into a keyword filter (strips [category] prefix)', () => {
    expect(extractFilterRules(['[rule] never show Quora'])).toEqual({
      blockedDomains: [],
      blockedKeywords: ['quora'],
    });
  });

  it('treats dotted/@ targets as domain filters', () => {
    expect(extractFilterRules(['block linkedin.com emails'])).toEqual({
      blockedDomains: ['linkedin.com'],
      blockedKeywords: [],
    });
  });

  it('strips trailing noise words like "notifications"', () => {
    expect(extractFilterRules(['[preference] skip all newsletter notifications'])).toEqual({
      blockedDomains: [],
      blockedKeywords: ['newsletter'],
    });
  });

  it('ignores entries with no blocking intent', () => {
    expect(extractFilterRules(['I like concise summaries'])).toEqual({
      blockedDomains: [],
      blockedKeywords: [],
    });
  });
});

describe('applyRules', () => {
  const emails = [
    email({ id: 'keep', from: 'ok@x.com', subject: 'Hello' }),
    email({ id: 'briefed', from: 'ok@x.com' }),
    email({ id: 'muted', from: 'noise@spam.com' }),
    email({ id: 'ruled', from: 'promo@x.com', subject: 'Quora digest' }),
  ];

  it('excludes previously briefed/actioned IDs', () => {
    const kept = applyRules(emails, { excludeEmailIds: new Set(['briefed']) });
    expect(kept.map((e) => e.id)).not.toContain('briefed');
    expect(kept).toHaveLength(3);
  });

  it('removes muted senders (case-insensitive)', () => {
    const kept = applyRules(emails, { mutedSenders: ['NOISE@spam.com'] });
    expect(kept.map((e) => e.id)).not.toContain('muted');
  });

  it('applies knowledge [rule] keyword filters against sender+subject+preview', () => {
    const kept = applyRules(emails, { knowledgeEntries: ['never show quora'] });
    expect(kept.map((e) => e.id)).not.toContain('ruled');
  });

  it('returns every email when no options are given', () => {
    expect(applyRules(emails)).toHaveLength(4);
  });

  it('composes all three filters', () => {
    const kept = applyRules(emails, {
      excludeEmailIds: new Set(['briefed']),
      mutedSenders: ['noise@spam.com'],
      knowledgeEntries: ['block quora'],
    });
    expect(kept.map((e) => e.id)).toEqual(['keep']);
  });
});
