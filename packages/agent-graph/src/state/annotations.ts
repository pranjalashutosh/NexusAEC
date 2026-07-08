/**
 * LangGraph state schemas (plan §7).
 *
 * `InboxState` — Graph A (`inbox_sorting`): builds the priority-ordered
 * briefing queue on the `inbox:{userId}` thread. The Voice Node is the sole
 * writer of `cursor`.
 *
 * `WorkerState` — Graph B (`react_worker`): the Plan → Act → Observe
 * scratchpad on the `task:{userId}:{taskId}` thread. Extends
 * `MessagesAnnotation` so mid-run email bodies live only in `messages` and
 * expire with the checkpoint TTL (Rule 60, §8).
 */

import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

import { mergeByEmailId } from './inbox-queue';
import { upsertById } from './pending-actions';
import { emptyPreferences, type HydratedPreferences } from './user-preferences';

import type {
  AgentJob,
  AgentJobResult,
  InboxQueueItem,
  PendingAction,
  QueueCursor,
} from '@nexus-aec/shared-types';

/**
 * Per-sender context hydrated by `hydrate_context` and consumed by
 * `classify_sort`. Holds identifiers + knowledge-base snippets only — never
 * email bodies (Rule 60).
 */
export interface SenderContext {
  sender: string;
  /** Engagement summary for this sender (from `SenderProfileStore`). */
  profileSummary?: string;
  /** Knowledge-base doc IDs that matched — identifiers, not content. */
  ragEvidence?: string[];
  /** Retrieved KB snippets used transiently to ground the ranking. */
  ragSnippets?: string[];
}

/** One step of a worker plan: a single tool call with its arguments. */
export interface PlanStep {
  tool: string;
  args: Record<string, unknown>;
  rationale?: string;
}

/** A recorded outcome of one `act` step, appended to the worker scratchpad. */
export interface Observation {
  tool: string;
  ok: boolean;
  summary: string;
  /** ISO-8601 timestamp. */
  at: string;
}

/** The terminal result the worker composes in `respond`. */
export interface WorkerOutcome {
  status: AgentJobResult['status'];
  voiceSummary: string;
  focusEmailId?: string;
  queueDelta?: AgentJobResult['queueDelta'];
}

/** Last-value-wins reducer for channels replaced wholesale each write. */
function replace<T>(_prev: T, next: T): T {
  return next;
}

/** Shallow-merge reducer for the `retrieval_context` record (incoming keys win). */
function mergeSenderContext(
  prev: Record<string, SenderContext>,
  next: Record<string, SenderContext>
): Record<string, SenderContext> {
  return { ...prev, ...next };
}

/** Append reducer for the `observations` scratchpad. */
function appendObservations(prev: Observation[], next: Observation[]): Observation[] {
  return [...prev, ...next];
}

/** A fresh, unlocked cursor (briefing not started). */
function freshCursor(): QueueCursor {
  return { currentEmailId: null, locked: false };
}

export const InboxState = Annotation.Root({
  userId: Annotation<string>,
  inbox_queue: Annotation<InboxQueueItem[]>({
    reducer: mergeByEmailId,
    default: () => [],
  }),
  user_preferences: Annotation<HydratedPreferences>({
    reducer: replace,
    default: () => emptyPreferences(''),
  }),
  retrieval_context: Annotation<Record<string, SenderContext>>({
    reducer: mergeSenderContext,
    default: () => ({}),
  }),
  cursor: Annotation<QueueCursor>({
    reducer: replace,
    default: freshCursor,
  }),
});

export const WorkerState = Annotation.Root({
  ...MessagesAnnotation.spec,
  task: Annotation<AgentJob>,
  plan: Annotation<PlanStep[]>({
    reducer: replace,
    default: () => [],
  }),
  pending_actions: Annotation<PendingAction[]>({
    reducer: upsertById,
    default: () => [],
  }),
  observations: Annotation<Observation[]>({
    reducer: appendObservations,
    default: () => [],
  }),
  outcome: Annotation<WorkerOutcome | undefined>({
    reducer: replace,
    default: () => undefined,
  }),
});

/** Concrete state types inferred from the annotations. */
export type InboxStateType = typeof InboxState.State;
export type WorkerStateType = typeof WorkerState.State;
