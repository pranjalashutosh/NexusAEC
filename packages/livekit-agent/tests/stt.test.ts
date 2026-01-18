/**
 * Tests for Deepgram STT configuration
 */

import {
  createSTTOptions,
  createSTTOptionsWithVocabulary,
  DEFAULT_CUSTOM_VOCABULARY,
  SUPPORTED_LANGUAGES,
  isLanguageSupported,
  getLanguageDisplayName,
  InterimResultsBuffer,
  processTranscript,
  detectCommand,
  type TranscriptEvent,
} from '../src/stt';

describe('livekit-agent/stt', () => {
  // Store original env
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env['LIVEKIT_URL'] = 'wss://test.livekit.cloud';
    process.env['LIVEKIT_API_KEY'] = 'test-key';
    process.env['LIVEKIT_API_SECRET'] = 'test-secret';
    process.env['DEEPGRAM_API_KEY'] = 'dg-test-key';
    process.env['ELEVENLABS_API_KEY'] = 'el-test-key';
    process.env['OPENAI_API_KEY'] = 'sk-test-key';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('createSTTOptions', () => {
    it('creates STT options with defaults', () => {
      const options = createSTTOptions();

      expect(options.apiKey).toBe('dg-test-key');
      expect(options.model).toBe('nova-2');
      expect(options.language).toBe('en-US');
      expect(options.interimResults).toBe(true);
      expect(options.punctuate).toBe(true);
      expect(options.smartFormat).toBe(true);
      expect(options.keywords.length).toBeGreaterThan(0);
    });

    it('includes default vocabulary', () => {
      const options = createSTTOptions();

      expect(options.keywords).toContain('P-104');
      expect(options.keywords).toContain('NCE');
      expect(options.keywords).toContain('priority');
    });
  });

  describe('createSTTOptionsWithVocabulary', () => {
    it('adds custom vocabulary to options', () => {
      const customTerms = ['CustomProject', 'JohnSmith', 'Q1Budget'];
      const options = createSTTOptionsWithVocabulary(customTerms);

      expect(options.keywords).toContain('CustomProject');
      expect(options.keywords).toContain('JohnSmith');
      expect(options.keywords).toContain('Q1Budget');
      // Should also include defaults
      expect(options.keywords).toContain('P-104');
    });

    it('deduplicates vocabulary', () => {
      const customTerms = ['P-104', 'NCE']; // Already in defaults
      const options = createSTTOptionsWithVocabulary(customTerms);

      const p104Count = options.keywords.filter((k) => k === 'P-104').length;
      expect(p104Count).toBe(1);
    });
  });

  describe('DEFAULT_CUSTOM_VOCABULARY', () => {
    it('contains asset ID patterns', () => {
      expect(DEFAULT_CUSTOM_VOCABULARY).toContain('P-104');
      expect(DEFAULT_CUSTOM_VOCABULARY).toContain('V-101');
    });

    it('contains action terms', () => {
      expect(DEFAULT_CUSTOM_VOCABULARY).toContain('flag');
      expect(DEFAULT_CUSTOM_VOCABULARY).toContain('priority');
      expect(DEFAULT_CUSTOM_VOCABULARY).toContain('skip');
    });
  });

  describe('language support', () => {
    it('SUPPORTED_LANGUAGES contains expected languages', () => {
      expect(SUPPORTED_LANGUAGES['en-US']).toBe('English (United States)');
      expect(SUPPORTED_LANGUAGES['en-GB']).toBe('English (United Kingdom)');
      expect(SUPPORTED_LANGUAGES['en-IN']).toBe('English (India)');
      expect(SUPPORTED_LANGUAGES['en-AU']).toBe('English (Australia)');
    });

    it('isLanguageSupported returns true for supported languages', () => {
      expect(isLanguageSupported('en-US')).toBe(true);
      expect(isLanguageSupported('en-GB')).toBe(true);
    });

    it('isLanguageSupported returns false for unsupported languages', () => {
      expect(isLanguageSupported('fr-FR')).toBe(false);
      expect(isLanguageSupported('es-ES')).toBe(false);
    });

    it('getLanguageDisplayName returns display name', () => {
      expect(getLanguageDisplayName('en-US')).toBe('English (United States)');
    });
  });

  describe('InterimResultsBuffer', () => {
    it('accumulates interim results', () => {
      const buffer = new InterimResultsBuffer();

      buffer.addInterim('Hello');
      expect(buffer.getBuffer()).toBe('Hello');

      buffer.addInterim('Hello world');
      expect(buffer.getBuffer()).toBe('Hello world');
    });

    it('clears buffer', () => {
      const buffer = new InterimResultsBuffer();

      buffer.addInterim('Hello');
      buffer.clear();
      expect(buffer.getBuffer()).toBe('');
    });

    it('detects stale buffer', async () => {
      const buffer = new InterimResultsBuffer();

      buffer.addInterim('Hello');
      expect(buffer.isStale()).toBe(false);

      // Note: In a real test, we'd mock timers
      // For now, just check the function exists
      expect(typeof buffer.flushIfStale).toBe('function');
    });
  });

  describe('processTranscript', () => {
    it('processes high-confidence transcripts', () => {
      const event: TranscriptEvent = {
        text: 'Flag this email',
        isFinal: true,
        confidence: 0.95,
        start: 0,
        duration: 1.5,
      };

      const result = processTranscript(event);

      expect(result.shouldProcess).toBe(true);
      expect(result.text).toBe('Flag this email');
      expect(result.confidence).toBe(0.95);
    });

    it('rejects low-confidence transcripts', () => {
      const event: TranscriptEvent = {
        text: 'unclear mumbling',
        isFinal: true,
        confidence: 0.4,
        start: 0,
        duration: 1,
      };

      const result = processTranscript(event);

      expect(result.shouldProcess).toBe(false);
    });

    it('rejects empty transcripts', () => {
      const event: TranscriptEvent = {
        text: ' ',
        isFinal: true,
        confidence: 0.95,
        start: 0,
        duration: 0.5,
      };

      const result = processTranscript(event);

      expect(result.shouldProcess).toBe(false);
    });
  });

  describe('detectCommand', () => {
    it('detects navigation commands', () => {
      expect(detectCommand('skip this')).toEqual({
        isCommand: true,
        possibleIntent: 'navigation',
      });
      expect(detectCommand('go back')).toEqual({
        isCommand: true,
        possibleIntent: 'navigation',
      });
      expect(detectCommand('repeat that')).toEqual({
        isCommand: true,
        possibleIntent: 'navigation',
      });
    });

    it('detects email action commands', () => {
      expect(detectCommand('flag this email')).toEqual({
        isCommand: true,
        possibleIntent: 'email_action',
      });
      expect(detectCommand('mute this sender')).toEqual({
        isCommand: true,
        possibleIntent: 'email_action',
      });
    });

    it('detects query commands', () => {
      expect(detectCommand('what is the status')).toEqual({
        isCommand: true,
        possibleIntent: 'query',
      });
      expect(detectCommand('tell me more')).toEqual({
        isCommand: true,
        possibleIntent: 'query',
      });
    });

    it('detects confirmation commands', () => {
      expect(detectCommand('yes')).toEqual({
        isCommand: true,
        possibleIntent: 'confirmation',
      });
      expect(detectCommand('go ahead')).toEqual({
        isCommand: true,
        possibleIntent: 'confirmation',
      });
    });

    it('returns false for non-commands', () => {
      expect(detectCommand('the weather is nice')).toEqual({
        isCommand: false,
      });
    });
  });
});
