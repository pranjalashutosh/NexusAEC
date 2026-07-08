/**
 * Bus consumer loop.
 *
 * Blocking consumer-group read → handle → ack, until `stopped()` flips (graceful
 * shutdown). At-least-once with a pragmatic ack policy: a job is acked after its
 * handler *attempt* (success or failure) so a poison job can't wedge the loop —
 * lost work is recoverable because the next precompute re-enqueues an
 * `inbox_sort`. Read errors back off before retrying so a Redis blip doesn't
 * spin the CPU.
 */

import { ackJob, readJobs } from '@nexus-aec/agent-graph';

import type { StreamJob } from '@nexus-aec/agent-graph';
import type { ILogger } from '@nexus-aec/logger';
import type { AgentJob } from '@nexus-aec/shared-types';
import type { Redis } from 'ioredis';

export type JobHandler = (job: AgentJob) => Promise<void>;

/** The logger surface the worker uses (subset of `@nexus-aec/logger` `ILogger`). */
export type WorkerLogger = Pick<ILogger, 'info' | 'warn' | 'error'>;

export interface ConsumerLoopOptions {
  redis: Redis;
  /** Unique consumer name within the group. */
  consumer: string;
  handle: JobHandler;
  /** The loop runs while this returns false; checked once per iteration. */
  stopped: () => boolean;
  logger?: WorkerLogger;
  /** XREADGROUP block window (ms). Default 5000. */
  blockMs?: number;
  /** Backoff after a read error (ms). Default 1000. */
  errorBackoffMs?: number;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run the consumer loop until `stopped()` returns true. */
export async function runConsumerLoop(options: ConsumerLoopOptions): Promise<void> {
  const { redis, consumer, handle, stopped, logger } = options;
  const blockMs = options.blockMs ?? 5000;
  const backoff = options.errorBackoffMs ?? 1000;

  while (!stopped()) {
    let jobs: StreamJob[];
    try {
      jobs = await readJobs(redis, { consumer, blockMs });
    } catch (err) {
      logger?.warn('worker: readJobs failed; backing off', { error: errMsg(err) });
      await delay(backoff);
      continue;
    }

    for (const { id, job } of jobs) {
      try {
        await handle(job);
      } catch (err) {
        logger?.error('worker: job handler threw', err instanceof Error ? err : null, {
          jobId: job.jobId,
          kind: job.kind,
        });
      } finally {
        try {
          await ackJob(redis, id);
        } catch (err) {
          logger?.warn('worker: ack failed', { id, error: errMsg(err) });
        }
      }
    }
  }
}
