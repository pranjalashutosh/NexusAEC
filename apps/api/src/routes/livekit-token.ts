/**
 * @nexus-aec/api - LiveKit Token Routes
 *
 * Generates room access tokens for authenticated users to connect to LiveKit rooms.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '@nexus-aec/logger';

const logger = createLogger({ baseContext: { component: 'livekit-token-routes' } });

// =============================================================================
// Types
// =============================================================================

/**
 * Request body for token generation
 */
interface GenerateTokenBody {
  /** User identifier */
  userId: string;
  /** Display name for the participant */
  name?: string;
  /** Room name to join (optional, will generate if not provided) */
  roomName?: string;
  /** Metadata to attach to the participant */
  metadata?: Record<string, string>;
}

/**
 * Response for token generation
 */
interface TokenResponse {
  success: true;
  token: string;
  roomName: string;
  serverUrl: string;
  expiresAt: number;
}

/**
 * Error response
 */
interface TokenErrorResponse {
  success: false;
  error: string;
  code: string;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get LiveKit configuration from environment
 */
function getLiveKitConfig(): {
  apiKey: string;
  apiSecret: string;
  serverUrl: string;
} {
  return {
    apiKey: process.env['LIVEKIT_API_KEY'] ?? '',
    apiSecret: process.env['LIVEKIT_API_SECRET'] ?? '',
    serverUrl: process.env['LIVEKIT_URL'] ?? 'wss://localhost:7880',
  };
}

// =============================================================================
// Token Generation
// =============================================================================

/**
 * Simple base64url encoding for JWT
 */
function base64UrlEncode(str: string): string {
  const base64 = Buffer.from(str).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * HMAC-SHA256 signing for JWT
 */
async function sign(payload: string, secret: string): Promise<string> {
  const crypto = await import('crypto');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');
  return signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a LiveKit access token
 * Note: In production, use @livekit/server-sdk for proper token generation
 */
async function generateAccessToken(options: {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name?: string;
  roomName: string;
  metadata?: string;
  ttlSeconds?: number;
}): Promise<{ token: string; expiresAt: number }> {
  const {
    apiKey,
    apiSecret,
    identity,
    name,
    roomName,
    metadata,
    ttlSeconds = 3600,
  } = options;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds;

  // JWT header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  // JWT payload (LiveKit access token claims)
  const payload = {
    iss: apiKey,
    sub: identity,
    iat: now,
    nbf: now,
    exp: expiresAt,
    name: name ?? identity,
    video: {
      room: roomName,
      roomJoin: true,
      roomCreate: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
    metadata: metadata ?? '',
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Sign
  const signature = await sign(signatureInput, apiSecret);

  // Combine into JWT
  const token = `${encodedHeader}.${encodedPayload}.${signature}`;

  return { token, expiresAt };
}

/**
 * Generate a unique room name for a user session
 */
function generateRoomName(userId: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `briefing-${userId.substring(0, 8)}-${timestamp}-${random}`;
}

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * Register LiveKit token routes
 */
export function registerLiveKitTokenRoutes(app: FastifyInstance): void {
  /**
   * Generate a LiveKit room access token
   * POST /livekit/token
   */
  app.post<{ Body: GenerateTokenBody }>(
    '/livekit/token',
    async (
      request: FastifyRequest<{ Body: GenerateTokenBody }>,
      reply: FastifyReply
    ) => {
      const config = getLiveKitConfig();

      // Validate configuration
      if (!config.apiKey || !config.apiSecret) {
        logger.error('LiveKit not configured', null, {});
        return reply.status(500).send({
          success: false,
          error: 'LiveKit not configured',
          code: 'LIVEKIT_NOT_CONFIGURED',
        } satisfies TokenErrorResponse);
      }

      const { userId, name, roomName, metadata } = request.body;

      // Validate required fields
      if (!userId) {
        return reply.status(400).send({
          success: false,
          error: 'userId is required',
          code: 'MISSING_USER_ID',
        } satisfies TokenErrorResponse);
      }

      try {
        // Generate or use provided room name
        const room = roomName ?? generateRoomName(userId);

        // Build options with only defined properties
        const tokenOptions: Parameters<typeof generateAccessToken>[0] = {
          apiKey: config.apiKey,
          apiSecret: config.apiSecret,
          identity: userId,
          roomName: room,
          ttlSeconds: 3600, // 1 hour
        };
        if (name) {
          tokenOptions.name = name;
        }
        if (metadata) {
          tokenOptions.metadata = JSON.stringify(metadata);
        }

        // Generate the access token
        const { token, expiresAt } = await generateAccessToken(tokenOptions);

        logger.info('LiveKit token generated', {
          userId,
          roomName: room,
          expiresAt,
        });

        return reply.send({
          success: true,
          token,
          roomName: room,
          serverUrl: config.serverUrl,
          expiresAt,
        } satisfies TokenResponse);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Token generation failed', null, { errorMessage: message });

        return reply.status(500).send({
          success: false,
          error: `Token generation failed: ${message}`,
          code: 'TOKEN_GENERATION_FAILED',
        } satisfies TokenErrorResponse);
      }
    }
  );

  /**
   * Get LiveKit token (GET alternative for simpler clients)
   * GET /livekit/token?userId=xxx&roomName=xxx
   */
  app.get<{ Querystring: { userId?: string; roomName?: string; name?: string } }>(
    '/livekit/token',
    async (request, reply) => {
      const config = getLiveKitConfig();

      if (!config.apiKey || !config.apiSecret) {
        return reply.status(500).send({
          success: false,
          error: 'LiveKit not configured',
          code: 'LIVEKIT_NOT_CONFIGURED',
        } satisfies TokenErrorResponse);
      }

      const { userId, roomName, name } = request.query;

      if (!userId) {
        return reply.status(400).send({
          success: false,
          error: 'userId query parameter is required',
          code: 'MISSING_USER_ID',
        } satisfies TokenErrorResponse);
      }

      try {
        const room = roomName ?? generateRoomName(userId);

        // Build options with only defined properties
        const tokenOptions: Parameters<typeof generateAccessToken>[0] = {
          apiKey: config.apiKey,
          apiSecret: config.apiSecret,
          identity: userId,
          roomName: room,
          ttlSeconds: 3600,
        };
        if (name) {
          tokenOptions.name = name;
        }

        const { token, expiresAt } = await generateAccessToken(tokenOptions);

        logger.info('LiveKit token generated (GET)', {
          userId,
          roomName: room,
        });

        return reply.send({
          success: true,
          token,
          roomName: room,
          serverUrl: config.serverUrl,
          expiresAt,
        } satisfies TokenResponse);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Token generation failed', null, { errorMessage: message });

        return reply.status(500).send({
          success: false,
          error: `Token generation failed: ${message}`,
          code: 'TOKEN_GENERATION_FAILED',
        } satisfies TokenErrorResponse);
      }
    }
  );
}
