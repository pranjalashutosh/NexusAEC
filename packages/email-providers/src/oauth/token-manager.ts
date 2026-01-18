/**
 * @nexus-aec/email-providers - Token Manager
 *
 * Manages OAuth token storage, automatic refresh, and expiration handling.
 * Uses secure storage for token persistence.
 */

import type { GoogleOAuthProvider } from './google';
import type { MicrosoftOAuthProvider } from './microsoft';
import type { OAuthTokens, EmailSource } from '../interfaces/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Stored token data with metadata
 */
export interface StoredTokenData {
  /** The OAuth tokens */
  tokens: OAuthTokens;
  /** User identifier */
  userId: string;
  /** Email provider source */
  source: EmailSource;
  /** User's email address */
  email?: string;
  /** User's display name */
  displayName?: string;
  /** When the tokens were stored */
  storedAt: string;
  /** When tokens were last refreshed */
  lastRefreshedAt?: string;
}

/**
 * Token refresh callback for notifying when tokens are refreshed
 */
export type TokenRefreshCallback = (
  userId: string,
  source: EmailSource,
  newTokens: OAuthTokens
) => void | Promise<void>;

/**
 * Token expiration callback for notifying when re-auth is needed
 */
export type TokenExpirationCallback = (
  userId: string,
  source: EmailSource,
  error: Error
) => void | Promise<void>;

/**
 * Secure storage interface (compatible with @nexus-aec/secure-storage)
 */
export interface ITokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * OAuth provider type (Microsoft or Google)
 */
export type OAuthProvider = MicrosoftOAuthProvider | GoogleOAuthProvider;

/**
 * Token manager configuration
 */
export interface TokenManagerConfig {
  /** Secure storage instance */
  storage: ITokenStorage;
  /** Buffer time before expiration to trigger refresh (seconds) */
  refreshBufferSeconds?: number;
  /** Enable automatic background refresh */
  autoRefresh?: boolean;
  /** Callback when tokens are refreshed */
  onTokenRefresh?: TokenRefreshCallback;
  /** Callback when re-authentication is required */
  onTokenExpired?: TokenExpirationCallback;
}

// =============================================================================
// Token Manager
// =============================================================================

/**
 * Token Manager - Handles secure token storage and automatic refresh
 */
export class TokenManager {
  private readonly storage: ITokenStorage;
  private readonly refreshBufferSeconds: number;
  private readonly autoRefresh: boolean;
  // With exactOptionalPropertyTypes enabled, prefer `T | undefined` over `?: T`
  // for class fields that may be explicitly assigned from optional config.
  private readonly onTokenRefresh: TokenRefreshCallback | undefined;
  private readonly onTokenExpired: TokenExpirationCallback | undefined;

  /** Registered OAuth providers by source */
  private providers = new Map<EmailSource, OAuthProvider>();

  /** Active refresh timers */
  private refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Tokens currently being refreshed (prevents duplicate refresh) */
  private refreshInProgress = new Set<string>();

  constructor(config: TokenManagerConfig) {
    this.storage = config.storage;
    this.refreshBufferSeconds = config.refreshBufferSeconds ?? 300; // 5 minutes
    this.autoRefresh = config.autoRefresh ?? true;
    this.onTokenRefresh = config.onTokenRefresh;
    this.onTokenExpired = config.onTokenExpired;
  }

  // ===========================================================================
  // Provider Registration
  // ===========================================================================

  /**
   * Register an OAuth provider for token refresh
   */
  registerProvider(source: EmailSource, provider: OAuthProvider): void {
    this.providers.set(source, provider);
  }

  /**
   * Get a registered provider
   */
  getProvider(source: EmailSource): OAuthProvider | undefined {
    return this.providers.get(source);
  }

  // ===========================================================================
  // Token Storage
  // ===========================================================================

