/**
 * @nexus-aec/api - Webhook Routes
 *
 * Handles incoming webhooks from external services like LiveKit.
 */

import { createLogger } from '@nexus-aec/logger';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const logger = createLogger({ baseContext: { component: 'webhook-routes' } });

// =============================================================================
// Types
// =============================================================================

/**
 * LiveKit webhook event types
 */
type LiveKitEventType =
  | 'room_started'
  | 'room_finished'
  | 'participant_joined'
  | 'participant_left'
  | 'track_published'
  | 'track_unpublished'
  | 'egress_started'
  | 'egress_ended'
  | 'ingress_started'
  | 'ingress_ended';

/**
 * LiveKit participant info
 */
interface LiveKitParticipant {
  sid: string;
  identity: string;
  name?: string;
  metadata?: string;
  joinedAt?: number;
  state?: number;
}

/**
 * LiveKit room info
 */
interface LiveKitRoom {
  sid: string;
  name: string;
  emptyTimeout?: number;
  maxParticipants?: number;
  creationTime?: number;
  numParticipants?: number;
  numPublishers?: number;
}

/**
 * LiveKit track info
 */
interface LiveKitTrack {
  sid: string;
  type: 'AUDIO' | 'VIDEO' | 'DATA';
  source: 'CAMERA' | 'MICROPHONE' | 'SCREEN_SHARE' | 'UNKNOWN';
  name?: string;
  muted?: boolean;
}

/**
 * LiveKit webhook payload
 */
interface LiveKitWebhookPayload {
  event: LiveKitEventType;
  room?: LiveKitRoom;
  participant?: LiveKitParticipant;
  track?: LiveKitTrack;
  id?: string;
  createdAt?: number;
  numDropped?: number;
}

/**
 * Webhook response
 */
interface WebhookResponse {
  received: true;
  event: string;
  timestamp: string;
}

/**
 * Webhook error response
 */
interface WebhookErrorResponse {
  received: false;
  error: string;
  code: string;
}

// =============================================================================
// Analytics Storage (In-memory for now)
// =============================================================================

interface RoomSession {
  roomSid: string;
  roomName: string;
  startedAt: string;
  endedAt?: string;
  participants: string[];
  events: Array<{
    type: LiveKitEventType;
    timestamp: string;
    data?: Record<string, unknown>;
  }>;
}

const roomSessions = new Map<string, RoomSession>();

// =============================================================================
// Webhook Verification
// =============================================================================

/**
 * Verify LiveKit webhook signature
 * Note: In production, use proper HMAC verification with the API secret
 */
async function verifyLiveKitWebhook(
  _request: FastifyRequest,
  _apiSecret: string
): Promise<boolean> {
  // TODO: Implement proper HMAC verification
  // The Authorization header contains a JWT signed with the API secret
  // For now, we skip verification in development
  return true;
}

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * Register webhook routes
 */
