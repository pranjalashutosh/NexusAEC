/**
 * @nexus-aec/email-providers - Microsoft OAuth 2.0 Implementation
 *
 * Implements OAuth 2.0 Authorization Code Flow with PKCE for Microsoft Graph API.
 * Supports Mail.Read, Mail.ReadWrite, Mail.Send, Calendars.Read, Contacts.Read scopes.
 *
 * @see https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow
 */

import type { OAuthTokens, OAuthState } from '../interfaces/types';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Microsoft OAuth configuration
 */
export interface MicrosoftOAuthConfig {
  /** Azure AD application (client) ID */
  clientId: string;
  /** Azure AD application client secret (for confidential clients) */
  clientSecret?: string;
  /** Redirect URI registered in Azure AD */
  redirectUri: string;
  /** Azure AD tenant ID or 'common' for multi-tenant */
  tenantId?: string;
  /** Custom scopes to request (defaults provided) */
  scopes?: string[];
}

/**
 * Default Microsoft Graph scopes for the application
 */
export const DEFAULT_MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access', // Required for refresh tokens
  'User.Read',
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.Read',
  'Calendars.ReadWrite',
  'Contacts.Read',
];

/**
 * Microsoft OAuth endpoints
 */
const MICROSOFT_ENDPOINTS = {
  authorize: (tenant: string) =>
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
  token: (tenant: string) =>
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  logout: (tenant: string) =>
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/logout`,
};

// =============================================================================
// PKCE Utilities
// =============================================================================

/**
 * Generate a cryptographically random string for PKCE code verifier
 * @param length - Length of the string (43-128 characters recommended)
 */
export function generateCodeVerifier(length = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);

  // Use crypto.getRandomValues in browser, crypto.randomBytes in Node
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto') as typeof import('crypto');
    const bytes = crypto.randomBytes(length);
    randomValues.set(bytes);
  }

  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i]! % charset.length];
  }
  return result;
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateState(): string {
  return generateCodeVerifier(32);
}

/**
 * Generate PKCE code challenge from code verifier using SHA-256
 * @param codeVerifier - The code verifier string
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  // Use Web Crypto API in browser, Node crypto in server
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(hash));
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto') as typeof import('crypto');
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    return base64UrlEncode(new Uint8Array(hash));
  }
}

/**
 * Base64 URL encode (RFC 4648)
 */
function base64UrlEncode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]!);
  }

  // Use btoa in browser, Buffer in Node
  let base64: string;
  if (typeof btoa !== 'undefined') {
    base64 = btoa(binary);
  } else {
    base64 = Buffer.from(binary, 'binary').toString('base64');
  }

  // Convert to URL-safe base64
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// =============================================================================
// Microsoft OAuth Provider
// =============================================================================

/**
 * Microsoft OAuth 2.0 provider for Azure AD / Microsoft Graph
 */
export class MicrosoftOAuthProvider {
  private readonly config: Required<Pick<MicrosoftOAuthConfig, 'clientId' | 'redirectUri'>> &
    MicrosoftOAuthConfig;
  private readonly tenant: string;
  private readonly scopes: string[];

  constructor(config: MicrosoftOAuthConfig) {
    this.config = config;
    this.tenant = config.tenantId ?? 'common';
    this.scopes = config.scopes ?? DEFAULT_MICROSOFT_SCOPES;
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
    prompt?: 'login' | 'consent' | 'select_account' | 'none';
    /** Additional state data to include */
    additionalState?: Record<string, string>;
  }): Promise<{ url: string; state: OAuthState }> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: this.scopes.join(' '),
      response_mode: 'query',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    if (options?.loginHint) {
      params.set('login_hint', options.loginHint);
    }

    if (options?.prompt) {
      params.set('prompt', options.prompt);
    }

    const url = `${MICROSOFT_ENDPOINTS.authorize(this.tenant)}?${params.toString()}`;

    return {
      url,
      state: {
        codeVerifier,
        state,
        redirectUri: this.config.redirectUri,
        provider: 'OUTLOOK',
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
      scope: this.scopes.join(' '),
      code: code,
      redirect_uri: oauthState.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: oauthState.codeVerifier,
    });

    // Add client secret for confidential clients
    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }

    const response = await fetch(MICROSOFT_ENDPOINTS.token(this.tenant), {
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
      throw new MicrosoftOAuthError(
        `Token exchange failed: ${error.error_description ?? error.error ?? response.statusText}`,
        'TOKEN_EXCHANGE_FAILED',
        error
      );
    }

    const data = (await response.json()) as MicrosoftTokenResponse;
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
      scope: this.scopes.join(' '),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    // Add client secret for confidential clients
    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }

    const response = await fetch(MICROSOFT_ENDPOINTS.token(this.tenant), {
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
      if (
        error.error === 'invalid_grant' ||
        error.error === 'interaction_required'
      ) {
        throw new MicrosoftOAuthError(
          'Refresh token expired or revoked. Re-authentication required.',
          'REFRESH_TOKEN_EXPIRED',
          error
        );
      }

      throw new MicrosoftOAuthError(
        `Token refresh failed: ${error.error_description ?? error.error ?? response.statusText}`,
        'TOKEN_REFRESH_FAILED',
        error
      );
    }

    const data = (await response.json()) as MicrosoftTokenResponse;
    return this.normalizeTokenResponse(data);
  }

  /**
   * Validate an access token by making a test API call
   *
   * @param accessToken - The access token to validate
   * @returns Validation result with user info if valid
   */
  async validateToken(
    accessToken: string
  ): Promise<{ valid: boolean; userInfo?: MicrosoftUserInfo; error?: string }> {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
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

      const userInfo = (await response.json()) as MicrosoftUserInfo;
      return { valid: true, userInfo };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get the logout URL to sign out the user
   *
   * @param postLogoutRedirectUri - Where to redirect after logout
   */
  getLogoutUrl(postLogoutRedirectUri?: string): string {
    const params = new URLSearchParams();
    if (postLogoutRedirectUri) {
      params.set('post_logout_redirect_uri', postLogoutRedirectUri);
    }

    const queryString = params.toString();
    const baseUrl = MICROSOFT_ENDPOINTS.logout(this.tenant);
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
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
   * Normalize Microsoft token response to standard format
   */
  private normalizeTokenResponse(response: MicrosoftTokenResponse): OAuthTokens {
    const expiresAt = new Date(Date.now() + response.expires_in * 1000).toISOString();

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      tokenType: response.token_type,
      expiresAt,
      scopes: response.scope.split(' '),
    };
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Microsoft token endpoint response
 */
interface MicrosoftTokenResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in?: number;
  access_token: string;
  refresh_token: string;
  id_token?: string;
}

/**
 * Microsoft user info from /me endpoint
 */
export interface MicrosoftUserInfo {
  id: string;
  displayName: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  userPrincipalName: string;
  jobTitle?: string;
  officeLocation?: string;
  preferredLanguage?: string;
}

/**
 * Microsoft OAuth error
 */
export class MicrosoftOAuthError extends Error {
  constructor(
    message: string,
    public readonly code: MicrosoftOAuthErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'MicrosoftOAuthError';
  }
}

/**
 * Microsoft OAuth error codes
 */
export type MicrosoftOAuthErrorCode =
  | 'TOKEN_EXCHANGE_FAILED'
  | 'TOKEN_REFRESH_FAILED'
  | 'REFRESH_TOKEN_EXPIRED'
  | 'INVALID_STATE'
  | 'NETWORK_ERROR';

/**
 * Type guard for MicrosoftOAuthError
 */
export function isMicrosoftOAuthError(error: unknown): error is MicrosoftOAuthError {
  return error instanceof MicrosoftOAuthError;
}

