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
import {
  SenderProfileStore,
  preprocessBatch,
  type PreprocessedEmail,
  EmailMetadata,
} from '@nexus-aec/intelligence';
import { createLogger } from '@nexus-aec/logger';

import { BriefedEmailStore } from './briefing/briefed-email-store.js';
import { BriefingSessionTracker } from './briefing/briefing-session-tracker.js';
import { runBriefingPipeline } from './briefing-pipeline.js';
import { loadAgentConfig, validateEnvironment, type AgentConfig } from './config.js';
import { bootstrapFromMetadata, teardownEmailServices } from './email-bootstrap.js';
import { startHealthServer } from './health.js';
import { summarizeKnowledge } from './knowledge/summarize-knowledge.js';
import { UserKnowledgeStore } from './knowledge/user-knowledge-store.js';
import { ReasoningLLM } from './llm/reasoning-llm.js';
import { removeSession, setSession } from './session-store.js';
import { initializeFromPreferences } from './tools/email-tools.js';
import { setKnowledgeStore, clearKnowledgeStore } from './tools/knowledge-tools.js';

import type { BriefingData } from './briefing-pipeline.js';
import type { BriefingTopicRef, ReasoningLoop } from './reasoning/reasoning-loop.js';
import type { AgentSession } from './session-store.js';
import type { JobContext, JobProcess } from '@livekit/agents';
import type { UnifiedInboxService } from '@nexus-aec/email-providers';

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
        logger.error(
          'Failed to load configuration during prewarm',
          error instanceof Error ? error : null
        );
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
      if (participant.name) {
        session.displayName = participant.name;
      }

      logger.info('User joined, starting voice assistant', {
        roomName,
        sessionId,
        userIdentity: participant.identity,
        userName: participant.name,
      });

      // Initialize BriefedEmailStore early — needed to filter pipeline input
      let briefedEmailStore: BriefedEmailStore | null = null;
      try {
        briefedEmailStore = new BriefedEmailStore({
          redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        });
        logger.info('BriefedEmailStore initialized', { sessionId });
      } catch (error) {
        logger.warn('Failed to init BriefedEmailStore, continuing without', {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        });
      }

      // Initialize SenderProfileStore for personalization tracking
      let senderProfileStore: SenderProfileStore | null = null;
      try {
        senderProfileStore = new SenderProfileStore({
          redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        });
        logger.info('SenderProfileStore initialized', { sessionId });
      } catch (error) {
        logger.warn('Failed to init SenderProfileStore, continuing without personalization', {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        });
      }

      // Load persistent VIP/mute preferences (needed before pipeline)
      let vipEmails: string[] = [];
      let mutedEmails: Array<{ email: string; expiresAt?: Date | null }> = [];

      try {
        const storagePath = process.env['NEXUS_PREFERENCES_PATH'] ?? '.nexus-data/preferences';
        const encryptionKey = process.env['NEXUS_PREFERENCES_KEY'];

        if (encryptionKey) {
          const { PreferencesStore } = await import('@nexus-aec/intelligence');
          const prefStore = new PreferencesStore({
            storagePath,
            encryptionKey,
          });
          await prefStore.initialize();

          const vips = await prefStore.getVips();
          vipEmails = vips.map((v) => v.identifier);
          const muted = await prefStore.getMutedSenders();
          mutedEmails = muted.map((m) => ({
            email: m.identifier,
            expiresAt: m.expiresAt ?? null,
          }));

          // Pre-populate in-memory VIP/mute lists in email tools
          initializeFromPreferences(vipEmails, mutedEmails);

          logger.info('Loaded user preferences', {
            vipCount: vipEmails.length,
            mutedCount: mutedEmails.length,
            sessionId,
          });
        } else {
          logger.info('No NEXUS_PREFERENCES_KEY set, skipping preferences load', { sessionId });
        }
      } catch (error) {
        logger.warn('Failed to load preferences, continuing without', {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        });
      }

      // Bootstrap email services from participant metadata
      // The backend API places OAuth tokens in metadata when issuing join tokens
      const emailResult = bootstrapFromMetadata(participant.metadata);
      let briefingData: BriefingData | null = null;
      let sessionHistoryId: string | null = null;
      let remainingBatches: EmailMetadata[][] = [];

      if (emailResult?.success && emailResult.inboxService) {
        logger.info('Email services available', {
          providers: emailResult.connectedProviders,
          sessionId,
        });

        // Load previously briefed email IDs to exclude from this session
        let excludeEmailIds: Set<string> | undefined;
        if (briefedEmailStore) {
          try {
            // Wait for Redis to be connected before reading
            await briefedEmailStore.waitForReady();
            excludeEmailIds = await briefedEmailStore.getBriefedIds(participant.identity);
            logger.info('Loaded briefed email history', {
              briefedCount: excludeEmailIds.size,
              userId: participant.identity,
              sessionId,
            });
          } catch (error) {
            logger.warn('Failed to load briefed IDs, proceeding without filter', {
              error: error instanceof Error ? error.message : String(error),
              sessionId,
            });
          }
        }

        // Synthesize learned preferences from past sessions.
        // We pass VIP emails as a proxy; the pipeline will inject them
        // into the LLM prompt along with any cached sender knowledge.
        let senderPreferences: string | undefined;
        if (senderProfileStore) {
          try {
            senderPreferences = await senderProfileStore.synthesizePreferences(
              participant.identity,
              vipEmails
            );
          } catch (error) {
            logger.warn('Failed to synthesize sender preferences', {
              error: error instanceof Error ? error.message : String(error),
              sessionId,
            });
          }
        }

        // Run the briefing pipeline (LLM batched when apiKey available)
        try {
          const pipelineResult = await runBriefingPipeline(emailResult.inboxService, {
            ...(excludeEmailIds ? { excludeEmailIds } : {}),
            ...(vipEmails.length > 0 ? { vipEmails } : {}),
            mutedSenderEmails: mutedEmails.map((m) => m.email),
            apiKey: config.openai.apiKey,
            ...(senderPreferences ? { senderPreferences } : {}),
          });
          briefingData = pipelineResult.briefingData;
          remainingBatches = pipelineResult.remainingBatches;
          logger.info('Briefing pipeline completed', {
            topicCount: briefingData.topics.length,
            totalEmails: briefingData.totalEmails,
            totalFlagged: briefingData.totalFlagged,
            durationMs: briefingData.pipelineDurationMs,
            remainingBatches: remainingBatches.length,
            sessionId,
          });
        } catch (error) {
          logger.error(
            'Briefing pipeline failed, falling back to defaults',
            error instanceof Error ? error : null
          );
        }

        // Capture Gmail historyId for mid-session new-email detection
        try {
          const gmailProvider = emailResult.inboxService.getProvider('GMAIL');
          if (gmailProvider && 'getProfileHistoryId' in gmailProvider) {
            const getHistoryId = gmailProvider as { getProfileHistoryId(): Promise<string> };
            sessionHistoryId = await getHistoryId.getProfileHistoryId();
            logger.info('Captured session historyId for real-time awareness', {
              historyId: sessionHistoryId,
              sessionId,
            });
          }
        } catch (error) {
          logger.warn('Failed to capture historyId, real-time awareness disabled', {
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          });
        }
      } else {
        logger.warn('Email services unavailable — email tools will not work', {
          sessionId,
          errors: emailResult?.errors,
        });
      }

      // Load user's persistent knowledge document
      let knowledgeEntries: string[] = [];
      let knowledgeStore: UserKnowledgeStore | null = null;

      try {
        const storeOpts: ConstructorParameters<typeof UserKnowledgeStore>[0] = {
          redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        };
        const sbUrl = process.env['SUPABASE_URL'];
        const sbKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
        if (sbUrl) {
          storeOpts.supabaseUrl = sbUrl;
        }
        if (sbKey) {
          storeOpts.supabaseKey = sbKey;
        }

        knowledgeStore = new UserKnowledgeStore(storeOpts);

        const userId = participant.identity;
        let knowledgeDoc = await knowledgeStore.get(userId);

        // Summarize if over limit (runs before user hears anything — no latency impact)
        if (knowledgeStore.isOverLimit(knowledgeDoc)) {
          logger.info('Knowledge over limit, summarizing', {
            entryCount: knowledgeDoc.entries.length,
            userId,
            sessionId,
          });
          await summarizeKnowledge(knowledgeStore, knowledgeDoc, config.openai.apiKey);
          knowledgeDoc = await knowledgeStore.get(userId);
        }

        knowledgeEntries = knowledgeDoc.entries.map((e) => `[${e.category}] ${e.content}`);

        // Register the store so knowledge tools can use it
        setKnowledgeStore(knowledgeStore, userId);

        logger.info('User knowledge loaded', {
          entryCount: knowledgeEntries.length,
          userId,
          sessionId,
        });
      } catch (error) {
        logger.warn('Failed to load user knowledge, continuing without', {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        });
      }

      // Start the voice assistant pipeline with real or fallback briefing data
      const inboxService = emailResult?.inboxService ?? null;
      const sessionTracker = await startVoiceAssistant(
        ctx,
        session,
        config,
        briefingData,
        knowledgeEntries,
        briefedEmailStore,
        sessionHistoryId,
        inboxService,
        vipEmails,
        mutedEmails.map((m) => m.email),
        senderProfileStore
      );

      // Process remaining batches in background (if LLM pipeline was used)
      if (remainingBatches.length > 0 && sessionTracker) {
        processRemainingBatches(
          remainingBatches,
          config.openai.apiKey,
          vipEmails,
          sessionTracker,
          null // ReasoningLoop not directly accessible here; alerts via tracker
        ).catch((err) => {
          logger.warn('Background batch processing failed', {
            error: err instanceof Error ? err.message : String(err),
            sessionId,
          });
        });
      }

      // Clean up when the context shuts down
      ctx.addShutdownCallback(async () => {
        // Flush briefing state to Redis as a safety net
        if (sessionTracker) {
          await sessionTracker.flushToStore().catch((err) => {
            logger.warn('Failed to flush briefing state on shutdown', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
        teardownEmailServices();
        clearKnowledgeStore();
        if (knowledgeStore) {
          await knowledgeStore.disconnect();
        }
        if (briefedEmailStore) {
          await briefedEmailStore.disconnect();
        }
        if (senderProfileStore) {
          await senderProfileStore.disconnect();
        }
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
  knowledgeEntries?: string[],
  briefedEmailStore?: BriefedEmailStore | null,
  sessionHistoryId?: string | null,
  inboxService?: UnifiedInboxService | null,
  vipEmails?: string[],
  mutedSenderEmails?: string[],
  senderProfileStore?: SenderProfileStore | null
): Promise<BriefingSessionTracker | undefined> {
  // Use real briefing data when available, fall back to defaults
  const topicItems = briefingData?.topicItems.length ? briefingData.topicItems : [5, 3, 2];
  const topicLabels = briefingData?.topicLabels ?? ['Inbox', 'VIP', 'Flagged'];

  // Build lightweight topic references with email IDs for GPT-4o context.
  // When LLM preprocessing was used, each email has a priority and summary
  // from the BatchResult. We look up by emailId to attach them.
  const preprocessedMap = new Map<
    string,
    { priority: 'high' | 'medium' | 'low'; summary: string }
  >();
  if (briefingData?.topics) {
    for (const topic of briefingData.topics) {
      // The topic.priority from LLM pipeline is the cluster-level priority
      for (const se of topic.emails) {
        const score = briefingData.scoreMap.get(se.email.id);
        if (score && score.reasons.length > 0) {
          const priority: 'high' | 'medium' | 'low' = score.isFlagged
            ? 'high'
            : score.score >= 0.5
              ? 'medium'
              : 'low';
          preprocessedMap.set(se.email.id, {
            priority,
            summary: score.reasons[0]?.description ?? '',
          });
        }
      }
    }
  }

  const topicRefs: BriefingTopicRef[] =
    briefingData?.topics.map((topic) => ({
      label: topic.label,
      emails: topic.emails.map((se) => {
        const preprocessed = preprocessedMap.get(se.email.id);
        return {
          emailId: se.email.id,
          subject: se.email.subject,
          from: se.email.from?.email ?? se.email.from?.name ?? 'unknown',
          threadId: se.email.threadId,
          isFlagged: se.score.isFlagged,
          ...(preprocessed
            ? { priority: preprocessed.priority, summary: preprocessed.summary }
            : {}),
        };
      }),
    })) ?? [];

  logger.info('Starting voice assistant pipeline', {
    roomName: session.roomName,
    sessionId: session.sessionId,
    sttModel: config.deepgram.model,
    llmModel: config.openai.model,
    ttsVoice: config.elevenlabs.voiceId,
    briefingTopics: topicLabels,
    briefingItemCounts: topicItems,
    topicRefsCount: topicRefs.length,
    totalEmailRefs: topicRefs.reduce((sum, t) => sum + t.emails.length, 0),
  });

  // 1. Create Deepgram STT (Speech-to-Text)
  logger.info('[pipeline] Creating Deepgram STT...');
  const sttInstance = new deepgram.STT({
    apiKey: config.deepgram.apiKey,
    model: config.deepgram.model as 'nova-2-general',
    language: config.deepgram.language,
    interimResults: config.deepgram.interimResults,
    punctuate: config.deepgram.punctuate,
    smartFormat: config.deepgram.smartFormat,
    keywords: config.deepgram.customVocabulary.map((word) => [word, 1.5] as [string, number]),
  });
  logger.info('[pipeline] Deepgram STT created');

  // 2. Create ElevenLabs TTS (Text-to-Speech)
  logger.info('[pipeline] Creating ElevenLabs TTS...');
  const ttsInstance = new elevenlabs.TTS({
    apiKey: config.elevenlabs.apiKey,
    voiceId: config.elevenlabs.voiceId,
    model: config.elevenlabs.modelId,
    encoding: config.elevenlabs.outputFormat,
    voiceSettings: {
      stability: config.elevenlabs.voiceSettings.stability,
      similarity_boost: config.elevenlabs.voiceSettings.similarityBoost,
      style: config.elevenlabs.voiceSettings.style,
    },
  });
  logger.info('[pipeline] ElevenLabs TTS created', {
    encoding: config.elevenlabs.outputFormat,
    voiceId: config.elevenlabs.voiceId,
    model: config.elevenlabs.modelId,
  });

  // 3. Create BriefingSessionTracker from topic refs (if we have briefing data)
  let tracker: BriefingSessionTracker | undefined;
  if (topicRefs.length > 0) {
    tracker = new BriefingSessionTracker(
      topicRefs,
      briefedEmailStore ?? undefined,
      session.userIdentity || undefined,
      senderProfileStore ?? undefined
    );
    logger.info('[pipeline] BriefingSessionTracker created', {
      topicCount: topicRefs.length,
      totalEmails: topicRefs.reduce((sum, t) => sum + t.emails.length, 0),
      hasStore: !!briefedEmailStore,
    });
  }

  // 4. Create ReasoningLLM with real topic data, email references, tracker, and knowledge entries
  // Use participant display name (from JWT) instead of identity (numeric OAuth ID)
  const displayName =
    session.displayName && session.displayName !== session.userIdentity
      ? session.displayName
      : undefined;

  logger.info('[pipeline] Creating ReasoningLLM...');
  const reasoningLLM = new ReasoningLLM(
    config.openai,
    topicItems,
    {
      userName: displayName ?? session.userIdentity,
      ...(knowledgeEntries && knowledgeEntries.length > 0 ? { knowledgeEntries } : {}),
      ...(vipEmails && vipEmails.length > 0 ? { vipNames: vipEmails } : {}),
      ...(mutedSenderEmails && mutedSenderEmails.length > 0
        ? { mutedSenders: mutedSenderEmails }
        : {}),
    },
    topicRefs,
    tracker
  );
  logger.info('[pipeline] ReasoningLLM created');

  // 4b. Configure real-time inbox awareness (Gmail History API)
  if (sessionHistoryId && inboxService) {
    reasoningLLM.getReasoningLoop().setInboxAwareness(inboxService, sessionHistoryId);
  }

  // 5. Get VAD from prewarm, or load if not available
  logger.info('[pipeline] Loading VAD model...');
  const vad = (ctx.proc.userData['vad'] as silero.VAD) ?? (await silero.VAD.load());
  logger.info('[pipeline] VAD model loaded');

  // 6. Create the voice Agent
  // Note: ReasoningLLM manages its own system prompt internally, so the
  // instructions here are not sent to GPT-4o. Kept empty intentionally.
  const agent = new voice.Agent({
    instructions: '',
  });

  // 8. Create the AgentSession with the pipeline components
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
      preemptiveGeneration: false,
    },
  });

  // 9. Wire barge-in and state tracking via 1.0.x event system
  agentSession.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
    logger.info('User state changed', {
      sessionId: session.sessionId,
      oldState: ev.oldState,
      newState: ev.newState,
    });
    if (ev.newState === 'speaking') {
      session.isSpeaking = false;
      void reasoningLLM.handleBargeIn();
    }
  });

  agentSession.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
    logger.info('Agent state changed', {
      sessionId: session.sessionId,
      oldState: ev.oldState,
      newState: ev.newState,
    });
    if (ev.newState === 'speaking') {
      session.isSpeaking = true;
    } else if (ev.oldState === 'speaking') {
      session.isSpeaking = false;
    }
  });

  // 9b. Add error, close, and speech creation handlers for debugging
  agentSession.on(voice.AgentSessionEventTypes.Error, (ev) => {
    logger.error('AgentSession error', null, {
      sessionId: session.sessionId,
      error: String(ev),
    });
  });

  agentSession.on(voice.AgentSessionEventTypes.Close, () => {
    logger.info('AgentSession closed', {
      sessionId: session.sessionId,
    });
  });

  agentSession.on(voice.AgentSessionEventTypes.SpeechCreated, (ev) => {
    logger.info('Speech created', {
      sessionId: session.sessionId,
      source: ev.source,
      userInitiated: ev.userInitiated,
      speechId: ev.speechHandle?.id,
    });
  });

  // 10. Start the voice pipeline
  logger.info('Calling agentSession.start()...');
  await agentSession.start({
    agent,
    room: ctx.room,
    outputOptions: {
      audioSampleRate: 22050,
      audioNumChannels: 1,
      audioEnabled: true,
    },
  });

  logger.info('Voice assistant pipeline started', {
    roomName: session.roomName,
    sessionId: session.sessionId,
  });

  // 11. Generate an initial greeting with real briefing context
  let greetingContext: string;
  if (tracker && briefingData && briefingData.totalEmails > 0) {
    const progress = tracker.getProgress();
    greetingContext =
      `Greet the user and start the briefing. Introduce yourself as their NexusAEC executive assistant. ` +
      `You have ${progress.totalEmails} new emails across ${progress.totalTopics} topics. ` +
      `${briefingData.totalFlagged} are flagged as important. ` +
      `Start with the first email shown in your CURRENT BRIEFING POSITION.`;
  } else if (briefingData && briefingData.totalEmails > 0) {
    greetingContext =
      `Greet the user and start the briefing. Introduce yourself as their NexusAEC executive assistant. ` +
      `You have ${briefingData.totalEmails} new emails across ${briefingData.topics.length} topics. ` +
      `${briefingData.totalFlagged} are flagged as important. ` +
      `Topics to cover: ${topicLabels.join(', ')}.`;
  } else {
    greetingContext =
      'Greet the user and start the morning briefing. Introduce yourself as their NexusAEC executive assistant.';
  }

  logger.info('Generating initial greeting...');
  agentSession.generateReply({
    userInput: greetingContext,
  });

  // 12. Start periodic new-email check (every 60 seconds) if inbox awareness is available
  if (sessionHistoryId && inboxService) {
    const NEW_EMAIL_CHECK_INTERVAL_MS = 60_000;
    const checkInterval = setInterval(() => {
      reasoningLLM
        .getReasoningLoop()
        .checkForNewEmails()
        .catch((err) => {
          logger.warn('Periodic new-email check failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }, NEW_EMAIL_CHECK_INTERVAL_MS);

    // Clean up interval when session closes
    agentSession.on(voice.AgentSessionEventTypes.Close, () => {
      clearInterval(checkInterval);
      logger.info('Stopped periodic new-email check');
    });

    logger.info('Periodic new-email check started', {
      intervalMs: NEW_EMAIL_CHECK_INTERVAL_MS,
    });
  }

  return tracker;
}

// =============================================================================
// Background Batch Processing
// =============================================================================

/**
 * Process remaining email batches in the background.
 * Converts each batch result into BriefingTopicRefs and adds them to the tracker.
 * If high-priority emails are found, logs an alert (injected via tracker addTopics).
 */
async function processRemainingBatches(
  batches: EmailMetadata[][],
  apiKey: string,
  vipEmails: string[],
  tracker: BriefingSessionTracker,
  _reasoningLoop: ReasoningLoop | null
): Promise<void> {
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    const result = await preprocessBatch(batch, {
      apiKey,
      vipEmails,
      batchIndex: i + 1,
    });

    // Convert to BriefingTopicRef[] and add to tracker
    const newTopicRefs: BriefingTopicRef[] = result.clusters.map(
      (cluster: { label: string; priority: string; emails: PreprocessedEmail[] }) => ({
        label: cluster.label,
        emails: cluster.emails.map((pe: PreprocessedEmail) => ({
          emailId: pe.emailId,
          subject: pe.summary,
          from: batch.find((b: EmailMetadata) => b.id === pe.emailId)?.from ?? 'unknown',
          isFlagged: pe.priority === 'high',
          priority: pe.priority,
          summary: pe.summary,
        })),
      })
    );
    tracker.addTopics(newTopicRefs);

    const highPriorityCount = result.emails.filter(
      (e: PreprocessedEmail) => e.priority === 'high'
    ).length;

    logger.info('Background batch processed', {
      batchIndex: i + 1,
      emailCount: batch.length,
      highPriority: highPriorityCount,
    });
  }
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

  // Inject 'dev' command into argv if no command was provided
  // cli.runApp() parses process.argv for commands like 'start', 'dev', 'connect'
  const hasCommand = process.argv
    .slice(2)
    .some((arg) => ['start', 'dev', 'connect', 'download-files'].includes(arg));
  if (!hasCommand) {
    process.argv.push('dev');
  }

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
    logger.error(
      'Failed to load configuration during prewarm',
      error instanceof Error ? error : null
    );
  }
}

// =============================================================================
// Default Export for LiveKit CLI
// =============================================================================

/**
 * Default export: The agent definition for the LiveKit Agents SDK.
 * The SDK loads this file in a child process and expects the default export
 * to be the result of defineAgent().
 */
const agentConfig = loadAgentConfig();
export default createVoiceAgent(agentConfig);
