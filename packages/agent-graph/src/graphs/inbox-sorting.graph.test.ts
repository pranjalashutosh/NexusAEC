import RedisMock from 'ioredis-mock';

import { RedisSaver } from '../checkpoint/redis-saver';
import { createInboxSortingGraph, inboxThreadId } from './inbox-sorting.graph';

import type { InboxSortingDeps } from './inbox-sorting.graph';
import type { ClassifyFn, RawClassification } from '../nodes/sorting/classify-sort';
import type { InboxFetchService } from '../nodes/sorting/fetch-inbox';
import type { StandardEmail } from '@nexus-aec/email-providers';
import type { Redis } from 'ioredis';

function email(o: { id: string; from?: string; subject?: string }): StandardEmail {
  return {
    id: o.id,
    from: { email: o.from ?? 'sender@example.com' },
    subject: o.subject ?? 'Subject',
    bodyPreview: 'preview',
    receivedAt: '2026-07-01T10:00:00.000Z',
    threadId: `thread-${o.id}`,
  } as unknown as StandardEmail;
}

function inboxWith(emails: StandardEmail[]): InboxFetchService {
  return {
    fetchUnread: jest.fn().mockResolvedValue({ items: emails }),
  } as unknown as InboxFetchService;
}

/** Deterministic stand-in for the LLM: ids containing "hi" are high, else low. */
const classify: ClassifyFn = (messages) => {
  const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
  const ids = [...userMsg.matchAll(/id:(\S+)/g)].map((m) => m[1] as string);
  return Promise.resolve(
    ids.map<RawClassification>((id) => ({
      emailId: id,
      priority: id.includes('hi') ? 'high' : 'low',
      summary: `handles ${id}`,
    }))
  );
};

function makeDeps(emails: StandardEmail[], client: Redis): InboxSortingDeps {
  return {
    inboxService: inboxWith(emails),
    classify,
    redis: client,
    checkpointer: new RedisSaver({ client }),
  };
}

function newClient(): Redis {
  return new RedisMock() as unknown as Redis;
}

describe('inbox_sorting graph', () => {
  it('builds a priority-ordered queue and mirrors the counts to Redis', async () => {
    const client = newClient();
    const graph = createInboxSortingGraph(
      makeDeps([email({ id: 'lo1' }), email({ id: 'hi1' }), email({ id: 'lo2' })], client)
    );

    const result = await graph.invoke(
      { userId: 'u1' },
      { configurable: { thread_id: inboxThreadId('u1') } }
    );

    // High priority first; ties broken by recency then id.
    expect(result.inbox_queue.map((i) => i.emailId)).toEqual(['hi1', 'lo1', 'lo2']);
    expect(result.inbox_queue.every((i) => i.status === 'pending')).toBe(true);
    expect(result.inbox_queue[0]?.summary).toBe('handles hi1');

    const counts = JSON.parse((await client.get('nexus:priority-counts:u1')) ?? '{}') as unknown;
    expect(counts).toEqual({ high: 1, medium: 0, low: 2 });
  });

  it('is idempotent across re-runs on the same thread (no duplication)', async () => {
    // Distinct user: ioredis-mock shares one store across instances, so reusing
    // another test's thread id would inherit its checkpointed queue.
    const client = newClient();
    const graph = createInboxSortingGraph(
      makeDeps([email({ id: 'hi1' }), email({ id: 'lo1' })], client)
    );
    const config = { configurable: { thread_id: inboxThreadId('u-idem') } };

    await graph.invoke({ userId: 'u-idem' }, config);
    const second = await graph.invoke({ userId: 'u-idem' }, config);

    expect(second.inbox_queue.map((i) => i.emailId)).toEqual(['hi1', 'lo1']);
    expect(second.inbox_queue).toHaveLength(2);
  });

  it('handles an empty inbox — empty queue, zeroed counts', async () => {
    const client = newClient();
    const graph = createInboxSortingGraph(makeDeps([], client));

    const result = await graph.invoke(
      { userId: 'u2' },
      { configurable: { thread_id: inboxThreadId('u2') } }
    );

    expect(result.inbox_queue).toEqual([]);
    const counts = JSON.parse((await client.get('nexus:priority-counts:u2')) ?? '{}') as unknown;
    expect(counts).toEqual({ high: 0, medium: 0, low: 0 });
  });
});
