/**
 * @nexus-aec/email-providers - Outlook Adapter
 *
 * Implements EmailProvider interface using Microsoft Graph API.
 * Handles Outlook/Office 365 email, calendar, and contacts.
 *
 * @see https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview
 */

import {
  EmailProviderError as EmailProviderErrorClass,
  createStandardId,
  parseStandardId,
} from '../interfaces/email-provider';

import type {
  EmailProvider,
  EmailProviderConfig,
  EmailProviderError,
} from '../interfaces/email-provider';
import type {
  EmailSource,
  StandardEmail,
  StandardThread,
  StandardDraft,
  CalendarEvent,
  Contact,
  Folder,
  CreateDraftInput,
  UpdateDraftInput,
  PaginationParams,
  PaginatedResponse,
  EmailQueryFilters,
  CalendarQueryFilters,
  SyncStatus,
  SyncState,
  EmailAddress,
  Attachment,
  PhoneNumber,
} from '../interfaces/types';

// =============================================================================
// Constants
// =============================================================================

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

// =============================================================================
// Microsoft Graph Types
// =============================================================================

/** Microsoft Graph message */
interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string;
  from?: { emailAddress: { address: string; name?: string } };
  toRecipients: Array<{ emailAddress: { address: string; name?: string } }>;
  ccRecipients: Array<{ emailAddress: { address: string; name?: string } }>;
  bccRecipients: Array<{ emailAddress: { address: string; name?: string } }>;
  replyTo?: Array<{ emailAddress: { address: string; name?: string } }>;
  receivedDateTime: string;
  sentDateTime: string;
  bodyPreview: string;
  body?: { contentType: string; content: string };
  isRead: boolean;
  flag?: { flagStatus: string };
  hasAttachments: boolean;
  attachments?: GraphAttachment[];
  parentFolderId: string;
  categories: string[];
  importance: 'low' | 'normal' | 'high';
  internetMessageId?: string;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
}

/** Microsoft Graph attachment */
interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
}

/** Microsoft Graph conversation/thread */
interface GraphConversation {
  id: string;
  topic: string;
  lastDeliveredDateTime: string;
  uniqueSenders: string[];
  hasAttachments: boolean;
  preview: string;
}

/** Microsoft Graph mail folder */
interface GraphFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
  totalItemCount: number;
  unreadItemCount: number;
  isHidden: boolean;
}

/** Microsoft Graph calendar event */
interface GraphEvent {
  id: string;
  subject: string;
  body?: { contentType: string; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  location?: { displayName: string };
  onlineMeeting?: { joinUrl: string };
  organizer: { emailAddress: { address: string; name?: string } };
  attendees: Array<{
    emailAddress: { address: string; name?: string };
    status: { response: string };
    type: string;
  }>;
  responseStatus: { response: string };
  isRecurrence: boolean;
  calendar?: string;
  sensitivity: string;
  reminderMinutesBeforeStart?: number;
}

/** Microsoft Graph contact */
interface GraphContact {
  id: string;
  displayName: string;
  givenName?: string;
  surname?: string;
  emailAddresses: Array<{ address: string; name?: string }>;
  businessPhones: string[];
  mobilePhone?: string;
  homePhones: string[];
  companyName?: string;
  jobTitle?: string;
  department?: string;
  photo?: { id: string };
  lastModifiedDateTime?: string;
}

/** Graph API paginated response */
interface GraphPagedResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.count'?: number;
}

// =============================================================================
// Outlook Adapter
// =============================================================================

/**
 * OutlookAdapter - Microsoft Graph API implementation of EmailProvider
 */
export class OutlookAdapter implements EmailProvider {
  readonly source: EmailSource = 'OUTLOOK';
  readonly userId: string;

  private accessToken: string;
  private syncStatus: SyncStatus = { state: 'idle' };
  private readonly apiBase: string;

  constructor(config: EmailProviderConfig) {
    this.userId = config.userId;
    this.accessToken = config.tokens.accessToken;
    this.apiBase = config.apiEndpoint ?? GRAPH_API_BASE;
  }

  /**
   * Update access token (called after refresh)
   */
  updateAccessToken(newToken: string): void {
    this.accessToken = newToken;
  }

