/**
 * @nexus-aec/livekit-agent - Deepgram STT Configuration
 *
 * Configures Deepgram Nova-2 for speech-to-text in the voice agent.
 * 
 * Features:
 * - Nova-2 model for high accuracy
 * - Custom vocabulary for domain terms (NCE Asset IDs, project names)
 * - Multi-language support (en-US, en-GB, en-IN, en-AU)
 * - Interim results for responsive UX
 */

import { createLogger } from '@nexus-aec/logger';

import { loadDeepgramConfig } from '../config.js';

import type { DeepgramConfig } from '../config.js';

const logger = createLogger({ baseContext: { component: 'deepgram-stt' } });

// =============================================================================
// Types
// =============================================================================

/**
 * Deepgram language codes supported by the agent
 */
export type DeepgramLanguage = 'en-US' | 'en-GB' | 'en-IN' | 'en-AU' | 'en';

/**
 * Deepgram model options
 */
export type DeepgramModel = 'nova-2' | 'nova-2-general' | 'nova-2-meeting' | 'nova-2-phonecall';

/**
 * STT options for creating the Deepgram plugin
 */
export interface STTOptions {
  /** API key for Deepgram */
  apiKey: string;
  /** Model to use */
  model: DeepgramModel;
  /** Language code */
  language: DeepgramLanguage;
  /** Enable interim (partial) results */
  interimResults: boolean;
  /** Enable punctuation */
  punctuate: boolean;
  /** Enable smart formatting (numbers, dates, etc.) */
  smartFormat: boolean;
  /** Custom vocabulary/keywords for better recognition */
  keywords: string[];
  /** Keyword boost value (higher = more likely to recognize) */
  keywordBoost: number;
  /** Enable diarization (speaker identification) */
  diarize: boolean;
  /** Enable profanity filter */
  profanityFilter: boolean;
  /** Enable redaction of sensitive info */
  redact: boolean;
  /** Endpointing sensitivity (ms of silence before finalizing) */
  endpointing: number;
  /** Utterance end timeout (ms) */
  utteranceEndMs: number;
}

/**
 * Transcript event from Deepgram
 */
export interface TranscriptEvent {
  /** The transcribed text */
  text: string;
  /** Whether this is a final or interim result */
  isFinal: boolean;
  /** Confidence score (0-1) */
  confidence: number;
  /** Start time in seconds */
  start: number;
  /** Duration in seconds */
  duration: number;
  /** Speaker ID (if diarization enabled) */
  speaker?: number;
  /** Individual words with timing */
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

/**
 * Callback for transcript events
 */
export type TranscriptCallback = (event: TranscriptEvent) => void;

// =============================================================================
// Default Custom Vocabulary
// =============================================================================

/**
 * Default custom vocabulary for NexusAEC domain
 * These terms will be boosted for better recognition
 */
export const DEFAULT_CUSTOM_VOCABULARY: string[] = [
  // NCE Asset ID patterns
  'P-104', 'P-205', 'P-301', 'P-402',
  'V-101', 'V-202', 'V-303',
  'NCE',
  
  // Common project/location terms
  'Riverside', 'North Plant', 'South Plant',
  'maintenance', 'inspection', 'outage',
  
  // Email action terms
  'flag', 'priority', 'urgent', 'follow-up',
  'mute', 'skip', 'next', 'repeat',
  'draft', 'reply', 'forward',
  
  // VIP names (would be loaded dynamically in production)
  // These are placeholders
];

// =============================================================================
// STT Configuration Builder
// =============================================================================

/**
 * Create STT options from Deepgram config
 */
export function createSTTOptions(config?: DeepgramConfig): STTOptions {
  const deepgramConfig = config ?? loadDeepgramConfig();

  // Merge default vocabulary with configured vocabulary
  const keywords = [
    ...DEFAULT_CUSTOM_VOCABULARY,
    ...deepgramConfig.customVocabulary,
  ];

  // Remove duplicates
  const uniqueKeywords = [...new Set(keywords)];

  const options: STTOptions = {
    apiKey: deepgramConfig.apiKey,
    model: deepgramConfig.model as DeepgramModel,
    language: deepgramConfig.language as DeepgramLanguage,
    interimResults: deepgramConfig.interimResults,
    punctuate: deepgramConfig.punctuate,
    smartFormat: deepgramConfig.smartFormat,
    keywords: uniqueKeywords,
    keywordBoost: 1.5, // Boost custom vocabulary
    diarize: false, // Single speaker for voice assistant
    profanityFilter: false, // Don't filter in business context
    redact: false, // Handle PII in application layer
    endpointing: 300, // 300ms of silence to finalize
    utteranceEndMs: 1000, // 1s utterance end timeout
  };

  logger.info('STT options created', {
    model: options.model,
    language: options.language,
    interimResults: options.interimResults,
    keywordCount: options.keywords.length,
  });

  return options;
}

/**
 * Create STT options with custom vocabulary
 * Used when user has VIPs or custom keywords configured
 */
export function createSTTOptionsWithVocabulary(
  customTerms: string[],
  config?: DeepgramConfig
): STTOptions {
  const baseOptions = createSTTOptions(config);

  // Add custom terms to keywords
  const allKeywords = [...baseOptions.keywords, ...customTerms];
  const uniqueKeywords = [...new Set(allKeywords)];

  return {
    ...baseOptions,
    keywords: uniqueKeywords,
  };
}

// =============================================================================
// Language Support
// =============================================================================

/**
 * Supported language variants
 */
export const SUPPORTED_LANGUAGES: Record<DeepgramLanguage, string> = {
  'en-US': 'English (United States)',
  'en-GB': 'English (United Kingdom)',
  'en-IN': 'English (India)',
  'en-AU': 'English (Australia)',
  'en': 'English (General)',
};

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: string): language is DeepgramLanguage {
  return language in SUPPORTED_LANGUAGES;
}

