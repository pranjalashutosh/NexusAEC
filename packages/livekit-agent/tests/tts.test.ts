/**
 * Tests for ElevenLabs TTS configuration
 */

import {
  createTTSOptions,
  createTTSOptionsWithVoice,
  VOICE_PROFILES,
  DEFAULT_VOICE,
  getAvailableVoices,
  getVoiceProfile,
  getVoicesByGender,
  getVoicesByAccent,
  DEFAULT_STREAMING_CONFIG,
  createStreamingConfig,
  preprocessTextForTTS,
  splitTextForStreaming,
} from '../src/tts';

describe('livekit-agent/tts', () => {
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

  describe('createTTSOptions', () => {
    it('creates TTS options with defaults', () => {
      const options = createTTSOptions();

      expect(options.apiKey).toBe('el-test-key');
      expect(options.modelId).toBe('eleven_turbo_v2_5');
      expect(options.streaming).toBe(true);
      expect(options.optimizeLatency).toBe(true);
    });

    it('includes voice settings', () => {
      const options = createTTSOptions();

      expect(options.voiceSettings.stability).toBeGreaterThanOrEqual(0);
      expect(options.voiceSettings.stability).toBeLessThanOrEqual(1);
      expect(options.voiceSettings.similarityBoost).toBeGreaterThanOrEqual(0);
      expect(options.voiceSettings.similarityBoost).toBeLessThanOrEqual(1);
    });
  });

  describe('createTTSOptionsWithVoice', () => {
    it('creates options with specific voice profile', () => {
      const options = createTTSOptionsWithVoice('sarah');

      expect(options.voiceId).toBe(VOICE_PROFILES['sarah'].id);
      expect(options.voiceSettings).toEqual(VOICE_PROFILES['sarah'].settings);
    });

    it('falls back to default for unknown voice', () => {
      const options = createTTSOptionsWithVoice('unknown_voice');

      // Should use default config, not crash
      expect(options.apiKey).toBe('el-test-key');
    });

    it('is case-insensitive', () => {
      const options1 = createTTSOptionsWithVoice('Sarah');
      const options2 = createTTSOptionsWithVoice('SARAH');
      const options3 = createTTSOptionsWithVoice('sarah');

      expect(options1.voiceId).toBe(options2.voiceId);
      expect(options2.voiceId).toBe(options3.voiceId);
    });
  });

  describe('VOICE_PROFILES', () => {
    it('contains expected voices', () => {
      expect(VOICE_PROFILES['sarah']).toBeDefined();
      expect(VOICE_PROFILES['adam']).toBeDefined();
      expect(VOICE_PROFILES['emily']).toBeDefined();
    });

    it('voice profiles have required fields', () => {
      for (const [name, profile] of Object.entries(VOICE_PROFILES)) {
        expect(profile.id).toBeDefined();
        expect(profile.name).toBeDefined();
        expect(profile.gender).toMatch(/^(male|female|neutral)$/);
        expect(profile.accent).toBeDefined();
        expect(profile.settings).toBeDefined();
        expect(profile.settings.stability).toBeDefined();
        expect(profile.settings.similarityBoost).toBeDefined();
      }
    });
  });

  describe('DEFAULT_VOICE', () => {
    it('is a valid voice profile', () => {
      expect(VOICE_PROFILES[DEFAULT_VOICE]).toBeDefined();
    });
  });

  describe('getAvailableVoices', () => {
    it('returns array of voice profiles', () => {
      const voices = getAvailableVoices();

      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      expect(voices[0]).toHaveProperty('id');
      expect(voices[0]).toHaveProperty('name');
    });
  });

  describe('getVoiceProfile', () => {
    it('returns profile for valid name', () => {
      const profile = getVoiceProfile('sarah');

      expect(profile).toBeDefined();
      expect(profile?.name).toBe('Sarah');
    });

    it('returns undefined for invalid name', () => {
      const profile = getVoiceProfile('nonexistent');

      expect(profile).toBeUndefined();
    });
  });

  describe('getVoicesByGender', () => {
    it('returns female voices', () => {
      const voices = getVoicesByGender('female');

      expect(voices.length).toBeGreaterThan(0);
      voices.forEach((v) => expect(v.gender).toBe('female'));
    });

    it('returns male voices', () => {
      const voices = getVoicesByGender('male');

      expect(voices.length).toBeGreaterThan(0);
      voices.forEach((v) => expect(v.gender).toBe('male'));
    });
  });

  describe('getVoicesByAccent', () => {
    it('returns American voices', () => {
      const voices = getVoicesByAccent('American');

      expect(voices.length).toBeGreaterThan(0);
      voices.forEach((v) => expect(v.accent).toBe('American'));
    });

    it('returns British voices', () => {
      const voices = getVoicesByAccent('British');

      expect(voices.length).toBeGreaterThan(0);
      voices.forEach((v) => expect(v.accent).toBe('British'));
    });

    it('is case-insensitive', () => {
      const voices1 = getVoicesByAccent('american');
      const voices2 = getVoicesByAccent('AMERICAN');

      expect(voices1.length).toBe(voices2.length);
    });
  });

  describe('DEFAULT_STREAMING_CONFIG', () => {
    it('has expected properties', () => {
      expect(DEFAULT_STREAMING_CONFIG.chunkSize).toBeDefined();
      expect(DEFAULT_STREAMING_CONFIG.bufferSize).toBeDefined();
      expect(DEFAULT_STREAMING_CONFIG.prefetch).toBeDefined();
    });
  });

  describe('createStreamingConfig', () => {
    it('returns default config when no options', () => {
      const config = createStreamingConfig();

      expect(config).toEqual(DEFAULT_STREAMING_CONFIG);
    });

    it('merges custom options', () => {
      const config = createStreamingConfig({ chunkSize: 2048 });

      expect(config.chunkSize).toBe(2048);
      expect(config.bufferSize).toBe(DEFAULT_STREAMING_CONFIG.bufferSize);
    });
  });

  describe('preprocessTextForTTS', () => {
    it('handles email addresses', () => {
      const result = preprocessTextForTTS('john@example.com');

      expect(result).toContain(' at ');
    });

    it('expands abbreviations', () => {
      expect(preprocessTextForTTS('Reply ASAP')).toContain('A-S-A-P');
      expect(preprocessTextForTTS('FYI')).toContain('F-Y-I');
      expect(preprocessTextForTTS('EOD')).toContain('end of day');
      expect(preprocessTextForTTS('WFH today')).toContain('working from home');
    });

    it('handles asset IDs', () => {
      const result = preprocessTextForTTS('Check P-104');

      expect(result).toContain('P 104');
    });
  });

  describe('splitTextForStreaming', () => {
    it('splits long text into chunks', () => {
      const longText =
        'This is a long sentence. This is another sentence. And one more sentence. ' +
        'We need multiple sentences to test splitting behavior properly.';

      const chunks = splitTextForStreaming(longText, 50);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(100); // Some buffer for sentence boundaries
      });
    });

    it('keeps short text as single chunk', () => {
      const shortText = 'Hello world.';

      const chunks = splitTextForStreaming(shortText, 200);

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe('Hello world.');
    });

    it('preserves sentence boundaries', () => {
      const text = 'First sentence. Second sentence. Third sentence.';

      const chunks = splitTextForStreaming(text, 30);

      // Each chunk should end with a sentence boundary
      chunks.forEach((chunk) => {
        expect(chunk).toMatch(/[.!?]$/);
      });
    });
  });
});
