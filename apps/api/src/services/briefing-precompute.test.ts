import { JOBS_STREAM } from '@nexus-aec/agent-graph';

import { getRedisClient } from '../lib/redis';
import { getPrebriefingStatus, runPrecomputation } from './briefing-precompute';

import type { Redis } from 'ioredis';

jest.mock('../lib/redis', () => ({ getRedisClient: jest.fn() }));

const mockGetRedis = getRedisClient as jest.MockedFunction<typeof getRedisClient>;

describe('runPrecomputation', () => {
  it('enqueues an inbox_sort job for the user onto the worker stream', async () => {
    const xadd = jest.fn().mockResolvedValue('1-0');
    mockGetRedis.mockReturnValue({ xadd } as unknown as Redis);

    await runPrecomputation('u1');

    expect(xadd).toHaveBeenCalledTimes(1);
    const args = xadd.mock.calls[0] as unknown[];
    expect(args[0]).toBe(JOBS_STREAM);
    const payload = JSON.parse(args[args.length - 1] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({ userId: 'u1', kind: 'inbox_sort' });
    expect(payload['jobId']).toBeTruthy();
    expect(payload['requestedAt']).toBeTruthy();
  });

  it('no-ops (does not throw) when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValue(null);

    await expect(runPrecomputation('u1')).resolves.toBeUndefined();
  });
});

describe('getPrebriefingStatus', () => {
  it('is ready with counts when the priority-counts mirror exists', async () => {
    const get = jest.fn().mockResolvedValue(JSON.stringify({ high: 2, medium: 1, low: 3 }));
    mockGetRedis.mockReturnValue({ get } as unknown as Redis);

    const status = await getPrebriefingStatus('u1');

    expect(status).toEqual({
      ready: true,
      emailCount: 6,
      priorityCounts: { high: 2, medium: 1, low: 3 },
    });
  });

  it('is not ready when no counts exist yet', async () => {
    mockGetRedis.mockReturnValue({ get: jest.fn().mockResolvedValue(null) } as unknown as Redis);

    expect(await getPrebriefingStatus('u1')).toEqual({ ready: false, emailCount: 0 });
  });
});
