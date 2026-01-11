/**
 * Tests for Unified Inbox Service
 */

import { UnifiedInboxService } from './unified-inbox';
import type { EmailProvider } from '../interfaces/email-provider';
import type {
  StandardEmail,
  StandardDraft,
  Contact,
  Folder,
  SyncStatus,
} from '../interfaces/types';

// =============================================================================
// Mock Helpers
// =============================================================================

const createMockEmail = (overrides: Partial<StandardEmail> = {}): StandardEmail => ({
  id: 'outlook:msg-123',
  source: 'OUTLOOK',
  providerMessageId: 'msg-123',
  threadId: 'outlook:thread-456',
  subject: 'Test Subject',
  from: { email: 'sender@example.com', name: 'Sender' },
  to: [{ email: 'recipient@example.com' }],
  cc: [],
  bcc: [],
  receivedAt: new Date().toISOString(),
  sentAt: new Date().toISOString(),
  bodyPreview: 'Preview...',
  isRead: false,
  isFlagged: false,
  hasAttachments: false,
  attachments: [],
  folder: 'inbox',
  labels: [],
  importance: 'normal',
  ...overrides,
});

const createMockDraft = (overrides: Partial<StandardDraft> = {}): StandardDraft => ({
  id: 'outlook:draft-123',
  source: 'OUTLOOK',
  providerDraftId: 'draft-123',
  subject: 'Test Draft',
  to: [{ email: 'recipient@example.com' }],
  cc: [],
  bcc: [],
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  isPendingReview: false,
  attachments: [],
  ...overrides,
});