export function registerWebhookRoutes(app: FastifyInstance): void {
  /**
   * LiveKit webhook endpoint
   * POST /webhooks/livekit
   */
  app.post<{ Body: LiveKitWebhookPayload }>(
    '/webhooks/livekit',
    async (request: FastifyRequest<{ Body: LiveKitWebhookPayload }>, reply: FastifyReply) => {
      const apiSecret = process.env['LIVEKIT_API_SECRET'] ?? '';

      // Verify webhook signature in production
      if (process.env['NODE_ENV'] === 'production') {
        const isValid = await verifyLiveKitWebhook(request, apiSecret);
        if (!isValid) {
          logger.warn('Invalid webhook signature', {});
          return reply.status(401).send({
            received: false,
            error: 'Invalid webhook signature',
            code: 'INVALID_SIGNATURE',
          } satisfies WebhookErrorResponse);
        }
      }

      const payload = request.body;
      const timestamp = new Date().toISOString();

      logger.info('LiveKit webhook received', {
        event: payload.event,
        roomSid: payload.room?.sid,
        roomName: payload.room?.name,
        participantIdentity: payload.participant?.identity,
      });

      // Process the event
      try {
        await processLiveKitEvent(payload, timestamp);

        return reply.send({
          received: true,
          event: payload.event,
          timestamp,
        } satisfies WebhookResponse);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Webhook processing failed', null, { errorMessage: message });

        return reply.status(500).send({
          received: false,
          error: message,
          code: 'PROCESSING_FAILED',
        } satisfies WebhookErrorResponse);
      }
    }
  );

  /**
   * Get room session analytics
   * GET /webhooks/livekit/sessions
   */
  app.get<{ Querystring: { limit?: string } }>(
    '/webhooks/livekit/sessions',
    async (request, reply) => {
      const limit = parseInt(request.query.limit ?? '50', 10);

      const sessions = Array.from(roomSessions.values())
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, limit);

      return reply.send({
        success: true,
        data: sessions,
        total: roomSessions.size,
      });
    }
  );

  /**
   * Get session by room SID
   * GET /webhooks/livekit/sessions/:roomSid
   */
  app.get<{ Params: { roomSid: string } }>(
    '/webhooks/livekit/sessions/:roomSid',
    async (request, reply) => {
      const { roomSid } = request.params;
      const session = roomSessions.get(roomSid);

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found',
        });
      }

      return reply.send({
        success: true,
        data: session,
      });
    }
  );
}

// =============================================================================
// Event Processing
// =============================================================================

/**
 * Process a LiveKit webhook event
 */
async function processLiveKitEvent(
  payload: LiveKitWebhookPayload,
  timestamp: string
): Promise<void> {
  const { event, room, participant, track } = payload;

  if (!room) {
    logger.warn('Webhook event without room info', { event });
    return;
  }

  const roomSid = room.sid;

  switch (event) {
    case 'room_started': {
      // Create new session
      roomSessions.set(roomSid, {
        roomSid,
        roomName: room.name,
        startedAt: timestamp,
        participants: [],
        events: [{ type: event, timestamp }],
      });

      logger.info('Room session started', {
        roomSid,
        roomName: room.name,
      });
      break;
    }

    case 'room_finished': {
      // Mark session as ended
      const session = roomSessions.get(roomSid);
      if (session) {
        session.endedAt = timestamp;
        session.events.push({ type: event, timestamp });

        logger.info('Room session finished', {
          roomSid,
          roomName: room.name,
          duration: Date.now() - new Date(session.startedAt).getTime(),
          participantCount: session.participants.length,
        });
      }
      break;
    }

    case 'participant_joined': {
      const session = roomSessions.get(roomSid);
      if (session && participant) {
        if (!session.participants.includes(participant.identity)) {
          session.participants.push(participant.identity);
        }
        session.events.push({
          type: event,
          timestamp,
          data: {
            identity: participant.identity,
            name: participant.name,
          },
        });

        logger.info('Participant joined', {
          roomSid,
          identity: participant.identity,
          name: participant.name,
        });
      }
      break;
    }

    case 'participant_left': {
      const session = roomSessions.get(roomSid);
      if (session && participant) {
        session.events.push({
          type: event,
          timestamp,
          data: { identity: participant.identity },
        });

        logger.info('Participant left', {
          roomSid,
          identity: participant.identity,
        });
      }
      break;
    }

    case 'track_published':
    case 'track_unpublished': {
      const session = roomSessions.get(roomSid);
      if (session && track && participant) {
        session.events.push({
          type: event,
          timestamp,
          data: {
            identity: participant.identity,
            trackType: track.type,
            trackSource: track.source,
          },
        });

        logger.debug('Track event', {
          event,
          roomSid,
          identity: participant.identity,
          trackType: track.type,
        });
      }
      break;
    }

    default: {
      // Log other events but don't process them specifically
      const session = roomSessions.get(roomSid);
      if (session) {
        session.events.push({ type: event, timestamp });
      }
      logger.debug('Unhandled webhook event', { event, roomSid });
    }
  }
}
