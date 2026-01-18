import { registerAuthRoutes } from './auth';
import { registerHealthRoutes } from './health';
import { registerLiveKitTokenRoutes } from './livekit-token';
import { registerSyncRoutes } from './sync';
import { registerWebhookRoutes } from './webhooks';

import type { FastifyInstance } from 'fastify';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check (public)
  registerHealthRoutes(app);

  // Authentication routes (public - handles OAuth flows)
  registerAuthRoutes(app);

  // LiveKit token generation
  registerLiveKitTokenRoutes(app);

  // Sync routes (drafts, preferences)
  registerSyncRoutes(app);

  // Webhook endpoints (LiveKit events)
  registerWebhookRoutes(app);
}

