/**
 * Tests for livekit-agent configuration module
 */

import {
  loadLiveKitConfig,
  loadDeepgramConfig,
  loadElevenLabsConfig,
  loadOpenAIConfig,
  loadAgentConfig,
  validateEnvironment,
  isEnvironmentConfigured,
} from '../src/config';

describe('livekit-agent/config', () => {
  // Store original env and restore after tests
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset to clean state before each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    it('returns missing variables when environment is not configured', () => {
      // Clear all relevant env vars
      delete process.env['LIVEKIT_URL'];
      delete process.env['LIVEKIT_API_KEY'];
      delete process.env['LIVEKIT_API_SECRET'];
      delete process.env['DEEPGRAM_API_KEY'];
      delete process.env['ELEVENLABS_API_KEY'];
      delete process.env['OPENAI_API_KEY'];

      const missing = validateEnvironment();

      expect(missing).toContain('LIVEKIT_URL');
      expect(missing).toContain('LIVEKIT_API_KEY');
      expect(missing).toContain('LIVEKIT_API_SECRET');
      expect(missing).toContain('DEEPGRAM_API_KEY');
      expect(missing).toContain('ELEVENLABS_API_KEY');
      expect(missing).toContain('OPENAI_API_KEY');
    });

    it('returns empty array when all variables are configured', () => {
      process.env['LIVEKIT_URL'] = 'wss://test.livekit.cloud';
      process.env['LIVEKIT_API_KEY'] = 'test-key';
      process.env['LIVEKIT_API_SECRET'] = 'test-secret';
      process.env['DEEPGRAM_API_KEY'] = 'dg-test-key';
      process.env['ELEVENLABS_API_KEY'] = 'el-test-key';
      process.env['OPENAI_API_KEY'] = 'sk-test-key';

      const missing = validateEnvironment();

      expect(missing).toHaveLength(0);
    });
  });

  describe('isEnvironmentConfigured', () => {
    it('returns false when environment is not configured', () => {
      delete process.env['LIVEKIT_URL'];
      delete process.env['LIVEKIT_API_KEY'];

      expect(isEnvironmentConfigured()).toBe(false);
    });

    it('returns true when all required variables are set', () => {
      process.env['LIVEKIT_URL'] = 'wss://test.livekit.cloud';
      process.env['LIVEKIT_API_KEY'] = 'test-key';
      process.env['LIVEKIT_API_SECRET'] = 'test-secret';
      process.env['DEEPGRAM_API_KEY'] = 'dg-test-key';
      process.env['ELEVENLABS_API_KEY'] = 'el-test-key';
      process.env['OPENAI_API_KEY'] = 'sk-test-key';

      expect(isEnvironmentConfigured()).toBe(true);
    });
  });

  describe('loadLiveKitConfig', () => {
    it('loads LiveKit configuration from environment', () => {
      process.env['LIVEKIT_URL'] = 'wss://my-app.livekit.cloud';
      process.env['LIVEKIT_API_KEY'] = 'api-key-123';
      process.env['LIVEKIT_API_SECRET'] = 'api-secret-456';
      process.env['LIVEKIT_MAX_PARTICIPANTS'] = '5';
      process.env['LIVEKIT_EMPTY_TIMEOUT'] = '600';
      process.env['LIVEKIT_RECORDING_ENABLED'] = 'true';

      const config = loadLiveKitConfig();

      expect(config.wsUrl).toBe('wss://my-app.livekit.cloud');
      expect(config.apiKey).toBe('api-key-123');
      expect(config.apiSecret).toBe('api-secret-456');
      expect(config.roomDefaults.maxParticipants).toBe(5);
      expect(config.roomDefaults.emptyTimeout).toBe(600);
      expect(config.roomDefaults.recordingEnabled).toBe(true);
    });

    it('uses defaults for optional values', () => {
      process.env['LIVEKIT_URL'] = 'wss://my-app.livekit.cloud';
      process.env['LIVEKIT_API_KEY'] = 'api-key-123';
      process.env['LIVEKIT_API_SECRET'] = 'api-secret-456';

      const config = loadLiveKitConfig();

      expect(config.roomDefaults.maxParticipants).toBe(2);
      expect(config.roomDefaults.emptyTimeout).toBe(300);
      expect(config.roomDefaults.recordingEnabled).toBe(false);
    });

    it('throws when required variables are missing', () => {
      delete process.env['LIVEKIT_URL'];
      delete process.env['LIVEKIT_API_KEY'];
      delete process.env['LIVEKIT_API_SECRET'];

      expect(() => loadLiveKitConfig()).toThrow(
        'Missing required environment variable: LIVEKIT_URL'
      );
    });
  });

  describe('loadDeepgramConfig', () => {
    it('loads Deepgram configuration from environment', () => {
      process.env['DEEPGRAM_API_KEY'] = 'dg-api-key';
      process.env['DEEPGRAM_MODEL'] = 'nova-3';
      process.env['DEEPGRAM_LANGUAGE'] = 'en-GB';
      process.env['DEEPGRAM_INTERIM_RESULTS'] = 'false';
      process.env['DEEPGRAM_CUSTOM_VOCABULARY'] = 'P-104,P-205,NCE';

      const config = loadDeepgramConfig();

      expect(config.apiKey).toBe('dg-api-key');
      expect(config.model).toBe('nova-3');
      expect(config.language).toBe('en-GB');
      expect(config.interimResults).toBe(false);
      expect(config.customVocabulary).toEqual(['P-104', 'P-205', 'NCE']);
    });

    it('uses defaults for optional values', () => {
      process.env['DEEPGRAM_API_KEY'] = 'dg-api-key';

      const config = loadDeepgramConfig();

      expect(config.model).toBe('nova-2');
      expect(config.language).toBe('en-US');
      expect(config.interimResults).toBe(true);
      expect(config.punctuate).toBe(true);
      expect(config.smartFormat).toBe(true);
      expect(config.customVocabulary).toEqual([]);
    });
  });

  describe('loadElevenLabsConfig', () => {
    it('loads ElevenLabs configuration from environment', () => {
      process.env['ELEVENLABS_API_KEY'] = 'el-api-key';
      process.env['ELEVENLABS_VOICE_ID'] = 'custom-voice-id';
      process.env['ELEVENLABS_MODEL_ID'] = 'eleven_multilingual_v2';
      process.env['ELEVENLABS_STABILITY'] = '0.7';
      process.env['ELEVENLABS_SIMILARITY_BOOST'] = '0.8';

      const config = loadElevenLabsConfig();

      expect(config.apiKey).toBe('el-api-key');
      expect(config.voiceId).toBe('custom-voice-id');
      expect(config.modelId).toBe('eleven_multilingual_v2');
      expect(config.voiceSettings.stability).toBe(0.7);
      expect(config.voiceSettings.similarityBoost).toBe(0.8);
    });

    it('uses defaults for optional values', () => {
      process.env['ELEVENLABS_API_KEY'] = 'el-api-key';

      const config = loadElevenLabsConfig();

      expect(config.voiceId).toBe('EXAVITQu4vr4xnSDxMaL');
      expect(config.modelId).toBe('eleven_turbo_v2_5');
      expect(config.voiceSettings.stability).toBe(0.5);
      expect(config.voiceSettings.similarityBoost).toBe(0.75);
      expect(config.voiceSettings.style).toBe(0.0);
      expect(config.voiceSettings.useSpeakerBoost).toBe(true);
      expect(config.outputFormat).toBe('pcm_24000');
    });
  });

  describe('loadOpenAIConfig', () => {
    it('loads OpenAI configuration from environment', () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-key';
      process.env['OPENAI_MODEL'] = 'gpt-4-turbo';
      process.env['OPENAI_MAX_TOKENS'] = '2048';
      process.env['OPENAI_TEMPERATURE'] = '0.5';

      const config = loadOpenAIConfig();

      expect(config.apiKey).toBe('sk-test-key');
      expect(config.model).toBe('gpt-4-turbo');
      expect(config.maxTokens).toBe(2048);
      expect(config.temperature).toBe(0.5);
    });

    it('uses defaults for optional values', () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-key';

      const config = loadOpenAIConfig();

      expect(config.model).toBe('gpt-4o');
      expect(config.maxTokens).toBe(1024);
      expect(config.temperature).toBe(0.7);
    });
  });

  describe('loadAgentConfig', () => {
    it('loads complete agent configuration', () => {
      process.env['LIVEKIT_URL'] = 'wss://my-app.livekit.cloud';
      process.env['LIVEKIT_API_KEY'] = 'lk-key';
      process.env['LIVEKIT_API_SECRET'] = 'lk-secret';
      process.env['DEEPGRAM_API_KEY'] = 'dg-key';
      process.env['ELEVENLABS_API_KEY'] = 'el-key';
      process.env['OPENAI_API_KEY'] = 'sk-key';

      const config = loadAgentConfig();

      expect(config.livekit.wsUrl).toBe('wss://my-app.livekit.cloud');
      expect(config.deepgram.apiKey).toBe('dg-key');
      expect(config.elevenlabs.apiKey).toBe('el-key');
      expect(config.openai.apiKey).toBe('sk-key');
    });
  });
});
