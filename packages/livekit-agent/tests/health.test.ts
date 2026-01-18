/**
 * Tests for livekit-agent health server
 */

import {
  startHealthServer,
  stopHealthServer,
  isHealthServerRunning,
} from '../src/health';

describe('livekit-agent/health', () => {
  // Store original env
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set required env vars
    process.env['LIVEKIT_URL'] = 'wss://test.livekit.cloud';
    process.env['LIVEKIT_API_KEY'] = 'test-key';
    process.env['LIVEKIT_API_SECRET'] = 'test-secret';
    process.env['DEEPGRAM_API_KEY'] = 'dg-test-key';
    process.env['ELEVENLABS_API_KEY'] = 'el-test-key';
    process.env['OPENAI_API_KEY'] = 'sk-test-key';
  });

  afterEach(async () => {
    // Stop server after each test
    await stopHealthServer();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('startHealthServer', () => {
    it('starts the health server', async () => {
      expect(isHealthServerRunning()).toBe(false);
      
      startHealthServer(9999);
      
      // Give the server time to start
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      expect(isHealthServerRunning()).toBe(true);
    });

    it('does not start duplicate servers', async () => {
      startHealthServer(9998);
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // Try to start again - should log warning but not crash
      startHealthServer(9998);
      
      expect(isHealthServerRunning()).toBe(true);
    });
  });

  describe('stopHealthServer', () => {
    it('stops a running server', async () => {
      startHealthServer(9997);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(isHealthServerRunning()).toBe(true);
      
      await stopHealthServer();
      
      expect(isHealthServerRunning()).toBe(false);
    });

    it('resolves if server is not running', async () => {
      expect(isHealthServerRunning()).toBe(false);
      
      // Should not throw
      await expect(stopHealthServer()).resolves.toBeUndefined();
    });
  });

  describe('isHealthServerRunning', () => {
    it('returns false when server is not running', () => {
      expect(isHealthServerRunning()).toBe(false);
    });

    it('returns true when server is running', async () => {
      startHealthServer(9996);
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      expect(isHealthServerRunning()).toBe(true);
    });
  });

  describe('health endpoint', () => {
    it('responds to /health with status', async () => {
      startHealthServer(9995);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await fetch('http://localhost:9995/health');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
      expect(data.uptime).toBeGreaterThanOrEqual(0);
      expect(data.environment.configured).toBe(true);
      expect(data.agent.activeSessions).toBe(0);
    });

    it('responds to /ready with readiness status', async () => {
      startHealthServer(9994);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await fetch('http://localhost:9994/ready');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ready).toBe(true);
    });

    it('responds to /live with liveness status', async () => {
      startHealthServer(9993);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await fetch('http://localhost:9993/live');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.alive).toBe(true);
    });

    it('returns 404 for unknown routes', async () => {
      startHealthServer(9992);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await fetch('http://localhost:9992/unknown');
      
      expect(response.status).toBe(404);
    });
  });
});
