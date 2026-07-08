/**
 * `inbox_sort` job handler — runs Graph A on the `inbox:{userId}` thread,
 * rebuilding the priority-ordered briefing queue and mirroring counts.
 *
 * Per-user graph dependencies (inbox adapter, classify call, stores) are
 * assembled by an injected `buildGraphDeps`; when the user has no connected
 * inbox it returns null and the job is a no-op.
 */

import { createInboxSortingGraph, inboxThreadId } from '@nexus-aec/agent-graph';

import type { WorkerLogger } from '../consumer';
import type { InboxSortConfigurable, InboxSortingDeps } from '@nexus-aec/agent-graph';
import type { AgentJob } from '@nexus-aec/shared-types';

export interface InboxSortHandlerDeps {
  /** Assemble per-user graph dependencies; null when the user has no inbox. */
  buildGraphDeps: (userId: string) => Promise<InboxSortingDeps | null>;
  /** Optional per-run config (window, cap, briefed excludes). */
  buildConfig?: (userId: string) => Promise<InboxSortConfigurable>;
  logger?: WorkerLogger;
}

/** Build the `inbox_sort` handler. */
export function createInboxSortHandler(
  deps: InboxSortHandlerDeps
): (job: AgentJob) => Promise<void> {
  return async (job) => {
    const graphDeps = await deps.buildGraphDeps(job.userId);
    if (!graphDeps) {
      deps.logger?.warn('inbox-sort: no connected inbox; skipping', {
        userId: job.userId,
        jobId: job.jobId,
      });
      return;
    }

    const configurable = (await deps.buildConfig?.(job.userId)) ?? {};
    const graph = createInboxSortingGraph(graphDeps);
    await graph.invoke(
      { userId: job.userId },
      { configurable: { thread_id: inboxThreadId(job.userId), ...configurable } }
    );

    deps.logger?.info('inbox-sort: queue rebuilt', { userId: job.userId, jobId: job.jobId });
  };
}