  /**
   * Store tokens for a user
   */
  async storeTokens(
    userId: string,
    source: EmailSource,
    tokens: OAuthTokens,
    userInfo?: { email?: string; displayName?: string }
  ): Promise<void> {
    const key = this.getStorageKey(userId, source);

    const data: StoredTokenData = {
      tokens,
      userId,
      source,
      ...(userInfo?.email && { email: userInfo.email }),
      ...(userInfo?.displayName && { displayName: userInfo.displayName }),
      storedAt: new Date().toISOString(),
    };

    await this.storage.set(key, JSON.stringify(data));

    // Schedule auto-refresh if enabled
    if (this.autoRefresh) {
      this.scheduleRefresh(userId, source, tokens);
    }
  }

  /**
   * Retrieve tokens for a user
   */
  async getTokens(userId: string, source: EmailSource): Promise<StoredTokenData | null> {
    const key = this.getStorageKey(userId, source);
    const data = await this.storage.get(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as StoredTokenData;
    } catch {
      // Invalid data, remove it
      await this.storage.delete(key);
      return null;
    }
  }

  /**
   * Remove tokens for a user
   */
  async removeTokens(userId: string, source: EmailSource): Promise<void> {
    const key = this.getStorageKey(userId, source);
    await this.storage.delete(key);

    // Cancel any scheduled refresh
    this.cancelRefresh(userId, source);
  }

  /**
   * Check if tokens exist for a user
   */
  async hasTokens(userId: string, source: EmailSource): Promise<boolean> {
    const key = this.getStorageKey(userId, source);
    return this.storage.has(key);
  }

  /**
   * Get all stored token sources for a user
   */
  async getUserSources(userId: string): Promise<EmailSource[]> {
    const sources: EmailSource[] = [];

    for (const source of ['OUTLOOK', 'GMAIL'] as EmailSource[]) {
      if (await this.hasTokens(userId, source)) {
        sources.push(source);
      }
    }

    return sources;
  }

  // ===========================================================================
  // Token Access & Validation
  // ===========================================================================

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidAccessToken(userId: string, source: EmailSource): Promise<string> {
    const data = await this.getTokens(userId, source);

    if (!data) {
      throw new TokenManagerError(
        `No tokens found for user ${userId} and source ${source}`,
        'NO_TOKENS'
      );
    }

    // Check if token is expired or expiring soon
    const provider = this.providers.get(source);
    if (provider?.isTokenExpired(data.tokens, this.refreshBufferSeconds)) {
      // Token is expired or expiring soon, refresh it
      const newTokens = await this.refreshTokens(userId, source);
      return newTokens.accessToken;
    }

    return data.tokens.accessToken;
  }

  /**
   * Check if tokens are valid (not expired)
   */
  async areTokensValid(userId: string, source: EmailSource): Promise<boolean> {
    const data = await this.getTokens(userId, source);

    if (!data) {
      return false;
    }

    const provider = this.providers.get(source);
    if (provider) {
      return !provider.isTokenExpired(data.tokens, 0);
    }

    // Without a provider, check expiration directly
    const expiresAt = new Date(data.tokens.expiresAt).getTime();
    return Date.now() < expiresAt;
  }

  // ===========================================================================
  // Token Refresh
  // ===========================================================================

  /**
   * Manually refresh tokens
   */
  async refreshTokens(userId: string, source: EmailSource): Promise<OAuthTokens> {
    const key = this.getStorageKey(userId, source);

    // Prevent duplicate refresh requests
    if (this.refreshInProgress.has(key)) {
      // Wait for the current refresh to complete
      return this.waitForRefresh(userId, source);
    }

    this.refreshInProgress.add(key);

    try {
      const data = await this.getTokens(userId, source);

      if (!data) {
        throw new TokenManagerError(
          `No tokens found for user ${userId} and source ${source}`,
          'NO_TOKENS'
        );
      }

      const provider = this.providers.get(source);

      if (!provider) {
        throw new TokenManagerError(
          `No OAuth provider registered for source ${source}`,
          'NO_PROVIDER'
        );
      }

      try {
        const newTokens = await provider.refreshTokens(data.tokens.refreshToken);

        // Update stored tokens
        const updatedData: StoredTokenData = {
          ...data,
          tokens: newTokens,
          lastRefreshedAt: new Date().toISOString(),
        };

        await this.storage.set(key, JSON.stringify(updatedData));

        // Notify callback
        if (this.onTokenRefresh) {
          await this.onTokenRefresh(userId, source, newTokens);
        }

        // Reschedule auto-refresh
        if (this.autoRefresh) {
          this.scheduleRefresh(userId, source, newTokens);
        }

        return newTokens;
      } catch (error) {
        // Check if re-auth is required
        if (this.isReauthRequired(error)) {
          // Notify callback
          if (this.onTokenExpired) {
            await this.onTokenExpired(
              userId,
              source,
              error instanceof Error ? error : new Error(String(error))
            );
          }
        }

        throw new TokenManagerError(
          `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`,
          'REFRESH_FAILED',
          error
        );
      }
    } finally {
      this.refreshInProgress.delete(key);
    }
  }

