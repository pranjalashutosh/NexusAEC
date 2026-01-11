/**
 * @nexus-aec/email-providers - Google OAuth 2.0 Implementation
 *
 * Implements OAuth 2.0 Authorization Code Flow with PKCE for Google APIs.
 * Supports Gmail, Calendar, and Contacts scopes.
 *
 * @see https://developers.google.com/identity/protocols/oauth2/native-app
 */

import type { OAuthTokens, OAuthState } from '../interfaces/types';
import { generateCodeVerifier, generateState, generateCodeChallenge } from './microsoft';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Google OAuth configuration
 */
export interface GoogleOAuthConfig {
  /** Google Cloud OAuth 2.0 Client ID */
  clientId: string;
  /** Google Cloud OAuth 2.0 Client Secret (for confidential clients) */
  clientSecret?: string;
  /** Redirect URI registered in Google Cloud Console */
  redirectUri: string;
  /** Custom scopes to request (defaults provided) */
  scopes?: string[];
}

/**
 * Default Google API scopes for the application
 */
export const DEFAULT_GOOGLE_SCOPES = [
  'openid',
  'profile',
  'email',
  // Gmail scopes
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  // Calendar scopes
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  // Contacts/People scope
  'https://www.googleapis.com/auth/contacts.readonly',
];

/**
 * Google OAuth endpoints
 */
const GOOGLE_ENDPOINTS = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  userinfo: 'https://www.googleapis.com/oauth2/v2/userinfo',
};

// =============================================================================
// Google OAuth Provider
// =============================================================================

/**
 * Google OAuth 2.0 provider for Gmail, Calendar, and Contacts APIs
 */
export class GoogleOAuthProvider {
  private readonly config: GoogleOAuthConfig;
  private readonly scopes: string[];

  constructor(config: GoogleOAuthConfig) {
    this.config = config;
    this.scopes = config.scopes ?? DEFAULT_GOOGLE_SCOPES;
  }

