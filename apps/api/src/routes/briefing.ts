/**
 * @nexus-aec/api - Briefing Routes
 *
 * API routes for briefing pre-computation:
 *   POST /briefing/precompute  — triggers background computation
 *   GET  /briefing/status/:userId — returns { ready, emailCount }
 */

import { createLogger } from '@nexus-aec/logger';

import { getPrebriefingStatus, storePrebriefing } from '../services/briefing-precompute';

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const logger = createLogger({ baseContext: { component: 'briefing-routes' } });

// =============================================================================
// Route Registration
// =============================================================================

export function registerBriefingRoutes(app: FastifyInstance): void {
  /**
   * POST /briefing/precompute
   *
   * Triggers background briefing pre-computation.
   * The mobile app calls this when it opens, before the user joins a LiveKit room.
   *
   * Body: { userId: string }
   * Response: { accepted: boolean }
   */
  app.post(
    '/briefing/precompute',
    async (request: FastifyRequest<{ Body: { userId: string } }>, reply: FastifyReply) => {
      const { userId } = request.body;

      if (!userId) {
        return reply.status(400).send({ error: 'userId is required' });
      }

      logger.info('Pre-compute request received', { userId });

      // Store a placeholder to indicate computation is in progress.
      // The actual computation would be triggered by the email services
      // which are not available in the API layer directly.
      // For now, this endpoint signals intent and the agent picks it up.
      await storePrebriefing(userId, {
        briefingJson: '{}',
        remainingBatchesJson: '[]',
        computedAt: new Date().toISOString(),
        emailCount: 0,
      });

      return reply.send({ accepted: true });
    }
  );

  /**
   * GET /briefing/status/:userId
   *
   * Returns pre-computation status.
   * The mobile app polls this to know when to join the LiveKit room.
   *
   * Response: { ready: boolean, emailCount: number }
   */
  app.get(
    '/briefing/status/:userId',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const { userId } = request.params;

      if (!userId) {
        return reply.status(400).send({ error: 'userId is required' });
      }

      const status = await getPrebriefingStatus(userId);

      return reply.send(status);
    }
  );
}
