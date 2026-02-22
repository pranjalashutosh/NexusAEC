/**
 * Tests for EmailProvider interface helpers and types
 */

import {
  EmailProviderError,
  isEmailProviderError,
  createStandardId,
  parseStandardId,
} from './email-provider';

describe('EmailProvider Helpers', () => {
  describe('EmailProviderError', () => {
    it('should create error with all properties', () => {
      const error = new EmailProviderError(
        'Token expired',
        'OUTLOOK',
        'AUTH_EXPIRED',
        new Error('Original error')
      );

      expect(error.message).toBe('Token expired');
      expect(error.source).toBe('OUTLOOK');
      expect(error.code).toBe('AUTH_EXPIRED');
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.name).toBe('EmailProviderError');
    });

    it('should be an instance of Error', () => {
      const error = new EmailProviderError('Test', 'GMAIL', 'UNKNOWN');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(EmailProviderError);
    });
  });

  describe('isEmailProviderError', () => {
    it('should return true for EmailProviderError', () => {
      const error = new EmailProviderError('Test', 'OUTLOOK', 'NOT_FOUND');
      expect(isEmailProviderError(error)).toBe(true);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Test');
      expect(isEmailProviderError(error)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isEmailProviderError(null)).toBe(false);
      expect(isEmailProviderError(undefined)).toBe(false);
    });

    it('should return false for non-error objects', () => {
      expect(isEmailProviderError({ message: 'fake error' })).toBe(false);
      expect(isEmailProviderError('string')).toBe(false);
      expect(isEmailProviderError(123)).toBe(false);
    });
  });

  describe('createStandardId', () => {
    it('should create Outlook standard ID', () => {
      const id = createStandardId('OUTLOOK', 'AAMkAGI2');
      expect(id).toBe('outlook:AAMkAGI2');
    });

    it('should create Gmail standard ID', () => {
      const id = createStandardId('GMAIL', '18e2f3a4b5c6d7e8');
      expect(id).toBe('gmail:18e2f3a4b5c6d7e8');
    });

    it('should handle provider IDs with special characters', () => {
      const id = createStandardId('OUTLOOK', 'msg:id/with/slashes');
      expect(id).toBe('outlook:msg:id/with/slashes');
    });

    it('should handle empty provider ID', () => {
      const id = createStandardId('GMAIL', '');
      expect(id).toBe('gmail:');
    });
  });

  describe('parseStandardId', () => {
    it('should parse Outlook standard ID', () => {
      const result = parseStandardId('outlook:AAMkAGI2');
      expect(result).toEqual({
        source: 'OUTLOOK',
        providerId: 'AAMkAGI2',
      });
    });

    it('should parse Gmail standard ID', () => {
      const result = parseStandardId('gmail:18e2f3a4b5c6d7e8');
      expect(result).toEqual({
        source: 'GMAIL',
        providerId: '18e2f3a4b5c6d7e8',
      });
    });

    it('should handle case-insensitive source', () => {
      const result = parseStandardId('OUTLOOK:AAMkAGI2');
      expect(result).toEqual({
        source: 'OUTLOOK',
        providerId: 'AAMkAGI2',
      });
    });

    it('should handle provider IDs containing colons', () => {
      const result = parseStandardId('outlook:msg:id:with:colons');
      expect(result).toEqual({
        source: 'OUTLOOK',
        providerId: 'msg:id:with:colons',
      });
    });

    it('should return null for invalid format - no colon', () => {
      const result = parseStandardId('outlookAAMkAGI2');
      expect(result).toBeNull();
    });

    it('should return null for invalid source', () => {
      const result = parseStandardId('yahoo:12345');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseStandardId('');
      expect(result).toBeNull();
    });

    it('should handle mixed case source correctly', () => {
      const result1 = parseStandardId('Gmail:abc123');
      expect(result1?.source).toBe('GMAIL');

      const result2 = parseStandardId('Outlook:xyz789');
      expect(result2?.source).toBe('OUTLOOK');
    });
  });

  describe('createStandardId and parseStandardId roundtrip', () => {
    it('should roundtrip Outlook ID', () => {
      const original = 'AAMkAGI2TG93bWF';
      const standardId = createStandardId('OUTLOOK', original);
      const parsed = parseStandardId(standardId);

      expect(parsed?.source).toBe('OUTLOOK');
      expect(parsed?.providerId).toBe(original);
    });

    it('should roundtrip Gmail ID', () => {
      const original = '18e2f3a4b5c6d7e8f9a0';
      const standardId = createStandardId('GMAIL', original);
      const parsed = parseStandardId(standardId);

      expect(parsed?.source).toBe('GMAIL');
      expect(parsed?.providerId).toBe(original);
    });

    it('should roundtrip complex ID with special chars', () => {
      const original = 'msg:id/with/many:special:chars/and/slashes';
      const standardId = createStandardId('OUTLOOK', original);
      const parsed = parseStandardId(standardId);

      expect(parsed?.source).toBe('OUTLOOK');
      expect(parsed?.providerId).toBe(original);
    });
  });
});

