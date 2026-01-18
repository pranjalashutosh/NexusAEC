/**
 * @nexus-aec/livekit-agent - ElevenLabs TTS Configuration
 *
 * Configures ElevenLabs Turbo v2.5 for text-to-speech in the voice agent.
 * 
 * Features:
 * - Turbo v2.5 model for low-latency streaming
 * - Professional voice selection for in-motion listening
 * - Configurable voice settings (stability, similarity, style)
 * - Streaming audio output
 */

import { createLogger } from '@nexus-aec/logger';
import { loadElevenLabsConfig, type ElevenLabsConfig } from '../config.js';

const logger = createLogger({ baseContext: { component: 'elevenlabs-tts' } });

// =============================================================================
// Types
// =============================================================================

/**
 * ElevenLabs model IDs
 */
export type ElevenLabsModel = 
  | 'eleven_turbo_v2_5'      // Fastest, good quality
  | 'eleven_turbo_v2'        // Fast, good quality
  | 'eleven_multilingual_v2' // Multi-language, highest quality
  | 'eleven_monolingual_v1'; // Legacy

/**
 * Audio output formats supported by ElevenLabs
 */
export type AudioFormat = 
  | 'mp3_44100_128'    // MP3, 44.1kHz, 128kbps
  | 'mp3_44100_64'     // MP3, 44.1kHz, 64kbps
  | 'pcm_16000'        // PCM, 16kHz (phone quality)
  | 'pcm_22050'        // PCM, 22.05kHz
  | 'pcm_24000'        // PCM, 24kHz (recommended for voice)
  | 'pcm_44100'        // PCM, 44.1kHz (high quality)
  | 'ulaw_8000';       // μ-law, 8kHz (telephony)

/**
 * Voice settings for ElevenLabs
 */
export interface VoiceSettings {
  /** Stability (0-1): Lower = more expressive, Higher = more consistent */
  stability: number;
  /** Similarity boost (0-1): Higher = closer to original voice */
  similarityBoost: number;
  /** Style (0-1): Amount of stylistic exaggeration */
  style: number;
  /** Use speaker boost for enhanced voice clarity */
  useSpeakerBoost: boolean;
}

/**
 * TTS options for creating the ElevenLabs plugin
 */
export interface TTSOptions {
  /** API key for ElevenLabs */
  apiKey: string;
  /** Voice ID to use */
  voiceId: string;
  /** Model ID */
  modelId: ElevenLabsModel;
  /** Voice settings */
  voiceSettings: VoiceSettings;
  /** Output audio format */
  outputFormat: AudioFormat;
  /** Enable streaming */
  streaming: boolean;
  /** Optimize for latency */
  optimizeLatency: boolean;
}

/**
 * Pre-defined voice profiles
 */
export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  gender: 'male' | 'female' | 'neutral';
  accent: string;
  useCase: string[];
  settings: VoiceSettings;
}

// =============================================================================
// Pre-defined Voices
// =============================================================================

/**
 * Curated voice profiles suitable for executive assistant
 * These are ElevenLabs voice IDs for professional, clear voices
 */
export const VOICE_PROFILES: Record<string, VoiceProfile> = {
  // Female voices
  sarah: {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah',
    description: 'Professional female voice, clear and articulate',
    gender: 'female',
    accent: 'American',
    useCase: ['assistant', 'narration', 'business'],
    settings: {
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.0,
      useSpeakerBoost: true,
    },
  },
  rachel: {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel',
    description: 'Warm female voice, conversational tone',
    gender: 'female',
    accent: 'American',
    useCase: ['assistant', 'conversational'],
    settings: {
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.1,
      useSpeakerBoost: true,
    },
  },
  emily: {
    id: 'LcfcDJNUP1GQjkzn1xUU',
    name: 'Emily',
    description: 'British female voice, professional',
    gender: 'female',
    accent: 'British',
    useCase: ['assistant', 'business', 'narration'],
    settings: {
      stability: 0.6,
      similarityBoost: 0.8,
      style: 0.0,
      useSpeakerBoost: true,
    },
  },
  
  // Male voices
  adam: {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam',
    description: 'Deep male voice, authoritative',
    gender: 'male',
    accent: 'American',
    useCase: ['assistant', 'narration', 'business'],
    settings: {
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.0,
      useSpeakerBoost: true,
    },
  },
  josh: {
    id: 'TxGEqnHWrfWFTfGW9XjX',
    name: 'Josh',
    description: 'Young male voice, energetic',
    gender: 'male',
    accent: 'American',
    useCase: ['assistant', 'conversational'],
    settings: {
      stability: 0.4,
      similarityBoost: 0.7,
      style: 0.2,
      useSpeakerBoost: true,
    },
  },
  harry: {
    id: 'SOYHLrjzK2X1ezoPC6cr',
    name: 'Harry',
    description: 'British male voice, professional',
    gender: 'male',
    accent: 'British',
    useCase: ['assistant', 'business', 'narration'],
    settings: {
      stability: 0.6,
      similarityBoost: 0.8,
      style: 0.0,
      useSpeakerBoost: true,
    },
  },
};

