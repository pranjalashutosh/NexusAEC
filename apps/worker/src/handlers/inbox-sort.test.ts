import { RedisSaver } from '@nexus-aec/agent-graph';
import RedisMock from 'ioredis-mock';

import { createInboxSortHandler } from './inbox-sort';

import type { WorkerLogger } from '../consumer';
import type { ClassifyFn, InboxFetchService, InboxSortingDeps } from '@nexus-aec/agent-graph';
import type { AgentJob } from '@nexus-aec/shared-types';
import type { StandardEmail } from '@nexus-aec/email-providers';
import type { Redis } from 'ioredis';

const job: AgentJob = {
  jobId: 'j1',
  userId: 'u1',
  kind: 'inbox_sort',
  requestedAt: '2026-07-03T10:00:00.000Z',
};

function silentLogger(): WorkerLogger {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function email(id: string): StandardEmail {
  return {
    id,
    from: { email: 'sender@example.com' },
    subject: 'Subject',
    bodyPreview: 'preview',
    receivedAt: '2026-07-01T10:00:00.000Z',
    threadId: `thread-${id}`,
  } as unknown as StandardEmail;
}

const classify: ClassifyFn = (messages) => {
  const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
  const ids = [...userMsg.matchAll(/id:(\S+)/g)].map((m) => m[1] as string);
  return Promise.resolve(
    ids.map((id) => ({ emailId: id, priority: 'low' as const, summary: `h ${id}` }))
  );
};

describe('createInboxSortHandler', () => {
  it('skips (logs, no throw) when the user has no connected inbox', async () => {
    const logger = silentLogger();
    const handler = createInboxSortHandler({ buildGraphDeps: async () => null, logger });

    await expect(handler(job)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'inbox-sort: no connected inbox; skipping',
      expect.objectContaining({ userId: 'u1' })
    );
  });

  it('runs Graph A on the inbox:{userId} thread and mirrors the counts', async () => {
    const client = new RedisMock() as unknown as Redis;
    const deps: InboxSortingDeps = {
      inboxService: {
        fetchUnread: jest.fn().mockResolvedValue({ items: [email('a'), email('b')] }),
      } as unknown as InboxFetchService,
      classify,
      redis: client,
      checkpointer: new RedisSaver({ client }),
    };
    const handler = createInboxSortHandler({
      buildGraphDeps: async () => deps,
      logger: silentLogger(),
    });

    await handler(job);

    const counts = JSON.parse((await client.get('nexus:priority-counts:u1')) ?? '{}') as unknown;
    expect(counts).toEqual({ high: 0, medium: 0, low: 2 });
  });
});
