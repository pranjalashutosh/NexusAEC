/**
 * Tests for Token Manager
 */

import {
  TokenManager,
  TokenManagerError,
  isTokenManagerError,
  InMemoryTokenStorage,
} from './token-manager';

import type { OAuthTokens, EmailSource } from '../interfaces/types';

// Mock OAuth provider
const createMockProvider = (overrides: Partial<{
  isTokenExpired: (tokens: OAuthTokens, buffer: number) => boolean;
  refreshTokens: (refreshToken: string) => Promise<OAuthTokens>;
}> = {}) => ({
  source: 'OUTLOOK' as EmailSource,
  isTokenExpired: overrides.isTokenExpired ?? (() => false),
  refreshTokens: overrides.refreshTokens ?? (async () => createMockTokens()),
});

// Create mock tokens
const createMockTokens = (overrides: Partial<OAuthTokens> = {}): OAuthTokens => ({
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  tokenType: 'Bearer',
  expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
  scopes: ['Mail.Read'],
  ...overrides,
});

describe('TokenManager', () => {
  let storage: InMemoryTokenStorage;
  let manager: TokenManager;

  beforeEach(() => {
    storage = new InMemoryTokenStorage();
    manager = new TokenManager({ storage });
  });

  afterEach(() => {
    manager.dispose();
    storage.clear();
  });

  describe('storeTokens', () => {
    it('should store tokens with user info', async () => {
      const tokens = createMockTokens();

      await manager.storeTokens('user1', 'OUTLOOK', tokens, {
        email: 'user@example.com',
        displayName: 'Test User',
      });

      const stored = await manager.getTokens('user1', 'OUTLOOK');

      expect(stored).not.toBeNull();
      expect(stored?.tokens).toEqual(tokens);
      expect(stored?.userId).toBe('user1');
      expect(stored?.source).toBe('OUTLOOK');
      expect(stored?.email).toBe('user@example.com');
      expect(stored?.displayName).toBe('Test User');
      expect(stored?.storedAt).toBeDefined();
    });

    it('should store tokens without user info', async () => {
      const tokens = createMockTokens();

      await manager.storeTokens('user1', 'GMAIL', tokens);

      const stored = await manager.getTokens('user1', 'GMAIL');

      expect(stored).not.toBeNull();
      expect(stored?.tokens).toEqual(tokens);
      expect(stored?.email).toBeUndefined();
    });

    it('should store tokens for different providers separately', async () => {
      const outlookTokens = createMockTokens({ accessToken: 'outlook-token' });
      const gmailTokens = createMockTokens({ accessToken: 'gmail-token' });

      await manager.storeTokens('user1', 'OUTLOOK', outlookTokens);
      await manager.storeTokens('user1', 'GMAIL', gmailTokens);

      const outlook = await manager.getTokens('user1', 'OUTLOOK');
      const gmail = await manager.getTokens('user1', 'GMAIL');

      expect(outlook?.tokens.accessToken).toBe('outlook-token');
      expect(gmail?.tokens.accessToken).toBe('gmail-token');
    });
  });

  describe('getTokens', () => {
    it('should return null for non-existent tokens', async () => {
      const result = await manager.getTokens('nonexistent', 'OUTLOOK');
      expect(result).toBeNull();
    });

    it('should return stored token data', async () => {
      const tokens = createMockTokens();
      await manager.storeTokens('user1', 'OUTLOOK', tokens);

      const result = await manager.getTokens('user1', 'OUTLOOK');

      expect(result).not.toBeNull();
      expect(result?.tokens).toEqual(tokens);
    });
  });

  describe('removeTokens', () => {
    it('should remove stored tokens', async () => {
      const tokens = createMockTokens();
      await manager.storeTokens('user1', 'OUTLOOK', tokens);

      await manager.removeTokens('user1', 'OUTLOOK');

      const result = await manager.getTokens('user1', 'OUTLOOK');
      expect(result).toBeNull();
    });

    it('should not throw when removing non-existent tokens', async () => {
      await expect(
        manager.removeTokens('nonexistent', 'OUTLOOK')
      ).resolves.not.toThrow();
    });
  });

  describe('hasTokens', () => {
    it('should return true for existing tokens', async () => {
      const tokens = createMockTokens();
      await manager.storeTokens('user1', 'OUTLOOK', tokens);

      const result = await manager.hasTokens('user1', 'OUTLOOK');
      expect(result).toBe(true);
    });

    it('should return false for non-existent tokens', async () => {
      const result = await manager.hasTokens('nonexistent', 'OUTLOOK');
      expect(result).toBe(false);
    });
  });

  describe('getUserSources', () => {
    it('should return empty array for user with no tokens', async () => {
      const sources = await manager.getUserSources('user1');
      expect(sources).toEqual([]);
    });

    it('should return all sources for user with tokens', async () => {
      const tokens = createMockTokens();
      await manager.storeTokens('user1', 'OUTLOOK', tokens);
      await manager.storeTokens('user1', 'GMAIL', tokens);

      const sources = await manager.getUserSources('user1');

      expect(sources).toHaveLength(2);
      expect(sources).toContain('OUTLOOK');
      expect(sources).toContain('GMAIL');
    });

    it('should only return sources with tokens', async () => {
      const tokens = createMockTokens();
      await manager.storeTokens('user1', 'OUTLOOK', tokens);

      const sources = await manager.getUserSources('user1');

      expect(sources).toEqual(['OUTLOOK']);
    });
  });

  describe('getValidAccessToken', () => {
    it('should throw when no tokens exist', async () => {
      await expect(
        manager.getValidAccessToken('nonexistent', 'OUTLOOK')
      ).rejects.toThrow(TokenManagerError);
    });

    it('should return access token when valid', async () => {
      const tokens = createMockTokens({ accessToken: 'valid-token' });
      await manager.storeTokens('user1', 'OUTLOOK', tokens);

      const provider = createMockProvider({ isTokenExpired: () => false });
      manager.registerProvider('OUTLOOK', provider as never);

      const accessToken = await manager.getValidAccessToken('user1', 'OUTLOOK');
      expect(accessToken).toBe('valid-token');
    });

    it('should refresh and return new token when expired', async () => {
      const oldTokens = createMockTokens({ accessToken: 'old-token' });
      await manager.storeTokens('user1', 'OUTLOOK', oldTokens);

      const newTokens = createMockTokens({ accessToken: 'new-token' });
      const provider = createMockProvider({
        isTokenExpired: () => true,
        refreshTokens: async () => newTokens,
      });
      manager.registerProvider('OUTLOOK', provider as never);

      const accessToken = await manager.getValidAccessToken('user1', 'OUTLOOK');
      expect(accessToken).toBe('new-token');
    });
  });

  describe('areTokensValid', () => {
    it('should return false when no tokens exist', async () => {
      const result = await manager.areTokensValid('nonexistent', 'OUTLOOK');
      expect(result).toBe(false);
    });

    it('should return true for valid tokens with provider', async () => {
      const tokens = createMockTokens();
      await manager.storeTokens('user1', 'OUTLOOK', tokens);

      const provider = createMockProvider({ isTokenExpired: () => false });
      manager.registerProvider('OUTLOOK', provider as never);

      const result = await manager.areTokensValid('user1', 'OUTLOOK');
      expect(result).toBe(true);
    });

    it('should return false for expired tokens with provider', async () => {
      const tokens = createMockTokens();
      await manager.storeTokens('user1', 'OUTLOOK', tokens);

      const provider = createMockProvider({ isTokenExpired: () => true });
      manager.registerProvider('OUTLOOK', provider as never);

      const result = await manager.areTokensValid('user1', 'OUTLOOK');
      expect(result).toBe(false);
    });

    it('should check expiration directly without provider', async () => {
      // Valid token (expires in future)
      const validTokens = createMockTokens({
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      await manager.storeTokens('user1', 'OUTLOOK', validTokens);

      expect(await manager.areTokensValid('user1', 'OUTLOOK')).toBe(true);

      // Expired token
      const expiredTokens = createMockTokens({
        expiresAt: new Date(Date.now() - 60000).toISOString(),
      });
      await manager.storeTokens('user2', 'OUTLOOK', expiredTokens);

      expect(await manager.areTokensValid('user2', 'OUTLOOK')).toBe(false);
    });
  });

  describe('refreshTokens', () => {
    it('should throw when no tokens exist', async () => {
      await expect(
        manager.refreshTokens('nonexistent', 'OUTLOOK')
      ).rejects.toThrow(TokenManagerError);
    });

    it('should throw when no provider is registered', async () => {
      const tokens = createMockTokens();
      await manager.storeTokens('user1', 'OUTLOOK', tokens);

      await expect(
        manager.refreshTokens('user1', 'OUTLOOK')
      ).rejects.toThrow('No OAuth provider registered');
    });

    it('should refresh and update stored tokens', async () => {
      const oldTokens = createMockTokens({ accessToken: 'old-token' });
      await manager.storeTokens('user1', 'OUTLOOK', oldTokens);

      const newTokens = createMockTokens({ accessToken: 'new-token' });
      const provider = createMockProvider({
        refreshTokens: async () => newTokens,
      });
      manager.registerProvider('OUTLOOK', provider as never);

      const result = await manager.refreshTokens('user1', 'OUTLOOK');

      expect(result.accessToken).toBe('new-token');

      // Verify stored tokens are updated
      const stored = await manager.getTokens('user1', 'OUTLOOK');
      expect(stored?.tokens.accessToken).toBe('new-token');
      expect(stored?.lastRefreshedAt).toBeDefined();
    });

    it('should call onTokenRefresh callback', async () => {
      const onTokenRefresh = jest.fn();
      const managerWithCallback = new TokenManager({
        storage,
        onTokenRefresh,
      });

      const oldTokens = createMockTokens();
      await managerWithCallback.storeTokens('user1', 'OUTLOOK', oldTokens);

      const newTokens = createMockTokens({ accessToken: 'new-token' });
      const provider = createMockProvider({
        refreshTokens: async () => newTokens,
      });
      managerWithCallback.registerProvider('OUTLOOK', provider as never);

      await managerWithCallback.refreshTokens('user1', 'OUTLOOK');

      expect(onTokenRefresh).toHaveBeenCalledWith('user1', 'OUTLOOK', newTokens);

      managerWithCallback.dispose();
    });
  });

  describe('registerProvider', () => {
    it('should register provider', () => {
      const provider = createMockProvider();
      manager.registerProvider('OUTLOOK', provider as never);

      expect(manager.getProvider('OUTLOOK')).toBe(provider);
    });

    it('should overwrite existing provider', () => {
      const provider1 = createMockProvider();
      const provider2 = createMockProvider();

      manager.registerProvider('OUTLOOK', provider1 as never);
      manager.registerProvider('OUTLOOK', provider2 as never);

      expect(manager.getProvider('OUTLOOK')).toBe(provider2);
    });
  });
});

describe('InMemoryTokenStorage', () => {
  let storage: InMemoryTokenStorage;

  beforeEach(() => {
    storage = new InMemoryTokenStorage();
  });

  it('should store and retrieve values', async () => {
    await storage.set('key1', 'value1');
    const result = await storage.get('key1');
    expect(result).toBe('value1');
  });

  it('should return null for non-existent keys', async () => {
    const result = await storage.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should delete values', async () => {
    await storage.set('key1', 'value1');
    await storage.delete('key1');
    const result = await storage.get('key1');
    expect(result).toBeNull();
  });

  it('should check if key exists', async () => {
    await storage.set('key1', 'value1');
    expect(await storage.has('key1')).toBe(true);
    expect(await storage.has('nonexistent')).toBe(false);
  });

  it('should clear all data', async () => {
    await storage.set('key1', 'value1');
    await storage.set('key2', 'value2');
    storage.clear();
    expect(await storage.get('key1')).toBeNull();
    expect(await storage.get('key2')).toBeNull();
  });
});

describe('TokenManagerError', () => {
  it('should create error with all properties', () => {
    const cause = new Error('Original error');
    const error = new TokenManagerError('Token refresh failed', 'REFRESH_FAILED', cause);

    expect(error.message).toBe('Token refresh failed');
    expect(error.code).toBe('REFRESH_FAILED');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('TokenManagerError');
  });

  it('should be an instance of Error', () => {
    const error = new TokenManagerError('Test', 'NO_TOKENS');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TokenManagerError);
  });
});

describe('isTokenManagerError', () => {
  it('should return true for TokenManagerError', () => {
    const error = new TokenManagerError('Test', 'NO_TOKENS');
    expect(isTokenManagerError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('Test');
    expect(isTokenManagerError(error)).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isTokenManagerError(null)).toBe(false);
    expect(isTokenManagerError(undefined)).toBe(false);
  });
});

