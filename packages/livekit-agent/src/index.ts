/**
 * @nexus-aec/livekit-agent
 *
 * LiveKit Voice Agent for NexusAEC.
 * Handles voice briefings, STT/TTS integration, and GPT-4o reasoning loop.
 *
 * Architecture:
 * - Uses LiveKit Agents SDK for room management
 * - Deepgram Nova-2 for speech-to-text
 * - ElevenLabs Turbo v2.5 for text-to-speech
 * - GPT-4o for intent parsing and response generation
 */

// Configuration exports
export {
  loadAgentConfig,
  loadLiveKitConfig,
  loadDeepgramConfig,
  loadElevenLabsConfig,
  loadOpenAIConfig,
  validateEnvironment,
  isEnvironmentConfigured,
} from './config.js';

export type {
  AgentConfig,
  LiveKitConfig,
  DeepgramConfig,
  ElevenLabsConfig,
  OpenAIConfig,
} from './config.js';

// Agent exports
export {
  createVoiceAgent,
  startAgent,
  prewarm,
  getAgent,
} from './agent.js';

export {
  getSession,
  getAllSessions,
  getActiveSessionCount,
} from './session-store.js';

export type { AgentSession } from './session-store.js';

// Default agent export for CLI
export { default as defaultAgent } from './agent.js';

// Health check exports
export {
  startHealthServer,
  stopHealthServer,
  isHealthServerRunning,
} from './health.js';

// STT (Speech-to-Text) exports
export * from './stt/index.js';

// TTS (Text-to-Speech) exports
export * from './tts/index.js';

// Prompts exports
export * from './prompts/index.js';

// Tools exports
export * from './tools/index.js';

// Reasoning loop exports
export * from './reasoning/index.js';

// Briefing pipeline (intelligence layer → voice agent)
export { runBriefingPipeline } from './briefing-pipeline.js';
export type {
  BriefingData,
  BriefingTopic,
  ScoredEmail,
  BriefingPipelineOptions,
} from './briefing-pipeline.js';

// Email bootstrap (wires email-providers into voice agent)
export {
  bootstrapEmailServices,
  bootstrapFromMetadata,
  teardownEmailServices,
  parseEmailCredentials,
} from './email-bootstrap.js';

export type {
  EmailCredentials,
  EmailBootstrapResult,
} from './email-bootstrap.js';
