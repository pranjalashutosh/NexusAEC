import { fetchUnreadEmails, presortForBriefing, toEmailMetadata } from './fetch-inbox';

import type { InboxFetchService } from './fetch-inbox';
import type { StandardEmail } from '@nexus-aec/email-providers';

function email(o: {
  id: string;
  from?: string;
  subject?: string;
  bodyPreview?: string;
  receivedAt?: string;
}): StandardEmail {
  return {
    id: o.id,
    from: { email: o.from ?? 'sender@example.com' },
    subject: o.subject ?? 'Subject',
    bodyPreview: o.bodyPreview ?? 'preview text',
    receivedAt: o.receivedAt ?? '2026-07-01T10:00:00.000Z',
    threadId: `thread-${o.id}`,
  } as unknown as StandardEmail;
}

function serviceReturning(fetchUnread: jest.Mock): InboxFetchService {
  return { fetchUnread } as unknown as InboxFetchService;
}

describe('fetchUnreadEmails', () => {
  it('accumulates emails across pages until the cursor runs out', async () => {
    const fetchUnread = jest
      .fn()
      .mockResolvedValueOnce({
        items: [email({ id: 'a' }), email({ id: 'b' })],
        nextPageToken: 'p1',
      })
      .mockResolvedValueOnce({ items: [email({ id: 'c' })] });

    const result = await fetchUnreadEmails(serviceReturning(fetchUnread));

    expect(result.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(fetchUnread).toHaveBeenCalledTimes(2);
  });

  it('stops paginating on an empty page even if a cursor is returned', async () => {
    const fetchUnread = jest
      .fn()
      .mockResolvedValueOnce({ items: [email({ id: 'a' })], nextPageToken: 'p1' })
      .mockResolvedValueOnce({ items: [], nextPageToken: 'p2' });

    const result = await fetchUnreadEmails(serviceReturning(fetchUnread));

    expect(result.map((e) => e.id)).toEqual(['a']);
    expect(fetchUnread).toHaveBeenCalledTimes(2);
  });

  it('caps the requested page size to the remaining email budget', async () => {
    const fetchUnread = jest.fn().mockResolvedValue({ items: [email({ id: 'a' })] });

    await fetchUnreadEmails(serviceReturning(fetchUnread), { maxEmails: 30 });

    expect(fetchUnread).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.any(Date) }),
      expect.objectContaining({ pageSize: 30 })
    );
  });

  it('defaults the fetch window to ~24h ago', async () => {
    const fetchUnread = jest.fn().mockResolvedValue({ items: [] });

    await fetchUnreadEmails(serviceReturning(fetchUnread));

    const [filters] = fetchUnread.mock.calls[0] as [{ after: Date }];
    const ageMs = Date.now() - filters.after.getTime();
    expect(ageMs).toBeGreaterThan(23 * 3_600_000);
    expect(ageMs).toBeLessThan(25 * 3_600_000);
  });
});

describe('toEmailMetadata', () => {
  it('maps provider fields and flags VIP senders case-insensitively', () => {
    const meta = toEmailMetadata(
      email({ id: 'x', from: 'BOSS@Corp.com', subject: 'Hi', bodyPreview: 'pv' }),
      ['boss@corp.com']
    );

    expect(meta).toMatchObject({
      id: 'x',
      from: 'BOSS@Corp.com',
      subject: 'Hi',
      snippet: 'pv',
      threadId: 'thread-x',
      isVip: true,
    });
    expect(meta.receivedAt).toBeInstanceOf(Date);
  });

  it('marks non-VIP senders', () => {
    const meta = toEmailMetadata(email({ id: 'x', from: 'random@x.com' }), ['boss@corp.com']);
    expect(meta.isVip).toBe(false);
  });
});

describe('presortForBriefing', () => {
  it('orders VIP senders first, then most-recent', () => {
    const emails = [
      email({ id: 'old', from: 'x@y.com', receivedAt: '2026-07-01T08:00:00.000Z' }),
      email({ id: 'vip', from: 'vip@y.com', receivedAt: '2026-07-01T07:00:00.000Z' }),
      email({ id: 'new', from: 'x@y.com', receivedAt: '2026-07-01T09:00:00.000Z' }),
    ];

    const sorted = presortForBriefing(emails, ['vip@y.com']);

    expect(sorted.map((e) => e.id)).toEqual(['vip', 'new', 'old']);
  });
});
