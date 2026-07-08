import { JOBS_STREAM, WORKER_GROUP } from '@nexus-aec/agent-graph';

import { runConsumerLoop } from './consumer';

import type { WorkerLogger } from './consumer';
import type { AgentJob } from '@nexus-aec/shared-types';
import type { Redis } from 'ioredis';

const job: AgentJob = {
  jobId: 'j1',
  userId: 'u1',
  kind: 'inbox_sort',
  requestedAt: '2026-07-03T10:00:00.000Z',
};

function replyWith(j: AgentJob, id = '1-0'): unknown {
  return [[JOBS_STREAM, [[id, ['data', JSON.stringify(j)]]]]];
}

/** Stops the loop after exactly one iteration. */
function stopAfterOne(): () => boolean {
  let calls = 0;
  return () => calls++ > 0;
}

function silentLogger(): WorkerLogger {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('runConsumerLoop', () => {
  it('reads a job, hands it to the handler, and acks it', async () => {
    const xreadgroup = jest.fn().mockResolvedValue(replyWith(job));
    const xack = jest.fn().mockResolvedValue(1);
    const redis = { xreadgroup, xack } as unknown as Redis;
    const handle = jest.fn().mockResolvedValue(undefined);

    await runConsumerLoop({ redis, consumer: 'w1', handle, stopped: stopAfterOne(), blockMs: 10 });

    expect(handle).toHaveBeenCalledWith(job);
    expect(xack).toHaveBeenCalledWith(JOBS_STREAM, WORKER_GROUP, '1-0');
  });

  it('still acks (and logs) when the handler throws — no poison-pill wedge', async () => {
    const xack = jest.fn().mockResolvedValue(1);
    const redis = {
      xreadgroup: jest.fn().mockResolvedValue(replyWith(job)),
      xack,
    } as unknown as Redis;
    const handle = jest.fn().mockRejectedValue(new Error('boom'));
    const logger = silentLogger();

    await runConsumerLoop({
      redis,
      consumer: 'w1',
      handle,
      stopped: stopAfterOne(),
      blockMs: 10,
      logger,
    });

    expect(xack).toHaveBeenCalledWith(JOBS_STREAM, WORKER_GROUP, '1-0');
    expect(logger.error).toHaveBeenCalled();
  });

  it('backs off and continues when the read fails', async () => {
    const redis = {
      xreadgroup: jest.fn().mockRejectedValue(new Error('ECONNRESET')),
      xack: jest.fn(),
    } as unknown as Redis;
    const handle = jest.fn();
    const logger = silentLogger();

    await runConsumerLoop({
      redis,
      consumer: 'w1',
      handle,
      stopped: stopAfterOne(),
      errorBackoffMs: 1,
      logger,
    });

    expect(handle).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'worker: readJobs failed; backing off',
      expect.objectContaining({ error: 'ECONNRESET' })
    );
  });

  it('does nothing when already stopped', async () => {
    const xreadgroup = jest.fn();
    const redis = { xreadgroup, xack: jest.fn() } as unknown as Redis;

    await runConsumerLoop({ redis, consumer: 'w1', handle: jest.fn(), stopped: () => true });

    expect(xreadgroup).not.toHaveBeenCalled();
  });
});