/**
 * Get display name for a language
 */
export function getLanguageDisplayName(language: DeepgramLanguage): string {
  return SUPPORTED_LANGUAGES[language];
}

// =============================================================================
// Interim Results Handling
// =============================================================================

/**
 * Interim results buffer for handling partial transcripts
 * Accumulates interim results and emits when finalized
 */
export class InterimResultsBuffer {
  private buffer: string = '';
  private lastInterimTimestamp: number = 0;
  private readonly staleThresholdMs: number = 2000;

  /**
   * Add an interim result to the buffer
   */
  addInterim(text: string): void {
    this.buffer = text;
    this.lastInterimTimestamp = Date.now();
  }

  /**
   * Get the current buffer content
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Clear the buffer (called when final result received)
   */
  clear(): void {
    this.buffer = '';
    this.lastInterimTimestamp = 0;
  }

  /**
   * Check if the buffer has stale interim results
   */
  isStale(): boolean {
    if (this.buffer === '') {
      return false;
    }
    return Date.now() - this.lastInterimTimestamp > this.staleThresholdMs;
  }

  /**
   * Get stale content and clear if stale
   */
  flushIfStale(): string | null {
    if (this.isStale()) {
      const content = this.buffer;
      this.clear();
      return content;
    }
    return null;
  }
}

// =============================================================================
// Transcript Processing
// =============================================================================

/**
 * Process a transcript event and extract actionable text
 */
export function processTranscript(event: TranscriptEvent): {
  text: string;
  shouldProcess: boolean;
  confidence: number;
} {
  // Skip low-confidence transcripts
  if (event.confidence < 0.7) {
    return {
      text: event.text,
      shouldProcess: false,
      confidence: event.confidence,
    };
  }

  // Clean up the text
  const cleanText = event.text.trim();

  // Skip empty or very short transcripts
  if (cleanText.length < 2) {
    return {
      text: cleanText,
      shouldProcess: false,
      confidence: event.confidence,
    };
  }

  return {
    text: cleanText,
    shouldProcess: true,
    confidence: event.confidence,
  };
}

/**
 * Detect if transcript contains a command
 * Simple heuristic - would be enhanced with GPT-4o in reasoning loop
 */
export function detectCommand(text: string): {
  isCommand: boolean;
  possibleIntent?: string;
} {
  const lowerText = text.toLowerCase();

  // Navigation commands
  if (/\b(skip|next|previous|back|repeat|stop|pause|resume)\b/.test(lowerText)) {
    return { isCommand: true, possibleIntent: 'navigation' };
  }

  // Email actions
  if (/\b(flag|mark|mute|prioritize|draft|reply|forward|archive|delete)\b/.test(lowerText)) {
    return { isCommand: true, possibleIntent: 'email_action' };
  }

  // Queries
  if (/\b(what|who|when|where|how|why|tell me|show me)\b/.test(lowerText)) {
    return { isCommand: true, possibleIntent: 'query' };
  }

  // Confirmations
  if (/\b(yes|no|confirm|cancel|okay|ok|sure|go ahead)\b/.test(lowerText)) {
    return { isCommand: true, possibleIntent: 'confirmation' };
  }

  return { isCommand: false };
}

// =============================================================================
// Exports
// =============================================================================

export {
  DEFAULT_CUSTOM_VOCABULARY as defaultVocabulary,
};
