/**
 * Redis job bus (plan §9).
 *
 * Jobs → a **Redis Stream** (`nexus:jobs:worker`) consumed by an
 * `apps/worker` consumer group. Streams give at-least-once delivery that
 * survives a voice-session hangup (D2) and, unlike BullMQ's polling, are cheap
 * on Upstash's per-command billing (§16).
 *
 * Results + approval prompts → **Redis Pub/Sub** on `nexus:results:{userId}`.
 * Fire-and-forget matches D2: if no session is subscribed, the message is
 * dropped and the native inbox state is the record. Approval *resumes* do not
 * ride this path — they resume the parked graph via `Command` on the
 * checkpointed thread (Phase 5).
 */

import type { AgentJob, AgentJobResult, PendingAction } from '@nexus-aec/shared-types';
import type { Redis } from 'ioredis';

/** The worker job stream. */
export const JOBS_STREAM = 'nexus:jobs:worker';
/** The worker consumer group. */
export const WORKER_GROUP = 'nexus:worker-group';

/** Approximate cap on the job stream length (trimmed with `MAXLEN ~`). */
const DEFAULT_JOBS_MAXLEN = 10_000;
/** Field name the job JSON is stored under in a stream entry. */
const DATA_FIELD = 'data';

/** Pub/Sub channel a Voice Node subscribes to for a user's results. */
export function resultChannel(userId: string): string {
  return `nexus:results:${userId}`;
}

// ---------------------------------------------------------------------------
// Approval events (bus wire shapes — Voice Node imports these from agent-graph)
// ---------------------------------------------------------------------------

/** A staged action awaiting the user's spoken yes/no (Graph B → Voice Node). */
export interface ApprovalRequest {
  jobId: string;
  userId: string;
  sessionId?: string;
  /** The worker thread to resume: `task:{userId}:{taskId}`. */
  taskId: string;
  action: PendingAction;
  /** TTS-ready confirmation prompt. */
  prompt: string;
  /** ISO-8601, createdAt + 60s (D4). */
  expiresAt: string;
}

/** The user's decision, carried back to the worker to resume the parked graph. */
export interface ApprovalResponse {
  jobId: string;
  taskId: string;
  approved: boolean;
  reason?: string;
}

/**
 * Graph A → Voice Node signal that the briefing queue changed (a sort batch
 * committed). Carries counts only — no email content. A live session refreshes
 * its view; with no subscriber it is harmlessly dropped (D2).
 */
export interface QueueUpdate {
  userId: string;
  counts: { high: number; medium: number; low: number };
  /** Total items in the queue after this update. */
  total: number;
  /** ISO-8601 timestamp. */
  at: string;
}

/** Discriminated union of everything published on a user's results channel. */
export type ResultChannelMessage =
  | { kind: 'result'; result: AgentJobResult }
  | { kind: 'approval'; approval: ApprovalRequest }
  | { kind: 'queue_updated'; update: QueueUpdate };

// ---------------------------------------------------------------------------
// Producer
// ---------------------------------------------------------------------------

export interface EnqueueOptions {
  /** Approximate stream length cap. Default 10,000. */
  maxLen?: number;
}

/** Enqueue a job onto the worker stream. Returns the stream entry id. */
export async function enqueueJob(
  client: Redis,
  job: AgentJob,
  options: EnqueueOptions = {}
): Promise<string> {
  const maxLen = options.maxLen ?? DEFAULT_JOBS_MAXLEN;
  const id = await client.xadd(
    JOBS_STREAM,
    'MAXLEN',
    '~',
    maxLen,
    '*',
    DATA_FIELD,
    JSON.stringify(job)
  );
  return id ?? '';
}

// ---------------------------------------------------------------------------
// Consumer group
// ---------------------------------------------------------------------------

export interface ConsumerGroupOptions {
  stream?: string;
  group?: string;
  /** Where a freshly-created group starts. Default `0` (drain any backlog). */
  startId?: string;
}

/**
 * Idempotently create the consumer group (with `MKSTREAM`). A pre-existing
 * group (`BUSYGROUP`) is treated as success.
 */
