/**
 * Graph A · inbox_sorting
 *
 * Builds the priority-ordered briefing queue on the `inbox:{userId}` thread:
 *
 *   START → hydrate_prefs → build_queue → write_queue → END
 *
 * `build_queue` fetches, filters, presorts, and classifies the inbox in
 * concurrent batches of 25 (bounded in-node `Promise.all` rather than a
 * `Send` map-reduce — keeps email snippets out of every durable checkpoint
 * channel; they live only in node-local scope). The `mergeByEmailId` reducer
 * makes re-runs idempotent (task 2.6). Dependencies are injected so the worker
 * builds provider adapters per job and tests pass fakes.
 */

import { END, START, StateGraph } from '@langchain/langgraph';

import { applyRules } from '../nodes/sorting/apply-rules';
import { classifyBatch } from '../nodes/sorting/classify-sort';
import { fetchUnreadEmails, presortForBriefing } from '../nodes/sorting/fetch-inbox';
import { hydrateContext } from '../nodes/sorting/hydrate-context';
import { commitQueueSideEffects } from '../nodes/sorting/write-queue';
import { InboxState } from '../state/annotations';
import { hydratePreferences } from '../state/user-preferences';

import type { ClassifyContext, ClassifyFn } from '../nodes/sorting/classify-sort';
import type { InboxFetchService } from '../nodes/sorting/fetch-inbox';
import type { HydrateContextDeps } from '../nodes/sorting/hydrate-context';
import type { InboxStateType } from '../state/annotations';
import type { HydratedPreferences, HydrationSources } from '../state/user-preferences';
import type { BaseCheckpointSaver, LangGraphRunnableConfig } from '@langchain/langgraph';
import type { InboxQueueItem } from '@nexus-aec/shared-types';
import type { Redis } from 'ioredis';

const DEFAULT_BATCH_SIZE = 25;

/** Injected services Graph A runs on. */
export interface InboxSortingDeps {
  /** Provider inbox for this user's job (built per job by the worker). */
  inboxService: InboxFetchService;
  /** Structured-output classify call (built from a `ChatOpenAI`). */
  classify: ClassifyFn;
  /** Redis for the priority-counts mirror + queue-updated publish. */
  redis: Redis;
  /** Checkpointer persisting the `inbox:{userId}` thread. */
  checkpointer: BaseCheckpointSaver;
  /** Preference sources for the one-shot `hydrate_prefs` node. */
  preferences?: HydrationSources;
  /** Per-batch sender-insight + knowledge-base context sources. */
  hydrate?: HydrateContextDeps;
  logger?: { warn(msg: string, meta?: Record<string, unknown>): void };
  /** Classification batch size. Default 25. */
  batchSize?: number;
}

/** Per-invocation runtime config, read from `config.configurable`. */
export interface InboxSortConfigurable {
  /** Email IDs to exclude (briefed/actioned in past sessions). */
  excludeEmailIds?: string[];
  /** ISO-8601 window start. Default: 24h ago (in `fetch-inbox`). */
  sinceIso?: string;
  /** Fetch cap. Default 500. */
  maxEmails?: number;
}

/** Graph A checkpoint thread id for a user. */
export function inboxThreadId(userId: string): string {
  return `inbox:${userId}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function readConfig(config: LangGraphRunnableConfig): InboxSortConfigurable {
  const c: Record<string, unknown> = config.configurable ?? {};
  const excludeRaw = c['excludeEmailIds'];
  const sinceRaw = c['sinceIso'];
  const maxRaw = c['maxEmails'];
  return {
    ...(Array.isArray(excludeRaw) ? { excludeEmailIds: excludeRaw as string[] } : {}),
    ...(typeof sinceRaw === 'string' ? { sinceIso: sinceRaw } : {}),
    ...(typeof maxRaw === 'number' ? { maxEmails: maxRaw } : {}),
  };
}

/** Compile Graph A with its injected dependencies. */
export function createInboxSortingGraph(deps: InboxSortingDeps) {
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;

  async function sortOneBatch(
    userId: string,
    batch: Parameters<typeof classifyBatch>[0],
    prefs: HydratedPreferences
  ): Promise<InboxQueueItem[]> {
    const ctx = await hydrateContext(userId, batch, deps.hydrate ?? {});
    const classifyContext: ClassifyContext = {
      senderPreferences: ctx.senderPreferences,
      knowledgeEntries: prefs.knowledge,
      knowledgeSnippets: ctx.knowledgeSnippets,
      evidenceByEmail: ctx.evidenceByEmail,
    };
    return classifyBatch(batch, prefs.vips, classifyContext, deps.classify);
  }

  const hydratePrefsNode = async (state: InboxStateType): Promise<Partial<InboxStateType>> => {
    const user_preferences = await hydratePreferences(state.userId, deps.preferences ?? {});
    return { user_preferences };
  };

  const buildQueueNode = async (
    state: InboxStateType,
    config: LangGraphRunnableConfig
  ): Promise<Partial<InboxStateType>> => {
    const cfg = readConfig(config);
    const prefs = state.user_preferences;

    const emails = await fetchUnreadEmails(deps.inboxService, {
      ...(cfg.sinceIso ? { since: new Date(cfg.sinceIso) } : {}),
      ...(cfg.maxEmails ? { maxEmails: cfg.maxEmails } : {}),
    });

    const filtered = applyRules(emails, {
      ...(cfg.excludeEmailIds ? { excludeEmailIds: new Set(cfg.excludeEmailIds) } : {}),
      mutedSenders: prefs.mutedSenders,
      knowledgeEntries: prefs.knowledge,
    });

    const sorted = presortForBriefing(filtered, prefs.vips);
    if (sorted.length === 0) {
      return { inbox_queue: [] };
    }

    const perBatch = await Promise.all(
      chunk(sorted, batchSize).map((batch) => sortOneBatch(state.userId, batch, prefs))
    );
    return { inbox_queue: perBatch.flat() };
  };

  const writeQueueNode = async (state: InboxStateType): Promise<Partial<InboxStateType>> => {
    await commitQueueSideEffects(deps.redis, state.userId, state.inbox_queue, deps.logger);
    return {};
  };

  return new StateGraph(InboxState)
    .addNode('hydrate_prefs', hydratePrefsNode)
    .addNode('build_queue', buildQueueNode)
    .addNode('write_queue', writeQueueNode)
    .addEdge(START, 'hydrate_prefs')
    .addEdge('hydrate_prefs', 'build_queue')
    .addEdge('build_queue', 'write_queue')
    .addEdge('write_queue', END)
    .compile({ checkpointer: deps.checkpointer });
}
