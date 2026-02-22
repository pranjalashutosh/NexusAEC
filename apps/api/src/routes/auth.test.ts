/**
 * @nexus-aec/api - OAuth Authentication Routes Tests
 */

import fastify, { type FastifyInstance } from 'fastify';

import { registerAuthRoutes, resetAuthState, injectPendingState } from './auth';

describe('Auth Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Reset auth state between tests
    resetAuthState();

    // Create fresh Fastify instance
    app = fastify({ logger: false });
    registerAuthRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /auth/microsoft', () => {
    it('should return authorization URL when Microsoft OAuth is configured', async () => {
      // Set up environment for test
      process.env['MICROSOFT_CLIENT_ID'] = 'test-client-id';

      const response = await app.inject({
        method: 'GET',
        url: '/auth/microsoft',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as { authorizationUrl: string; state: string };
      expect(body.authorizationUrl).toContain('login.microsoftonline.com');
      expect(body.authorizationUrl).toContain('test-client-id');
      expect(body.state).toBeDefined();
      expect(typeof body.state).toBe('string');

      // Clean up
      delete process.env['MICROSOFT_CLIENT_ID'];
    });

    it('should return error when Microsoft OAuth is not configured', async () => {
      // Ensure no client ID is set
      delete process.env['MICROSOFT_CLIENT_ID'];
      resetAuthState(); // Reset to pick up missing config

      const response = await app.inject({
        method: 'GET',
        url: '/auth/microsoft',
      });

      expect(response.statusCode).toBe(500);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('OAUTH_NOT_CONFIGURED');
    });
  });

  describe('GET /auth/google', () => {
    it('should return authorization URL when Google OAuth is configured', async () => {
      // Set up environment for test
      process.env['GOOGLE_CLIENT_ID'] = 'test-google-client-id';

      const response = await app.inject({
        method: 'GET',
        url: '/auth/google',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as { authorizationUrl: string; state: string };
      expect(body.authorizationUrl).toContain('accounts.google.com');
      expect(body.authorizationUrl).toContain('test-google-client-id');
      expect(body.state).toBeDefined();
      expect(typeof body.state).toBe('string');

      // Clean up
      delete process.env['GOOGLE_CLIENT_ID'];
    });

    it('should return error when Google OAuth is not configured', async () => {
      // Ensure no client ID is set
      delete process.env['GOOGLE_CLIENT_ID'];
      resetAuthState(); // Reset to pick up missing config

      const response = await app.inject({
        method: 'GET',
        url: '/auth/google',
      });

      expect(response.statusCode).toBe(500);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('OAUTH_NOT_CONFIGURED');
    });
  });

  describe('GET /auth/microsoft/callback', () => {
    it('should return error when authorization code is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/microsoft/callback?state=test-state',
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('MISSING_CODE');
    });

    it('should return error when state is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/microsoft/callback?code=test-code',
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('MISSING_STATE');
    });

    it('should return error when state is invalid', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/microsoft/callback?code=test-code&state=invalid-state',
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('INVALID_STATE');
    });

    it('should return error when OAuth provider returns error', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/microsoft/callback?error=access_denied&error_description=User%20denied%20access',
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('OAUTH_ERROR');
      expect(body.error).toBe('User denied access');
    });

    it('should return error when provider mismatch occurs', async () => {
      // Inject a state for GMAIL but call OUTLOOK callback
      injectPendingState({
        codeVerifier: 'test-verifier',
        state: 'test-state',
        redirectUri: 'http://localhost:3000/auth/google/callback',
        provider: 'GMAIL',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/microsoft/callback?code=test-code&state=test-state',
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('PROVIDER_MISMATCH');
    });
  });

  describe('GET /auth/google/callback', () => {
    it('should return error when authorization code is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/google/callback?state=test-state',
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('MISSING_CODE');
    });

    it('should return error when state is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/google/callback?code=test-code',
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('MISSING_STATE');
    });

    it('should return error when state is invalid', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/google/callback?code=test-code&state=invalid-state',
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('INVALID_STATE');
    });

    it('should return error when OAuth provider returns error', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/google/callback?error=access_denied&error_description=User%20denied%20access',
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('OAUTH_ERROR');
      expect(body.error).toBe('User denied access');
    });

    it('should return error when provider mismatch occurs', async () => {
      // Inject a state for OUTLOOK but call GMAIL callback
      injectPendingState({
        codeVerifier: 'test-verifier',
        state: 'test-state',
        redirectUri: 'http://localhost:3000/auth/microsoft/callback',
        provider: 'OUTLOOK',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/google/callback?code=test-code&state=test-state',
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as { success: boolean; error: string; code: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('PROVIDER_MISMATCH');
    });
  });
});
