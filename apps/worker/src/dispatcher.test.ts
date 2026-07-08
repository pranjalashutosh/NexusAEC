import { createJobDispatcher } from './dispatcher';

import type { WorkerLogger } from './consumer';
import type { AgentJob } from '@nexus-aec/shared-types';

function silentLogger(): WorkerLogger {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function job(kind: string): AgentJob {
  return { jobId: 'j1', userId: 'u1', kind, requestedAt: '2026-07-03T10:00:00.000Z' } as AgentJob;
}

describe('createJobDispatcher', () => {
  it('routes inbox_sort to the inbox-sort handler', async () => {
    const inboxSort = jest.fn().mockResolvedValue(undefined);
    const dispatch = createJobDispatcher({ inboxSort });

    await dispatch(job('inbox_sort'));

    expect(inboxSort).toHaveBeenCalledTimes(1);
  });

  it('logs and skips react_task (not handled until Phase 4)', async () => {
    const inboxSort = jest.fn();
    const logger = silentLogger();
    const dispatch = createJobDispatcher({ inboxSort, logger });

    await dispatch(job('react_task'));

    expect(inboxSort).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('react_task'),
      expect.any(Object)
    );
  });

  it('logs and skips an unknown kind', async () => {
    const inboxSort = jest.fn();
    const logger = silentLogger();
    const dispatch = createJobDispatcher({ inboxSort, logger });

    await dispatch(job('nonsense'));

    expect(inboxSort).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'worker: unknown job kind; skipping',
      expect.objectContaining({ kind: 'nonsense' })
    );
  });
});
