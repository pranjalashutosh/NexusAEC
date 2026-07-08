import { parseResultMessage } from '../../bus/jobs';
import {
  commitQueueSideEffects,
  countByPriority,
  PRIORITY_COUNTS_TTL_SECONDS,
} from './write-queue';

import type { InboxQueueItem } from '@nexus-aec/shared-types';
import type { Redis } from 'ioredis';

function item(o: { emailId: string; priority: InboxQueueItem['priority'] }): InboxQueueItem {
  return {
    emailId: o.emailId,
    from: 'sender@example.com',
    subject: 'Subject',
    receivedAt: '2026-07-01T00:00:00.000Z',
    priority: o.priority,
    summary: '',
    status: 'pending',
  };
}

function okRedis(): { setex: jest.Mock; publish: jest.Mock } {
  return { setex: jest.fn().mockResolvedValue('OK'), publish: jest.fn().mockResolvedValue(1) };
}

describe('countByPriority', () => {
  it('tallies high / medium / low', () => {
    const counts = countByPriority([
      item({ emailId: 'a', priority: 'high' }),
      item({ emailId: 'b', priority: 'high' }),
      item({ emailId: 'c', priority: 'low' }),
    ]);
    expect(counts).toEqual({ high: 2, medium: 0, low: 1 });
  });
});

describe('commitQueueSideEffects', () => {
  it('mirrors counts to the priority-counts key and publishes a queue_updated event', async () => {
    const redis = okRedis();
    const items = [
      item({ emailId: 'a', priority: 'high' }),
      item({ emailId: 'b', priority: 'low' }),
    ];

    const counts = await commitQueueSideEffects(redis as unknown as Redis, 'u1', items);

    expect(counts).toEqual({ high: 1, medium: 0, low: 1 });
    expect(redis.setex).toHaveBeenCalledWith(
      'nexus:priority-counts:u1',
      PRIORITY_COUNTS_TTL_SECONDS,
      JSON.stringify({ high: 1, medium: 0, low: 1 })
    );

    const [channel, payload] = redis.publish.mock.calls[0] as [string, string];
    expect(channel).toBe('nexus:results:u1');
    const message = parseResultMessage(payload);
    expect(message?.kind).toBe('queue_updated');
    if (message?.kind === 'queue_updated') {
      expect(message.update).toMatchObject({ userId: 'u1', total: 2, counts: { high: 1, low: 1 } });
    }
  });

  it('swallows a Redis failure so the sort result still stands', async () => {
    const redis = {
      setex: jest.fn().mockRejectedValue(new Error('down')),
      publish: jest.fn().mockRejectedValue(new Error('down')),
    };
    const logger = { warn: jest.fn() };

    const counts = await commitQueueSideEffects(
      redis as unknown as Redis,
      'u1',
      [item({ emailId: 'a', priority: 'high' })],
      logger
    );

    expect(counts).toEqual({ high: 1, medium: 0, low: 0 });
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
