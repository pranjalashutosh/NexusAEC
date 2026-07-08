/**
 * Custom LangGraph checkpoint saver over ioredis (plan §8).
 *
 * Prod Redis is Upstash, which does not implement the RediSearch `FT.*`
 * commands the official `@langchain/langgraph-checkpoint-redis` relies on. This
 * saver needs only plain `GET` / `SET` / `DEL`, all Upstash-safe. Each thread's
 * entire checkpoint history + pending writes is stored as one JSON document at
 * `nexus:graph:{thread_id}` with a rolling 24h TTL (refreshed on every write).
 *
 * PRD Rule 60 (§8): email bodies only ever transit `WorkerState.messages` and
 * expire with this TTL — nothing content-bearing is persisted to Postgres.
 */

import {
  BaseCheckpointSaver,
  WRITES_IDX_MAP,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointPendingWrite,
  type CheckpointTuple,
  type PendingWrite,
} from '@langchain/langgraph-checkpoint';

import type { RunnableConfig } from '@langchain/core/runnables';
import type { Redis } from 'ioredis';

const DEFAULT_KEY_PREFIX = 'nexus:graph:';
const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24h

/** Keys that would traverse the prototype chain if used as object properties. */
const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** A serde-serialized value: `[type, base64(bytes)]` flattened for JSON. */
interface StoredBlob {
  t: string;
  d: string;
}

interface StoredCheckpoint {
  checkpoint: StoredBlob;
  metadata: StoredBlob;
  parentId?: string;
}

/** One thread's full persisted state. */
interface ThreadDoc {
  /** checkpoint_ns → checkpoint_id → stored checkpoint. */
  checkpoints: Record<string, Record<string, StoredCheckpoint>>;
  /** outerWriteKey → innerKey → `[taskId, channel, blob]`. */
  writes: Record<string, Record<string, [string, string, StoredBlob]>>;
}

export interface RedisSaverOptions {
  client: Redis;
  /** Redis key prefix. Default `nexus:graph:`. */
  keyPrefix?: string;
  /** TTL in seconds, refreshed on each write. Default 86400 (24h). */
  ttlSeconds?: number;
}

function assertSafeSegment(field: string, value: string): void {
  if (POLLUTION_KEYS.has(value)) {
    throw new Error(`Unsafe ${field} segment "${value}" (would pollute Object.prototype).`);
  }
}

function encodeBlob([type, bytes]: [string, Uint8Array]): StoredBlob {
  return { t: type, d: Buffer.from(bytes).toString('base64') };
}

function decodeBlob(blob: StoredBlob): [string, Uint8Array] {
  return [blob.t, new Uint8Array(Buffer.from(blob.d, 'base64'))];
}

function outerWriteKey(threadId: string, ns: string, checkpointId: string): string {
  return JSON.stringify([threadId, ns, checkpointId]);
}

function emptyDoc(): ThreadDoc {
  return { checkpoints: {}, writes: {} };
}

export class RedisSaver extends BaseCheckpointSaver {
  private readonly client: Redis;
  private readonly keyPrefix: string;
  private readonly ttlSeconds: number;

  constructor(options: RedisSaverOptions) {
    super();
    this.client = options.client;
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  private key(threadId: string): string {
    return `${this.keyPrefix}${threadId}`;
  }

  private async load(threadId: string): Promise<ThreadDoc | null> {
    const raw = await this.client.get(this.key(threadId));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as ThreadDoc;
    } catch {
      return null;
    }
  }

  private async save(threadId: string, doc: ThreadDoc): Promise<void> {
    await this.client.set(this.key(threadId), JSON.stringify(doc), 'EX', this.ttlSeconds);
  }

  private async readWrites(
    doc: ThreadDoc,
    threadId: string,
    ns: string,
    checkpointId: string
  ): Promise<CheckpointPendingWrite[]> {
    const stored = doc.writes[outerWriteKey(threadId, ns, checkpointId)];
    if (!stored) {
      return [];
    }
    const result: CheckpointPendingWrite[] = [];
    for (const [taskId, channel, blob] of Object.values(stored)) {
      const value = await this.serde.loadsTyped(...decodeBlob(blob));
      result.push([taskId, channel, value]);
    }
    return result;
  }

