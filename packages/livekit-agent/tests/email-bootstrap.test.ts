/**
 * Tests for email-bootstrap module
 *
 * Verifies that:
 * - Metadata is correctly parsed into EmailCredentials
 * - Provider adapters are instantiated from credentials
 * - UnifiedInboxService and SmartDraftService are wired up
 * - setEmailServices/clearEmailServices are called at the right times
 */

// Mock email-providers before imports
jest.mock('@nexus-aec/email-providers', () => {
  const mockOutlookAdapter = jest.fn().mockImplementation((config: any) => ({
    source: 'OUTLOOK' as const,
    userId: config.userId,
    testConnection: jest.fn().mockResolvedValue(true),
  }));

  const mockGmailAdapter = jest.fn().mockImplementation((config: any) => ({
    source: 'GMAIL' as const,
    userId: config.userId,
    testConnection: jest.fn().mockResolvedValue(true),
  }));

  const mockUnifiedInboxService = jest.fn().mockImplementation(() => ({
    fetchUnread: jest.fn().mockResolvedValue({ items: [], errors: [] }),
    addProvider: jest.fn(),
  }));

  const mockSmartDraftService = jest.fn().mockImplementation(() => ({
    createDraft: jest.fn().mockResolvedValue({}),
  }));

  return {
    OutlookAdapter: mockOutlookAdapter,
    GmailAdapter: mockGmailAdapter,
    UnifiedInboxService: mockUnifiedInboxService,
    SmartDraftService: mockSmartDraftService,
  };
});

// Mock the email-tools service registry
const mockSetEmailServices = jest.fn();
const mockClearEmailServices = jest.fn();

jest.mock('../src/tools/email-tools', () => ({
  setEmailServices: mockSetEmailServices,
  clearEmailServices: mockClearEmailServices,
}));

import {
  parseEmailCredentials,
  bootstrapEmailServices,
  bootstrapFromMetadata,
  teardownEmailServices,
} from '../src/email-bootstrap';

import type { EmailCredentials } from '../src/email-bootstrap';
import type { OAuthTokens } from '@nexus-aec/email-providers';

import {
  OutlookAdapter,
  GmailAdapter,
  UnifiedInboxService,
  SmartDraftService,
} from '@nexus-aec/email-providers';

// =============================================================================
// Test Data
// =============================================================================

function createMockTokens(): OAuthTokens {
  return {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    scopes: ['mail.read', 'mail.readwrite'],
  };
}

function createMetadata(email: Record<string, unknown>): string {
  return JSON.stringify({ email });
}

// =============================================================================
// Tests
// =============================================================================

