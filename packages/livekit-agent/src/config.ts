/**
 * @nexus-aec/livekit-agent - Configuration
 *
 * Configuration for LiveKit Cloud, Deepgram STT, and ElevenLabs TTS.
 * All credentials are loaded from environment variables.
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from root .env
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

// =============================================================================
// Types
// =============================================================================

/**
 * LiveKit Cloud configuration
 */
export interface LiveKitConfig {
  /** LiveKit Cloud WebSocket URL (e.g., wss://your-app.livekit.cloud) */
  wsUrl: string;
  /** LiveKit API Key */
  apiKey: string;
  /** LiveKit API Secret */
  apiSecret: string;
  /** Default room settings */
  roomDefaults: {
    /** Maximum number of participants per room */
    maxParticipants: number;
    /** Empty room timeout in seconds */
    emptyTimeout: number;
    /** Enable recording */
    recordingEnabled: boolean;
  };
}

/**
 * Deepgram STT configuration
 */
export interface DeepgramConfig {
  /** Deepgram API Key */
  apiKey: string;
  /** Deepgram model (e.g., nova-2) */
  model: string;
  /** Language code (e.g., en-US) */
  language: string;
  /** Enable interim results for responsiveness */
  interimResults: boolean;
  /** Enable punctuation */
  punctuate: boolean;
  /** Enable smart formatting */
  smartFormat: boolean;
  /** Custom vocabulary for domain terms */
  customVocabulary: string[];
}

/**
 * ElevenLabs TTS configuration
 */
export interface ElevenLabsConfig {
  /** ElevenLabs API Key */
  apiKey: string;
  /** Voice ID to use */
  voiceId: string;
  /** Model ID (e.g., eleven_turbo_v2_5) */
  modelId: string;
  /** Voice settings */
  voiceSettings: {
    /** Stability (0-1) */
    stability: number;
    /** Similarity boost (0-1) */
    similarityBoost: number;
    /** Style (0-1) */
    style: number;
    /** Use speaker boost */
    useSpeakerBoost: boolean;
  };
  /** Output format */
  outputFormat: string;
}

/**
 * OpenAI configuration for GPT-4o reasoning
 */
export interface OpenAIConfig {
  /** OpenAI API Key */
  apiKey: string;
  /** Model to use (e.g., gpt-4o) */
  model: string;
  /** Maximum tokens for responses */
  maxTokens: number;
  /** Temperature for response generation */
  temperature: number;
}

/**
 * Complete agent configuration
 */
export interface AgentConfig {
  livekit: LiveKitConfig;
  deepgram: DeepgramConfig;
  elevenlabs: ElevenLabsConfig;
  openai: OpenAIConfig;
}

// =============================================================================
// Environment Variable Helpers
// =============================================================================

/**
 * Get required environment variable or throw
 */
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

/**
 * Get numeric environment variable with default
 */
function getNumericEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  return parsed;
}

/**
 * Get boolean environment variable with default
 */
function getBooleanEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

// =============================================================================
// Configuration Loaders
// =============================================================================

/**
 * Load LiveKit configuration from environment
 */
export function loadLiveKitConfig(): LiveKitConfig {
  return {
    wsUrl: getRequiredEnv('LIVEKIT_URL'),
    apiKey: getRequiredEnv('LIVEKIT_API_KEY'),
    apiSecret: getRequiredEnv('LIVEKIT_API_SECRET'),
    roomDefaults: {
      maxParticipants: getNumericEnv('LIVEKIT_MAX_PARTICIPANTS', 2),
      emptyTimeout: getNumericEnv('LIVEKIT_EMPTY_TIMEOUT', 300),
      recordingEnabled: getBooleanEnv('LIVEKIT_RECORDING_ENABLED', false),
    },
  };
}

/**
 * Load Deepgram configuration from environment
 */
export function loadDeepgramConfig(): DeepgramConfig {
  const customVocab = process.env['DEEPGRAM_CUSTOM_VOCABULARY'];

  return {
    apiKey: getRequiredEnv('DEEPGRAM_API_KEY'),
    model: getOptionalEnv('DEEPGRAM_MODEL', 'nova-2'),
    language: getOptionalEnv('DEEPGRAM_LANGUAGE', 'en-US'),
    interimResults: getBooleanEnv('DEEPGRAM_INTERIM_RESULTS', true),
    punctuate: getBooleanEnv('DEEPGRAM_PUNCTUATE', true),
    smartFormat: getBooleanEnv('DEEPGRAM_SMART_FORMAT', true),
    customVocabulary: customVocab ? customVocab.split(',').map((v) => v.trim()) : [],
  };
}

/**
 * Load ElevenLabs configuration from environment
 */
export function loadElevenLabsConfig(): ElevenLabsConfig {
  return {
    apiKey: getRequiredEnv('ELEVENLABS_API_KEY'),
    voiceId: getOptionalEnv('ELEVENLABS_VOICE_ID', 'EXAVITQu4vr4xnSDxMaL'), // Default: Sarah
    modelId: getOptionalEnv('ELEVENLABS_MODEL_ID', 'eleven_turbo_v2_5'),
    voiceSettings: {
      stability: getNumericEnv('ELEVENLABS_STABILITY', 0.5),
      similarityBoost: getNumericEnv('ELEVENLABS_SIMILARITY_BOOST', 0.75),
      style: getNumericEnv('ELEVENLABS_STYLE', 0.0),
      useSpeakerBoost: getBooleanEnv('ELEVENLABS_SPEAKER_BOOST', true),
    },
    outputFormat: getOptionalEnv('ELEVENLABS_OUTPUT_FORMAT', 'pcm_24000'),
  };
}

/**
 * Load OpenAI configuration from environment
 */
export function loadOpenAIConfig(): OpenAIConfig {
  return {
    apiKey: getRequiredEnv('OPENAI_API_KEY'),
    model: getOptionalEnv('OPENAI_MODEL', 'gpt-4o'),
    maxTokens: getNumericEnv('OPENAI_MAX_TOKENS', 1024),
    temperature: getNumericEnv('OPENAI_TEMPERATURE', 0.7),
  };
}

/**
 * Load complete agent configuration from environment
 */
export function loadAgentConfig(): AgentConfig {
  return {
    livekit: loadLiveKitConfig(),
    deepgram: loadDeepgramConfig(),
    elevenlabs: loadElevenLabsConfig(),
    openai: loadOpenAIConfig(),
  };
}

/**
 * Validate that all required environment variables are set
 * Returns an array of missing variable names
 */
export function validateEnvironment(): string[] {
  const required = [
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'DEEPGRAM_API_KEY',
    'ELEVENLABS_API_KEY',
    'OPENAI_API_KEY',
  ];

  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  return missing;
}

/**
 * Check if the environment is properly configured
 */
export function isEnvironmentConfigured(): boolean {
  return validateEnvironment().length === 0;
}
