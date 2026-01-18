/**
 * @nexus-aec/api - OAuth Authentication Routes
 *
 * Handles OAuth 2.0 callback endpoints for Microsoft (Outlook) and Google (Gmail).
 * These routes receive the authorization code after user consent and exchange it for tokens.
 */

import {
  GoogleOAuthProvider,
  MicrosoftOAuthProvider,
  TokenManager,
  InMemoryTokenStorage,
} from '@nexus-aec/email-providers';
import { createLogger } from '@nexus-aec/logger';

import type { EmailSource, OAuthState } from '@nexus-aec/email-providers';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const logger = createLogger({ baseContext: { component: 'auth-routes' } });

// =============================================================================
// Types
// =============================================================================

/**
 * Query parameters for OAuth callback
 */
interface OAuthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

/**
 * Response for successful OAuth authentication
 */
interface AuthSuccessResponse {
  success: true;
  provider: EmailSource;
  userId: string;
  email?: string;
  displayName?: string;
}

/**
 * Response for failed OAuth authentication
 */
interface AuthErrorResponse {
  success: false;
  error: string;
  code: string;
}

/**
 * Request body for initiating OAuth flow
 */
interface InitiateAuthBody {
  loginHint?: string;
  prompt?: 'login' | 'consent' | 'select_account';
}

/**
 * Response for OAuth initiation
 */
