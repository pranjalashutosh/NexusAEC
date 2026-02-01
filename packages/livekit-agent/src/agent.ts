/**
 * @nexus-aec/livekit-agent - Voice Agent
 *
 * LiveKit Backend Agent that joins rooms, manages audio tracks,
 * and handles participant lifecycle for voice briefings.
 *
 * Architecture:
 * - Uses LiveKit Agents SDK 1.0.x for room management
 * - Deepgram Nova-2 for speech-to-text (STT)
 * - ElevenLabs Turbo v2.5 for text-to-speech (TTS)
 * - Custom ReasoningLLM wrapping GPT-4o with tool calling
 * - Silero VAD for voice activity detection
 */

import { defineAgent, voice, cli, WorkerOptions } from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as silero from '@livekit/agents-plugin-silero';
import { createLogger } from '@nexus-aec/logger';

import { loadAgentConfig, validateEnvironment, type AgentConfig } from './config.js';
import { runBriefingPipeline } from './briefing-pipeline.js';
import { bootstrapFromMetadata, teardownEmailServices } from './email-bootstrap.js';
import { startHealthServer } from './health.js';
import { ReasoningLLM } from './llm/reasoning-llm.js';
import { removeSession, setSession } from './session-store.js';
import { buildSystemPrompt, DEFAULT_SYSTEM_PROMPT_CONTEXT } from './prompts/system-prompt.js';

import type { BriefingData } from './briefing-pipeline.js';
import type { AgentSession } from './session-store.js';
import type { JobContext, JobProcess } from '@livekit/agents';

const logger = createLogger({ baseContext: { component: 'voice-agent' } });

// =============================================================================
// Types
// =============================================================================

// (No extra types needed - using LiveKit 1.0.x event types)

// =============================================================================
// Agent Implementation
// =============================================================================

/**
 * Create the NexusAEC Voice Agent
 */
export function createVoiceAgent(config: AgentConfig) {
  return defineAgent({
    prewarm: async (proc: JobProcess) => {
      logger.info('Prewarming agent process', { pid: process.pid });

      // Pre-load Silero VAD model for faster cold starts
      proc.userData['vad'] = await silero.VAD.load();

      // Pre-load configuration
      try {
        loadAgentConfig();
        logger.info('Configuration loaded successfully');
      } catch (error) {
        logger.error('Failed to load configuration during prewarm', error instanceof Error ? error : null);
      }
    },

    entry: async (ctx: JobContext) => {
      const roomName = ctx.room.name ?? `room-${Date.now()}`;
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      logger.info('Agent joining room', {
        roomName,
        sessionId,
      });

      // Create session tracking
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

      // Wait for a user to join
      const participant = await ctx.waitForParticipant();
      session.userIdentity = participant.identity;

      logger.info('User joined, starting voice assistant', {
        roomName,
        sessionId,
        userIdentity: participant.identity,
        userName: participant.name,
      });

      // Bootstrap email services from participant metadata
      // The backend API places OAuth tokens in metadata when issuing join tokens
      const emailResult = bootstrapFromMetadata(participant.metadata);
      let briefingData: BriefingData | null = null;

      if (emailResult?.success && emailResult.inboxService) {
        logger.info('Email services available', {
          providers: emailResult.connectedProviders,
          sessionId,
        });

        // Run the briefing pipeline to score and cluster emails
        try {
          briefingData = await runBriefingPipeline(emailResult.inboxService);
          logger.info('Briefing pipeline completed', {
            topicCount: briefingData.topics.length,
            totalEmails: briefingData.totalEmails,
            totalFlagged: briefingData.totalFlagged,
            durationMs: briefingData.pipelineDurationMs,
            sessionId,
          });
        } catch (error) {
          logger.error('Briefing pipeline failed, falling back to defaults', error instanceof Error ? error : null);
        }
      } else {
        logger.warn('Email services unavailable — email tools will not work', {
          sessionId,
          errors: emailResult?.errors,
        });
      }

      // Start the voice assistant pipeline with real or fallback briefing data
      await startVoiceAssistant(ctx, session, config, briefingData);

      // Clean up when the context shuts down
      ctx.addShutdownCallback(async () => {
        teardownEmailServices();
        handleDisconnect(session);
      });
    },
  });
}

/**
 * Start the voice assistant with the full STT → LLM → TTS pipeline.
 *
 * Pipeline:
 *   User speaks → Deepgram STT → ReasoningLLM (GPT-4o + tools) → ElevenLabs TTS → User hears
 */
