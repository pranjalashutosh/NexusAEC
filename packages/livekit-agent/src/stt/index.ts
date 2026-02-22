/**
 * STT (Speech-to-Text) module exports
 */

export {
  // Types
  type DeepgramLanguage,
  type DeepgramModel,
  type STTOptions,
  type TranscriptEvent,
  type TranscriptCallback,

  // Configuration
  createSTTOptions,
  createSTTOptionsWithVocabulary,

  // Vocabulary
  DEFAULT_CUSTOM_VOCABULARY,
  defaultVocabulary,

  // Language support
  SUPPORTED_LANGUAGES,
  isLanguageSupported,
  getLanguageDisplayName,

  // Interim results
  InterimResultsBuffer,

  // Transcript processing
  processTranscript,
  detectCommand,
} from './deepgram-config.js';