describe('email-bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // parseEmailCredentials
  // ===========================================================================

  describe('parseEmailCredentials', () => {
    it('returns null for undefined metadata', () => {
      expect(parseEmailCredentials(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseEmailCredentials('')).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(parseEmailCredentials('not-json')).toBeNull();
    });

    it('returns null when no email field in metadata', () => {
      expect(parseEmailCredentials(JSON.stringify({ other: 'data' }))).toBeNull();
    });

    it('returns null when email field has no userId', () => {
      const metadata = createMetadata({ outlook: createMockTokens() });
      expect(parseEmailCredentials(metadata)).toBeNull();
    });

    it('returns null when no provider tokens present', () => {
      const metadata = createMetadata({ userId: 'user-1' });
      expect(parseEmailCredentials(metadata)).toBeNull();
    });

    it('parses Outlook-only credentials', () => {
      const tokens = createMockTokens();
      const metadata = createMetadata({
        userId: 'user-1',
        outlook: tokens,
      });

      const result = parseEmailCredentials(metadata);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-1');
      expect(result!.outlook).toEqual(tokens);
      expect(result!.gmail).toBeUndefined();
    });

    it('parses Gmail-only credentials', () => {
      const tokens = createMockTokens();
      const metadata = createMetadata({
        userId: 'user-1',
        gmail: tokens,
      });

      const result = parseEmailCredentials(metadata);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-1');
      expect(result!.gmail).toEqual(tokens);
      expect(result!.outlook).toBeUndefined();
    });

    it('parses dual-provider credentials', () => {
      const outlookTokens = createMockTokens();
      const gmailTokens = createMockTokens();
      const metadata = createMetadata({
        userId: 'user-1',
        outlook: outlookTokens,
        gmail: gmailTokens,
      });

      const result = parseEmailCredentials(metadata);

      expect(result).not.toBeNull();
      expect(result!.outlook).toEqual(outlookTokens);
      expect(result!.gmail).toEqual(gmailTokens);
    });

    it('ignores tokens without accessToken', () => {
      const metadata = createMetadata({
        userId: 'user-1',
        outlook: { refreshToken: 'rt', tokenType: 'Bearer', expiresAt: '', scopes: [] },
      });

      expect(parseEmailCredentials(metadata)).toBeNull();
    });
  });

  // ===========================================================================
  // bootstrapEmailServices
  // ===========================================================================

  describe('bootstrapEmailServices', () => {
    it('creates Outlook adapter when outlook credentials present', () => {
      const credentials: EmailCredentials = {
        userId: 'user-1',
        outlook: createMockTokens(),
      };

      const result = bootstrapEmailServices(credentials);

      expect(result.success).toBe(true);
      expect(result.connectedProviders).toEqual(['OUTLOOK']);
      expect(OutlookAdapter).toHaveBeenCalledWith({
        userId: 'user-1',
        tokens: credentials.outlook,
      });
    });

    it('creates Gmail adapter when gmail credentials present', () => {
      const credentials: EmailCredentials = {
        userId: 'user-1',
        gmail: createMockTokens(),
      };

      const result = bootstrapEmailServices(credentials);

      expect(result.success).toBe(true);
      expect(result.connectedProviders).toEqual(['GMAIL']);
      expect(GmailAdapter).toHaveBeenCalledWith({
        userId: 'user-1',
        tokens: credentials.gmail,
      });
    });

    it('creates both adapters when dual credentials present', () => {
      const credentials: EmailCredentials = {
        userId: 'user-1',
        outlook: createMockTokens(),
        gmail: createMockTokens(),
      };

      const result = bootstrapEmailServices(credentials);

      expect(result.success).toBe(true);
      expect(result.connectedProviders).toEqual(['OUTLOOK', 'GMAIL']);
      expect(OutlookAdapter).toHaveBeenCalled();
      expect(GmailAdapter).toHaveBeenCalled();
    });

    it('creates UnifiedInboxService with providers', () => {
      const credentials: EmailCredentials = {
        userId: 'user-1',
        outlook: createMockTokens(),
      };

      bootstrapEmailServices(credentials);

      expect(UnifiedInboxService).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          continueOnError: true,
          defaultPageSize: 25,
        }),
      );
    });

    it('creates SmartDraftService with providers', () => {
      const credentials: EmailCredentials = {
        userId: 'user-1',
        outlook: createMockTokens(),
      };

      bootstrapEmailServices(credentials);

      expect(SmartDraftService).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          defaultSource: 'OUTLOOK',
          defaultPendingReview: true,
        }),
      );
    });

    it('calls setEmailServices with inbox and draft services', () => {
      const credentials: EmailCredentials = {
        userId: 'user-1',
        outlook: createMockTokens(),
      };

      bootstrapEmailServices(credentials);

      expect(mockSetEmailServices).toHaveBeenCalledWith(
        expect.any(Object), // UnifiedInboxService instance
        expect.any(Object), // SmartDraftService instance
      );
    });

    it('defaults to GMAIL when only Gmail is available', () => {
      const credentials: EmailCredentials = {
        userId: 'user-1',
        gmail: createMockTokens(),
      };

      bootstrapEmailServices(credentials);

      expect(SmartDraftService).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          defaultSource: 'GMAIL',
          fallbackSource: 'OUTLOOK',
        }),
      );
    });

    it('returns inboxService and draftService on success', () => {
      const credentials: EmailCredentials = {
        userId: 'user-1',
        outlook: createMockTokens(),
      };

      const result = bootstrapEmailServices(credentials);

      expect(result.inboxService).not.toBeNull();
      expect(result.draftService).not.toBeNull();
    });

    it('returns failure when no credentials match any provider', () => {
      const credentials: EmailCredentials = {
        userId: 'user-1',
        // No outlook or gmail
      };

      const result = bootstrapEmailServices(credentials);

      expect(result.success).toBe(false);
      expect(result.connectedProviders).toEqual([]);
      expect(result.inboxService).toBeNull();
      expect(result.draftService).toBeNull();
      expect(mockSetEmailServices).not.toHaveBeenCalled();
    });

    it('captures adapter creation errors without throwing', () => {
      (OutlookAdapter as unknown as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Invalid token format');
      });

      const credentials: EmailCredentials = {
        userId: 'user-1',
        outlook: createMockTokens(),
        gmail: createMockTokens(),
      };

      const result = bootstrapEmailServices(credentials);

      // Gmail should still succeed
      expect(result.success).toBe(true);
      expect(result.connectedProviders).toEqual(['GMAIL']);
      expect(result.errors).toEqual([
        { source: 'OUTLOOK', error: 'Invalid token format' },
      ]);
    });
  });

  // ===========================================================================
  // bootstrapFromMetadata
  // ===========================================================================

  describe('bootstrapFromMetadata', () => {
    it('returns null for missing metadata', () => {
      expect(bootstrapFromMetadata(undefined)).toBeNull();
    });

    it('returns null for metadata without email credentials', () => {
      expect(bootstrapFromMetadata(JSON.stringify({ other: 'data' }))).toBeNull();
    });

    it('bootstraps from valid metadata', () => {
      const metadata = createMetadata({
        userId: 'user-1',
        outlook: createMockTokens(),
      });

      const result = bootstrapFromMetadata(metadata);

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.connectedProviders).toEqual(['OUTLOOK']);
      expect(mockSetEmailServices).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // teardownEmailServices
  // ===========================================================================

  describe('teardownEmailServices', () => {
    it('calls clearEmailServices', () => {
      teardownEmailServices();
      expect(mockClearEmailServices).toHaveBeenCalled();
    });
  });
});