export async function ensureConsumerGroup(
  client: Redis,
  options: ConsumerGroupOptions = {}
): Promise<void> {
  const stream = options.stream ?? JOBS_STREAM;
  const group = options.group ?? WORKER_GROUP;
  const startId = options.startId ?? '0';
  try {
    await client.xgroup('CREATE', stream, group, startId, 'MKSTREAM');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('BUSYGROUP')) {
      throw err;
    }
  }
}

export interface ReadJobsOptions {
  consumer: string;
  stream?: string;
  group?: string;
  /** Max entries per read. Default 1. */
  count?: number;
  /** Block for this many ms waiting for new entries. Default 5000. */
  blockMs?: number;
}

/** A job pulled off the stream, paired with its entry id (needed to ack). */
export interface StreamJob {
  id: string;
  job: AgentJob;
}

/** Extract a field's value from a flat `[k, v, k, v, ...]` stream field array. */
function fieldValue(fields: unknown, key: string): string | undefined {
  if (!Array.isArray(fields)) {
    return undefined;
  }
  for (let i = 0; i + 1 < fields.length; i += 2) {
    if (fields[i] === key) {
      const value = fields[i + 1];
      return typeof value === 'string' ? value : undefined;
    }
  }
  return undefined;
}

/** Parse the nested `XREADGROUP` reply into typed jobs; skips malformed entries. */
export function parseStreamJobs(reply: unknown): StreamJob[] {
  if (!Array.isArray(reply)) {
    return [];
  }
  const jobs: StreamJob[] = [];
  for (const stream of reply) {
    const entries = Array.isArray(stream) ? stream[1] : undefined;
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      if (!Array.isArray(entry)) {
        continue;
      }
      const id = entry[0];
      const data = fieldValue(entry[1], DATA_FIELD);
      if (typeof id !== 'string' || data === undefined) {
        continue;
      }
      try {
        jobs.push({ id, job: JSON.parse(data) as AgentJob });
      } catch {
        // Skip a malformed entry rather than kill the consumer loop.
      }
    }
  }
  return jobs;
}

/** Blocking `XREADGROUP` for never-delivered entries (`>`). */
export async function readJobs(client: Redis, options: ReadJobsOptions): Promise<StreamJob[]> {
  const stream = options.stream ?? JOBS_STREAM;
  const group = options.group ?? WORKER_GROUP;
  const count = options.count ?? 1;
  const blockMs = options.blockMs ?? 5000;
  const reply = await client.xreadgroup(
    'GROUP',
    group,
    options.consumer,
    'COUNT',
    count,
    'BLOCK',
    blockMs,
    'STREAMS',
    stream,
    '>'
  );
  return parseStreamJobs(reply);
}

/** Acknowledge a processed entry so it leaves the group's pending list. */
export async function ackJob(
  client: Redis,
  id: string,
  options: { stream?: string; group?: string } = {}
): Promise<void> {
  const stream = options.stream ?? JOBS_STREAM;
  const group = options.group ?? WORKER_GROUP;
  await client.xack(stream, group, id);
}

// ---------------------------------------------------------------------------
// Results + approval pub/sub
// ---------------------------------------------------------------------------

/** Publish a job result to the user's channel. Returns subscriber count. */
export async function publishResult(client: Redis, result: AgentJobResult): Promise<number> {
  const message: ResultChannelMessage = { kind: 'result', result };
  return client.publish(resultChannel(result.userId), JSON.stringify(message));
}

/** Publish an approval prompt to the user's channel. Returns subscriber count. */
export async function publishApprovalRequest(
  client: Redis,
  approval: ApprovalRequest
): Promise<number> {
  const message: ResultChannelMessage = { kind: 'approval', approval };
  return client.publish(resultChannel(approval.userId), JSON.stringify(message));
}

/** Publish a queue-updated signal to the user's channel. Returns subscriber count. */
export async function publishQueueUpdate(client: Redis, update: QueueUpdate): Promise<number> {
  const message: ResultChannelMessage = { kind: 'queue_updated', update };
  return client.publish(resultChannel(update.userId), JSON.stringify(message));
}

/** Parse a results-channel payload; returns `null` on malformed JSON. */
export function parseResultMessage(payload: string): ResultChannelMessage | null {
  try {
    return JSON.parse(payload) as ResultChannelMessage;
  } catch {
    return null;
  }
}