describe('Type Validation', () => {
  describe('EmailSource type', () => {
    it('should accept valid sources', () => {
      // TypeScript compilation test - if this compiles, the types are correct
      const outlook: import('./types').EmailSource = 'OUTLOOK';
      const gmail: import('./types').EmailSource = 'GMAIL';

      expect(outlook).toBe('OUTLOOK');
      expect(gmail).toBe('GMAIL');
    });
  });

  describe('Standard types structure', () => {
    it('should have correct StandardEmail shape', () => {
      const email: import('./types').StandardEmail = {
        id: 'outlook:123',
        source: 'OUTLOOK',
        providerMessageId: '123',
        threadId: 'thread:456',
        subject: 'Test Subject',
        from: { email: 'sender@example.com', name: 'Sender' },
        to: [{ email: 'recipient@example.com' }],
        cc: [],
        bcc: [],
        receivedAt: '2024-01-01T00:00:00Z',
        sentAt: '2024-01-01T00:00:00Z',
        bodyPreview: 'This is a preview...',
        isRead: false,
        isFlagged: false,
        hasAttachments: false,
        attachments: [],
        folder: 'inbox',
        labels: [],
        importance: 'normal',
      };

      expect(email.source).toBe('OUTLOOK');
      expect(email.importance).toBe('normal');
    });

    it('should have correct StandardThread shape', () => {
      const thread: import('./types').StandardThread = {
        id: 'gmail:thread123',
        source: 'GMAIL',
        providerThreadId: 'thread123',
        subject: 'Thread Subject',
        participants: [
          { email: 'person1@example.com', name: 'Person 1' },
          { email: 'person2@example.com', name: 'Person 2' },
        ],
        messageCount: 5,
        messageIds: ['msg1', 'msg2', 'msg3', 'msg4', 'msg5'],
        latestMessage: {
          id: 'gmail:msg5',
          source: 'GMAIL',
          providerMessageId: 'msg5',
          threadId: 'gmail:thread123',
          subject: 'Re: Thread Subject',
          from: { email: 'person2@example.com' },
          to: [{ email: 'person1@example.com' }],
          cc: [],
          bcc: [],
          receivedAt: '2024-01-05T00:00:00Z',
          sentAt: '2024-01-05T00:00:00Z',
          bodyPreview: 'Latest message...',
          isRead: true,
          isFlagged: false,
          hasAttachments: false,
          attachments: [],
          folder: 'inbox',
          labels: ['INBOX'],
          importance: 'normal',
        },
        lastUpdatedAt: '2024-01-05T00:00:00Z',
        hasUnread: false,
        snippet: 'Latest message...',
        labels: ['INBOX'],
      };

      expect(thread.source).toBe('GMAIL');
      expect(thread.messageCount).toBe(5);
    });

    it('should have correct StandardDraft shape', () => {
      const draft: import('./types').StandardDraft = {
        id: 'outlook:draft123',
        source: 'OUTLOOK',
        providerDraftId: 'draft123',
        subject: 'Draft Subject',
        to: [{ email: 'recipient@example.com' }],
        cc: [],
        bcc: [],
        bodyText: 'Draft content...',
        createdAt: '2024-01-01T00:00:00Z',
        modifiedAt: '2024-01-01T00:00:00Z',
        isPendingReview: true,
        reviewRationale: 'Contains sensitive information',
        attachments: [],
      };

      expect(draft.source).toBe('OUTLOOK');
      expect(draft.isPendingReview).toBe(true);
    });

    it('should have correct CalendarEvent shape', () => {
      const event: import('./types').CalendarEvent = {
        id: 'gmail:event123',
        source: 'GMAIL',
        providerEventId: 'event123',
        title: 'Team Meeting',
        description: 'Weekly sync',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        isAllDay: false,
        location: 'Conference Room A',
        organizer: { email: 'organizer@example.com', name: 'Organizer' },
        attendees: [
          {
            email: 'attendee@example.com',
            name: 'Attendee',
            responseStatus: 'accepted',
            isRequired: true,
            isOrganizer: false,
          },
        ],
        responseStatus: 'accepted',
        isRecurring: true,
        calendarId: 'primary',
        calendarName: 'Primary Calendar',
        visibility: 'private',
        reminderMinutes: 15,
      };

      expect(event.source).toBe('GMAIL');
      expect(event.isRecurring).toBe(true);
    });
  });
});
