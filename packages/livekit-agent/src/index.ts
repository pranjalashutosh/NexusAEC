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
  getSession,
  getAllSessions,
  getActiveSessionCount,
} from './agent.js';

export type { AgentSession } from './agent.js';

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

// Reasoning loop will be exported here once implemented in Task 4.15
// export { ReasoningLoop } from './reasoning-loop.js';

// Tools will be exported here once implemented in Tasks 4.18-4.19
// export { emailTools, navigationTools } from './tools/index.js';

// Prompts will be exported here once implemented in Tasks 4.16-4.17
// export { systemPrompt, briefingPrompts } from './prompts/index.js';
