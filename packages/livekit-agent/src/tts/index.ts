/**
 * TTS (Text-to-Speech) module exports
 */

export {
  // Types
  type ElevenLabsModel,
  type AudioFormat,
  type VoiceSettings,
  type TTSOptions,
  type VoiceProfile,
  type StreamingConfig,
  
  // Configuration
  createTTSOptions,
  createTTSOptionsWithVoice,
  
  // Voice selection
  VOICE_PROFILES,
  voiceProfiles,
  DEFAULT_VOICE,
  defaultVoice,
  getAvailableVoices,
  getVoiceProfile,
  getVoicesByGender,
  getVoicesByAccent,
  
  // Streaming
  DEFAULT_STREAMING_CONFIG,
  defaultStreamingConfig,
  createStreamingConfig,
  
  // Text processing
  preprocessTextForTTS,
  splitTextForStreaming,
} from './elevenlabs-config.js';
