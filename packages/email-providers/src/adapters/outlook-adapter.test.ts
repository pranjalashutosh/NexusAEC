/**
 * Tests for Outlook Adapter
 */

import { OutlookAdapter } from './outlook-adapter';
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
  scopes: ['Mail.Read'],
});

// Helper to create mock Graph API response
const createMockResponse = <T>(data: T, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(data),
});

describe('OutlookAdapter', () => {
  let adapter: OutlookAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new OutlookAdapter({
      userId: 'test-user',
      tokens: createMockTokens(),
    });
  });

  describe('constructor', () => {
    it('should initialize with correct source', () => {
      expect(adapter.source).toBe('OUTLOOK');
    });

    it('should initialize with userId', () => {
      expect(adapter.userId).toBe('test-user');
    });
  });

  describe('testConnection', () => {
    it('should return connected true on successful API call', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ id: 'user-id', displayName: 'Test User' })
      );

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
      const mockMessage = {
        id: 'msg-123',
        conversationId: 'conv-456',
        subject: 'Test Subject',
        from: { emailAddress: { address: 'sender@example.com', name: 'Sender' } },
        toRecipients: [{ emailAddress: { address: 'recipient@example.com' } }],
        ccRecipients: [],
        bccRecipients: [],
        receivedDateTime: '2024-01-01T10:00:00Z',
        sentDateTime: '2024-01-01T09:59:00Z',
        bodyPreview: 'This is the preview...',
        body: { contentType: 'Text', content: 'Full body content' },
        isRead: false,
        flag: { flagStatus: 'notFlagged' },
        hasAttachments: false,
        attachments: [],
        parentFolderId: 'inbox-folder-id',
        categories: ['Work'],
        importance: 'normal',
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockMessage));

      const email = await adapter.fetchEmail('outlook:msg-123');

      expect(email).not.toBeNull();
      expect(email?.id).toBe('outlook:msg-123');
      expect(email?.source).toBe('OUTLOOK');
      expect(email?.subject).toBe('Test Subject');
      expect(email?.from.email).toBe('sender@example.com');
      expect(email?.isRead).toBe(false);
      expect(email?.labels).toContain('Work');
    });

    it('should return null for non-OUTLOOK ID', async () => {
      const email = await adapter.fetchEmail('gmail:msg-123');
      expect(email).toBeNull();
    });

    it('should return null for not found', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: 'Not found' } }, 404)
      );

      const email = await adapter.fetchEmail('outlook:nonexistent');
      expect(email).toBeNull();
    });
  });

  describe('fetchUnread', () => {
    it('should fetch unread emails with filter', async () => {
      const mockResponse = {
        value: [
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            subject: 'Unread 1',
            from: { emailAddress: { address: 'a@example.com' } },
            toRecipients: [],
            ccRecipients: [],
            bccRecipients: [],
            receivedDateTime: '2024-01-01T10:00:00Z',
            sentDateTime: '2024-01-01T10:00:00Z',
            bodyPreview: '',
            isRead: false,
            hasAttachments: false,
            parentFolderId: 'inbox',
            categories: [],
            importance: 'normal',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await adapter.fetchUnread();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.isRead).toBe(false);

      // Verify the request included unread filter
      const fetchCall = mockFetch.mock.calls[0];
      const url = new URL(String(fetchCall[0]));
      expect(url.searchParams.get('$filter')).toBe('isRead eq false');
    });
  });

  describe('markRead', () => {
    it('should update messages as read', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await adapter.markRead(['outlook:msg-123']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/me/messages/msg-123'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isRead: true }),
        })
      );
    });

    it('should skip non-OUTLOOK IDs', async () => {
      await adapter.markRead(['gmail:msg-123']);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('markUnread', () => {
    it('should update messages as unread', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await adapter.markUnread(['outlook:msg-123']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/me/messages/msg-123'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isRead: false }),
        })
      );
    });
  });

  describe('flagEmails', () => {
    it('should flag messages', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await adapter.flagEmails(['outlook:msg-123']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/me/messages/msg-123'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ flag: { flagStatus: 'flagged' } }),
        })
      );
    });
  });

  describe('moveToFolder', () => {
    it('should move messages to folder', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await adapter.moveToFolder(['outlook:msg-123'], 'folder-id');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/me/messages/msg-123/move'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ destinationId: 'folder-id' }),
        })
      );
    });
  });

  describe('createDraft', () => {
    it('should create a draft with all fields', async () => {
      const mockCreatedDraft = {
        id: 'draft-123',
        conversationId: null,
        subject: 'Test Draft',
        from: null,
        toRecipients: [{ emailAddress: { address: 'to@example.com', name: 'To' } }],
        ccRecipients: [{ emailAddress: { address: 'cc@example.com' } }],
        bccRecipients: [],
        receivedDateTime: '2024-01-01T10:00:00Z',
        sentDateTime: '2024-01-01T10:00:00Z',
        bodyPreview: 'Draft body',
        body: { contentType: 'HTML', content: '<p>Draft body</p>' },
        isRead: true,
        hasAttachments: false,
        parentFolderId: 'drafts',
        categories: [],
        importance: 'normal',
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockCreatedDraft));

      const draft = await adapter.createDraft({
        subject: 'Test Draft',
        to: [{ email: 'to@example.com', name: 'To' }],
        cc: [{ email: 'cc@example.com' }],
        bodyHtml: '<p>Draft body</p>',
      });

      expect(draft.id).toBe('outlook:draft-123');
      expect(draft.source).toBe('OUTLOOK');
      expect(draft.subject).toBe('Test Draft');
    });
  });

  describe('sendDraft', () => {
    it('should send a draft', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve({}) });

      const sentId = await adapter.sendDraft('outlook:draft-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/me/messages/draft-123/send'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(sentId).toBe('outlook:draft-123');
    });
  });

  describe('fetchFolders', () => {
    it('should fetch and normalize folders', async () => {
      const mockFolders = {
        value: [
          {
            id: 'inbox-id',
            displayName: 'Inbox',
            totalItemCount: 100,
            unreadItemCount: 5,
            isHidden: false,
          },
          {
            id: 'sent-id',
            displayName: 'Sent Items',
            totalItemCount: 50,
            unreadItemCount: 0,
            isHidden: false,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockFolders));

      const folders = await adapter.fetchFolders();

      expect(folders).toHaveLength(2);
      expect(folders[0]?.name).toBe('Inbox');
      expect(folders[0]?.systemType).toBe('inbox');
      expect(folders[1]?.systemType).toBe('sent');
    });
  });

  describe('fetchCalendarEvents', () => {
    it('should fetch calendar events within time range', async () => {
      const mockEvents = {
        value: [
          {
            id: 'event-123',
            subject: 'Team Meeting',
            start: { dateTime: '2024-01-15T10:00:00', timeZone: 'UTC' },
            end: { dateTime: '2024-01-15T11:00:00', timeZone: 'UTC' },
            isAllDay: false,
            location: { displayName: 'Conference Room' },
            organizer: { emailAddress: { address: 'org@example.com', name: 'Organizer' } },
            attendees: [],
            responseStatus: { response: 'accepted' },
            isRecurrence: false,
            sensitivity: 'normal',
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
      expect(result.items[0]?.responseStatus).toBe('accepted');
    });
  });

  describe('fetchContacts', () => {
    it('should fetch and normalize contacts', async () => {
      const mockContacts = {
        value: [
          {
            id: 'contact-123',
            displayName: 'John Doe',
            givenName: 'John',
            surname: 'Doe',
            emailAddresses: [{ address: 'john@example.com' }],
            businessPhones: ['555-1234'],
            mobilePhone: '555-5678',
            homePhones: [],
            companyName: 'Acme Corp',
            jobTitle: 'Engineer',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockContacts));

      const result = await adapter.fetchContacts();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.displayName).toBe('John Doe');
      expect(result.items[0]?.emailAddresses[0]?.email).toBe('john@example.com');
      expect(result.items[0]?.phoneNumbers).toHaveLength(2);
    });
  });

  describe('searchContacts', () => {
    it('should search contacts by query', async () => {
      const mockContacts = {
        value: [
          {
            id: 'contact-123',
            displayName: 'John Doe',
            emailAddresses: [{ address: 'john@example.com' }],
            businessPhones: [],
            homePhones: [],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockContacts));

      const contacts = await adapter.searchContacts('John');

      expect(contacts).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('$search="John"'),
        expect.anything()
      );
    });
  });

  describe('error handling', () => {
    it('should handle 401 as AUTH_EXPIRED', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: 'Unauthorized' } }, 401)
      );

      await expect(adapter.fetchEmail('outlook:msg-123')).rejects.toMatchObject({
        code: 'AUTH_EXPIRED',
      });
    });

    it('should handle 403 as PERMISSION_DENIED', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: 'Forbidden' } }, 403)
      );

      await expect(adapter.fetchEmail('outlook:msg-123')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
    });

    it('should handle 429 as RATE_LIMITED', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: 'Too many requests' } }, 429)
      );

      await expect(adapter.fetchEmail('outlook:msg-123')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
    });
  });

  describe('updateAccessToken', () => {
    it('should update the access token', async () => {
      adapter.updateAccessToken('new-token');

      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 'user' }));
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

describe('ID helpers', () => {
  describe('createStandardId', () => {
    it('should create outlook standard ID', () => {
      expect(createStandardId('OUTLOOK', 'msg-123')).toBe('outlook:msg-123');
    });
  });

  describe('parseStandardId', () => {
    it('should parse outlook standard ID', () => {
      const result = parseStandardId('outlook:msg-123');
      expect(result?.source).toBe('OUTLOOK');
      expect(result?.providerId).toBe('msg-123');
    });

    it('should return null for invalid ID', () => {
      expect(parseStandardId('invalid')).toBeNull();
    });
  });
});

