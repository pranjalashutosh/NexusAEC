import { existsSync } from 'fs';
import { resolve } from 'path';

import { createLogger } from '@nexus-aec/logger';
import { config } from 'dotenv';

import { createApp } from './app';
import { disconnectRedis } from './lib/redis';

// Load .env — check cwd first (monorepo root), then walk up from package dir
const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '..', '.env'),
  resolve(__dirname, '..', '..', '.env'),
  resolve(__dirname, '..', '..', '..', '.env'),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}

async function main(): Promise<void> {
  const logger = createLogger({ baseContext: { component: 'api' } });
  const app = await createApp({ logger: false });

  const port = Number(process.env['PORT'] ?? 3000);
  const host = process.env['HOST'] ?? '0.0.0.0';

  await app.listen({ port, host });
  logger.info('API server started', { port, host });

  // Graceful shutdown: drain HTTP connections, then disconnect Redis
  const shutdown = async (signal: string) => {
    logger.info('Received shutdown signal', { signal });
    try {
      await app.close();
      logger.info('HTTP server closed');
    } catch (err) {
      logger.error('Error closing HTTP server', err instanceof Error ? err : null, {});
    }
    try {
      await disconnectRedis();
      logger.info('Redis disconnected');
    } catch (err) {
      logger.error('Error disconnecting Redis', err instanceof Error ? err : null, {});
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  const logger = createLogger({ baseContext: { component: 'api' } });
  const err = error instanceof Error ? error : new Error(String(error));
  logger.fatal('API server failed to start', err);
  process.exit(1);
});
