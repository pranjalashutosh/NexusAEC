import { registerAuthRoutes } from './auth';
import { registerEmailStatsRoutes } from './email-stats';
import { registerHealthRoutes } from './health';
import { registerKnowledgeUploadRoutes } from './knowledge-upload';
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

  // Email stats for home screen
  registerEmailStatsRoutes(app);

  // Sync routes (drafts, preferences)
  registerSyncRoutes(app);

  // Webhook endpoints (LiveKit events)
  registerWebhookRoutes(app);

  // Knowledge file upload (ingestion into vector store)
  registerKnowledgeUploadRoutes(app);
}

