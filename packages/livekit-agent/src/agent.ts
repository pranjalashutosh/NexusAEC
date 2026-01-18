/**
 * @nexus-aec/livekit-agent - Voice Agent
 *
 * LiveKit Backend Agent that joins rooms, manages audio tracks,
 * and handles participant lifecycle for voice briefings.
 *
 * Architecture:
 * - Uses LiveKit Agents SDK for room management
 * - Handles participant joined/left events
 * - Manages audio track subscriptions
 * - Coordinates with STT/TTS plugins (configured separately)
 */

import { defineAgent, JobContext, WorkerOptions, cli } from '@livekit/agents';
import { TrackKind } from '@livekit/rtc-node';
import { createLogger } from '@nexus-aec/logger';

import { loadAgentConfig, validateEnvironment, type AgentConfig } from './config.js';
import { startHealthServer } from './health.js';
import { removeSession, setSession } from './session-store.js';

import type { AgentSession } from './session-store.js';
import type { JobProcess } from '@livekit/agents';

const logger = createLogger({ baseContext: { component: 'voice-agent' } });

// =============================================================================
// Types
// =============================================================================

/**
 * Participant info for logging
 */
interface ParticipantInfo {
  identity: string;
  name?: string;
  metadata?: string;
}

// =============================================================================
// Agent State
// =============================================================================

// =============================================================================
// Agent Implementation
// =============================================================================

/**
 * Create the NexusAEC Voice Agent
 */
export function createVoiceAgent(config: AgentConfig) {
  return defineAgent({
    entry: async (ctx: JobContext) => {
      const roomName = ctx.room.name ?? `room-${Date.now()}`;
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      logger.info('Agent joining room', {
        roomName,
        sessionId,
      });

      // Create session
      const session: AgentSession = {
        sessionId,
        roomName,
        userIdentity: '',
        startedAt: new Date(),
        isSpeaking: false,
        isActive: true,
      };
      setSession(session);

      // Connect to the room
      await ctx.connect();

      logger.info('Agent connected to room', {
        roomName,
        sessionId,
        participantCount: ctx.room.remoteParticipants.size,
      });

      // Set up participant event handlers
      setupParticipantHandlers(ctx, session);

      // Wait for a user participant to join
      const userParticipant = await waitForUserParticipant(ctx);

      if (userParticipant) {
        session.userIdentity = userParticipant.identity;

        logger.info('User joined, starting briefing session', {
          roomName,
          sessionId,
          userIdentity: userParticipant.identity,
          userName: userParticipant.name,
        });

        // Start the voice assistant
        await startVoiceAssistant(ctx, session, config);
      }

      // Clean up when room closes
      ctx.room.on('disconnected', () => {
        handleDisconnect(session);
      });
    },
  });
}

/**
 * Set up participant event handlers
 */
function setupParticipantHandlers(ctx: JobContext, session: AgentSession): void {
  const room = ctx.room;

  // Handle participant connected
  room.on('participantConnected', (participant) => {
    const info = extractParticipantInfo(participant);
    logger.info('Participant connected', {
      roomName: session.roomName,
      sessionId: session.sessionId,
      ...info,
    });
  });

  // Handle participant disconnected
  room.on('participantDisconnected', (participant) => {
    const info = extractParticipantInfo(participant);
    logger.info('Participant disconnected', {
      roomName: session.roomName,
      sessionId: session.sessionId,
      ...info,
    });

    // If the user disconnected, end the session
    if (participant.identity === session.userIdentity) {
      logger.info('User left, ending session', {
        roomName: session.roomName,
        sessionId: session.sessionId,
      });
      session.isActive = false;
    }
  });

  // Handle track subscribed (audio from user)
  room.on('trackSubscribed', (track, publication, participant) => {
    const trackKind = track.kind as TrackKind;
    if (trackKind === TrackKind.KIND_AUDIO) {
      logger.info('Subscribed to audio track', {
        roomName: session.roomName,
        sessionId: session.sessionId,
        participantIdentity: participant.identity,
        trackSid: publication.sid,
      });
    }
  });

  // Handle track unsubscribed
  room.on('trackUnsubscribed', (track, publication, participant) => {
    const trackKind = track.kind as TrackKind;
    if (trackKind === TrackKind.KIND_AUDIO) {
      logger.info('Unsubscribed from audio track', {
        roomName: session.roomName,
        sessionId: session.sessionId,
        participantIdentity: participant.identity,
        trackSid: publication.sid,
      });
    }
  });
}

/**
 * Wait for a non-agent participant to join the room
 */
