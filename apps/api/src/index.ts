import { existsSync } from 'fs';
import { resolve } from 'path';

import { createLogger } from '@nexus-aec/logger';
import { config } from 'dotenv';

import { createApp } from './app';

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
}

main().catch((error: unknown) => {
  const logger = createLogger({ baseContext: { component: 'api' } });
  const err = error instanceof Error ? error : new Error(String(error));
  logger.fatal('API server failed to start', err);
  process.exit(1);
});
