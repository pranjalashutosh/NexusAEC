/**
 * Tests for Gmail Adapter
 */

import { GmailAdapter } from './gmail-adapter';
import { createStandardId, parseStandardId } from '../interfaces/email-provider';

import type { OAuthTokens } from '../interfaces/types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Helper to create mock tokens
const createMockTokens = (): OAuthTokens => ({
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  tokenType: 'Bearer',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
});

// Helper to create mock API response
const createMockResponse = <T>(data: T, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(data),
});

// Helper to create mock Gmail message
const createMockGmailMessage = (
  overrides: Partial<{
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    subject: string;
    from: string;
    to: string;
  }> = {}
) => ({
  id: overrides.id ?? 'msg-123',
  threadId: overrides.threadId ?? 'thread-456',
  labelIds: overrides.labelIds ?? ['INBOX', 'UNREAD'],
  snippet: overrides.snippet ?? 'This is a preview...',
  historyId: '12345',
  internalDate: Date.now().toString(),
  sizeEstimate: 1000,
  payload: {
    mimeType: 'text/plain',
    headers: [
      { name: 'Subject', value: overrides.subject ?? 'Test Subject' },
      { name: 'From', value: overrides.from ?? 'sender@example.com' },
      { name: 'To', value: overrides.to ?? 'recipient@example.com' },
      { name: 'Date', value: new Date().toISOString() },
    ],
    body: { size: 100, data: 'VGVzdCBib2R5IGNvbnRlbnQ=' }, // "Test body content" base64
  },
});