/**
 * Default voice for the assistant
 */
export const DEFAULT_VOICE = 'sarah';

// =============================================================================
// TTS Configuration Builder
// =============================================================================

/**
 * Create TTS options from ElevenLabs config
 */
export function createTTSOptions(config?: ElevenLabsConfig): TTSOptions {
  const elevenLabsConfig = config ?? loadElevenLabsConfig();

  const options: TTSOptions = {
    apiKey: elevenLabsConfig.apiKey,
    voiceId: elevenLabsConfig.voiceId,
    modelId: elevenLabsConfig.modelId as ElevenLabsModel,
    voiceSettings: {
      stability: elevenLabsConfig.voiceSettings.stability,
      similarityBoost: elevenLabsConfig.voiceSettings.similarityBoost,
      style: elevenLabsConfig.voiceSettings.style,
      useSpeakerBoost: elevenLabsConfig.voiceSettings.useSpeakerBoost,
    },
    outputFormat: elevenLabsConfig.outputFormat as AudioFormat,
    streaming: true,
    optimizeLatency: true,
  };

  logger.info('TTS options created', {
    voiceId: options.voiceId,
    modelId: options.modelId,
    outputFormat: options.outputFormat,
    streaming: options.streaming,
  });

  return options;
}

/**
 * Create TTS options with a specific voice profile
 */
export function createTTSOptionsWithVoice(
  voiceName: string,
  config?: ElevenLabsConfig
): TTSOptions {
  const baseOptions = createTTSOptions(config);
  const profile = VOICE_PROFILES[voiceName.toLowerCase()];

  if (!profile) {
    logger.warn('Voice profile not found, using default', { voiceName });
    return baseOptions;
  }

  return {
    ...baseOptions,
    voiceId: profile.id,
    voiceSettings: profile.settings,
  };
}

// =============================================================================
// Voice Selection
// =============================================================================

/**
 * Get all available voice profiles
 */
export function getAvailableVoices(): VoiceProfile[] {
  return Object.values(VOICE_PROFILES);
}

/**
 * Get voice profile by name
 */
export function getVoiceProfile(name: string): VoiceProfile | undefined {
  return VOICE_PROFILES[name.toLowerCase()];
}

/**
 * Get voices by gender
 */
export function getVoicesByGender(gender: 'male' | 'female'): VoiceProfile[] {
  return Object.values(VOICE_PROFILES).filter((v) => v.gender === gender);
}

/**
 * Get voices by accent
 */
export function getVoicesByAccent(accent: string): VoiceProfile[] {
  return Object.values(VOICE_PROFILES).filter(
    (v) => v.accent.toLowerCase() === accent.toLowerCase()
  );
}

// =============================================================================
// Streaming TTS
// =============================================================================

/**
 * Configuration for streaming TTS
 */
export interface StreamingConfig {
  /** Chunk size in bytes for streaming */
  chunkSize: number;
  /** Buffer size before starting playback */
  bufferSize: number;
  /** Enable prefetch for next segment */
  prefetch: boolean;
}

/**
 * Default streaming configuration optimized for low latency
 */
export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  chunkSize: 1024,
  bufferSize: 4096,
  prefetch: true,
};

/**
 * Create streaming configuration for TTS
 */
export function createStreamingConfig(
  options?: Partial<StreamingConfig>
): StreamingConfig {
  return {
    ...DEFAULT_STREAMING_CONFIG,
    ...options,
  };
}

// =============================================================================
// Text Processing for TTS
// =============================================================================

/**
 * Process text before sending to TTS
 * Handles special formatting, pauses, etc.
 */
export function preprocessTextForTTS(text: string): string {
  let processed = text;

  // Add slight pause after sentences
  processed = processed.replace(/\. /g, '. ... ');

  // Handle email addresses (spell out @ symbol)
  processed = processed.replace(/@/g, ' at ');

  // Handle common abbreviations
  processed = processed.replace(/\bASAP\b/gi, 'A-S-A-P');
  processed = processed.replace(/\bFYI\b/gi, 'F-Y-I');
  processed = processed.replace(/\bEOD\b/gi, 'end of day');
  processed = processed.replace(/\bEOW\b/gi, 'end of week');
  processed = processed.replace(/\bTBD\b/gi, 'to be determined');
  processed = processed.replace(/\bWFH\b/gi, 'working from home');
  processed = processed.replace(/\bOOO\b/gi, 'out of office');

  // Handle asset IDs (add hyphens for clarity)
  processed = processed.replace(/\b([A-Z])-?(\d+)\b/g, '$1 $2');

  return processed;
}

/**
 * Split text into chunks suitable for streaming TTS
 * Breaks at natural points (sentences, clauses)
 */
export function splitTextForStreaming(
  text: string,
  maxChunkLength: number = 200
): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// =============================================================================
// Exports
// =============================================================================

export {
  VOICE_PROFILES as voiceProfiles,
  DEFAULT_VOICE as defaultVoice,
  DEFAULT_STREAMING_CONFIG as defaultStreamingConfig,
};
