import fastify, { type FastifyInstance } from 'fastify';

import { registerRoutes } from './routes';

export interface CreateAppOptions {
  /**
   * Enable Fastify logger.
   * Note: we will replace this with @nexus-aec/logger wiring once routes expand.
   */
  logger?: boolean;
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: options.logger ?? false,
  });

  await registerRoutes(app);
  return app;
}