describe('GmailAdapter', () => {
  let adapter: GmailAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new GmailAdapter({
      userId: 'test-user',
      tokens: createMockTokens(),
    });
  });

  describe('constructor', () => {
    it('should initialize with correct source', () => {
      expect(adapter.source).toBe('GMAIL');
    });

    it('should initialize with userId', () => {
      expect(adapter.userId).toBe('test-user');
    });
  });

  describe('testConnection', () => {
    it('should return connected true on successful API call', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ emailAddress: 'user@gmail.com' }));

      const result = await adapter.testConnection();

      expect(result.connected).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return connected false on API error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.testConnection();

      expect(result.connected).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('getSyncStatus', () => {
    it('should return initial idle status', () => {
      const status = adapter.getSyncStatus();
      expect(status.state).toBe('idle');
    });
  });

  describe('fetchEmail', () => {
    it('should fetch and normalize email', async () => {
      const mockMessage = createMockGmailMessage();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMessage));

      const email = await adapter.fetchEmail('gmail:msg-123');

      expect(email).not.toBeNull();
      expect(email?.id).toBe('gmail:msg-123');
      expect(email?.source).toBe('GMAIL');
      expect(email?.subject).toBe('Test Subject');
      expect(email?.from.email).toBe('sender@example.com');
    });

    it('should return null for non-GMAIL ID', async () => {
      const email = await adapter.fetchEmail('outlook:msg-123');
      expect(email).toBeNull();
    });

    it('should return null for not found', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ error: { message: 'Not found' } }, 404));

      const email = await adapter.fetchEmail('gmail:nonexistent');
      expect(email).toBeNull();
    });

    it('should parse UNREAD label correctly', async () => {
      const mockMessage = createMockGmailMessage({ labelIds: ['INBOX'] }); // No UNREAD
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMessage));

      const email = await adapter.fetchEmail('gmail:msg-123');

      expect(email?.isRead).toBe(true);
    });

    it('should parse STARRED label correctly', async () => {
      const mockMessage = createMockGmailMessage({ labelIds: ['INBOX', 'STARRED'] });
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMessage));

      const email = await adapter.fetchEmail('gmail:msg-123');

      expect(email?.isFlagged).toBe(true);
    });
  });

  describe('fetchUnread', () => {
    it('should fetch unread emails with query', async () => {
      const mockResponse = {
        messages: [{ id: 'msg-1', threadId: 'thread-1' }],
        resultSizeEstimate: 1,
      };

      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockResponse))
        .mockResolvedValueOnce(createMockResponse(createMockGmailMessage({ id: 'msg-1' })));

      const result = await adapter.fetchUnread();

      expect(result.items).toHaveLength(1);

      // Verify the request included unread query
      const listCall = mockFetch.mock.calls[0];
      expect(listCall[0]).toContain('q=is%3Aunread');
    });
  });

  describe('markRead', () => {
    it('should remove UNREAD label', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await adapter.markRead(['gmail:msg-123']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me/messages/batchModify'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            ids: ['msg-123'],
            removeLabelIds: ['UNREAD'],
          }),
        })
      );
    });

    it('should skip non-GMAIL IDs', async () => {
      await adapter.markRead(['outlook:msg-123']);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('markUnread', () => {
    it('should add UNREAD label', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await adapter.markUnread(['gmail:msg-123']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me/messages/batchModify'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            ids: ['msg-123'],
            addLabelIds: ['UNREAD'],
          }),
        })
      );
    });
  });

  describe('flagEmails', () => {
    it('should add STARRED label', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await adapter.flagEmails(['gmail:msg-123']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me/messages/batchModify'),
        expect.objectContaining({
          body: JSON.stringify({
            ids: ['msg-123'],
            addLabelIds: ['STARRED'],
          }),
        })
      );
    });
  });

  describe('archiveEmails', () => {
    it('should remove INBOX label', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await adapter.archiveEmails(['gmail:msg-123']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me/messages/batchModify'),
        expect.objectContaining({
          body: JSON.stringify({
            ids: ['msg-123'],
            removeLabelIds: ['INBOX'],
          }),
        })
      );
    });
  });

  describe('deleteEmails', () => {
    it('should add TRASH label', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await adapter.deleteEmails(['gmail:msg-123']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me/messages/batchModify'),
        expect.objectContaining({
          body: JSON.stringify({
            ids: ['msg-123'],
            addLabelIds: ['TRASH'],
          }),
        })
      );
    });
  });

  describe('fetchFolders (labels)', () => {
    it('should fetch and normalize labels', async () => {
      const mockLabels = {
        labels: [
          { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: 100, messagesUnread: 5 },
          { id: 'SENT', name: 'SENT', type: 'system', messagesTotal: 50 },
          { id: 'Label_1', name: 'Custom Label', type: 'user' },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockLabels));

      const folders = await adapter.fetchFolders();

      expect(folders).toHaveLength(3);
      expect(folders[0]?.name).toBe('INBOX');
      expect(folders[0]?.systemType).toBe('inbox');
      expect(folders[0]?.isSystem).toBe(true);
      expect(folders[2]?.isSystem).toBe(false);
    });
  });

  describe('createDraft', () => {
    it('should create a draft', async () => {
      const mockCreatedDraft = {
        id: 'draft-123',
        message: createMockGmailMessage({
          id: 'msg-123',
          subject: 'Test Draft',
          to: 'to@example.com',
        }),
      };

      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockCreatedDraft)) // Create
        .mockResolvedValueOnce(createMockResponse(mockCreatedDraft)); // Fetch full

      const draft = await adapter.createDraft({
        subject: 'Test Draft',
        to: [{ email: 'to@example.com' }],
        bodyText: 'Draft content',
      });

      expect(draft.id).toBe('gmail:draft-123');
      expect(draft.source).toBe('GMAIL');
    });
  });

  describe('sendDraft', () => {
    it('should send a draft', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ id: 'sent-msg-123', threadId: 'thread-456' })
      );

      const sentId = await adapter.sendDraft('gmail:draft-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me/drafts/draft-123/send'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(sentId).toBe('gmail:sent-msg-123');
    });
  });

  describe('fetchCalendarEvents', () => {
    it('should fetch calendar events', async () => {
      const mockEvents = {
        items: [
          {
            id: 'event-123',
            summary: 'Team Meeting',
            start: { dateTime: '2024-01-15T10:00:00Z' },
            end: { dateTime: '2024-01-15T11:00:00Z' },
            organizer: { email: 'org@example.com' },
            attendees: [],
            status: 'confirmed',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockEvents));

      const result = await adapter.fetchCalendarEvents({
        timeMin: new Date('2024-01-01'),
        timeMax: new Date('2024-01-31'),
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.title).toBe('Team Meeting');
    });
  });

  describe('fetchContacts', () => {
    it('should fetch and normalize contacts', async () => {
      const mockContacts = {
        connections: [
          {
            resourceName: 'people/123',
            names: [{ displayName: 'John Doe', givenName: 'John', familyName: 'Doe' }],
            emailAddresses: [{ value: 'john@example.com' }],
            phoneNumbers: [{ value: '555-1234', type: 'mobile' }],
            organizations: [{ name: 'Acme Corp', title: 'Engineer' }],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockContacts));

      const result = await adapter.fetchContacts();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.displayName).toBe('John Doe');
      expect(result.items[0]?.emailAddresses[0]?.email).toBe('john@example.com');
    });
  });

  describe('searchContacts', () => {
    it('should search contacts', async () => {
      const mockResults = {
        results: [
          {
            person: {
              resourceName: 'people/123',
              names: [{ displayName: 'John Doe' }],
              emailAddresses: [{ value: 'john@example.com' }],
              phoneNumbers: [],
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResults));

      const contacts = await adapter.searchContacts('John');

      expect(contacts).toHaveLength(1);
      expect(contacts[0]?.displayName).toBe('John Doe');
    });
  });

  describe('error handling', () => {
    it('should handle 401 as AUTH_EXPIRED', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: 'Unauthorized' } }, 401)
      );

      await expect(adapter.fetchEmail('gmail:msg-123')).rejects.toMatchObject({
        code: 'AUTH_EXPIRED',
      });
    });

    it('should handle 403 as PERMISSION_DENIED', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ error: { message: 'Forbidden' } }, 403));

      await expect(adapter.fetchEmail('gmail:msg-123')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
    });

    it('should handle 429 as RATE_LIMITED', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: 'Too many requests' } }, 429)
      );

      await expect(adapter.fetchEmail('gmail:msg-123')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
    });
  });

  describe('updateAccessToken', () => {
    it('should update the access token', async () => {
      adapter.updateAccessToken('new-token');

      mockFetch.mockResolvedValueOnce(createMockResponse({ emailAddress: 'user@gmail.com' }));
      await adapter.testConnection();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer new-token',
          }),
        })
      );
    });
  });
});

describe('Gmail ID helpers', () => {
  describe('createStandardId', () => {
    it('should create gmail standard ID', () => {
      expect(createStandardId('GMAIL', 'msg-123')).toBe('gmail:msg-123');
    });
  });

  describe('parseStandardId', () => {
    it('should parse gmail standard ID', () => {
      const result = parseStandardId('gmail:msg-123');
      expect(result?.source).toBe('GMAIL');
      expect(result?.providerId).toBe('msg-123');
    });
  });
});
