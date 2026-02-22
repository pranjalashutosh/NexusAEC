/**
 * Tests for Google OAuth 2.0 Implementation
 */

import {
  GoogleOAuthProvider,
  GoogleOAuthError,
  isGoogleOAuthError,
  DEFAULT_GOOGLE_SCOPES,
} from './google';

describe('GoogleOAuthProvider', () => {
  const mockConfig = {
    clientId: 'test-client-id.apps.googleusercontent.com',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/auth/google/callback',
  };

  let provider: GoogleOAuthProvider;

  beforeEach(() => {
    provider = new GoogleOAuthProvider(mockConfig);
  });

  describe('constructor', () => {
    it('should use default scopes if not specified', async () => {
      const { url } = await provider.getAuthorizationUrl();
      const urlObj = new URL(url);
      const scope = urlObj.searchParams.get('scope');

      // Should contain Gmail scopes
      expect(scope).toContain('https://www.googleapis.com/auth/gmail.readonly');
      expect(scope).toContain('https://www.googleapis.com/auth/gmail.modify');
    });

    it('should use custom scopes if specified', async () => {
      const customProvider = new GoogleOAuthProvider({
        ...mockConfig,
        scopes: ['openid', 'email'],
      });

      const { url } = await customProvider.getAuthorizationUrl();
      const urlObj = new URL(url);
      const scope = urlObj.searchParams.get('scope');

      expect(scope).toBe('openid email');
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate valid authorization URL', async () => {
      const { url } = await provider.getAuthorizationUrl();

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=');
      expect(url).toContain('response_type=code');
      expect(url).toContain('code_challenge_method=S256');
    });

    it('should include PKCE parameters', async () => {
      const { url, state } = await provider.getAuthorizationUrl();
      const urlObj = new URL(url);

      expect(urlObj.searchParams.get('code_challenge')).toBeTruthy();
      expect(urlObj.searchParams.get('code_challenge_method')).toBe('S256');
      expect(state.codeVerifier).toBeTruthy();
    });

    it('should include state parameter for CSRF protection', async () => {
      const { url, state } = await provider.getAuthorizationUrl();
      const urlObj = new URL(url);

      expect(urlObj.searchParams.get('state')).toBe(state.state);
    });

    it('should return OAuth state with GMAIL provider', async () => {
      const { state } = await provider.getAuthorizationUrl();

      expect(state.codeVerifier).toBeTruthy();
      expect(state.state).toBeTruthy();
      expect(state.redirectUri).toBe(mockConfig.redirectUri);
      expect(state.provider).toBe('GMAIL');
    });

    it('should request offline access by default', async () => {
      const { url } = await provider.getAuthorizationUrl();
      const urlObj = new URL(url);

      expect(urlObj.searchParams.get('access_type')).toBe('offline');
    });

    it('should include login_hint when provided', async () => {
      const { url } = await provider.getAuthorizationUrl({
        loginHint: 'user@gmail.com',
      });
      const urlObj = new URL(url);

      expect(urlObj.searchParams.get('login_hint')).toBe('user@gmail.com');
    });

    it('should include prompt when provided', async () => {
      const { url } = await provider.getAuthorizationUrl({
        prompt: 'consent',
      });
      const urlObj = new URL(url);

      expect(urlObj.searchParams.get('prompt')).toBe('consent');
    });

    it('should include include_granted_scopes when requested', async () => {
      const { url } = await provider.getAuthorizationUrl({
        includeGrantedScopes: true,
      });
      const urlObj = new URL(url);

      expect(urlObj.searchParams.get('include_granted_scopes')).toBe('true');
    });

    it('should allow online access type', async () => {
      const { url } = await provider.getAuthorizationUrl({
        accessType: 'online',
      });
      const urlObj = new URL(url);

      expect(urlObj.searchParams.get('access_type')).toBe('online');
    });

    it('should generate unique state on each call', async () => {
      const result1 = await provider.getAuthorizationUrl();
      const result2 = await provider.getAuthorizationUrl();

      expect(result1.state.state).not.toBe(result2.state.state);
      expect(result1.state.codeVerifier).not.toBe(result2.state.codeVerifier);
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for expired tokens', () => {
      const expiredTokens = {
        accessToken: 'test',
        refreshToken: 'test',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        scopes: ['email'],
      };

      expect(provider.isTokenExpired(expiredTokens)).toBe(true);
    });

    it('should return false for valid tokens', () => {
      const validTokens = {
        accessToken: 'test',
        refreshToken: 'test',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        scopes: ['email'],
      };

      expect(provider.isTokenExpired(validTokens)).toBe(false);
    });

    it('should return true for tokens expiring within buffer', () => {
      const soonToExpireTokens = {
        accessToken: 'test',
        refreshToken: 'test',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
        scopes: ['email'],
      };

      // Default buffer is 5 minutes (300 seconds)
      expect(provider.isTokenExpired(soonToExpireTokens)).toBe(true);
    });

    it('should respect custom buffer', () => {
      const tokens = {
        accessToken: 'test',
        refreshToken: 'test',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
        scopes: ['email'],
      };

      // With 30 second buffer, token should not be considered expired
      expect(provider.isTokenExpired(tokens, 30)).toBe(false);
    });
  });
});

describe('GoogleOAuthError', () => {
  it('should create error with all properties', () => {
    const error = new GoogleOAuthError('Token exchange failed', 'TOKEN_EXCHANGE_FAILED', {
      error: 'invalid_grant',
    });

    expect(error.message).toBe('Token exchange failed');
    expect(error.code).toBe('TOKEN_EXCHANGE_FAILED');
    expect(error.details).toEqual({ error: 'invalid_grant' });
    expect(error.name).toBe('GoogleOAuthError');
  });

  it('should be an instance of Error', () => {
    const error = new GoogleOAuthError('Test', 'NETWORK_ERROR');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GoogleOAuthError);
  });
});

describe('isGoogleOAuthError', () => {
  it('should return true for GoogleOAuthError', () => {
    const error = new GoogleOAuthError('Test', 'TOKEN_REFRESH_FAILED');
    expect(isGoogleOAuthError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('Test');
    expect(isGoogleOAuthError(error)).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isGoogleOAuthError(null)).toBe(false);
    expect(isGoogleOAuthError(undefined)).toBe(false);
  });
});

describe('DEFAULT_GOOGLE_SCOPES', () => {
  it('should include OpenID Connect scopes', () => {
    expect(DEFAULT_GOOGLE_SCOPES).toContain('openid');
    expect(DEFAULT_GOOGLE_SCOPES).toContain('profile');
    expect(DEFAULT_GOOGLE_SCOPES).toContain('email');
  });

  it('should include Gmail scopes', () => {
    expect(DEFAULT_GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/gmail.readonly');
    expect(DEFAULT_GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/gmail.modify');
    expect(DEFAULT_GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/gmail.compose');
    expect(DEFAULT_GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/gmail.send');
  });

  it('should include Calendar scopes', () => {
    expect(DEFAULT_GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/calendar.readonly');
    expect(DEFAULT_GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/calendar.events');
  });

  it('should include Contacts scope', () => {
    expect(DEFAULT_GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/contacts.readonly');
  });
});
