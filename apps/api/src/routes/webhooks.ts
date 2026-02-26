/**
 * @nexus-aec/api - Webhook Routes
 *
 * Handles incoming webhooks from external services like LiveKit.
 */

import { createLogger } from '@nexus-aec/logger';
import { WebhookReceiver } from 'livekit-server-sdk';

import { getHashAll, getHashField, setHashField } from '../lib/redis-state';

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
// Analytics Storage (Redis-backed)
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

const ROOM_SESSIONS_KEY = 'nexus:room-sessions';
const ROOM_SESSIONS_TTL = 24 * 60 * 60; // 24 hours

// =============================================================================
// Webhook Verification
// =============================================================================

let webhookReceiver: WebhookReceiver | null = null;

/**
 * Get or create the WebhookReceiver singleton
 */
function getWebhookReceiver(): WebhookReceiver | null {
  if (webhookReceiver) {
    return webhookReceiver;
  }

  const apiKey = process.env['LIVEKIT_API_KEY'] ?? '';
  const apiSecret = process.env['LIVEKIT_API_SECRET'] ?? '';

  if (!apiKey || !apiSecret) {
    logger.warn('LiveKit API key/secret not configured — webhook verification disabled');
    return null;
  }

  webhookReceiver = new WebhookReceiver(apiKey, apiSecret);
  return webhookReceiver;
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
  app.addContentTypeParser(
    'application/webhook+json',
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, body);
    }
  );

  app.post<{ Body: string | LiveKitWebhookPayload }>(
    '/webhooks/livekit',
    async (
      request: FastifyRequest<{ Body: string | LiveKitWebhookPayload }>,
      reply: FastifyReply
    ) => {
      // Verify webhook signature
      const receiver = getWebhookReceiver();
      const rawBody =
        typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      const authHeader = request.headers.authorization ?? (request.headers['authorize'] as string);

      if (process.env['NODE_ENV'] === 'production') {
        if (!receiver) {
          logger.error('Webhook receiver not configured', null, {});
          return reply.status(500).send({
            received: false,
            error: 'Webhook verification not configured',
            code: 'NOT_CONFIGURED',
          } satisfies WebhookErrorResponse);
        }

        try {
          await receiver.receive(rawBody, authHeader);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn('Invalid webhook signature', { error: msg });
          return reply.status(401).send({
            received: false,
            error: 'Invalid webhook signature',
            code: 'INVALID_SIGNATURE',
          } satisfies WebhookErrorResponse);
        }
      }

      const payload: LiveKitWebhookPayload =
        typeof request.body === 'string'
          ? (JSON.parse(request.body) as LiveKitWebhookPayload)
          : request.body;
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

      const allSessions = await getHashAll<RoomSession>(ROOM_SESSIONS_KEY);
      const sessions = Object.values(allSessions)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, limit);

      return reply.send({
        success: true,
        data: sessions,
        total: Object.keys(allSessions).length,
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
      const session = await getHashField<RoomSession>(ROOM_SESSIONS_KEY, roomSid);

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

  // Helper to load, modify, and save a session
  const updateSession = async (
    sid: string,
    updater: (session: RoomSession) => void
  ): Promise<void> => {
    const session = await getHashField<RoomSession>(ROOM_SESSIONS_KEY, sid);
    if (session) {
      updater(session);
      await setHashField(ROOM_SESSIONS_KEY, sid, session, ROOM_SESSIONS_TTL);
    }
  };

  switch (event) {
    case 'room_started': {
      const newSession: RoomSession = {
        roomSid,
        roomName: room.name,
        startedAt: timestamp,
        participants: [],
        events: [{ type: event, timestamp }],
      };
      await setHashField(ROOM_SESSIONS_KEY, roomSid, newSession, ROOM_SESSIONS_TTL);

      logger.info('Room session started', {
        roomSid,
        roomName: room.name,
      });
      break;
    }

    case 'room_finished': {
      await updateSession(roomSid, (session) => {
        session.endedAt = timestamp;
        session.events.push({ type: event, timestamp });

        logger.info('Room session finished', {
          roomSid,
          roomName: room.name,
          duration: Date.now() - new Date(session.startedAt).getTime(),
          participantCount: session.participants.length,
        });
      });
      break;
    }

    case 'participant_joined': {
      if (participant) {
        await updateSession(roomSid, (session) => {
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
      if (participant) {
        await updateSession(roomSid, (session) => {
          session.events.push({
            type: event,
            timestamp,
            data: { identity: participant.identity },
          });
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
      if (track && participant) {
        await updateSession(roomSid, (session) => {
          session.events.push({
            type: event,
            timestamp,
            data: {
              identity: participant.identity,
              trackType: track.type,
              trackSource: track.source,
            },
          });
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
      await updateSession(roomSid, (session) => {
        session.events.push({ type: event, timestamp });
      });
      logger.debug('Unhandled webhook event', { event, roomSid });
    }
  }
}