  private async toTuple(
    doc: ThreadDoc,
    threadId: string,
    ns: string,
    checkpointId: string,
    stored: StoredCheckpoint
  ): Promise<CheckpointTuple> {
    const checkpoint = (await this.serde.loadsTyped(
      ...decodeBlob(stored.checkpoint)
    )) as Checkpoint;
    const metadata = (await this.serde.loadsTyped(
      ...decodeBlob(stored.metadata)
    )) as CheckpointMetadata;
    const tuple: CheckpointTuple = {
      config: {
        configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpointId },
      },
      checkpoint,
      metadata,
      pendingWrites: await this.readWrites(doc, threadId, ns, checkpointId),
    };
    if (stored.parentId !== undefined) {
      tuple.parentConfig = {
        configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: stored.parentId },
      };
    }
    return tuple;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId: string | undefined = config.configurable?.['thread_id'];
    if (threadId === undefined) {
      return undefined;
    }
    const ns: string = config.configurable?.['checkpoint_ns'] ?? '';
    assertSafeSegment('checkpoint_ns', ns);

    const doc = await this.load(threadId);
    const nsCheckpoints = doc?.checkpoints[ns];
    if (!doc || !nsCheckpoints) {
      return undefined;
    }

    let checkpointId: string | undefined = config.configurable?.['checkpoint_id'];
    if (checkpointId === undefined) {
      // uuid6 ids are time-ordered, so lexical desc = newest first.
      checkpointId = Object.keys(nsCheckpoints).sort((a, b) => b.localeCompare(a))[0];
      if (checkpointId === undefined) {
        return undefined;
      }
    }
    assertSafeSegment('checkpoint_id', checkpointId);

    const stored = nsCheckpoints[checkpointId];
    if (!stored) {
      return undefined;
    }
    return this.toTuple(doc, threadId, ns, checkpointId, stored);
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const threadId: string | undefined = config.configurable?.['thread_id'];
    if (threadId === undefined) {
      return;
    }
    const doc = await this.load(threadId);
    if (!doc) {
      return;
    }

    const configNs: string | undefined = config.configurable?.['checkpoint_ns'];
    const beforeId: string | undefined = options?.before?.configurable?.['checkpoint_id'];
    const filter = options?.filter;
    let remaining = options?.limit;

    for (const [ns, checkpoints] of Object.entries(doc.checkpoints)) {
      if (configNs !== undefined && ns !== configNs) {
        continue;
      }
      const ids = Object.keys(checkpoints).sort((a, b) => b.localeCompare(a));
      for (const checkpointId of ids) {
        if (beforeId !== undefined && checkpointId >= beforeId) {
          continue;
        }
        const stored = checkpoints[checkpointId];
        if (!stored) {
          continue;
        }
        const metadata = (await this.serde.loadsTyped(
          ...decodeBlob(stored.metadata)
        )) as CheckpointMetadata;
        if (
          filter &&
          !Object.entries(filter).every(([k, v]) => (metadata as Record<string, unknown>)[k] === v)
        ) {
          continue;
        }
        if (remaining !== undefined) {
          if (remaining <= 0) {
            return;
          }
          remaining -= 1;
        }
        yield this.toTuple(doc, threadId, ns, checkpointId, stored);
      }
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const threadId: string | undefined = config.configurable?.['thread_id'];
    if (threadId === undefined) {
      throw new Error('RedisSaver.put requires a "thread_id" in config.configurable.');
    }
    const ns: string = config.configurable?.['checkpoint_ns'] ?? '';
    assertSafeSegment('checkpoint_ns', ns);
    assertSafeSegment('checkpoint_id', checkpoint.id);

    const doc = (await this.load(threadId)) ?? emptyDoc();
    const parentId: string | undefined = config.configurable?.['checkpoint_id'];
    const nsCheckpoints = doc.checkpoints[ns] ?? {};
    nsCheckpoints[checkpoint.id] = {
      checkpoint: encodeBlob(await this.serde.dumpsTyped(checkpoint)),
      metadata: encodeBlob(await this.serde.dumpsTyped(metadata)),
      ...(parentId !== undefined ? { parentId } : {}),
    };
    doc.checkpoints[ns] = nsCheckpoints;
    await this.save(threadId, doc);

    return {
      configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpoint.id },
    };
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId: string | undefined = config.configurable?.['thread_id'];
    const checkpointId: string | undefined = config.configurable?.['checkpoint_id'];
    if (threadId === undefined) {
      throw new Error('RedisSaver.putWrites requires a "thread_id" in config.configurable.');
    }
    if (checkpointId === undefined) {
      throw new Error('RedisSaver.putWrites requires a "checkpoint_id" in config.configurable.');
    }
    const ns: string = config.configurable?.['checkpoint_ns'] ?? '';
    assertSafeSegment('checkpoint_ns', ns);
    assertSafeSegment('checkpoint_id', checkpointId);

    const doc = (await this.load(threadId)) ?? emptyDoc();
    const outerKey = outerWriteKey(threadId, ns, checkpointId);
    const bucket = doc.writes[outerKey] ?? {};

    for (let idx = 0; idx < writes.length; idx += 1) {
      const write = writes[idx];
      if (!write) {
        continue;
      }
      const [channel, value] = write;
      const writeIdx = WRITES_IDX_MAP[channel] ?? idx;
      const innerKey = `${taskId},${writeIdx}`;
      // Regular writes (idx >= 0) are idempotent; special writes (negative) overwrite.
      if (writeIdx >= 0 && innerKey in bucket) {
        continue;
      }
      bucket[innerKey] = [taskId, channel, encodeBlob(await this.serde.dumpsTyped(value))];
    }
    doc.writes[outerKey] = bucket;
    await this.save(threadId, doc);
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.client.del(this.key(threadId));
  }
}