  /**
   * Generate the authorization URL for initiating OAuth flow
   *
   * @param options - Optional parameters for the auth URL
   * @returns Object containing the authorization URL and state for verification
   */
  async getAuthorizationUrl(options?: {
    /** Login hint (email) to pre-fill */
    loginHint?: string;
    /** Force re-authentication */
    prompt?: 'none' | 'consent' | 'select_account';
    /** Include granted scopes in response */
    includeGrantedScopes?: boolean;
    /** Access type - 'offline' required for refresh tokens */
    accessType?: 'online' | 'offline';
  }): Promise<{ url: string; state: OAuthState }> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: this.scopes.join(' '),
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      // Request offline access to get refresh token
      access_type: options?.accessType ?? 'offline',
    });

    if (options?.loginHint) {
      params.set('login_hint', options.loginHint);
    }

    if (options?.prompt) {
      params.set('prompt', options.prompt);
    }

    if (options?.includeGrantedScopes) {
      params.set('include_granted_scopes', 'true');
    }

    const url = `${GOOGLE_ENDPOINTS.authorize}?${params.toString()}`;

    return {
      url,
      state: {
        codeVerifier,
        state,
        redirectUri: this.config.redirectUri,
        provider: 'GMAIL',
      },
    };
  }

  /**
   * Exchange authorization code for tokens
   *
   * @param code - The authorization code from callback
   * @param oauthState - The OAuth state from getAuthorizationUrl
   * @returns OAuth tokens
   */
  async exchangeCodeForTokens(code: string, oauthState: OAuthState): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      code: code,
      redirect_uri: oauthState.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: oauthState.codeVerifier,
    });

    // Add client secret for confidential clients
    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }

    const response = await fetch(GOOGLE_ENDPOINTS.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        error?: string;
        error_description?: string;
      };
      throw new GoogleOAuthError(
        `Token exchange failed: ${error.error_description ?? error.error ?? response.statusText}`,
        'TOKEN_EXCHANGE_FAILED',
        error
      );
    }

    const data = (await response.json()) as GoogleTokenResponse;
    return this.normalizeTokenResponse(data);
  }

  /**
   * Refresh an expired access token
   *
   * @param refreshToken - The refresh token
   * @returns New OAuth tokens
   */
  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    // Add client secret for confidential clients
    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }

    const response = await fetch(GOOGLE_ENDPOINTS.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        error?: string;
        error_description?: string;
      };

      // Check for specific error codes that indicate re-auth is needed
      if (error.error === 'invalid_grant') {
        throw new GoogleOAuthError(
          'Refresh token expired or revoked. Re-authentication required.',
          'REFRESH_TOKEN_EXPIRED',
          error
        );
      }

      throw new GoogleOAuthError(
        `Token refresh failed: ${error.error_description ?? error.error ?? response.statusText}`,
        'TOKEN_REFRESH_FAILED',
        error
      );
    }

    const data = (await response.json()) as GoogleTokenResponse;

    // Google doesn't return refresh_token on refresh, so preserve the original
    return this.normalizeTokenResponse({
      ...data,
      refresh_token: data.refresh_token ?? refreshToken,
    });
  }

  /**
   * Validate an access token by making a test API call
   *
   * @param accessToken - The access token to validate
   * @returns Validation result with user info if valid
   */
  async validateToken(
    accessToken: string
  ): Promise<{ valid: boolean; userInfo?: GoogleUserInfo; error?: string }> {
    try {
      const response = await fetch(GOOGLE_ENDPOINTS.userinfo, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: 'Token expired or invalid' };
        }
        return { valid: false, error: `API error: ${response.statusText}` };
      }

      const userInfo = (await response.json()) as GoogleUserInfo;
      return { valid: true, userInfo };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Revoke a token (access or refresh)
   *
   * @param token - The token to revoke
   */
  async revokeToken(token: string): Promise<void> {
    const response = await fetch(`${GOOGLE_ENDPOINTS.revoke}?token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok && response.status !== 200) {
      const error = (await response.json().catch(() => ({}))) as {
        error?: string;
        error_description?: string;
      };
      throw new GoogleOAuthError(
        `Token revocation failed: ${error.error_description ?? error.error ?? response.statusText}`,
        'TOKEN_REVOKE_FAILED',
        error
      );
    }
  }

  /**
   * Check if tokens are expired or about to expire
   *
   * @param tokens - The OAuth tokens
   * @param bufferSeconds - Seconds before expiration to consider "expiring soon"
   */
  isTokenExpired(tokens: OAuthTokens, bufferSeconds = 300): boolean {
    const expiresAt = new Date(tokens.expiresAt).getTime();
    const now = Date.now();
    return now >= expiresAt - bufferSeconds * 1000;
  }

  /**
   * Normalize Google token response to standard format
   */
  private normalizeTokenResponse(response: GoogleTokenResponse): OAuthTokens {
    const expiresAt = new Date(Date.now() + response.expires_in * 1000).toISOString();

    // Parse scope from response or use requested scopes
    const scopes = response.scope ? response.scope.split(' ') : this.scopes;
    const refreshToken = response.refresh_token;
    if (!refreshToken) {
      // We require a refresh token for background refresh flows; missing it indicates a bad
      // OAuth config (e.g., missing offline access) or a provider-side issue.
      throw new GoogleOAuthError(
        'Missing refresh token in OAuth response.',
        'TOKEN_EXCHANGE_FAILED',
        { hasRefreshToken: false }
      );
    }

    return {
      accessToken: response.access_token,
      refreshToken,
      tokenType: response.token_type,
      expiresAt,
      scopes,
    };
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Google token endpoint response
 */
interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
}

/**
 * Google user info from userinfo endpoint
 */
export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
}

/**
 * Google OAuth error
 */
export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    public readonly code: GoogleOAuthErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

/**
 * Google OAuth error codes
 */
export type GoogleOAuthErrorCode =
  | 'TOKEN_EXCHANGE_FAILED'
  | 'TOKEN_REFRESH_FAILED'
  | 'REFRESH_TOKEN_EXPIRED'
  | 'TOKEN_REVOKE_FAILED'
  | 'INVALID_STATE'
  | 'NETWORK_ERROR';

/**
 * Type guard for GoogleOAuthError
 */
export function isGoogleOAuthError(error: unknown): error is GoogleOAuthError {
  return error instanceof GoogleOAuthError;
}

