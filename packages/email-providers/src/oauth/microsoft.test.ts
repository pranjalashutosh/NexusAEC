/**
 * Tests for Microsoft OAuth 2.0 Implementation
 */

import {
  MicrosoftOAuthProvider,
  MicrosoftOAuthError,
  isMicrosoftOAuthError,
  generateCodeVerifier,
  generateState,
  generateCodeChallenge,
  DEFAULT_MICROSOFT_SCOPES,
} from './microsoft';

describe('Microsoft OAuth PKCE Utilities', () => {
  describe('generateCodeVerifier', () => {
    it('should generate a string of default length (64)', () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toHaveLength(64);
    });

    it('should generate a string of specified length', () => {
      const verifier = generateCodeVerifier(128);
      expect(verifier).toHaveLength(128);
    });

    it('should only contain URL-safe characters', () => {
      const verifier = generateCodeVerifier();
      // PKCE code verifier allowed characters
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it('should generate unique values', () => {
      const verifiers = new Set<string>();
      for (let i = 0; i < 100; i++) {
        verifiers.add(generateCodeVerifier());
      }
      // All should be unique
      expect(verifiers.size).toBe(100);
    });
  });

  describe('generateState', () => {
    it('should generate a 32-character string', () => {
      const state = generateState();
      expect(state).toHaveLength(32);
    });

    it('should only contain URL-safe characters', () => {
      const state = generateState();
      expect(state).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it('should generate unique values', () => {
      const states = new Set<string>();
      for (let i = 0; i < 100; i++) {
        states.add(generateState());
      }
      expect(states.size).toBe(100);
    });
  });

  describe('generateCodeChallenge', () => {
    it('should generate a base64url-encoded challenge', async () => {
      const verifier = 'test_verifier_string_for_pkce';
      const challenge = await generateCodeChallenge(verifier);

      // Base64URL should not contain +, /, or =
      expect(challenge).not.toMatch(/[+/=]/);
      // Should be a non-empty string
      expect(challenge.length).toBeGreaterThan(0);
    });

    it('should generate consistent challenge for same verifier', async () => {
      const verifier = 'consistent_verifier_test';
      const challenge1 = await generateCodeChallenge(verifier);
      const challenge2 = await generateCodeChallenge(verifier);

      expect(challenge1).toBe(challenge2);
    });

    it('should generate different challenges for different verifiers', async () => {
      const challenge1 = await generateCodeChallenge('verifier_one');
      const challenge2 = await generateCodeChallenge('verifier_two');

      expect(challenge1).not.toBe(challenge2);
    });

    it('should generate 43-character challenge (SHA-256 = 32 bytes = 43 base64url chars)', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);

      // SHA-256 produces 32 bytes, which base64url encodes to 43 characters
      expect(challenge).toHaveLength(43);
    });
  });
});

describe('MicrosoftOAuthProvider', () => {
  const mockConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/auth/microsoft/callback',
    tenantId: 'common',
  };

  let provider: MicrosoftOAuthProvider;

  beforeEach(() => {
    provider = new MicrosoftOAuthProvider(mockConfig);
  });

  describe('constructor', () => {
    it('should use default tenant if not specified', async () => {
      const providerWithoutTenant = new MicrosoftOAuthProvider({
        clientId: 'test-id',
        redirectUri: 'http://localhost/callback',
      });

      // We can verify by checking the auth URL
      const { url } = await providerWithoutTenant.getAuthorizationUrl();
      expect(url).toContain('login.microsoftonline.com/common');
    });

    it('should use default scopes if not specified', async () => {
      const { url } = await provider.getAuthorizationUrl();
      const urlObj = new URL(url);
      const scope = urlObj.searchParams.get('scope');

      // Should contain offline_access for refresh tokens
      expect(scope).toContain('offline_access');
      expect(scope).toContain('Mail.Read');
    });

    it('should use custom scopes if specified', async () => {
      const customProvider = new MicrosoftOAuthProvider({
        ...mockConfig,
        scopes: ['openid', 'Mail.Read'],
      });

      const { url } = await customProvider.getAuthorizationUrl();
      const urlObj = new URL(url);
      const scope = urlObj.searchParams.get('scope');

      expect(scope).toBe('openid Mail.Read');
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate valid authorization URL', async () => {
      const { url } = await provider.getAuthorizationUrl();

      expect(url).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      expect(url).toContain('client_id=test-client-id');
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

    it('should return OAuth state with all required fields', async () => {
      const { state } = await provider.getAuthorizationUrl();

      expect(state.codeVerifier).toBeTruthy();
      expect(state.state).toBeTruthy();
      expect(state.redirectUri).toBe(mockConfig.redirectUri);
      expect(state.provider).toBe('OUTLOOK');
    });

    it('should include login_hint when provided', async () => {
      const { url } = await provider.getAuthorizationUrl({
        loginHint: 'user@example.com',
      });
      const urlObj = new URL(url);

      expect(urlObj.searchParams.get('login_hint')).toBe('user@example.com');
    });

    it('should include prompt when provided', async () => {
      const { url } = await provider.getAuthorizationUrl({
        prompt: 'consent',
      });
      const urlObj = new URL(url);

      expect(urlObj.searchParams.get('prompt')).toBe('consent');
    });

    it('should generate unique state on each call', async () => {
      const result1 = await provider.getAuthorizationUrl();
      const result2 = await provider.getAuthorizationUrl();

      expect(result1.state.state).not.toBe(result2.state.state);
      expect(result1.state.codeVerifier).not.toBe(result2.state.codeVerifier);
    });
  });

  describe('getLogoutUrl', () => {
    it('should generate logout URL', () => {
      const logoutUrl = provider.getLogoutUrl();
      expect(logoutUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/logout');
    });

    it('should include post_logout_redirect_uri when provided', () => {
      const logoutUrl = provider.getLogoutUrl('http://localhost:3000/logged-out');
      expect(logoutUrl).toContain('post_logout_redirect_uri=');
      expect(logoutUrl).toContain(encodeURIComponent('http://localhost:3000/logged-out'));
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for expired tokens', () => {
      const expiredTokens = {
        accessToken: 'test',
        refreshToken: 'test',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        scopes: ['Mail.Read'],
      };

      expect(provider.isTokenExpired(expiredTokens)).toBe(true);
    });

    it('should return false for valid tokens', () => {
      const validTokens = {
        accessToken: 'test',
        refreshToken: 'test',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        scopes: ['Mail.Read'],
      };

      expect(provider.isTokenExpired(validTokens)).toBe(false);
    });

    it('should return true for tokens expiring within buffer', () => {
      const soonToExpireTokens = {
        accessToken: 'test',
        refreshToken: 'test',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
        scopes: ['Mail.Read'],
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
        scopes: ['Mail.Read'],
      };

      // With 30 second buffer, token should not be considered expired
      expect(provider.isTokenExpired(tokens, 30)).toBe(false);
    });
  });
});

describe('MicrosoftOAuthError', () => {
  it('should create error with all properties', () => {
    const error = new MicrosoftOAuthError('Token exchange failed', 'TOKEN_EXCHANGE_FAILED', {
      error: 'invalid_grant',
    });

    expect(error.message).toBe('Token exchange failed');
    expect(error.code).toBe('TOKEN_EXCHANGE_FAILED');
    expect(error.details).toEqual({ error: 'invalid_grant' });
    expect(error.name).toBe('MicrosoftOAuthError');
  });

  it('should be an instance of Error', () => {
    const error = new MicrosoftOAuthError('Test', 'NETWORK_ERROR');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicrosoftOAuthError);
  });
});

describe('isMicrosoftOAuthError', () => {
  it('should return true for MicrosoftOAuthError', () => {
    const error = new MicrosoftOAuthError('Test', 'TOKEN_REFRESH_FAILED');
    expect(isMicrosoftOAuthError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('Test');
    expect(isMicrosoftOAuthError(error)).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isMicrosoftOAuthError(null)).toBe(false);
    expect(isMicrosoftOAuthError(undefined)).toBe(false);
  });
});

describe('DEFAULT_MICROSOFT_SCOPES', () => {
  it('should include offline_access for refresh tokens', () => {
    expect(DEFAULT_MICROSOFT_SCOPES).toContain('offline_access');
  });

  it('should include Mail scopes', () => {
    expect(DEFAULT_MICROSOFT_SCOPES).toContain('Mail.Read');
    expect(DEFAULT_MICROSOFT_SCOPES).toContain('Mail.ReadWrite');
    expect(DEFAULT_MICROSOFT_SCOPES).toContain('Mail.Send');
  });

  it('should include Calendar scopes', () => {
    expect(DEFAULT_MICROSOFT_SCOPES).toContain('Calendars.Read');
    expect(DEFAULT_MICROSOFT_SCOPES).toContain('Calendars.ReadWrite');
  });

  it('should include Contacts scope', () => {
    expect(DEFAULT_MICROSOFT_SCOPES).toContain('Contacts.Read');
  });

  it('should include User scope', () => {
    expect(DEFAULT_MICROSOFT_SCOPES).toContain('User.Read');
  });

  it('should include OpenID Connect scopes', () => {
    expect(DEFAULT_MICROSOFT_SCOPES).toContain('openid');
    expect(DEFAULT_MICROSOFT_SCOPES).toContain('profile');
    expect(DEFAULT_MICROSOFT_SCOPES).toContain('email');
  });
});
