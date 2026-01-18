/**
 * Tests for Smart Draft Service
 */

import {
  SmartDraftService,
  SmartDraftError,
  isSmartDraftError,
} from './smart-draft';

import type { EmailProvider } from '../interfaces/email-provider';
import type { StandardEmail, StandardDraft, SyncStatus } from '../interfaces/types';

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
  to: [{ email: 'recipient@example.com', name: 'Recipient' }],
  cc: [{ email: 'cc@example.com' }],
  bcc: [],
  receivedAt: new Date().toISOString(),
  sentAt: new Date().toISOString(),
  bodyPreview: 'Preview...',
  bodyText: 'Full body text',
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
  subject: 'Draft Subject',
  to: [{ email: 'to@example.com' }],
  cc: [],
  bcc: [],
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  isPendingReview: true,
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
  fetchUnread: jest.fn().mockResolvedValue({ items: [] }),
  fetchThreads: jest.fn().mockResolvedValue({ items: [] }),
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
  fetchDrafts: jest.fn().mockResolvedValue({ items: [] }),
  fetchDraft: jest.fn().mockResolvedValue(null),
  createDraft: jest.fn().mockResolvedValue(createMockDraft({ source })),
  updateDraft: jest.fn().mockResolvedValue(createMockDraft({ source })),
  deleteDraft: jest.fn().mockResolvedValue(undefined),
  sendDraft: jest.fn().mockResolvedValue('sent-id'),
  fetchFolders: jest.fn().mockResolvedValue([]),
  createFolder: jest.fn().mockResolvedValue({}),
  deleteFolder: jest.fn().mockResolvedValue(undefined),
  fetchCalendarEvents: jest.fn().mockResolvedValue({ items: [] }),
  fetchCalendarEvent: jest.fn().mockResolvedValue(null),
  fetchContacts: jest.fn().mockResolvedValue({ items: [] }),
  searchContacts: jest.fn().mockResolvedValue([]),
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('SmartDraftService', () => {
  describe('constructor', () => {
    it('should initialize with providers from object', () => {
      const outlook = createMockProvider('OUTLOOK');
      const gmail = createMockProvider('GMAIL');

      const service = new SmartDraftService({ OUTLOOK: outlook, GMAIL: gmail });

      expect(service.hasProvider('OUTLOOK')).toBe(true);
      expect(service.hasProvider('GMAIL')).toBe(true);
    });

    it('should initialize with providers from Map', () => {
      const outlook = createMockProvider('OUTLOOK');
      const providers = new Map<'OUTLOOK' | 'GMAIL', EmailProvider>();
      providers.set('OUTLOOK', outlook);

      const service = new SmartDraftService(providers);

      expect(service.hasProvider('OUTLOOK')).toBe(true);
    });

    it('should use Outlook as default source', () => {
      const service = new SmartDraftService({});
      expect(service.getDefaultSource()).toBe('OUTLOOK');
    });
  });

  describe('createDraft', () => {
    it('should use default provider for new drafts', async () => {
      const outlookDraft = createMockDraft({ id: 'outlook:d1', source: 'OUTLOOK' });
      const outlook = createMockProvider('OUTLOOK', {
        createDraft: jest.fn().mockResolvedValue(outlookDraft),
      });
      const gmail = createMockProvider('GMAIL');

      const service = new SmartDraftService(
        { OUTLOOK: outlook, GMAIL: gmail },
        { defaultSource: 'OUTLOOK' }
      );

      const result = await service.createDraft({
        subject: 'New Draft',
        to: [{ email: 'recipient@example.com' }],
        bodyText: 'Content',
      });

      expect(result.source).toBe('OUTLOOK');
      expect(result.routingReason).toBe('DEFAULT_PROVIDER');
      expect(outlook.createDraft).toHaveBeenCalled();
      expect(gmail.createDraft).not.toHaveBeenCalled();
    });

    it('should use original email source for replies', async () => {
      const gmailDraft = createMockDraft({ id: 'gmail:d1', source: 'GMAIL' });
      const outlook = createMockProvider('OUTLOOK');
      const gmail = createMockProvider('GMAIL', {
        createDraft: jest.fn().mockResolvedValue(gmailDraft),
      });

      const service = new SmartDraftService(
        { OUTLOOK: outlook, GMAIL: gmail },
        { defaultSource: 'OUTLOOK' }
      );

      const originalEmail = createMockEmail({ id: 'gmail:msg-1', source: 'GMAIL' });

      const result = await service.createDraft({
        subject: 'Re: Test',
        to: [originalEmail.from],
        bodyText: 'Reply content',
        context: {
          replyTo: { email: originalEmail },
        },
      });

      expect(result.source).toBe('GMAIL');
      expect(result.routingReason).toBe('REPLY_TO_THREAD');
      expect(gmail.createDraft).toHaveBeenCalled();
      expect(outlook.createDraft).not.toHaveBeenCalled();
    });

    it('should use forced source when specified', async () => {
      const gmailDraft = createMockDraft({ id: 'gmail:d1', source: 'GMAIL' });
      const outlook = createMockProvider('OUTLOOK');
      const gmail = createMockProvider('GMAIL', {
        createDraft: jest.fn().mockResolvedValue(gmailDraft),
      });

      const service = new SmartDraftService(
        { OUTLOOK: outlook, GMAIL: gmail },
        { defaultSource: 'OUTLOOK' }
      );

      const result = await service.createDraft({
        subject: 'New Draft',
        to: [{ email: 'recipient@example.com' }],
        context: {
          forceSource: 'GMAIL',
        },
      });

      expect(result.source).toBe('GMAIL');
      expect(result.routingReason).toBe('FORCED_PROVIDER');
    });

    it('should use fallback when default unavailable', async () => {
      const gmailDraft = createMockDraft({ id: 'gmail:d1', source: 'GMAIL' });
      const gmail = createMockProvider('GMAIL', {
        createDraft: jest.fn().mockResolvedValue(gmailDraft),
      });

      const service = new SmartDraftService(
        { GMAIL: gmail },
        { defaultSource: 'OUTLOOK', fallbackSource: 'GMAIL' }
      );

      const result = await service.createDraft({
        subject: 'New Draft',
        to: [{ email: 'recipient@example.com' }],
      });

      expect(result.source).toBe('GMAIL');
      expect(result.routingReason).toBe('FALLBACK_PROVIDER');
    });

    it('should throw when no provider available', async () => {
      const service = new SmartDraftService({});

      await expect(
        service.createDraft({
          subject: 'Draft',
          to: [{ email: 'test@example.com' }],
        })
      ).rejects.toThrow(SmartDraftError);
    });

    it('should set isPendingReview by default', async () => {
      const outlook = createMockProvider('OUTLOOK', {
        createDraft: jest.fn().mockImplementation((input) =>
          createMockDraft({ isPendingReview: input.isPendingReview })
        ),
      });

      const service = new SmartDraftService(
        { OUTLOOK: outlook },
        { defaultPendingReview: true }
      );

      await service.createDraft({
        subject: 'Draft',
        to: [{ email: 'test@example.com' }],
      });

      expect(outlook.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({ isPendingReview: true })
      );
    });
  });

  describe('createReply', () => {
    it('should create reply with correct recipients', async () => {
      const outlookDraft = createMockDraft({ source: 'OUTLOOK' });
      const outlook = createMockProvider('OUTLOOK', {
        createDraft: jest.fn().mockResolvedValue(outlookDraft),
      });

      const service = new SmartDraftService({ OUTLOOK: outlook });

      const originalEmail = createMockEmail({
        source: 'OUTLOOK',
        from: { email: 'sender@example.com', name: 'Sender' },
        to: [{ email: 'me@example.com' }],
        subject: 'Original Subject',
      });

      await service.createReply(originalEmail, { bodyText: 'Thanks!' });

      expect(outlook.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Re: Original Subject',
          to: [originalEmail.from],
        })
      );
    });

    it('should handle "Re:" prefix in subject', async () => {
      const outlook = createMockProvider('OUTLOOK', {
        createDraft: jest.fn().mockResolvedValue(createMockDraft()),
      });

      const service = new SmartDraftService({ OUTLOOK: outlook });

      const originalEmail = createMockEmail({
        source: 'OUTLOOK',
        subject: 'Re: Already a reply',
      });

      await service.createReply(originalEmail, { bodyText: 'Thanks!' });

      expect(outlook.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Re: Already a reply', // Should not duplicate Re:
        })
      );
    });

    it('should include all recipients when ccAll is true', async () => {
      const outlook = createMockProvider('OUTLOOK', {
        createDraft: jest.fn().mockResolvedValue(createMockDraft()),
      });

      const service = new SmartDraftService({ OUTLOOK: outlook });

      const originalEmail = createMockEmail({
        source: 'OUTLOOK',
        from: { email: 'sender@example.com' },
        to: [{ email: 'me@example.com' }, { email: 'other@example.com' }],
        cc: [{ email: 'cc@example.com' }],
      });

      await service.createReply(originalEmail, { bodyText: 'Thanks!', ccAll: true });

      const createDraftCall = (outlook.createDraft as jest.Mock).mock.calls[0][0];
      expect(createDraftCall.to).toEqual([originalEmail.from]);
      expect(createDraftCall.cc).toHaveLength(3); // other, cc, excluding sender
    });
  });

  describe('createForward', () => {
    it('should create forward with header', async () => {
      const outlook = createMockProvider('OUTLOOK', {
        createDraft: jest.fn().mockResolvedValue(createMockDraft()),
      });

      const service = new SmartDraftService({ OUTLOOK: outlook });

      const originalEmail = createMockEmail({
        source: 'OUTLOOK',
        subject: 'Original Subject',
        bodyText: 'Original body',
      });

      await service.createForward(originalEmail, {
        to: [{ email: 'forward@example.com' }],
        additionalText: 'FYI',
      });

      const createDraftCall = (outlook.createDraft as jest.Mock).mock.calls[0][0];
      expect(createDraftCall.subject).toBe('Fwd: Original Subject');
      expect(createDraftCall.bodyText).toContain('FYI');
      expect(createDraftCall.bodyText).toContain('Forwarded message');
      expect(createDraftCall.bodyText).toContain('Original body');
    });

    it('should not duplicate Fwd: prefix', async () => {
      const outlook = createMockProvider('OUTLOOK', {
        createDraft: jest.fn().mockResolvedValue(createMockDraft()),
      });

      const service = new SmartDraftService({ OUTLOOK: outlook });

      const originalEmail = createMockEmail({
        source: 'OUTLOOK',
        subject: 'Fwd: Already forwarded',
      });

      await service.createForward(originalEmail, {
        to: [{ email: 'forward@example.com' }],
      });

      const createDraftCall = (outlook.createDraft as jest.Mock).mock.calls[0][0];
      expect(createDraftCall.subject).toBe('Fwd: Already forwarded');
    });
  });

  describe('updateDraft', () => {
    it('should route update to correct provider', async () => {
      const outlook = createMockProvider('OUTLOOK', {
        updateDraft: jest.fn().mockResolvedValue(createMockDraft()),
      });
      const gmail = createMockProvider('GMAIL');

      const service = new SmartDraftService({ OUTLOOK: outlook, GMAIL: gmail });

      await service.updateDraft('outlook:draft-123', { subject: 'Updated' });

      expect(outlook.updateDraft).toHaveBeenCalledWith('outlook:draft-123', { subject: 'Updated' });
      expect(gmail.updateDraft).not.toHaveBeenCalled();
    });

    it('should throw for unknown provider', async () => {
      const service = new SmartDraftService({});

      await expect(
        service.updateDraft('outlook:draft-123', { subject: 'Updated' })
      ).rejects.toThrow(SmartDraftError);
    });
  });

  describe('markReviewed', () => {
    it('should mark draft as no longer pending review', async () => {
      const outlook = createMockProvider('OUTLOOK', {
        updateDraft: jest.fn().mockResolvedValue(createMockDraft({ isPendingReview: false })),
      });

      const service = new SmartDraftService({ OUTLOOK: outlook });

      await service.markReviewed('outlook:draft-123');

      expect(outlook.updateDraft).toHaveBeenCalledWith('outlook:draft-123', {
        isPendingReview: false,
      });
    });
  });

  describe('fetchPendingReview', () => {
    it('should fetch pending review drafts from all providers', async () => {
      const outlookDrafts = [
        createMockDraft({ id: 'outlook:d1', source: 'OUTLOOK', isPendingReview: true }),
        createMockDraft({ id: 'outlook:d2', source: 'OUTLOOK', isPendingReview: false }),
      ];
      const gmailDrafts = [
        createMockDraft({ id: 'gmail:d1', source: 'GMAIL', isPendingReview: true }),
      ];

      const outlook = createMockProvider('OUTLOOK', {
        fetchDrafts: jest.fn().mockResolvedValue({ items: outlookDrafts }),
      });
      const gmail = createMockProvider('GMAIL', {
        fetchDrafts: jest.fn().mockResolvedValue({ items: gmailDrafts }),
      });

      const service = new SmartDraftService({ OUTLOOK: outlook, GMAIL: gmail });

      const pending = await service.fetchPendingReview();

      // Should only include pending review drafts
      expect(pending).toHaveLength(2);
      expect(pending.every((d) => d.isPendingReview)).toBe(true);
    });

    it('should sort by creation date (oldest first)', async () => {
      const draft1 = createMockDraft({
        id: 'outlook:d1',
        isPendingReview: true,
        createdAt: '2024-01-02T00:00:00Z',
      });
      const draft2 = createMockDraft({
        id: 'outlook:d2',
        isPendingReview: true,
        createdAt: '2024-01-01T00:00:00Z', // Older
      });

      const outlook = createMockProvider('OUTLOOK', {
        fetchDrafts: jest.fn().mockResolvedValue({ items: [draft1, draft2] }),
      });

      const service = new SmartDraftService({ OUTLOOK: outlook });

      const pending = await service.fetchPendingReview();

      // Older should be first (review queue order)
      expect(pending[0]?.id).toBe('outlook:d2');
    });
  });

  describe('sendDraft', () => {
    it('should route send to correct provider', async () => {
      const outlook = createMockProvider('OUTLOOK', {
        sendDraft: jest.fn().mockResolvedValue('outlook:sent-123'),
      });

      const service = new SmartDraftService({ OUTLOOK: outlook });

      const sentId = await service.sendDraft('outlook:draft-123');

      expect(sentId).toBe('outlook:sent-123');
      expect(outlook.sendDraft).toHaveBeenCalledWith('outlook:draft-123');
    });
  });
});

describe('SmartDraftError', () => {
  it('should create error with all properties', () => {
    const error = new SmartDraftError('Provider unavailable', 'PROVIDER_UNAVAILABLE');

    expect(error.message).toBe('Provider unavailable');
    expect(error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(error.name).toBe('SmartDraftError');
  });

  it('should be an instance of Error', () => {
    const error = new SmartDraftError('Test', 'INVALID_INPUT');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SmartDraftError);
  });
});

describe('isSmartDraftError', () => {
  it('should return true for SmartDraftError', () => {
    const error = new SmartDraftError('Test', 'DRAFT_NOT_FOUND');
    expect(isSmartDraftError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('Test');
    expect(isSmartDraftError(error)).toBe(false);
  });
});