async function waitForUserParticipant(
  ctx: JobContext,
  timeoutMs: number = 60000
): Promise<ParticipantInfo | null> {
  const room = ctx.room;

  // Check if there's already a user participant
  for (const [, participant] of room.remoteParticipants) {
    if (!isAgentParticipant(participant.identity)) {
      return extractParticipantInfo(participant);
    }
  }

  // Wait for a user to join
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn('Timeout waiting for user participant', {
        roomName: room.name,
        timeoutMs,
      });
      resolve(null);
    }, timeoutMs);

    room.on('participantConnected', (participant) => {
      if (!isAgentParticipant(participant.identity)) {
        clearTimeout(timeout);
        resolve(extractParticipantInfo(participant));
      }
    });
  });
}

/**
 * Check if a participant identity belongs to an agent
 */
function isAgentParticipant(identity: string): boolean {
  return identity.startsWith('agent-') || identity === 'agent';
}

/**
 * Extract participant info for logging (no PII in logs)
 */
function extractParticipantInfo(participant: {
  identity: string;
  name?: string;
  metadata?: string;
}): ParticipantInfo {
  const info: ParticipantInfo = {
    identity: participant.identity,
  };
  if (participant.name !== undefined) {
    info.name = participant.name;
  }
  if (participant.metadata !== undefined) {
    info.metadata = participant.metadata;
  }
  return info;
}

/**
 * Start the voice assistant for a session
 * This will be expanded in later tasks to include the full reasoning loop
 */
async function startVoiceAssistant(
  _ctx: JobContext,
  session: AgentSession,
  config: AgentConfig
): Promise<void> {
  logger.info('Starting voice assistant', {
    roomName: session.roomName,
    sessionId: session.sessionId,
    userIdentity: session.userIdentity,
  });

  // The full voice assistant implementation will be added in tasks 4.8-4.24
  // For now, we just log that the assistant is ready

  // Create a placeholder for the assistant pipeline
  // This will be replaced with the actual STT → GPT-4o → TTS pipeline
  
  logger.info('Voice assistant ready', {
    roomName: session.roomName,
    sessionId: session.sessionId,
    openaiModel: config.openai.model,
    deepgramModel: config.deepgram.model,
    elevenlabsVoice: config.elevenlabs.voiceId,
  });

  // Keep the agent running while the session is active
  while (session.isActive) {
    await sleep(1000);
  }

  logger.info('Voice assistant session ended', {
    roomName: session.roomName,
    sessionId: session.sessionId,
    durationMs: Date.now() - session.startedAt.getTime(),
  });
}

/**
 * Handle room disconnect
 */
function handleDisconnect(session: AgentSession): void {
  logger.info('Agent disconnected from room', {
    roomName: session.roomName,
    sessionId: session.sessionId,
    durationMs: Date.now() - session.startedAt.getTime(),
  });

  session.isActive = false;
  removeSession(session.roomName);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Agent Startup
// =============================================================================

/**
 * Create the agent and return it
 * This can be used for testing or programmatic access
 */
export function getAgent() {
  const config = loadAgentConfig();
  return createVoiceAgent(config);
}

/**
 * Start the agent worker using the LiveKit CLI
 * 
 * Usage: 
 * $ npx livekit-agents start dist/agent.js
 * 
 * Or use the npm script:
 * $ pnpm --filter @nexus-aec/livekit-agent start:dev
 */
export async function startAgent(): Promise<void> {
  // Validate environment
  const missingVars = validateEnvironment();
  if (missingVars.length > 0) {
    logger.error('Missing required environment variables', null, {
      missing: missingVars,
    });
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  logger.info('Starting NexusAEC Voice Agent', {
    nodeVersion: process.version,
    platform: process.platform,
  });

  // Start health check server for container orchestration
  const healthPort = parseInt(process.env['PORT'] ?? '8080', 10);
  startHealthServer(healthPort);

  // Create worker options pointing to this agent file
  const workerOptions = new WorkerOptions({
    agent: __filename,
  });

  // Run the agent using the CLI
  cli.runApp(workerOptions);
}

/**
 * Prewarm callback for faster cold starts
 * This is called when the agent process is started but before jobs are assigned
 */
export function prewarm(_proc: JobProcess): void {
  logger.info('Prewarming agent process', {
    pid: process.pid,
  });

  // Pre-load configuration
  try {
    loadAgentConfig();
    logger.info('Configuration loaded successfully');
  } catch (error) {
    logger.error('Failed to load configuration during prewarm', error instanceof Error ? error : null);
  }
}

// =============================================================================
// Default Export for LiveKit CLI
// =============================================================================

/**
 * Default export: Function to get the agent definition
 * The LiveKit CLI can call this to get the agent
 * 
 * Note: This is a function to avoid running loadAgentConfig at import time,
 * which would throw if environment variables are not set.
 */
export default getAgent;
