/**
 * @nexus-aec/agent-graph
 *
 * LangGraph graphs, state schemas, Redis checkpointer, and job bus for the
 * NexusAEC voice assistant. Graph A (`inbox_sorting`) builds the RAG-driven
 * briefing queue; Graph B (`react_worker`) runs the Plan → Act → Observe loop.
 *
 * See docs/architecture/langgraph-migration-plan.md.
 */

// State — annotations
export {
  InboxState,
  WorkerState,
  type InboxStateType,
  type WorkerStateType,
  type SenderContext,
  type PlanStep,
  type Observation,
  type WorkerOutcome,
} from './state/annotations';

// State — inbox queue reducer + helpers
export {
  mergeByEmailId,
  sortByPriority,
  priorityRank,
  applyStatusDeltas,
} from './state/inbox-queue';

// State — pending actions reducer + helpers
export {
  upsertById,
  createPendingAction,
  isExpired,
  expiredActions,
  APPROVAL_TTL_MS,
  type NewPendingAction,
} from './state/pending-actions';

// State — user preferences hydration
export {
  hydratePreferences,
  emptyPreferences,
  type HydratedPreferences,
  type HydrationSources,
  type HydrationOptions,
  type PreferencesSource,
  type KnowledgeSource,
  type SenderInsightSource,
} from './state/user-preferences';

// Checkpointing
export { RedisSaver, type RedisSaverOptions } from './checkpoint/redis-saver';

// Job bus
export {
  JOBS_STREAM,
  WORKER_GROUP,
  resultChannel,
  enqueueJob,
  ensureConsumerGroup,
  readJobs,
  ackJob,
  parseStreamJobs,
  publishResult,
  publishApprovalRequest,
  parseResultMessage,
  type EnqueueOptions,
  type ConsumerGroupOptions,
  type ReadJobsOptions,
  type StreamJob,
  type ApprovalRequest,
  type ApprovalResponse,
  type ResultChannelMessage,
} from './bus/jobs';

// LLM factory
export {
  createChatModel,
  DEFAULT_CHAT_MODEL,
  VOICE_CHAT_MODEL,
  type CreateChatModelOptions,
} from './llm';

// Graph A — inbox_sorting
export {
  createInboxSortingGraph,
  inboxThreadId,
  type InboxSortingDeps,
  type InboxSortConfigurable,
} from './graphs/inbox-sorting.graph';

// Graph A — sorting nodes (functions + injected-service interfaces)
export {
  fetchUnreadEmails,
  toEmailMetadata,
  presortForBriefing,
  type InboxFetchService,
  type FetchInboxOptions,
} from './nodes/sorting/fetch-inbox';
export {
  applyRules,
  extractFilterRules,
  type FilterRules,
  type ApplyRulesOptions,
} from './nodes/sorting/apply-rules';
export {
  hydrateContext,
  type HydrateContextDeps,
  type HydrateContextResult,
  type SenderInsightProvider,
  type KnowledgeRetriever,
} from './nodes/sorting/hydrate-context';
export {
  buildClassifyMessages,
  parseClassification,
  classifyBatch,
  createStructuredClassifier,
  ClassificationSchema,
  type ClassifyFn,
  type ClassifyContext,
  type PromptMessage,
  type RawClassification,
} from './nodes/sorting/classify-sort';
export {
  countByPriority,
  commitQueueSideEffects,
  priorityCountsKey,
  PRIORITY_COUNTS_TTL_SECONDS,
  type PriorityCounts,
} from './nodes/sorting/write-queue';

// Bus — queue-updated event (added in Phase 2)
export { publishQueueUpdate, type QueueUpdate } from './bus/jobs';
