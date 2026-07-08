/**
 * Worker entrypoint — the second container on the agent host.
 *
 * Wires the job bus consumer loop to the graph handlers, then runs until a
 * SIGTERM/SIGINT drains it. Phase 2 handles `inbox_sort` (Graph A); `react_task`
 * (Graph B) arrives in Phase 4.
 */

import 'dotenv/config';

import { ensureConsumerGroup } from '@nexus-aec/agent-graph';
import { createLogger } from '@nexus-aec/logger';
import { Redis } from 'ioredis';

import { runConsumerLoop } from './consumer';
import { createJobDispatcher } from './dispatcher';
import { createGraphDepsBuilder } from './graph-deps';
import { createInboxSortHandler } from './handlers/inbox-sort';
import { createCredentialResolver } from './token-provider';

const logger = createLogger({ baseContext: { component: 'worker-main' } });

async function main(): Promise<void> {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const openaiApiKey = process.env['OPENAI_API_KEY'];
  if (!openaiApiKey) {
    logger.error('OPENAI_API_KEY is required for the worker');
    process.exit(1);
  }
  const encryptionPassword = process.env['TOKEN_ENCRYPTION_KEY'] ?? process.env['JWT_SECRET'] ?? '';
  const consumerName = process.env['WORKER_CONSUMER_NAME'] ?? `worker-${process.pid}`;

  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection', reason instanceof Error ? reason : null, {
      reason: String(reason),
    });
  });
  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', err);
  });

  await ensureConsumerGroup(redis);

  const buildGraphDeps = createGraphDepsBuilder({
    redis,
    redisUrl,
    openaiApiKey,
    resolveCredentials: createCredentialResolver({ redis, encryptionPassword, logger }),
    logger,
  });

  const dispatch = createJobDispatcher({
    inboxSort: createInboxSortHandler({ buildGraphDeps, logger }),
    logger,
  });

  let stopping = false;
  const shutdown = (signal: string): void => {
    logger.info(`worker: received ${signal}, draining`);
    stopping = true;
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('worker: started', { consumerName, redisUrl });
  await runConsumerLoop({
    redis,
    consumer: consumerName,
    handle: dispatch,
    stopped: () => stopping,
    logger,
  });

  await redis.quit();
  logger.info('worker: stopped');
}

void main();