  // ===========================================================================
  // Connection & Lifecycle
  // ===========================================================================

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      await this.graphRequest('/me');
      return { connected: true };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  async disconnect(): Promise<void> {
    this.syncStatus = { state: 'idle' };
  }

  // ===========================================================================
  // Email Operations
  // ===========================================================================

  async fetchUnread(
    filters?: EmailQueryFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<StandardEmail>> {
    const mergedFilters: EmailQueryFilters = { ...filters, unreadOnly: true };
    return this.fetchEmails(mergedFilters, pagination);
  }

  async fetchThreads(
    filters?: EmailQueryFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<StandardThread>> {
    this.updateSyncStatus('syncing');

    try {
      const pageSize = Math.min(pagination?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

      // Build query parameters
      const params = new URLSearchParams({
        $top: pageSize.toString(),
        $orderby: 'lastDeliveredDateTime desc',
      });

      if (pagination?.pageToken) {
        // Use skiptoken for pagination
        params.set('$skiptoken', pagination.pageToken);
      }

      // Add filters
      const filterClauses: string[] = [];
      if (filters?.unreadOnly) {
        filterClauses.push('hasAttachments eq false or hasAttachments eq true'); // Placeholder
      }

      const response = await this.graphRequest<GraphPagedResponse<GraphConversation>>(
        `/me/mailFolders/inbox/messages?$select=conversationId&$orderby=receivedDateTime desc&$top=${pageSize}`
      );

      // Group messages by conversation
      const conversationIds = new Set<string>();
      const threads: StandardThread[] = [];

      for (const msg of response.value as unknown as GraphMessage[]) {
        if (!conversationIds.has(msg.conversationId)) {
          conversationIds.add(msg.conversationId);
          // Fetch full thread
          const thread = await this.fetchThread(createStandardId('OUTLOOK', msg.conversationId));
          if (thread) {
            threads.push(thread);
            if (threads.length >= pageSize) {
              break;
            }
          }
        }
      }

      this.updateSyncStatus('synced', threads.length);

      const nextPageToken = response['@odata.nextLink']
        ? this.extractSkipToken(response['@odata.nextLink'])
        : undefined;

      return {
        items: threads,
        ...(nextPageToken && { nextPageToken }),
      };
    } catch (error) {
      this.updateSyncStatus('error', undefined, this.getErrorMessage(error));
      throw this.wrapError(error, 'Failed to fetch threads');
    }
  }

  async fetchEmail(emailId: string): Promise<StandardEmail | null> {
    const parsed = parseStandardId(emailId);
    if (!parsed || parsed.source !== 'OUTLOOK') {
      return null;
    }

    try {
      const message = await this.graphRequest<GraphMessage>(
        `/me/messages/${parsed.providerId}?$expand=attachments`
      );
      return this.normalizeMessage(message);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw this.wrapError(error, 'Failed to fetch email');
    }
  }

  async fetchThread(threadId: string): Promise<StandardThread | null> {
    const parsed = parseStandardId(threadId);
    if (!parsed || parsed.source !== 'OUTLOOK') {
      return null;
    }

    try {
      const response = await this.graphRequest<GraphPagedResponse<GraphMessage>>(
        `/me/messages?$filter=conversationId eq '${parsed.providerId}'&$orderby=receivedDateTime asc&$expand=attachments`
      );

      if (response.value.length === 0) {
        return null;
      }

      const messages = response.value.map((msg) => this.normalizeMessage(msg));
      const latestMessage = messages[messages.length - 1]!;

      // Collect unique participants
      const participantMap = new Map<string, EmailAddress>();
      for (const msg of messages) {
        if (msg.from) {
          participantMap.set(msg.from.email, msg.from);
        }
        for (const recipient of [...msg.to, ...msg.cc]) {
          participantMap.set(recipient.email, recipient);
        }
      }

      return {
        id: threadId,
        source: 'OUTLOOK',
        providerThreadId: parsed.providerId,
        subject: latestMessage.subject,
        participants: Array.from(participantMap.values()),
        messageCount: messages.length,
        messageIds: messages.map((m) => m.id),
        latestMessage,
        lastUpdatedAt: latestMessage.receivedAt,
        hasUnread: messages.some((m) => !m.isRead),
        snippet: latestMessage.bodyPreview,
        labels: latestMessage.labels,
      };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw this.wrapError(error, 'Failed to fetch thread');
    }
  }

  async fetchThreadMessages(threadId: string): Promise<StandardEmail[]> {
    const thread = await this.fetchThread(threadId);
    if (!thread) {
      return [];
    }

    const parsed = parseStandardId(threadId);
    if (!parsed) {
      return [];
    }

    const response = await this.graphRequest<GraphPagedResponse<GraphMessage>>(
      `/me/messages?$filter=conversationId eq '${parsed.providerId}'&$orderby=receivedDateTime asc&$expand=attachments`
    );

    return response.value.map((msg) => this.normalizeMessage(msg));
  }

  async markRead(emailIds: string[]): Promise<void> {
    await this.batchUpdateMessages(emailIds, { isRead: true });
  }

  async markUnread(emailIds: string[]): Promise<void> {
    await this.batchUpdateMessages(emailIds, { isRead: false });
  }

  async flagEmails(emailIds: string[]): Promise<void> {
    await this.batchUpdateMessages(emailIds, { flag: { flagStatus: 'flagged' } });
  }

  async unflagEmails(emailIds: string[]): Promise<void> {
    await this.batchUpdateMessages(emailIds, { flag: { flagStatus: 'notFlagged' } });
  }

  async moveToFolder(emailIds: string[], folderId: string): Promise<void> {
    const parsed = parseStandardId(folderId);
    const targetFolderId = parsed?.providerId ?? folderId;

    for (const emailId of emailIds) {
      const msgParsed = parseStandardId(emailId);
      if (!msgParsed || msgParsed.source !== 'OUTLOOK') {
        continue;
      }

      await this.graphRequest(`/me/messages/${msgParsed.providerId}/move`, {
        method: 'POST',
        body: JSON.stringify({ destinationId: targetFolderId }),
      });
    }
  }

  async applyLabels(emailIds: string[], labelIds: string[]): Promise<void> {
    // Outlook uses categories instead of labels
    for (const emailId of emailIds) {
      const email = await this.fetchEmail(emailId);
      if (!email) {
        continue;
      }

      const parsed = parseStandardId(emailId);
      if (!parsed) {
        continue;
      }

      const existingCategories = email.labels;
      const newCategories = [...new Set([...existingCategories, ...labelIds])];

      await this.graphRequest(`/me/messages/${parsed.providerId}`, {
        method: 'PATCH',
        body: JSON.stringify({ categories: newCategories }),
      });
    }
  }

  async removeLabels(emailIds: string[], labelIds: string[]): Promise<void> {
    for (const emailId of emailIds) {
      const email = await this.fetchEmail(emailId);
      if (!email) {
        continue;
      }

      const parsed = parseStandardId(emailId);
      if (!parsed) {
        continue;
      }

      const newCategories = email.labels.filter((c) => !labelIds.includes(c));

      await this.graphRequest(`/me/messages/${parsed.providerId}`, {
        method: 'PATCH',
        body: JSON.stringify({ categories: newCategories }),
      });
    }
  }

  async archiveEmails(emailIds: string[]): Promise<void> {
    // Move to Archive folder
    const folders = await this.fetchFolders();
    const archiveFolder = folders.find((f) => f.systemType === 'archive');

    if (archiveFolder) {
      await this.moveToFolder(emailIds, archiveFolder.id);
    }
  }

  async deleteEmails(emailIds: string[]): Promise<void> {
    for (const emailId of emailIds) {
      const parsed = parseStandardId(emailId);
      if (!parsed || parsed.source !== 'OUTLOOK') {
        continue;
      }

      await this.graphRequest(`/me/messages/${parsed.providerId}`, {
        method: 'DELETE',
      });
    }
  }

  // ===========================================================================
  // Draft Operations
  // ===========================================================================

  async fetchDrafts(pagination?: PaginationParams): Promise<PaginatedResponse<StandardDraft>> {
    const pageSize = Math.min(pagination?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const response = await this.graphRequest<GraphPagedResponse<GraphMessage>>(
      `/me/mailFolders/drafts/messages?$top=${pageSize}&$orderby=lastModifiedDateTime desc`
    );

    const drafts = response.value.map((msg) => this.normalizeDraft(msg));
    const nextPageToken = response['@odata.nextLink']
      ? this.extractSkipToken(response['@odata.nextLink'])
      : undefined;

    return {
      items: drafts,
      ...(nextPageToken && { nextPageToken }),
    };
  }

  async fetchDraft(draftId: string): Promise<StandardDraft | null> {
    const parsed = parseStandardId(draftId);
    if (!parsed || parsed.source !== 'OUTLOOK') {
      return null;
    }

    try {
      const message = await this.graphRequest<GraphMessage>(`/me/messages/${parsed.providerId}`);
      return this.normalizeDraft(message);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw this.wrapError(error, 'Failed to fetch draft');
    }
  }

  async createDraft(input: CreateDraftInput): Promise<StandardDraft> {
    const body: Record<string, unknown> = {
      subject: input.subject,
      toRecipients: input.to.map((r) => ({
        emailAddress: { address: r.email, name: r.name },
      })),
    };

    if (input.cc?.length) {
      body['ccRecipients'] = input.cc.map((r) => ({
        emailAddress: { address: r.email, name: r.name },
      }));
    }

    if (input.bcc?.length) {
      body['bccRecipients'] = input.bcc.map((r) => ({
        emailAddress: { address: r.email, name: r.name },
      }));
    }

    if (input.bodyHtml) {
      body['body'] = { contentType: 'HTML', content: input.bodyHtml };
    } else if (input.bodyText) {
      body['body'] = { contentType: 'Text', content: input.bodyText };
    }

    const message = await this.graphRequest<GraphMessage>('/me/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const draft = this.normalizeDraft(message);

    // Mark as pending review if specified
    if (input.isPendingReview) {
      draft.isPendingReview = true;
      if (input.reviewRationale) {
        draft.reviewRationale = input.reviewRationale;
      }
    }

    return draft;
  }

  async updateDraft(draftId: string, input: UpdateDraftInput): Promise<StandardDraft> {
    const parsed = parseStandardId(draftId);
    if (!parsed || parsed.source !== 'OUTLOOK') {
      throw new EmailProviderErrorClass('Invalid draft ID', 'OUTLOOK', 'INVALID_REQUEST');
    }

    const body: Record<string, unknown> = {};

    if (input.subject !== undefined) {
      body['subject'] = input.subject;
    }

    if (input.to !== undefined) {
      body['toRecipients'] = input.to.map((r) => ({
        emailAddress: { address: r.email, name: r.name },
      }));
    }

    if (input.cc !== undefined) {
      body['ccRecipients'] = input.cc.map((r) => ({
        emailAddress: { address: r.email, name: r.name },
      }));
    }

    if (input.bcc !== undefined) {
      body['bccRecipients'] = input.bcc.map((r) => ({
        emailAddress: { address: r.email, name: r.name },
      }));
    }

    if (input.bodyHtml !== undefined) {
      body['body'] = { contentType: 'HTML', content: input.bodyHtml };
    } else if (input.bodyText !== undefined) {
      body['body'] = { contentType: 'Text', content: input.bodyText };
    }

    const message = await this.graphRequest<GraphMessage>(`/me/messages/${parsed.providerId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    const draft = this.normalizeDraft(message);

    if (input.isPendingReview !== undefined) {
      draft.isPendingReview = input.isPendingReview;
    }
    if (input.reviewRationale !== undefined) {
      draft.reviewRationale = input.reviewRationale;
    }

    return draft;
  }

  async deleteDraft(draftId: string): Promise<void> {
    const parsed = parseStandardId(draftId);
    if (!parsed || parsed.source !== 'OUTLOOK') {
      return;
    }

    await this.graphRequest(`/me/messages/${parsed.providerId}`, {
      method: 'DELETE',
    });
  }

  async sendDraft(draftId: string): Promise<string> {
    const parsed = parseStandardId(draftId);
    if (!parsed || parsed.source !== 'OUTLOOK') {
      throw new EmailProviderErrorClass('Invalid draft ID', 'OUTLOOK', 'INVALID_REQUEST');
    }

    await this.graphRequest(`/me/messages/${parsed.providerId}/send`, {
      method: 'POST',
    });

    // The message is moved to Sent folder, return the same ID
    return draftId;
  }

  // ===========================================================================
  // Folder Operations
  // ===========================================================================

  async fetchFolders(): Promise<Folder[]> {
    const response = await this.graphRequest<GraphPagedResponse<GraphFolder>>(
      '/me/mailFolders?$top=100'
    );

    return response.value.map((folder) => this.normalizeFolder(folder));
  }

  async createFolder(name: string, parentId?: string): Promise<Folder> {
    const endpoint = parentId ? `/me/mailFolders/${parentId}/childFolders` : '/me/mailFolders';

    const folder = await this.graphRequest<GraphFolder>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ displayName: name }),
    });

    return this.normalizeFolder(folder);
  }

  async deleteFolder(folderId: string): Promise<void> {
    const parsed = parseStandardId(folderId);
    const targetId = parsed?.providerId ?? folderId;

    await this.graphRequest(`/me/mailFolders/${targetId}`, {
      method: 'DELETE',
    });
  }

  // ===========================================================================
  // Calendar Operations
  // ===========================================================================

  async fetchCalendarEvents(
    filters: CalendarQueryFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<CalendarEvent>> {
    const pageSize = Math.min(pagination?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const startDateTime = filters.timeMin.toISOString();
    const endDateTime = filters.timeMax.toISOString();

    const endpoint = filters.calendarId
      ? `/me/calendars/${filters.calendarId}/calendarView`
      : '/me/calendarView';

    const response = await this.graphRequest<GraphPagedResponse<GraphEvent>>(
      `${endpoint}?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$top=${pageSize}&$orderby=start/dateTime`
    );

    const events = response.value.map((event) => this.normalizeEvent(event));
    const nextPageToken = response['@odata.nextLink']
      ? this.extractSkipToken(response['@odata.nextLink'])
      : undefined;

    return {
      items: events,
      ...(nextPageToken && { nextPageToken }),
    };
  }

  async fetchCalendarEvent(eventId: string): Promise<CalendarEvent | null> {
    const parsed = parseStandardId(eventId);
    if (!parsed || parsed.source !== 'OUTLOOK') {
      return null;
    }

    try {
      const event = await this.graphRequest<GraphEvent>(`/me/events/${parsed.providerId}`);
      return this.normalizeEvent(event);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw this.wrapError(error, 'Failed to fetch calendar event');
    }
  }

  // ===========================================================================
  // Contact Operations
  // ===========================================================================

  async fetchContacts(pagination?: PaginationParams): Promise<PaginatedResponse<Contact>> {
    const pageSize = Math.min(pagination?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const response = await this.graphRequest<GraphPagedResponse<GraphContact>>(
      `/me/contacts?$top=${pageSize}&$orderby=displayName`
    );

    const contacts = response.value.map((contact) => this.normalizeContact(contact));
    const nextPageToken = response['@odata.nextLink']
      ? this.extractSkipToken(response['@odata.nextLink'])
      : undefined;

    return {
      items: contacts,
      ...(nextPageToken && { nextPageToken }),
    };
  }

  async searchContacts(query: string, limit = 10): Promise<Contact[]> {
    const response = await this.graphRequest<GraphPagedResponse<GraphContact>>(
      `/me/contacts?$search="${query}"&$top=${limit}`
    );

    return response.value.map((contact) => this.normalizeContact(contact));
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async fetchEmails(
    filters?: EmailQueryFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<StandardEmail>> {
    this.updateSyncStatus('syncing');

    try {
      const pageSize = Math.min(pagination?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

      // Build endpoint
      let endpoint = '/me/messages';
      if (filters?.folderId) {
        const parsed = parseStandardId(filters.folderId);
        const folderId = parsed?.providerId ?? filters.folderId;
        endpoint = `/me/mailFolders/${folderId}/messages`;
      }

      // Build query parameters
      const params = new URLSearchParams({
        $top: pageSize.toString(),
        $orderby: 'receivedDateTime desc',
        $expand: 'attachments',
      });

      // Build filter clauses
      const filterClauses: string[] = [];

      if (filters?.unreadOnly) {
        filterClauses.push('isRead eq false');
      }

      if (filters?.flaggedOnly) {
        filterClauses.push("flag/flagStatus eq 'flagged'");
      }

      if (filters?.hasAttachments) {
        filterClauses.push('hasAttachments eq true');
      }

      if (filters?.from) {
        filterClauses.push(`from/emailAddress/address eq '${filters.from}'`);
      }

      if (filters?.after) {
        filterClauses.push(`receivedDateTime ge ${filters.after.toISOString()}`);
      }

      if (filters?.before) {
        filterClauses.push(`receivedDateTime le ${filters.before.toISOString()}`);
      }

      if (filterClauses.length > 0) {
        params.set('$filter', filterClauses.join(' and '));
      }

      if (filters?.query) {
        params.set('$search', `"${filters.query}"`);
      }

      if (pagination?.pageToken) {
        params.set('$skiptoken', pagination.pageToken);
      }

      const response = await this.graphRequest<GraphPagedResponse<GraphMessage>>(
        `${endpoint}?${params.toString()}`
      );

      const emails = response.value.map((msg) => this.normalizeMessage(msg));

      this.updateSyncStatus('synced', emails.length);

      const nextPageToken = response['@odata.nextLink']
        ? this.extractSkipToken(response['@odata.nextLink'])
        : undefined;
      const totalCount = response['@odata.count'];

      return {
        items: emails,
        ...(nextPageToken && { nextPageToken }),
        ...(totalCount !== undefined && { totalCount }),
      };
    } catch (error) {
      this.updateSyncStatus('error', undefined, this.getErrorMessage(error));
      throw this.wrapError(error, 'Failed to fetch emails');
    }
  }

  private async batchUpdateMessages(
    emailIds: string[],
    updates: Record<string, unknown>
  ): Promise<void> {
    for (const emailId of emailIds) {
      const parsed = parseStandardId(emailId);
      if (!parsed || parsed.source !== 'OUTLOOK') {
        continue;
      }

      await this.graphRequest(`/me/messages/${parsed.providerId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    }
  }

  private async graphRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.apiBase}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    // Handle empty responses
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    const errorMessage = errorBody.error?.message ?? errorBody.message ?? response.statusText;

    let code:
      | 'AUTH_EXPIRED'
      | 'PERMISSION_DENIED'
      | 'NOT_FOUND'
      | 'RATE_LIMITED'
      | 'SERVER_ERROR'
      | 'INVALID_REQUEST';

    switch (response.status) {
      case 401:
        code = 'AUTH_EXPIRED';
        break;
      case 403:
        code = 'PERMISSION_DENIED';
        break;
      case 404:
        code = 'NOT_FOUND';
        break;
      case 429:
        code = 'RATE_LIMITED';
        break;
      default:
        code = response.status >= 500 ? 'SERVER_ERROR' : 'INVALID_REQUEST';
    }

    throw new EmailProviderErrorClass(errorMessage, 'OUTLOOK', code, errorBody);
  }

  private normalizeMessage(msg: GraphMessage): StandardEmail {
    const inReplyTo = msg.internetMessageHeaders?.find(
      (h) => h.name.toLowerCase() === 'in-reply-to'
    )?.value;

    const references = msg.internetMessageHeaders
      ?.find((h) => h.name.toLowerCase() === 'references')
      ?.value?.split(/\s+/);

    return {
      id: createStandardId('OUTLOOK', msg.id),
      source: 'OUTLOOK',
      providerMessageId: msg.id,
      threadId: createStandardId('OUTLOOK', msg.conversationId),
      subject: msg.subject ?? '',
      from: msg.from
        ? {
            email: msg.from.emailAddress.address,
            ...(msg.from.emailAddress.name && { name: msg.from.emailAddress.name }),
          }
        : { email: '' },
      to: msg.toRecipients.map((r) => ({
        email: r.emailAddress.address,
        ...(r.emailAddress.name && { name: r.emailAddress.name }),
      })),
      cc: msg.ccRecipients.map((r) => ({
        email: r.emailAddress.address,
        ...(r.emailAddress.name && { name: r.emailAddress.name }),
      })),
      bcc: msg.bccRecipients.map((r) => ({
        email: r.emailAddress.address,
        ...(r.emailAddress.name && { name: r.emailAddress.name }),
      })),
      receivedAt: msg.receivedDateTime,
      sentAt: msg.sentDateTime,
      bodyPreview: msg.bodyPreview,
      ...(msg.body?.contentType === 'Text' && msg.body.content && { bodyText: msg.body.content }),
      ...(msg.body?.contentType === 'HTML' && msg.body.content && { bodyHtml: msg.body.content }),
      isRead: msg.isRead,
      isFlagged: msg.flag?.flagStatus === 'flagged',
      hasAttachments: msg.hasAttachments,
      attachments: (msg.attachments ?? []).map((a) => this.normalizeAttachment(a)),
      folder: msg.parentFolderId,
      labels: msg.categories,
      importance: msg.importance,
      ...(msg.replyTo && {
        replyTo: msg.replyTo.map((r) => ({
          email: r.emailAddress.address,
          ...(r.emailAddress.name && { name: r.emailAddress.name }),
        })),
      }),
      ...(msg.internetMessageId && { internetMessageId: msg.internetMessageId }),
      ...(inReplyTo && { inReplyTo }),
      ...(references && references.length > 0 && { references }),
    };
  }

  private normalizeAttachment(att: GraphAttachment): Attachment {
    return {
      id: att.id,
      name: att.name,
      contentType: att.contentType,
      size: att.size,
      isInline: att.isInline,
    };
  }

  private normalizeDraft(msg: GraphMessage): StandardDraft {
    const threadId = msg.conversationId
      ? createStandardId('OUTLOOK', msg.conversationId)
      : undefined;
    const bodyText = msg.body?.contentType === 'Text' ? msg.body.content : undefined;
    const bodyHtml = msg.body?.contentType === 'HTML' ? msg.body.content : undefined;

    return {
      id: createStandardId('OUTLOOK', msg.id),
      source: 'OUTLOOK',
      providerDraftId: msg.id,
      ...(threadId && { threadId }),
      subject: msg.subject ?? '',
      to: msg.toRecipients.map((r) => ({
        email: r.emailAddress.address,
        ...(r.emailAddress.name && { name: r.emailAddress.name }),
      })),
      cc: msg.ccRecipients.map((r) => ({
        email: r.emailAddress.address,
        ...(r.emailAddress.name && { name: r.emailAddress.name }),
      })),
      bcc: msg.bccRecipients.map((r) => ({
        email: r.emailAddress.address,
        ...(r.emailAddress.name && { name: r.emailAddress.name }),
      })),
      ...(bodyText && { bodyText }),
      ...(bodyHtml && { bodyHtml }),
      createdAt: msg.receivedDateTime,
      modifiedAt: msg.sentDateTime,
      isPendingReview: false, // Will be set by caller if needed
      attachments: (msg.attachments ?? []).map((a) => this.normalizeAttachment(a)),
    };
  }

  private normalizeFolder(folder: GraphFolder): Folder {
    // Map well-known folder names to system types
    const systemTypeMap: Record<string, Folder['systemType']> = {
      inbox: 'inbox',
      sentitems: 'sent',
      drafts: 'drafts',
      deleteditems: 'trash',
      junkemail: 'spam',
      archive: 'archive',
    };

    const normalizedName = folder.displayName.toLowerCase().replace(/\s+/g, '');
    const systemType = systemTypeMap[normalizedName];
    const parentId = folder.parentFolderId
      ? createStandardId('OUTLOOK', folder.parentFolderId)
      : undefined;

    return {
      id: createStandardId('OUTLOOK', folder.id),
      source: 'OUTLOOK',
      providerId: folder.id,
      name: folder.displayName,
      ...(parentId && { parentId }),
      totalCount: folder.totalItemCount,
      unreadCount: folder.unreadItemCount,
      isSystem: !!systemType,
      ...(systemType && { systemType }),
    };
  }

  private normalizeEvent(event: GraphEvent): CalendarEvent {
    const responseStatusMap: Record<string, CalendarEvent['responseStatus']> = {
      accepted: 'accepted',
      declined: 'declined',
      tentativelyAccepted: 'tentative',
      notResponded: 'needsAction',
      none: 'none',
    };

    return {
      id: createStandardId('OUTLOOK', event.id),
      source: 'OUTLOOK',
      providerEventId: event.id,
      title: event.subject,
      ...(event.body?.content && { description: event.body.content }),
      startTime: event.start.dateTime,
      endTime: event.end.dateTime,
      isAllDay: event.isAllDay,
      ...(event.location?.displayName && { location: event.location.displayName }),
      ...(event.onlineMeeting?.joinUrl && { onlineMeetingUrl: event.onlineMeeting.joinUrl }),
      organizer: {
        email: event.organizer.emailAddress.address,
        ...(event.organizer.emailAddress.name && { name: event.organizer.emailAddress.name }),
      },
      attendees: event.attendees.map((a) => ({
        email: a.emailAddress.address,
        ...(a.emailAddress.name && { name: a.emailAddress.name }),
        responseStatus: responseStatusMap[a.status.response] ?? 'none',
        isRequired: a.type === 'required',
        isOrganizer: a.emailAddress.address === event.organizer.emailAddress.address,
      })),
      responseStatus: responseStatusMap[event.responseStatus.response] ?? 'none',
      isRecurring: event.isRecurrence,
      calendarId: event.calendar ?? 'primary',
      calendarName: 'Calendar',
      visibility:
        event.sensitivity === 'private'
          ? 'private'
          : event.sensitivity === 'confidential'
            ? 'confidential'
            : 'public',
      ...(event.reminderMinutesBeforeStart !== undefined && {
        reminderMinutes: event.reminderMinutesBeforeStart,
      }),
    };
  }

  private normalizeContact(contact: GraphContact): Contact {
    const phoneNumbers: PhoneNumber[] = [];

    if (contact.mobilePhone) {
      phoneNumbers.push({ number: contact.mobilePhone, type: 'mobile' });
    }

    for (const phone of contact.businessPhones) {
      phoneNumbers.push({ number: phone, type: 'work' });
    }

    for (const phone of contact.homePhones) {
      phoneNumbers.push({ number: phone, type: 'home' });
    }

    return {
      id: createStandardId('OUTLOOK', contact.id),
      source: 'OUTLOOK',
      providerContactId: contact.id,
      displayName: contact.displayName,
      ...(contact.givenName && { firstName: contact.givenName }),
      ...(contact.surname && { lastName: contact.surname }),
      emailAddresses: contact.emailAddresses.map((e) => ({
        email: e.address,
        ...(e.name && { name: e.name }),
      })),
      phoneNumbers,
      ...(contact.companyName && { company: contact.companyName }),
      ...(contact.jobTitle && { jobTitle: contact.jobTitle }),
      ...(contact.department && { department: contact.department }),
      ...(contact.lastModifiedDateTime && { modifiedAt: contact.lastModifiedDateTime }),
    };
  }

  private updateSyncStatus(state: SyncState, itemsSynced?: number, error?: string): void {
    const lastSyncAt = state === 'synced' ? new Date().toISOString() : this.syncStatus.lastSyncAt;

    this.syncStatus = {
      state,
      ...(lastSyncAt && { lastSyncAt }),
      ...(itemsSynced !== undefined && { itemsSynced }),
      ...(error && { error }),
    };
  }

  private extractSkipToken(nextLink: string): string {
    const url = new URL(nextLink);
    return url.searchParams.get('$skiptoken') ?? '';
  }

  private isNotFoundError(error: unknown): boolean {
    return error instanceof EmailProviderErrorClass && error.code === 'NOT_FOUND';
  }

  private wrapError(error: unknown, message: string): EmailProviderError {
    if (error instanceof EmailProviderErrorClass) {
      return error;
    }

    return new EmailProviderErrorClass(
      `${message}: ${this.getErrorMessage(error)}`,
      'OUTLOOK',
      'UNKNOWN',
      error
    );
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  // ===========================================================================
  // Incremental Sync — Date-based Change Detection
  // ===========================================================================

  /**
   * Check if any new emails have been received since the given timestamp.
   *
   * Uses the existing fetchEmails() with an `after` date filter and pageSize 1
   * to efficiently detect new mail without fetching full content.
   */
  async hasNewEmailsSince(since: string): Promise<boolean> {
    try {
      const result = await this.fetchEmails({ after: new Date(since) }, { pageSize: 1 });
      return result.items.length > 0;
    } catch {
      // On error, assume changes exist to trigger a full refetch
      return true;
    }
  }
}