  // ===========================================================================
  // Auto-Refresh Scheduling
  // ===========================================================================

  /**
   * Schedule automatic token refresh
   */
  private scheduleRefresh(userId: string, source: EmailSource, tokens: OAuthTokens): void {
    const key = this.getStorageKey(userId, source);

    // Cancel any existing timer
    this.cancelRefresh(userId, source);

    // Calculate when to refresh (before expiration by buffer time)
    const expiresAt = new Date(tokens.expiresAt).getTime();
    const refreshAt = expiresAt - this.refreshBufferSeconds * 1000;
    const delay = Math.max(0, refreshAt - Date.now());

    // Don't schedule if already expired
    if (delay === 0) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        await this.refreshTokens(userId, source);
      } catch (error) {
        // Error already handled in refreshTokens
        console.error(`Auto-refresh failed for ${userId}/${source}:`, error);
      }
    }, delay);

    this.refreshTimers.set(key, timer);
  }

  /**
   * Cancel scheduled refresh
   */
  private cancelRefresh(userId: string, source: EmailSource): void {
    const key = this.getStorageKey(userId, source);
    const timer = this.refreshTimers.get(key);

    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(key);
    }
  }

  /**
   * Wait for an ongoing refresh to complete
   */
  private async waitForRefresh(userId: string, source: EmailSource): Promise<OAuthTokens> {
    const key = this.getStorageKey(userId, source);

    // Poll until refresh is complete
    const maxWait = 30000; // 30 seconds
    const pollInterval = 100;
    let waited = 0;

    while (this.refreshInProgress.has(key) && waited < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }

    if (this.refreshInProgress.has(key)) {
      throw new TokenManagerError('Token refresh timeout', 'REFRESH_TIMEOUT');
    }

    // Get the refreshed tokens
    const data = await this.getTokens(userId, source);

    if (!data) {
      throw new TokenManagerError('Tokens not found after refresh', 'NO_TOKENS');
    }

    return data.tokens;
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Generate storage key for a user's tokens
   */
  private getStorageKey(userId: string, source: EmailSource): string {
    return `nexus:tokens:${userId}:${source.toLowerCase()}`;
  }

  /**
   * Check if an error indicates re-authentication is required
   */
  private isReauthRequired(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;
      return code === 'REFRESH_TOKEN_EXPIRED' || code === 'invalid_grant';
    }
    return false;
  }

  /**
   * Clean up resources (call on shutdown)
   */
  dispose(): void {
    // Cancel all refresh timers
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
    this.refreshInProgress.clear();
  }
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Token manager error
 */
export class TokenManagerError extends Error {
  constructor(
    message: string,
    public readonly code: TokenManagerErrorCode,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TokenManagerError';
  }
}

/**
 * Token manager error codes
 */
export type TokenManagerErrorCode =
  | 'NO_TOKENS'
  | 'NO_PROVIDER'
  | 'REFRESH_FAILED'
  | 'REFRESH_TIMEOUT'
  | 'STORAGE_ERROR';

/**
 * Type guard for TokenManagerError
 */
export function isTokenManagerError(error: unknown): error is TokenManagerError {
  return error instanceof TokenManagerError;
}

// =============================================================================
// In-Memory Storage (for testing/development)
// =============================================================================

/**
 * Simple in-memory token storage for testing
 */
export class InMemoryTokenStorage implements ITokenStorage {
  private data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  /** Clear all data (for testing) */
  clear(): void {
    this.data.clear();
  }
}

