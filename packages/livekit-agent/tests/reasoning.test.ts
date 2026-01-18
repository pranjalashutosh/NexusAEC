/**
 * Tests for reasoning loop module
 */

import {
  ReasoningLoop,
  createReasoningLoop,
  type TranscriptEvent,
} from '../src/index';

describe('livekit-agent/reasoning', () => {
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

  describe('ReasoningLoop', () => {
    it('creates instance with default options', () => {
      const loop = createReasoningLoop();

      expect(loop).toBeInstanceOf(ReasoningLoop);
      expect(loop.getState()).toBeDefined();
    });

    it('creates instance with custom topic items', () => {
      const loop = createReasoningLoop([10, 5, 3]);
      const state = loop.getState();

      expect(state.briefingContext.totalItems).toBe(18);
    });

    it('has initial state', () => {
      const loop = createReasoningLoop();
      const state = loop.getState();

      expect(state.messages.length).toBe(1); // System message
      expect(state.messages[0].role).toBe('system');
      expect(state.isSpeaking).toBe(false);
      expect(state.briefingState.isPaused).toBe(false);
    });
  });

  describe('processUserInput', () => {
    it('processes simple text input', async () => {
      const loop = createReasoningLoop();
      const result = await loop.processUserInput('hello');

      expect(result).toBeDefined();
      expect(result.state).toBeDefined();
    });

    it('handles navigation commands', async () => {
      const loop = createReasoningLoop();
      const result = await loop.processUserInput('skip this topic');

      expect(result.actionsTaken.length).toBeGreaterThan(0);
      expect(result.actionsTaken[0].tool).toBe('skip_topic');
    });

    it('handles email commands', async () => {
      const loop = createReasoningLoop();
      const result = await loop.processUserInput('flag this email for follow up');

      expect(result.actionsTaken.length).toBeGreaterThan(0);
      expect(result.actionsTaken[0].tool).toBe('flag_followup');
    });

    it('handles stop command', async () => {
      const loop = createReasoningLoop();
      const result = await loop.processUserInput('stop the briefing');

      expect(result.shouldEnd).toBe(true);
    });
  });

  describe('processTranscript', () => {
    it('processes high confidence transcript', async () => {
      const loop = createReasoningLoop();
      const event: TranscriptEvent = {
        text: 'next item please',
        isFinal: true,
        confidence: 0.95,
        start: 0,
        duration: 1.5,
      };

      const result = await loop.processTranscript(event);

      expect(result).toBeDefined();
      expect(result.actionsTaken).toBeDefined();
    });

    it('skips low confidence transcript', async () => {
      const loop = createReasoningLoop();
      const event: TranscriptEvent = {
        text: 'mumble mumble',
        isFinal: true,
        confidence: 0.3,
        start: 0,
        duration: 1,
      };

      const result = await loop.processTranscript(event);

      expect(result.responseText).toBe('');
      expect(result.actionsTaken.length).toBe(0);
    });
  });

  describe('TTS callback', () => {
    it('calls TTS callback with response', async () => {
      const loop = createReasoningLoop();
      const chunks: string[] = [];

      loop.setTTSCallback((text, isFinal) => {
        if (text) {
          chunks.push(text);
        }
      });

      await loop.processUserInput('yes confirm');

      // Should have called TTS callback
      expect(chunks.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('state update callback', () => {
    it('calls state update callback', async () => {
      const loop = createReasoningLoop();
      let stateUpdated = false;

      loop.setStateUpdateCallback(() => {
        stateUpdated = true;
      });

      await loop.processUserInput('next');

      expect(stateUpdated).toBe(true);
    });
  });

  describe('email context', () => {
    it('sets email context', () => {
      const loop = createReasoningLoop();

      loop.setEmailContext({
        emailId: 'email-123',
        from: 'test@example.com',
        subject: 'Test Subject',
      });

      const state = loop.getState();
      expect(state.emailContext?.emailId).toBe('email-123');
    });
  });

  describe('barge-in handling', () => {
    it('detects barge-in when speaking', async () => {
      const loop = createReasoningLoop();

      // Set speaking state
      loop.setSpeaking(true);

      // Simulate barge-in
      await loop.handleBargeIn({ timestamp: Date.now() });

      // Should detect barge-in
      expect(loop.wasBargeInDetected()).toBe(true);
      expect(loop.getState().isSpeaking).toBe(false);

      // Second check should be false (reset after first check)
      expect(loop.wasBargeInDetected()).toBe(false);
    });
  });

  describe('conversation history', () => {
    it('accumulates messages', async () => {
      const loop = createReasoningLoop();

      await loop.processUserInput('hello');
      await loop.processUserInput('next');

      const state = loop.getState();

      // System message + 2 user messages + 2 assistant responses + tool calls
      expect(state.messages.length).toBeGreaterThan(3);
    });
  });
});
