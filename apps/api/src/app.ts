import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastify, { type FastifyInstance } from 'fastify';

import { getRedisClient } from './lib/redis';
import { registerAuthMiddleware } from './middleware/auth';
import { registerRoutes } from './routes';

export interface CreateAppOptions {
  /**
   * Enable Fastify logger.
   * Note: we will replace this with @nexus-aec/logger wiring once routes expand.
   */
  logger?: boolean;
  /** Disable auth middleware (useful for tests) */
  disableAuth?: boolean;
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: options.logger ?? false,
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // API-only, no HTML served
  });

  // CORS
  const isProduction = process.env['NODE_ENV'] === 'production';
  await app.register(cors, {
    origin: isProduction
      ? [process.env['API_BASE_URL'] ?? 'https://api.nexusaec.com', /\.nexusaec\.com$/]
      : true, // Allow all origins in dev
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Rate limiting
  const redis = getRedisClient();
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    ...(redis ? { redis } : {}),
  });

  // JWT auth middleware
  if (!options.disableAuth) {
    registerAuthMiddleware(app, {
      excludePaths: ['/health', '/live', '/ready', '/auth/', '/webhooks/'],
    });
  }

  await registerRoutes(app);

  return app;
}
