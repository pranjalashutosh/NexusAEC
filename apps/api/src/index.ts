import { createLogger } from '@nexus-aec/logger';

import { createApp } from './app';

async function main(): Promise<void> {
  const logger = createLogger({ baseContext: { component: 'api' } });
  const app = await createApp({ logger: false });

  const port = Number(process.env['PORT'] ?? 3000);
  const host = process.env['HOST'] ?? '0.0.0.0';

  await app.listen({ port, host });
  logger.info('API server started', { port, host });
}

main().catch((error: unknown) => {
  const logger = createLogger({ baseContext: { component: 'api' } });
  const err = error instanceof Error ? error : new Error(String(error));
  logger.fatal('API server failed to start', err);
  process.exit(1);
});

