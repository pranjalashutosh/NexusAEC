/**
 * Job dispatcher — routes a bus job to the handler for its `kind`.
 *
 * Unknown or not-yet-supported kinds are logged, never thrown, so a stray job
 * can't crash the consumer loop. `react_task` lands here until Phase 4.
 */

import type { JobHandler, WorkerLogger } from './consumer';
import type { AgentJob } from '@nexus-aec/shared-types';

export interface DispatcherHandlers {
  inboxSort: (job: AgentJob) => Promise<void>;
  logger?: WorkerLogger;
}

/** Build a `JobHandler` that dispatches by `job.kind`. */
export function createJobDispatcher(handlers: DispatcherHandlers): JobHandler {
  return async (job) => {
    const kind: string = job.kind;
    if (kind === 'inbox_sort') {
      await handlers.inboxSort(job);
      return;
    }
    if (kind === 'react_task') {
      handlers.logger?.warn('worker: react_task jobs are handled from Phase 4; skipping', {
        jobId: job.jobId,
      });
      return;
    }
    handlers.logger?.warn('worker: unknown job kind; skipping', { jobId: job.jobId, kind });
  };
}