const createMockProvider = (
  source: 'OUTLOOK' | 'GMAIL',
  overrides: Partial<EmailProvider> = {}
): EmailProvider => ({
  source,
  userId: 'test-user',
  testConnection: jest.fn().mockResolvedValue({ connected: true }),
  getSyncStatus: jest.fn().mockReturnValue({ state: 'idle' } as SyncStatus),
  disconnect: jest.fn().mockResolvedValue(undefined),
  fetchUnread: jest.fn().mockResolvedValue({ items: [], nextPageToken: undefined }),
  fetchThreads: jest.fn().mockResolvedValue({ items: [], nextPageToken: undefined }),
  fetchEmail: jest.fn().mockResolvedValue(null),
  fetchThread: jest.fn().mockResolvedValue(null),
  fetchThreadMessages: jest.fn().mockResolvedValue([]),
  markRead: jest.fn().mockResolvedValue(undefined),
  markUnread: jest.fn().mockResolvedValue(undefined),
  flagEmails: jest.fn().mockResolvedValue(undefined),
  unflagEmails: jest.fn().mockResolvedValue(undefined),
  moveToFolder: jest.fn().mockResolvedValue(undefined),
  applyLabels: jest.fn().mockResolvedValue(undefined),
  removeLabels: jest.fn().mockResolvedValue(undefined),
  archiveEmails: jest.fn().mockResolvedValue(undefined),
  deleteEmails: jest.fn().mockResolvedValue(undefined),
  fetchDrafts: jest.fn().mockResolvedValue({ items: [], nextPageToken: undefined }),
  fetchDraft: jest.fn().mockResolvedValue(null),
  createDraft: jest.fn().mockResolvedValue(createMockDraft()),
  updateDraft: jest.fn().mockResolvedValue(createMockDraft()),
  deleteDraft: jest.fn().mockResolvedValue(undefined),
  sendDraft: jest.fn().mockResolvedValue('sent-id'),
  fetchFolders: jest.fn().mockResolvedValue([]),
  createFolder: jest.fn().mockResolvedValue({} as Folder),
  deleteFolder: jest.fn().mockResolvedValue(undefined),
  fetchCalendarEvents: jest.fn().mockResolvedValue({ items: [], nextPageToken: undefined }),
  fetchCalendarEvent: jest.fn().mockResolvedValue(null),
  fetchContacts: jest.fn().mockResolvedValue({ items: [], nextPageToken: undefined }),
  searchContacts: jest.fn().mockResolvedValue([]),
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('UnifiedInboxService', () => {
  describe('constructor', () => {
    it('should initialize with providers', () => {
      const outlook = createMockProvider('OUTLOOK');
      const gmail = createMockProvider('GMAIL');

      const inbox = new UnifiedInboxService([outlook, gmail]);

      expect(inbox.getActiveSources()).toContain('OUTLOOK');
      expect(inbox.getActiveSources()).toContain('GMAIL');
    });

    it('should handle empty providers', () => {
      const inbox = new UnifiedInboxService([]);
      expect(inbox.getActiveSources()).toHaveLength(0);
    });
  });

  describe('provider management', () => {
    it('should add provider', () => {
      const inbox = new UnifiedInboxService([]);
      const outlook = createMockProvider('OUTLOOK');

      inbox.addProvider(outlook);

      expect(inbox.hasProvider('OUTLOOK')).toBe(true);
    });

    it('should remove provider', () => {
      const outlook = createMockProvider('OUTLOOK');
      const inbox = new UnifiedInboxService([outlook]);

      inbox.removeProvider('OUTLOOK');

      expect(inbox.hasProvider('OUTLOOK')).toBe(false);
    });

    it('should get specific provider', () => {
      const outlook = createMockProvider('OUTLOOK');
      const inbox = new UnifiedInboxService([outlook]);

      expect(inbox.getProvider('OUTLOOK')).toBe(outlook);
      expect(inbox.getProvider('GMAIL')).toBeUndefined();
    });
  });

  describe('testConnections', () => {
    it('should test all provider connections', async () => {
      const outlook = createMockProvider('OUTLOOK', {
        testConnection: jest.fn().mockResolvedValue({ connected: true }),
      });
      const gmail = createMockProvider('GMAIL', {
        testConnection: jest.fn().mockResolvedValue({ connected: false, error: 'Auth failed' }),
      });

      const inbox = new UnifiedInboxService([outlook, gmail]);
      const results = await inbox.testConnections();

      expect(results.OUTLOOK.connected).toBe(true);
      expect(results.GMAIL.connected).toBe(false);
      expect(results.GMAIL.error).toBe('Auth failed');
    });
  });

  describe('fetchUnread', () => {
    it('should merge unread from all providers sorted by date', async () => {
      const outlookEmail = createMockEmail({
        id: 'outlook:msg-1',
        source: 'OUTLOOK',
        receivedAt: '2024-01-01T12:00:00Z',
      });
      const gmailEmail = createMockEmail({
        id: 'gmail:msg-2',
        source: 'GMAIL',
        receivedAt: '2024-01-01T13:00:00Z', // Newer
      });

      const outlook = createMockProvider('OUTLOOK', {
        fetchUnread: jest.fn().mockResolvedValue({ items: [outlookEmail] }),
      });
      const gmail = createMockProvider('GMAIL', {
        fetchUnread: jest.fn().mockResolvedValue({ items: [gmailEmail] }),
      });

      const inbox = new UnifiedInboxService([outlook, gmail]);
      const result = await inbox.fetchUnread();

      expect(result.items).toHaveLength(2);
      // Gmail email should be first (newer)
      expect(result.items[0]?.id).toBe('gmail:msg-2');
      expect(result.items[1]?.id).toBe('outlook:msg-1');
    });

    it('should continue on provider error when configured', async () => {
      const outlookEmail = createMockEmail({ id: 'outlook:msg-1', source: 'OUTLOOK' });

      const outlook = createMockProvider('OUTLOOK', {
        fetchUnread: jest.fn().mockResolvedValue({ items: [outlookEmail] }),
      });
      const gmail = createMockProvider('GMAIL', {
        fetchUnread: jest.fn().mockRejectedValue(new Error('API Error')),
      });

      const inbox = new UnifiedInboxService([outlook, gmail], { continueOnError: true });
      const result = await inbox.fetchUnread();

      expect(result.items).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.source).toBe('GMAIL');
    });
  });

  describe('fetchEmail', () => {
    it('should route to correct provider', async () => {
      const mockEmail = createMockEmail({ id: 'outlook:msg-123', source: 'OUTLOOK' });

      const outlook = createMockProvider('OUTLOOK', {
        fetchEmail: jest.fn().mockResolvedValue(mockEmail),
      });
      const gmail = createMockProvider('GMAIL');

      const inbox = new UnifiedInboxService([outlook, gmail]);
      const email = await inbox.fetchEmail('outlook:msg-123');

      expect(email).toBe(mockEmail);
      expect(outlook.fetchEmail).toHaveBeenCalledWith('outlook:msg-123');
      expect(gmail.fetchEmail).not.toHaveBeenCalled();
    });

    it('should return null for unknown provider', async () => {
      const inbox = new UnifiedInboxService([]);
      const email = await inbox.fetchEmail('unknown:msg-123');

      expect(email).toBeNull();
    });
  });

  describe('markRead', () => {
    it('should route IDs to correct providers', async () => {
      const outlook = createMockProvider('OUTLOOK');
      const gmail = createMockProvider('GMAIL');

      const inbox = new UnifiedInboxService([outlook, gmail]);
      await inbox.markRead(['outlook:msg-1', 'outlook:msg-2', 'gmail:msg-3']);

      expect(outlook.markRead).toHaveBeenCalledWith(['outlook:msg-1', 'outlook:msg-2']);
      expect(gmail.markRead).toHaveBeenCalledWith(['gmail:msg-3']);
    });

    it('should return success when all providers succeed', async () => {
      const outlook = createMockProvider('OUTLOOK');
      const gmail = createMockProvider('GMAIL');

      const inbox = new UnifiedInboxService([outlook, gmail]);
      const result = await inbox.markRead(['outlook:msg-1', 'gmail:msg-2']);

      expect(result.allSucceeded).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report errors from failed providers', async () => {
      const outlook = createMockProvider('OUTLOOK', {
        markRead: jest.fn().mockRejectedValue(new Error('API Error')),
      });
      const gmail = createMockProvider('GMAIL');

      const inbox = new UnifiedInboxService([outlook, gmail], { continueOnError: true });
      const result = await inbox.markRead(['outlook:msg-1', 'gmail:msg-2']);

      expect(result.allSucceeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.source).toBe('OUTLOOK');
    });
  });

  describe('createDraft', () => {
    it('should default to Outlook provider', async () => {
      const outlookDraft = createMockDraft({ id: 'outlook:draft-1', source: 'OUTLOOK' });
      const outlook = createMockProvider('OUTLOOK', {
        createDraft: jest.fn().mockResolvedValue(outlookDraft),
      });
      const gmail = createMockProvider('GMAIL');

      const inbox = new UnifiedInboxService([outlook, gmail]);
      const draft = await inbox.createDraft({
        subject: 'Test',
        to: [{ email: 'test@example.com' }],
      });

      expect(draft.source).toBe('OUTLOOK');
      expect(outlook.createDraft).toHaveBeenCalled();
      expect(gmail.createDraft).not.toHaveBeenCalled();
    });

    it('should use specified preferred source', async () => {
      const gmailDraft = createMockDraft({ id: 'gmail:draft-1', source: 'GMAIL' });
      const outlook = createMockProvider('OUTLOOK');
      const gmail = createMockProvider('GMAIL', {
        createDraft: jest.fn().mockResolvedValue(gmailDraft),
      });

      const inbox = new UnifiedInboxService([outlook, gmail]);
      const draft = await inbox.createDraft(
        { subject: 'Test', to: [{ email: 'test@example.com' }] },
        'GMAIL'
      );

      expect(draft.source).toBe('GMAIL');
      expect(gmail.createDraft).toHaveBeenCalled();
    });

    it('should throw when no provider available', async () => {
      const inbox = new UnifiedInboxService([]);

      await expect(
        inbox.createDraft({ subject: 'Test', to: [{ email: 'test@example.com' }] })
      ).rejects.toThrow('No email provider available');
    });
  });

  describe('fetchFolders', () => {
    it('should fetch folders from all providers', async () => {
      const outlookFolders: Folder[] = [
        {
          id: 'outlook:inbox',
          source: 'OUTLOOK',
          providerId: 'inbox',
          name: 'Inbox',
          totalCount: 100,
          unreadCount: 5,
          isSystem: true,
          systemType: 'inbox',
        },
      ];
      const gmailFolders: Folder[] = [
        {
          id: 'gmail:INBOX',
          source: 'GMAIL',
          providerId: 'INBOX',
          name: 'INBOX',
          totalCount: 50,
          unreadCount: 3,
          isSystem: true,
          systemType: 'inbox',
        },
      ];

      const outlook = createMockProvider('OUTLOOK', {
        fetchFolders: jest.fn().mockResolvedValue(outlookFolders),
      });
      const gmail = createMockProvider('GMAIL', {
        fetchFolders: jest.fn().mockResolvedValue(gmailFolders),
      });

      const inbox = new UnifiedInboxService([outlook, gmail]);
      const { folders, errors } = await inbox.fetchFolders();

      expect(folders).toHaveLength(2);
      expect(errors).toHaveLength(0);
    });
  });

  describe('searchContacts', () => {
    it('should search across all providers and deduplicate', async () => {
      const contact1: Contact = {
        id: 'outlook:c1',
        source: 'OUTLOOK',
        providerContactId: 'c1',
        displayName: 'John Doe',
        emailAddresses: [{ email: 'john@example.com' }],
        phoneNumbers: [],
      };
      const contact2: Contact = {
        id: 'gmail:c2',
        source: 'GMAIL',
        providerContactId: 'c2',
        displayName: 'John Doe', // Same person
        emailAddresses: [{ email: 'john@example.com' }], // Same email
        phoneNumbers: [],
      };

      const outlook = createMockProvider('OUTLOOK', {
        searchContacts: jest.fn().mockResolvedValue([contact1]),
      });
      const gmail = createMockProvider('GMAIL', {
        searchContacts: jest.fn().mockResolvedValue([contact2]),
      });

      const inbox = new UnifiedInboxService([outlook, gmail]);
      const { contacts } = await inbox.searchContacts('John');

      // Should deduplicate by email
      expect(contacts).toHaveLength(1);
    });

    it('should sort by relevance (name starts with query first)', async () => {
      const contact1: Contact = {
        id: 'outlook:c1',
        source: 'OUTLOOK',
        providerContactId: 'c1',
        displayName: 'Alice Johnson',
        emailAddresses: [{ email: 'alice@example.com' }],
        phoneNumbers: [],
      };
      const contact2: Contact = {
        id: 'outlook:c2',
        source: 'OUTLOOK',
        providerContactId: 'c2',
        displayName: 'John Smith',
        emailAddresses: [{ email: 'john@example.com' }],
        phoneNumbers: [],
      };

      const outlook = createMockProvider('OUTLOOK', {
        searchContacts: jest.fn().mockResolvedValue([contact1, contact2]),
      });

      const inbox = new UnifiedInboxService([outlook]);
      const { contacts } = await inbox.searchContacts('John');

      // John Smith should be first (name starts with "John")
      expect(contacts[0]?.displayName).toBe('John Smith');
    });
  });

  describe('getSyncStatus', () => {
    it('should aggregate provider statuses', () => {
      const outlook = createMockProvider('OUTLOOK', {
        getSyncStatus: jest.fn().mockReturnValue({ state: 'synced' }),
      });
      const gmail = createMockProvider('GMAIL', {
        getSyncStatus: jest.fn().mockReturnValue({ state: 'synced' }),
      });

      const inbox = new UnifiedInboxService([outlook, gmail]);
      const status = inbox.getSyncStatus();

      expect(status.state).toBe('synced');
      expect(status.providers.OUTLOOK.state).toBe('synced');
      expect(status.providers.GMAIL.state).toBe('synced');
    });

    it('should report error state if any provider has error', () => {
      const outlook = createMockProvider('OUTLOOK', {
        getSyncStatus: jest.fn().mockReturnValue({ state: 'synced' }),
      });
      const gmail = createMockProvider('GMAIL', {
        getSyncStatus: jest.fn().mockReturnValue({ state: 'error', error: 'Failed' }),
      });

      const inbox = new UnifiedInboxService([outlook, gmail]);
      const status = inbox.getSyncStatus();

      expect(status.state).toBe('error');
    });

    it('should report syncing state if any provider is syncing', () => {
      const outlook = createMockProvider('OUTLOOK', {
        getSyncStatus: jest.fn().mockReturnValue({ state: 'syncing' }),
      });
      const gmail = createMockProvider('GMAIL', {
        getSyncStatus: jest.fn().mockReturnValue({ state: 'synced' }),
      });

      const inbox = new UnifiedInboxService([outlook, gmail]);
      const status = inbox.getSyncStatus();

      expect(status.state).toBe('syncing');
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all providers', async () => {
      const outlook = createMockProvider('OUTLOOK');
      const gmail = createMockProvider('GMAIL');

      const inbox = new UnifiedInboxService([outlook, gmail]);
      await inbox.disconnectAll();

      expect(outlook.disconnect).toHaveBeenCalled();
      expect(gmail.disconnect).toHaveBeenCalled();
    });
  });
});