interface InitiateAuthResponse {
  authorizationUrl: string;
  state: string;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * OAuth configuration shape
 */
interface OAuthProviderConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

/**
 * Get OAuth configuration from environment variables
 */
function getOAuthConfig(): {
  microsoft: OAuthProviderConfig;
  google: OAuthProviderConfig;
} {
  const baseUrl = process.env['API_BASE_URL'] ?? 'http://localhost:3000';

  const msClientSecret = process.env['MICROSOFT_CLIENT_SECRET'];
  const googleClientSecret = process.env['GOOGLE_CLIENT_SECRET'];

  return {
    microsoft: {
      clientId: process.env['MICROSOFT_CLIENT_ID'] ?? '',
      // Only include clientSecret if it's defined (exactOptionalPropertyTypes)
      ...(msClientSecret ? { clientSecret: msClientSecret } : {}),
      redirectUri: `${baseUrl}/auth/microsoft/callback`,
    },
    google: {
      clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
      // Only include clientSecret if it's defined (exactOptionalPropertyTypes)
      ...(googleClientSecret ? { clientSecret: googleClientSecret } : {}),
      redirectUri: `${baseUrl}/auth/google/callback`,
    },
  };
}

// =============================================================================
// State Management (In-memory for now, should use Redis in production)
// =============================================================================

/**
 * Pending OAuth states awaiting callback
 * Key: state parameter, Value: OAuthState
 */
const pendingOAuthStates = new Map<string, OAuthState>();

/**
 * Store an OAuth state for later verification
 */
function storePendingState(oauthState: OAuthState): void {
  pendingOAuthStates.set(oauthState.state, oauthState);

  // Auto-expire after 10 minutes
  setTimeout(() => {
    pendingOAuthStates.delete(oauthState.state);
  }, 10 * 60 * 1000);
}

/**
 * Retrieve and consume a pending OAuth state
 */
function consumePendingState(state: string): OAuthState | undefined {
  const oauthState = pendingOAuthStates.get(state);
  if (oauthState) {
    pendingOAuthStates.delete(state);
  }
  return oauthState;
}

// =============================================================================
// Singleton Instances (would be dependency-injected in production)
// =============================================================================

let tokenManager: TokenManager | null = null;
let microsoftProvider: MicrosoftOAuthProvider | null = null;
let googleProvider: GoogleOAuthProvider | null = null;

/**
 * Get or create the token manager instance
 */
function getTokenManager(): TokenManager {
  if (!tokenManager) {
    // Use in-memory storage for development; production would use secure storage
    tokenManager = new TokenManager({
      storage: new InMemoryTokenStorage(),
      autoRefresh: true,
      onTokenRefresh: (userId, source) => {
        logger.info('Tokens refreshed', { userId, source });
      },
      onTokenExpired: (userId, source, error) => {
        logger.warn('Token expired, re-auth required', {
          userId,
          source,
          errorMessage: error.message,
        });
      },
    });

    // Register providers
    const config = getOAuthConfig();
    const msProvider = getMicrosoftProvider();
    const gProvider = getGoogleProvider();

    if (config.microsoft.clientId) {
      tokenManager.registerProvider('OUTLOOK', msProvider);
    }
    if (config.google.clientId) {
      tokenManager.registerProvider('GMAIL', gProvider);
    }
  }
  return tokenManager;
}

/**
 * Get or create Microsoft OAuth provider
 */
function getMicrosoftProvider(): MicrosoftOAuthProvider {
  if (!microsoftProvider) {
    const config = getOAuthConfig();
    microsoftProvider = new MicrosoftOAuthProvider(config.microsoft);
  }
  return microsoftProvider;
}

/**
 * Get or create Google OAuth provider
 */
function getGoogleProvider(): GoogleOAuthProvider {
  if (!googleProvider) {
    const config = getOAuthConfig();
    googleProvider = new GoogleOAuthProvider(config.google);
  }
  return googleProvider;
}

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * Register OAuth authentication routes
 */
export function registerAuthRoutes(app: FastifyInstance): void {
  // ---------------------------------------------------------------------------
  // Microsoft OAuth Routes
  // ---------------------------------------------------------------------------

  /**
   * Initiate Microsoft OAuth flow
   * GET /auth/microsoft
   */
  app.get<{ Body: InitiateAuthBody }>('/auth/microsoft', async (_request, reply) => {
    const config = getOAuthConfig();

    if (!config.microsoft.clientId) {
      return reply.status(500).send({
        success: false,
        error: 'Microsoft OAuth not configured',
        code: 'OAUTH_NOT_CONFIGURED',
      } satisfies AuthErrorResponse);
    }

    const provider = getMicrosoftProvider();
    const { url, state } = await provider.getAuthorizationUrl({
      prompt: 'select_account',
    });

    storePendingState(state);

    logger.info('Microsoft OAuth flow initiated', { stateId: state.state });

    return reply.send({
      authorizationUrl: url,
      state: state.state,
    } satisfies InitiateAuthResponse);
  });

  /**
   * Microsoft OAuth callback
   * GET /auth/microsoft/callback
   */
  app.get<{ Querystring: OAuthCallbackQuery }>(
    '/auth/microsoft/callback',
    async (request, reply) => {
      return handleOAuthCallback(request, reply, 'OUTLOOK');
    }
  );

  // ---------------------------------------------------------------------------
  // Google OAuth Routes
  // ---------------------------------------------------------------------------

  /**
   * Initiate Google OAuth flow
   * GET /auth/google
   */
  app.get<{ Body: InitiateAuthBody }>('/auth/google', async (_request, reply) => {
    const config = getOAuthConfig();

    if (!config.google.clientId) {
      return reply.status(500).send({
        success: false,
        error: 'Google OAuth not configured',
        code: 'OAUTH_NOT_CONFIGURED',
      } satisfies AuthErrorResponse);
    }

    const provider = getGoogleProvider();
    const { url, state } = await provider.getAuthorizationUrl({
      prompt: 'select_account',
      accessType: 'offline',
    });

    storePendingState(state);

    logger.info('Google OAuth flow initiated', { stateId: state.state });

    return reply.send({
      authorizationUrl: url,
      state: state.state,
    } satisfies InitiateAuthResponse);
  });

  /**
   * Google OAuth callback
   * GET /auth/google/callback
   */
  app.get<{ Querystring: OAuthCallbackQuery }>(
    '/auth/google/callback',
    async (request, reply) => {
      return handleOAuthCallback(request, reply, 'GMAIL');
    }
  );
}

// =============================================================================
// Shared OAuth Callback Handler
// =============================================================================

/**
 * Handle OAuth callback for both Microsoft and Google
 */
async function handleOAuthCallback(
  request: FastifyRequest<{ Querystring: OAuthCallbackQuery }>,
  reply: FastifyReply,
  source: EmailSource
): Promise<FastifyReply> {
  const { code, state, error, error_description } = request.query;

  // Check for OAuth error response
  if (error) {
    logger.warn('OAuth error response', { source, error, errorDescription: error_description });
    return reply.status(400).send({
      success: false,
      error: error_description ?? error,
      code: 'OAUTH_ERROR',
    } satisfies AuthErrorResponse);
  }

  // Validate required parameters
  if (!code) {
    logger.warn('Missing authorization code', { source });
    return reply.status(400).send({
      success: false,
      error: 'Missing authorization code',
      code: 'MISSING_CODE',
    } satisfies AuthErrorResponse);
  }

  if (!state) {
    logger.warn('Missing state parameter', { source });
    return reply.status(400).send({
      success: false,
      error: 'Missing state parameter',
      code: 'MISSING_STATE',
    } satisfies AuthErrorResponse);
  }

  // Validate state (CSRF protection)
  const oauthState = consumePendingState(state);
  if (!oauthState) {
    logger.warn('Invalid or expired state parameter', { source, stateParam: state });
    return reply.status(400).send({
      success: false,
      error: 'Invalid or expired state parameter',
      code: 'INVALID_STATE',
    } satisfies AuthErrorResponse);
  }

  // Verify provider matches
  if (oauthState.provider !== source) {
    logger.warn('Provider mismatch', { expected: oauthState.provider, received: source });
    return reply.status(400).send({
      success: false,
      error: 'Provider mismatch',
      code: 'PROVIDER_MISMATCH',
    } satisfies AuthErrorResponse);
  }

  try {
    // Exchange code for tokens
    let tokens;
    let userId: string;
    let email: string | undefined;
    let displayName: string | undefined;

    if (source === 'OUTLOOK') {
      const provider = getMicrosoftProvider();
      tokens = await provider.exchangeCodeForTokens(code, oauthState);

      // Validate token and get user info
      const validation = await provider.validateToken(tokens.accessToken);
      if (!validation.valid || !validation.userInfo) {
        logger.error('Failed to get Microsoft user info after token exchange', null, { source });
        return reply.status(500).send({
          success: false,
          error: 'Failed to verify user identity',
          code: 'USER_INFO_FAILED',
        } satisfies AuthErrorResponse);
      }

      userId = validation.userInfo.id;
      email = validation.userInfo.mail ?? validation.userInfo.userPrincipalName;
      displayName = validation.userInfo.displayName;
    } else {
      const provider = getGoogleProvider();
      tokens = await provider.exchangeCodeForTokens(code, oauthState);

      // Validate token and get user info
      const validation = await provider.validateToken(tokens.accessToken);
      if (!validation.valid || !validation.userInfo) {
        logger.error('Failed to get Google user info after token exchange', null, { source });
        return reply.status(500).send({
          success: false,
          error: 'Failed to verify user identity',
          code: 'USER_INFO_FAILED',
        } satisfies AuthErrorResponse);
      }

      userId = validation.userInfo.id;
      email = validation.userInfo.email;
      displayName = validation.userInfo.name;
    }

    // Store tokens with user info (filter undefined values for exactOptionalPropertyTypes)
    const manager = getTokenManager();
    const userInfoForStorage: { email?: string; displayName?: string } = {};
    if (email) {
      userInfoForStorage.email = email;
    }
    if (displayName) {
      userInfoForStorage.displayName = displayName;
    }

    await manager.storeTokens(userId, source, tokens, userInfoForStorage);

    logger.info('OAuth authentication successful', {
      source,
      userId,
      hasEmail: !!email,
    });

    // Build response (filter undefined values for exactOptionalPropertyTypes)
    const response: AuthSuccessResponse = {
      success: true,
      provider: source,
      userId,
    };
    if (email) {
      response.email = email;
    }
    if (displayName) {
      response.displayName = displayName;
    }

    return reply.send(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Token exchange failed', null, { source, errorMessage: message });

    return reply.status(500).send({
      success: false,
      error: `Token exchange failed: ${message}`,
      code: 'TOKEN_EXCHANGE_FAILED',
    } satisfies AuthErrorResponse);
  }
}

// =============================================================================
// Testing Utilities
// =============================================================================

/**
 * Reset singleton instances (for testing)
 */
export function resetAuthState(): void {
  pendingOAuthStates.clear();
  tokenManager = null;
  microsoftProvider = null;
  googleProvider = null;
}

/**
 * Inject a pending state (for testing)
 */
export function injectPendingState(oauthState: OAuthState): void {
  pendingOAuthStates.set(oauthState.state, oauthState);
}

/**
 * Get the token manager (for testing)
 */
export function getTokenManagerInstance(): TokenManager {
  return getTokenManager();
}