async function startVoiceAssistant(
  ctx: JobContext,
  session: AgentSession,
  config: AgentConfig,
  briefingData?: BriefingData | null,
): Promise<void> {
  // Use real briefing data when available, fall back to defaults
  const topicItems = briefingData?.topicItems.length
    ? briefingData.topicItems
    : [5, 3, 2];
  const topicLabels = briefingData?.topicLabels ?? ['Inbox', 'VIP', 'Flagged'];

  logger.info('Starting voice assistant pipeline', {
    roomName: session.roomName,
    sessionId: session.sessionId,
    sttModel: config.deepgram.model,
    llmModel: config.openai.model,
    ttsVoice: config.elevenlabs.voiceId,
    briefingTopics: topicLabels,
    briefingItemCounts: topicItems,
  });

  // 1. Create Deepgram STT (Speech-to-Text)
  const sttInstance = new deepgram.STT({
    model: config.deepgram.model as 'nova-2-general',
    language: config.deepgram.language,
    interimResults: config.deepgram.interimResults,
    punctuate: config.deepgram.punctuate,
    smartFormat: config.deepgram.smartFormat,
    keywords: config.deepgram.customVocabulary.map((word) => [word, 1.5] as [string, number]),
  });

  // 2. Create ElevenLabs TTS (Text-to-Speech)
  const ttsInstance = new elevenlabs.TTS({
    voiceId: config.elevenlabs.voiceId,
    model: config.elevenlabs.modelId,
  });

  // 3. Create ReasoningLLM with real topic data from the briefing pipeline
  const reasoningLLM = new ReasoningLLM(config.openai, topicItems, {
    userName: session.userIdentity,
  });

  // 4. Get VAD from prewarm, or load if not available
  const vad = (ctx.proc.userData['vad'] as silero.VAD) ?? await silero.VAD.load();

  // 5. Build the system prompt
  const systemPrompt = buildSystemPrompt({
    ...DEFAULT_SYSTEM_PROMPT_CONTEXT,
    userName: session.userIdentity,
  });

  // 6. Create the voice Agent with instructions
  const agent = new voice.Agent({
    instructions: systemPrompt,
    llm: reasoningLLM,
    stt: sttInstance,
    tts: ttsInstance,
    vad,
    allowInterruptions: true,
  });

  // 7. Create the AgentSession
  const agentSession = new voice.AgentSession({
    stt: sttInstance,
    tts: ttsInstance,
    llm: reasoningLLM,
    vad,
    turnDetection: 'vad',
    voiceOptions: {
      allowInterruptions: true,
      minInterruptionDuration: 0.5,
      minEndpointingDelay: 0.3,
      maxEndpointingDelay: 0.6,
      maxToolSteps: 5,
      preemptiveGeneration: true,
    },
  });

  // 8. Wire barge-in and state tracking via 1.0.x event system
  agentSession.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
    if (ev.newState === 'speaking') {
      session.isSpeaking = false;
      reasoningLLM.handleBargeIn();
      logger.debug('User started speaking (barge-in)', {
        sessionId: session.sessionId,
      });
    }
  });

  agentSession.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
    if (ev.newState === 'speaking') {
      session.isSpeaking = true;
    } else if (ev.oldState === 'speaking') {
      session.isSpeaking = false;
    }
  });

  // 9. Start the voice pipeline
  await agentSession.start({
    agent,
    room: ctx.room,
  });

  logger.info('Voice assistant pipeline started', {
    roomName: session.roomName,
    sessionId: session.sessionId,
  });

  // 10. Generate an initial greeting with real briefing context
  const greetingContext = briefingData && briefingData.totalEmails > 0
    ? `Greet the user and start the briefing. Introduce yourself as their NexusAEC executive assistant. `
      + `You have ${briefingData.totalEmails} new emails across ${briefingData.topics.length} topics. `
      + `${briefingData.totalFlagged} are flagged as important. `
      + `Topics to cover: ${topicLabels.join(', ')}.`
    : 'Greet the user and start the morning briefing. Introduce yourself as their NexusAEC executive assistant.';

  agentSession.generateReply({
    instructions: greetingContext,
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Handle room disconnect / shutdown
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
export async function prewarm(proc: JobProcess): Promise<void> {
  logger.info('Prewarming agent process', {
    pid: process.pid,
  });

  // Pre-load Silero VAD model
  proc.userData['vad'] = await silero.VAD.load();

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
