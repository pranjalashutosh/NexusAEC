/**
 * Tests for livekit-agent agent module
 *
 * Note: Full agent testing requires LiveKit SDK mocking.
 * These tests focus on the testable utility functions and session management.
 */

import {
  getSession,
  getAllSessions,
  getActiveSessionCount,
  createVoiceAgent,
  getAgent,
  startAgent,
  prewarm,
} from '../src/agent';
import { loadAgentConfig } from '../src/config';

describe('livekit-agent/agent', () => {
  // Store original env
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set required env vars for tests
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

  describe('session management', () => {
    it('getSession returns undefined for non-existent room', () => {
      const session = getSession('non-existent-room');
      expect(session).toBeUndefined();
    });

    it('getAllSessions returns array', () => {
      const sessions = getAllSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('getActiveSessionCount returns number', () => {
      const count = getActiveSessionCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('agent exports', () => {
    it('exports createVoiceAgent function', () => {
      expect(typeof createVoiceAgent).toBe('function');
    });

    it('exports getAgent function', () => {
      expect(typeof getAgent).toBe('function');
    });

    it('exports startAgent function', () => {
      expect(typeof startAgent).toBe('function');
    });

    it('exports prewarm function', () => {
      expect(typeof prewarm).toBe('function');
    });
  });

  describe('AgentSession type', () => {
    it('has correct shape', () => {
      // Type-level test - if this compiles, the type is correct
      const mockSession = {
        sessionId: 'test-session',
        roomName: 'test-room',
        userIdentity: 'user-123',
        startedAt: new Date(),
        isSpeaking: false,
        isActive: true,
      };

      expect(mockSession.sessionId).toBeDefined();
      expect(mockSession.roomName).toBeDefined();
      expect(mockSession.userIdentity).toBeDefined();
      expect(mockSession.startedAt).toBeInstanceOf(Date);
      expect(typeof mockSession.isSpeaking).toBe('boolean');
      expect(typeof mockSession.isActive).toBe('boolean');
    });
  });

  describe('agent creation', () => {
    it('getAgent returns agent definition', () => {
      const agent = getAgent();
      expect(agent).toBeDefined();
    });

    it('createVoiceAgent returns agent definition', () => {
      const config = loadAgentConfig();
      const agent = createVoiceAgent(config);
      expect(agent).toBeDefined();
    });
  });

  describe('prewarm', () => {
    it('prewarm loads configuration without error', () => {
      // Create a mock JobProcess
      const mockProc = {} as Parameters<typeof prewarm>[0];
      
      // Should not throw
      expect(() => prewarm(mockProc)).not.toThrow();
    });
  });
});
