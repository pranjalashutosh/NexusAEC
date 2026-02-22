/**
 * @nexus-aec/email-providers - Gmail Adapter
 *
 * Implements EmailProvider interface using Google Gmail API.
 * Handles Gmail email, Google Calendar, and Google Contacts.
 *
 * @see https://developers.google.com/gmail/api/reference/rest
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

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const PEOPLE_API_BASE = 'https://people.googleapis.com/v1';
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

// =============================================================================
// Gmail API Types
// =============================================================================

/** Gmail message */
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload?: GmailMessagePart;
  sizeEstimate: number;
  raw?: string;
}

/** Gmail message part (MIME structure) */
interface GmailMessagePart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers: Array<{ name: string; value: string }>;
  body: { attachmentId?: string; size: number; data?: string };
  parts?: GmailMessagePart[];
}

/** Gmail thread */
interface GmailThread {
  id: string;
  historyId: string;
  messages?: GmailMessage[];
}

/** Gmail label */
interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
}

/** Gmail draft */
interface GmailDraft {
  id: string;
  message: GmailMessage;
}

/** Google Calendar event */
interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ uri: string; entryPointType: string }> };
  organizer: { email: string; displayName?: string; self?: boolean };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
    optional?: boolean;
    organizer?: boolean;
  }>;
  status: string;
  recurrence?: string[];
  recurringEventId?: string;
  visibility?: string;
  reminders?: { useDefault: boolean; overrides?: Array<{ method: string; minutes: number }> };
}

/** Google People/Contacts person */
interface GooglePerson {
  resourceName: string;
  etag?: string;
  names?: Array<{ displayName: string; givenName?: string; familyName?: string }>;
  emailAddresses?: Array<{ value: string; displayName?: string; type?: string }>;
  phoneNumbers?: Array<{ value: string; type?: string }>;
  organizations?: Array<{ name?: string; title?: string; department?: string }>;
  photos?: Array<{ url: string }>;
  metadata?: { sources?: Array<{ updateTime?: string }> };
}

/** Gmail API list response */
interface GmailListResponse<T> {
  messages?: T[];
  threads?: T[];
  drafts?: GmailDraft[];
  labels?: GmailLabel[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

// =============================================================================
// Gmail Adapter
// =============================================================================

/**
 * GmailAdapter - Google Gmail API implementation of EmailProvider
 */
export class GmailAdapter implements EmailProvider {
  readonly source: EmailSource = 'GMAIL';
  readonly userId: string;

  private accessToken: string;
  private syncStatus: SyncStatus = { state: 'idle' };
  private readonly gmailBase: string;
  private readonly calendarBase: string;
  private readonly peopleBase: string;

  constructor(config: EmailProviderConfig) {
    this.userId = config.userId;
    this.accessToken = config.tokens.accessToken;
    this.gmailBase = config.apiEndpoint ?? GMAIL_API_BASE;
    this.calendarBase = CALENDAR_API_BASE;
    this.peopleBase = PEOPLE_API_BASE;
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
      await this.gmailRequest<{ emailAddress: string }>('/users/me/profile');
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

      // Build query
      const queryParts = this.buildSearchQuery(filters);
      const params = new URLSearchParams({
        maxResults: pageSize.toString(),
      });

      if (queryParts.length > 0) {
        params.set('q', queryParts.join(' '));
      }

      if (pagination?.pageToken) {
        params.set('pageToken', pagination.pageToken);
      }

      const response = await this.gmailRequest<GmailListResponse<GmailThread>>(
        `/users/me/threads?${params.toString()}`
      );

      // Fetch full thread details for each thread
      const threads: StandardThread[] = [];
      for (const threadRef of response.threads ?? []) {
        const thread = await this.fetchThread(createStandardId('GMAIL', threadRef.id));
        if (thread) {
          threads.push(thread);
        }
      }

      this.updateSyncStatus('synced', threads.length);

      return {
        items: threads,
        ...(response.nextPageToken && { nextPageToken: response.nextPageToken }),
        ...(response.resultSizeEstimate !== undefined && {
          totalCount: response.resultSizeEstimate,
        }),
      };
    } catch (error) {
      this.updateSyncStatus('error', undefined, this.getErrorMessage(error));
      throw this.wrapError(error, 'Failed to fetch threads');
    }
  }

  async fetchEmail(emailId: string): Promise<StandardEmail | null> {
    const parsed = parseStandardId(emailId);
    if (!parsed || parsed.source !== 'GMAIL') {
      return null;
    }

    try {
      const message = await this.gmailRequest<GmailMessage>(
        `/users/me/messages/${parsed.providerId}?format=full`
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
    if (!parsed || parsed.source !== 'GMAIL') {
      return null;
    }

    try {
      const thread = await this.gmailRequest<GmailThread>(
        `/users/me/threads/${parsed.providerId}?format=full`
      );

      if (!thread.messages?.length) {
        return null;
      }

      const messages = thread.messages.map((msg) => this.normalizeMessage(msg));
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
        source: 'GMAIL',
        providerThreadId: thread.id,
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

    const gmailThread = await this.gmailRequest<GmailThread>(
      `/users/me/threads/${parsed.providerId}?format=full`
    );

    return (gmailThread.messages ?? []).map((msg) => this.normalizeMessage(msg));
  }

  async markRead(emailIds: string[]): Promise<void> {
    await this.batchModifyMessages(emailIds, { removeLabelIds: ['UNREAD'] });
  }

  async markUnread(emailIds: string[]): Promise<void> {
    await this.batchModifyMessages(emailIds, { addLabelIds: ['UNREAD'] });
  }

  async flagEmails(emailIds: string[]): Promise<void> {
    await this.batchModifyMessages(emailIds, { addLabelIds: ['STARRED'] });
  }

  async unflagEmails(emailIds: string[]): Promise<void> {
    await this.batchModifyMessages(emailIds, { removeLabelIds: ['STARRED'] });
  }

  async moveToFolder(emailIds: string[], folderId: string): Promise<void> {
    const parsed = parseStandardId(folderId);
    const targetLabelId = parsed?.providerId ?? folderId;

    // Remove from INBOX, add to target label
    await this.batchModifyMessages(emailIds, {
      addLabelIds: [targetLabelId],
      removeLabelIds: ['INBOX'],
    });
  }

  async applyLabels(emailIds: string[], labelIds: string[]): Promise<void> {
    const resolvedLabelIds = labelIds.map((id) => {
      const parsed = parseStandardId(id);
      return parsed?.providerId ?? id;
    });

    await this.batchModifyMessages(emailIds, { addLabelIds: resolvedLabelIds });
  }

  async removeLabels(emailIds: string[], labelIds: string[]): Promise<void> {
    const resolvedLabelIds = labelIds.map((id) => {
      const parsed = parseStandardId(id);
      return parsed?.providerId ?? id;
    });

    await this.batchModifyMessages(emailIds, { removeLabelIds: resolvedLabelIds });
  }

  async archiveEmails(emailIds: string[]): Promise<void> {
    await this.batchModifyMessages(emailIds, { removeLabelIds: ['INBOX'] });
  }

  async deleteEmails(emailIds: string[]): Promise<void> {
    // Move to trash
    await this.batchModifyMessages(emailIds, { addLabelIds: ['TRASH'] });
  }

  // ===========================================================================
  // Draft Operations
  // ===========================================================================

  async fetchDrafts(pagination?: PaginationParams): Promise<PaginatedResponse<StandardDraft>> {
    const pageSize = Math.min(pagination?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const params = new URLSearchParams({ maxResults: pageSize.toString() });
    if (pagination?.pageToken) {
      params.set('pageToken', pagination.pageToken);
    }

    const response = await this.gmailRequest<GmailListResponse<GmailDraft>>(
      `/users/me/drafts?${params.toString()}`
    );

    // Fetch full draft details
    const drafts: StandardDraft[] = [];
    for (const draftRef of response.drafts ?? []) {
      const draft = await this.fetchDraft(createStandardId('GMAIL', draftRef.id));
      if (draft) {
        drafts.push(draft);
      }
    }

    return {
      items: drafts,
      ...(response.nextPageToken && { nextPageToken: response.nextPageToken }),
    };
  }

  async fetchDraft(draftId: string): Promise<StandardDraft | null> {
    const parsed = parseStandardId(draftId);
    if (!parsed || parsed.source !== 'GMAIL') {
      return null;
    }

    try {
      const draft = await this.gmailRequest<GmailDraft>(
        `/users/me/drafts/${parsed.providerId}?format=full`
      );
      return this.normalizeDraft(draft);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw this.wrapError(error, 'Failed to fetch draft');
    }
  }

  async createDraft(input: CreateDraftInput): Promise<StandardDraft> {
    const rawMessage = this.buildRawMessage(input);

    const requestBody: Record<string, unknown> = {
      message: { raw: rawMessage },
    };

    if (input.threadId) {
      const parsed = parseStandardId(input.threadId);
      if (parsed) {
        requestBody['message'] = {
          ...(requestBody['message'] as object),
          threadId: parsed.providerId,
        };
      }
    }

    const draft = await this.gmailRequest<GmailDraft>('/users/me/drafts', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Fetch full draft to get normalized data
    const fullDraft = await this.fetchDraft(createStandardId('GMAIL', draft.id));
    if (!fullDraft) {
      throw new EmailProviderErrorClass('Failed to fetch created draft', 'GMAIL', 'SERVER_ERROR');
    }

    if (input.isPendingReview) {
      fullDraft.isPendingReview = true;
      if (input.reviewRationale) {
        fullDraft.reviewRationale = input.reviewRationale;
      }
    }

    return fullDraft;
  }

  async updateDraft(draftId: string, input: UpdateDraftInput): Promise<StandardDraft> {
    const parsed = parseStandardId(draftId);
    if (!parsed || parsed.source !== 'GMAIL') {
      throw new EmailProviderErrorClass('Invalid draft ID', 'GMAIL', 'INVALID_REQUEST');
    }

    // Fetch existing draft to merge changes
    const existing = await this.fetchDraft(draftId);
    if (!existing) {
      throw new EmailProviderErrorClass('Draft not found', 'GMAIL', 'NOT_FOUND');
    }

    // Merge with existing values
    const bodyText = input.bodyText ?? existing.bodyText;
    const bodyHtml = input.bodyHtml ?? existing.bodyHtml;
    const threadId = existing.threadId;

    const merged: CreateDraftInput = {
      subject: input.subject ?? existing.subject,
      to: input.to ?? existing.to,
      ...((input.cc ?? existing.cc) ? { cc: input.cc ?? existing.cc } : {}),
      ...((input.bcc ?? existing.bcc) ? { bcc: input.bcc ?? existing.bcc } : {}),
      ...(bodyText && { bodyText }),
      ...(bodyHtml && { bodyHtml }),
      ...(threadId && { threadId }),
    };

    const rawMessage = this.buildRawMessage(merged);

    const requestBody: Record<string, unknown> = {
      message: { raw: rawMessage },
    };

    if (existing.threadId) {
      const threadParsed = parseStandardId(existing.threadId);
      if (threadParsed) {
        requestBody['message'] = {
          ...(requestBody['message'] as object),
          threadId: threadParsed.providerId,
        };
      }
    }

    const draft = await this.gmailRequest<GmailDraft>(`/users/me/drafts/${parsed.providerId}`, {
      method: 'PUT',
      body: JSON.stringify(requestBody),
    });

    const fullDraft = await this.fetchDraft(createStandardId('GMAIL', draft.id));
    if (!fullDraft) {
      throw new EmailProviderErrorClass('Failed to fetch updated draft', 'GMAIL', 'SERVER_ERROR');
    }

    if (input.isPendingReview !== undefined) {
      fullDraft.isPendingReview = input.isPendingReview;
    }
    if (input.reviewRationale !== undefined) {
      fullDraft.reviewRationale = input.reviewRationale;
    }

    return fullDraft;
  }

  async deleteDraft(draftId: string): Promise<void> {
    const parsed = parseStandardId(draftId);
    if (!parsed || parsed.source !== 'GMAIL') {
      return;
    }

    await this.gmailRequest(`/users/me/drafts/${parsed.providerId}`, {
      method: 'DELETE',
    });
  }

  async sendDraft(draftId: string): Promise<string> {
    const parsed = parseStandardId(draftId);
    if (!parsed || parsed.source !== 'GMAIL') {
      throw new EmailProviderErrorClass('Invalid draft ID', 'GMAIL', 'INVALID_REQUEST');
    }

    const result = await this.gmailRequest<{ id: string; threadId: string }>(
      `/users/me/drafts/${parsed.providerId}/send`,
      { method: 'POST' }
    );

    return createStandardId('GMAIL', result.id);
  }

  // ===========================================================================
  // Folder/Label Operations
  // ===========================================================================

  async fetchFolders(): Promise<Folder[]> {
    const response = await this.gmailRequest<GmailListResponse<GmailLabel>>('/users/me/labels');

    return (response.labels ?? []).map((label) => this.normalizeLabel(label));
  }

  async createFolder(name: string, parentId?: string): Promise<Folder> {
    // Gmail doesn't support nested labels directly, but we can use naming convention
    const labelName = parentId ? `${parentId}/${name}` : name;

    const label = await this.gmailRequest<GmailLabel>('/users/me/labels', {
      method: 'POST',
      body: JSON.stringify({ name: labelName }),
    });

    return this.normalizeLabel(label);
  }

  async deleteFolder(folderId: string): Promise<void> {
    const parsed = parseStandardId(folderId);
    const targetId = parsed?.providerId ?? folderId;

    await this.gmailRequest(`/users/me/labels/${targetId}`, {
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

    const params = new URLSearchParams({
      timeMin: filters.timeMin.toISOString(),
      timeMax: filters.timeMax.toISOString(),
      maxResults: pageSize.toString(),
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    if (pagination?.pageToken) {
      params.set('pageToken', pagination.pageToken);
    }

    if (filters.showCancelled) {
      params.set('showDeleted', 'true');
    }

    const calendarId = filters.calendarId ?? 'primary';
    const response = await this.calendarRequest<{
      items: GoogleCalendarEvent[];
      nextPageToken?: string;
    }>(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);

    const events = (response.items ?? []).map((event) =>
      this.normalizeCalendarEvent(event, calendarId)
    );

    return {
      items: events,
      ...(response.nextPageToken && { nextPageToken: response.nextPageToken }),
    };
  }

  async fetchCalendarEvent(eventId: string): Promise<CalendarEvent | null> {
    const parsed = parseStandardId(eventId);
    if (!parsed || parsed.source !== 'GMAIL') {
      return null;
    }

    try {
      const event = await this.calendarRequest<GoogleCalendarEvent>(
        `/calendars/primary/events/${parsed.providerId}`
      );
      return this.normalizeCalendarEvent(event, 'primary');
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

    const params = new URLSearchParams({
      personFields: 'names,emailAddresses,phoneNumbers,organizations,photos,metadata',
      pageSize: pageSize.toString(),
    });

    if (pagination?.pageToken) {
      params.set('pageToken', pagination.pageToken);
    }

    const response = await this.peopleRequest<{
      connections: GooglePerson[];
      nextPageToken?: string;
      totalPeople?: number;
    }>(`/people/me/connections?${params.toString()}`);

    const contacts = (response.connections ?? []).map((person) => this.normalizePerson(person));

    return {
      items: contacts,
      ...(response.nextPageToken && { nextPageToken: response.nextPageToken }),
      ...(response.totalPeople !== undefined && { totalCount: response.totalPeople }),
    };
  }

  async searchContacts(query: string, limit = 10): Promise<Contact[]> {
    const params = new URLSearchParams({
      query,
      readMask: 'names,emailAddresses,phoneNumbers,organizations,photos',
      pageSize: limit.toString(),
    });

    const response = await this.peopleRequest<{ results: Array<{ person: GooglePerson }> }>(
      `/people:searchContacts?${params.toString()}`
    );

    return (response.results ?? []).map((r) => this.normalizePerson(r.person));
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

      const queryParts = this.buildSearchQuery(filters);
      const params = new URLSearchParams({
        maxResults: pageSize.toString(),
      });

      if (queryParts.length > 0) {
        params.set('q', queryParts.join(' '));
      }

      if (filters?.labelIds?.length) {
        for (const labelId of filters.labelIds) {
          const parsed = parseStandardId(labelId);
          params.append('labelIds', parsed?.providerId ?? labelId);
        }
      }

      if (pagination?.pageToken) {
        params.set('pageToken', pagination.pageToken);
      }

      const response = await this.gmailRequest<GmailListResponse<GmailMessage>>(
        `/users/me/messages?${params.toString()}`
      );

      // Fetch full message details
      const emails: StandardEmail[] = [];
      for (const msgRef of response.messages ?? []) {
        const email = await this.fetchEmail(createStandardId('GMAIL', msgRef.id));
        if (email) {
          emails.push(email);
        }
      }

      this.updateSyncStatus('synced', emails.length);

      return {
        items: emails,
        ...(response.nextPageToken && { nextPageToken: response.nextPageToken }),
        ...(response.resultSizeEstimate !== undefined && {
          totalCount: response.resultSizeEstimate,
        }),
      };
    } catch (error) {
      this.updateSyncStatus('error', undefined, this.getErrorMessage(error));
      throw this.wrapError(error, 'Failed to fetch emails');
    }
  }

  private buildSearchQuery(filters?: EmailQueryFilters): string[] {
    const queryParts: string[] = [];

    if (filters?.unreadOnly) {
      queryParts.push('is:unread');
    }

    if (filters?.flaggedOnly) {
      queryParts.push('is:starred');
    }

    if (filters?.hasAttachments) {
      queryParts.push('has:attachment');
    }

    if (filters?.from) {
      queryParts.push(`from:${filters.from}`);
    }

    if (filters?.after) {
      queryParts.push(`after:${Math.floor(filters.after.getTime() / 1000)}`);
    }

    if (filters?.before) {
      queryParts.push(`before:${Math.floor(filters.before.getTime() / 1000)}`);
    }

    if (filters?.query) {
      queryParts.push(filters.query);
    }

    return queryParts;
  }

  private async batchModifyMessages(
    emailIds: string[],
    modifications: { addLabelIds?: string[]; removeLabelIds?: string[] }
  ): Promise<void> {
    const ids = emailIds
      .map((id) => {
        const parsed = parseStandardId(id);
        return parsed?.source === 'GMAIL' ? parsed.providerId : null;
      })
      .filter((id): id is string => id !== null);

    if (ids.length === 0) {
      return;
    }

    await this.gmailRequest('/users/me/messages/batchModify', {
      method: 'POST',
      body: JSON.stringify({ ids, ...modifications }),
    });
  }

  private buildRawMessage(input: CreateDraftInput): string {
    const lines: string[] = [];

    // Headers
    lines.push(`To: ${input.to.map((r) => this.formatEmailAddress(r)).join(', ')}`);

    if (input.cc?.length) {
      lines.push(`Cc: ${input.cc.map((r) => this.formatEmailAddress(r)).join(', ')}`);
    }

    if (input.bcc?.length) {
      lines.push(`Bcc: ${input.bcc.map((r) => this.formatEmailAddress(r)).join(', ')}`);
    }

    lines.push(`Subject: ${input.subject}`);

    if (input.bodyHtml) {
      lines.push('Content-Type: text/html; charset=utf-8');
      lines.push('');
      lines.push(input.bodyHtml);
    } else {
      lines.push('Content-Type: text/plain; charset=utf-8');
      lines.push('');
      lines.push(input.bodyText ?? '');
    }

    const message = lines.join('\r\n');

    // Base64 URL encode
    if (typeof btoa !== 'undefined') {
      return btoa(unescape(encodeURIComponent(message)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } else {
      return Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }
  }

  private formatEmailAddress(addr: EmailAddress): string {
    if (addr.name) {
      return `"${addr.name}" <${addr.email}>`;
    }
    return addr.email;
  }

  private async gmailRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.apiRequest<T>(this.gmailBase, endpoint, options);
  }

  private async calendarRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.apiRequest<T>(this.calendarBase, endpoint, options);
  }

  private async peopleRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.apiRequest<T>(this.peopleBase, endpoint, options);
  }

  private async apiRequest<T>(
    baseUrl: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

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

    throw new EmailProviderErrorClass(errorMessage, 'GMAIL', code, errorBody);
  }

  private normalizeMessage(msg: GmailMessage): StandardEmail {
    const headers = msg.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    const from = this.parseEmailAddress(getHeader('From'));
    const to = this.parseEmailAddresses(getHeader('To'));
    const cc = this.parseEmailAddresses(getHeader('Cc'));
    const bcc = this.parseEmailAddresses(getHeader('Bcc'));
    const replyTo = this.parseEmailAddresses(getHeader('Reply-To'));

    const { bodyText, bodyHtml, attachments } = this.extractBody(msg.payload);

    return {
      id: createStandardId('GMAIL', msg.id),
      source: 'GMAIL',
      providerMessageId: msg.id,
      threadId: createStandardId('GMAIL', msg.threadId),
      subject: getHeader('Subject'),
      from: from ?? { email: '' },
      to,
      cc,
      bcc,
      receivedAt: new Date(parseInt(msg.internalDate, 10)).toISOString(),
      sentAt: getHeader('Date') || new Date(parseInt(msg.internalDate, 10)).toISOString(),
      bodyPreview: msg.snippet,
      ...(bodyText && { bodyText }),
      ...(bodyHtml && { bodyHtml }),
      isRead: !msg.labelIds.includes('UNREAD'),
      isFlagged: msg.labelIds.includes('STARRED'),
      hasAttachments: attachments.length > 0,
      attachments,
      folder: msg.labelIds.find((l) => l === 'INBOX') ?? msg.labelIds[0] ?? '',
      labels: msg.labelIds,
      importance: msg.labelIds.includes('IMPORTANT') ? 'high' : 'normal',
      ...(replyTo.length > 0 && { replyTo }),
      internetMessageId: getHeader('Message-ID'),
      ...(getHeader('In-Reply-To') && { inReplyTo: getHeader('In-Reply-To') }),
      references: getHeader('References')?.split(/\s+/).filter(Boolean),
    };
  }

  private extractBody(part?: GmailMessagePart): {
    bodyText?: string;
    bodyHtml?: string;
    attachments: Attachment[];
  } {
    if (!part) {
      return { attachments: [] };
    }

    let bodyText: string | undefined;
    let bodyHtml: string | undefined;
    const attachments: Attachment[] = [];

    const processPartRecursive = (p: GmailMessagePart) => {
      if (p.mimeType === 'text/plain' && p.body.data && !bodyText) {
        bodyText = this.decodeBase64(p.body.data);
      } else if (p.mimeType === 'text/html' && p.body.data && !bodyHtml) {
        bodyHtml = this.decodeBase64(p.body.data);
      } else if (p.filename && p.body.attachmentId) {
        attachments.push({
          id: p.body.attachmentId,
          name: p.filename,
          contentType: p.mimeType,
          size: p.body.size,
          isInline:
            p.headers?.some(
              (h) => h.name.toLowerCase() === 'content-disposition' && h.value.includes('inline')
            ) ?? false,
        });
      }

      if (p.parts) {
        for (const subPart of p.parts) {
          processPartRecursive(subPart);
        }
      }
    };

    processPartRecursive(part);

    return {
      ...(bodyText && { bodyText }),
      ...(bodyHtml && { bodyHtml }),
      attachments,
    };
  }

  private decodeBase64(data: string): string {
    // Gmail uses URL-safe base64
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');

    if (typeof atob !== 'undefined') {
      return decodeURIComponent(escape(atob(base64)));
    } else {
      return Buffer.from(base64, 'base64').toString('utf-8');
    }
  }

  private parseEmailAddress(value: string): EmailAddress | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();

    // Common case: plain email address (no display name)
    if (!trimmed.includes('<') && !trimmed.includes('>')) {
      return { email: trimmed };
    }

    // Match: Name <email> or "Name" <email> or <email>
    const angleMatch = trimmed.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+@[^>]+)>$/);
    if (angleMatch) {
      const name = angleMatch[1]?.trim();
      return {
        email: angleMatch[2]!.trim(),
        ...(name && { name }),
      };
    }

    // Fallback: best-effort
    return { email: trimmed };
  }

  private parseEmailAddresses(value: string): EmailAddress[] {
    if (!value) {
      return [];
    }

    // Split by comma, handling quoted names
    const addresses: EmailAddress[] = [];
    const parts = value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

    for (const part of parts) {
      const addr = this.parseEmailAddress(part.trim());
      if (addr) {
        addresses.push(addr);
      }
    }

    return addresses;
  }

  private normalizeDraft(draft: GmailDraft): StandardDraft {
    const message = draft.message;
    const headers = message.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    const to = this.parseEmailAddresses(getHeader('To'));
    const cc = this.parseEmailAddresses(getHeader('Cc'));
    const bcc = this.parseEmailAddresses(getHeader('Bcc'));

    const { bodyText, bodyHtml, attachments } = this.extractBody(message.payload);
    const threadId = message.threadId ? createStandardId('GMAIL', message.threadId) : undefined;

    return {
      id: createStandardId('GMAIL', draft.id),
      source: 'GMAIL',
      providerDraftId: draft.id,
      ...(threadId && { threadId }),
      subject: getHeader('Subject'),
      to,
      cc,
      bcc,
      ...(bodyText && { bodyText }),
      ...(bodyHtml && { bodyHtml }),
      createdAt: new Date(parseInt(message.internalDate, 10)).toISOString(),
      modifiedAt: new Date(parseInt(message.internalDate, 10)).toISOString(),
      isPendingReview: false,
      attachments,
    };
  }

  private normalizeLabel(label: GmailLabel): Folder {
    const systemTypeMap: Record<string, Folder['systemType']> = {
      INBOX: 'inbox',
      SENT: 'sent',
      DRAFT: 'drafts',
      TRASH: 'trash',
      SPAM: 'spam',
    };

    const systemType = systemTypeMap[label.id];

    return {
      id: createStandardId('GMAIL', label.id),
      source: 'GMAIL',
      providerId: label.id,
      name: label.name,
      totalCount: label.messagesTotal ?? 0,
      unreadCount: label.messagesUnread ?? 0,
      isSystem: label.type === 'system',
      ...(systemType && { systemType }),
    };
  }

  private normalizeCalendarEvent(event: GoogleCalendarEvent, calendarId: string): CalendarEvent {
    const responseStatusMap: Record<string, CalendarEvent['responseStatus']> = {
      accepted: 'accepted',
      declined: 'declined',
      tentative: 'tentative',
      needsAction: 'needsAction',
    };

    const isAllDay = !event.start.dateTime;
    const startTime = event.start.dateTime ?? event.start.date ?? '';
    const endTime = event.end.dateTime ?? event.end.date ?? '';

    // Find online meeting URL
    const onlineMeetingUrl =
      event.hangoutLink ??
      event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;

    return {
      id: createStandardId('GMAIL', event.id),
      source: 'GMAIL',
      providerEventId: event.id,
      title: event.summary,
      ...(event.description && { description: event.description }),
      startTime,
      endTime,
      isAllDay,
      ...(event.location && { location: event.location }),
      ...(onlineMeetingUrl && { onlineMeetingUrl }),
      organizer: {
        email: event.organizer.email,
        ...(event.organizer.displayName && { name: event.organizer.displayName }),
      },
      attendees: (event.attendees ?? []).map((a) => ({
        email: a.email,
        ...(a.displayName && { name: a.displayName }),
        responseStatus: responseStatusMap[a.responseStatus] ?? 'none',
        isRequired: !a.optional,
        isOrganizer: a.organizer ?? false,
      })),
      responseStatus: 'none', // Would need to check current user's response
      isRecurring: !!event.recurrence?.length || !!event.recurringEventId,
      calendarId,
      calendarName: calendarId === 'primary' ? 'Primary Calendar' : calendarId,
      visibility:
        event.visibility === 'private'
          ? 'private'
          : event.visibility === 'confidential'
            ? 'confidential'
            : 'public',
      ...(event.reminders?.overrides?.[0]?.minutes !== undefined && {
        reminderMinutes: event.reminders.overrides[0].minutes,
      }),
    };
  }

  private normalizePerson(person: GooglePerson): Contact {
    const name = person.names?.[0];
    const emails = person.emailAddresses ?? [];
    const phones = person.phoneNumbers ?? [];
    const org = person.organizations?.[0];
    const photo = person.photos?.[0];
    const metadata = person.metadata?.sources?.[0];

    const phoneNumbers: PhoneNumber[] = phones.map((p) => ({
      number: p.value,
      type: (p.type?.toLowerCase() as PhoneNumber['type']) ?? 'other',
    }));

    return {
      id: createStandardId('GMAIL', person.resourceName.replace('people/', '')),
      source: 'GMAIL',
      providerContactId: person.resourceName,
      displayName: name?.displayName ?? emails[0]?.value ?? '',
      ...(name?.givenName && { firstName: name.givenName }),
      ...(name?.familyName && { lastName: name.familyName }),
      emailAddresses: emails.map((e) => ({
        email: e.value,
        ...(e.displayName && { name: e.displayName }),
      })),
      phoneNumbers,
      ...(org?.name && { company: org.name }),
      ...(org?.title && { jobTitle: org.title }),
      ...(org?.department && { department: org.department }),
      ...(photo?.url && { photoUrl: photo.url }),
      ...(metadata?.updateTime && { modifiedAt: metadata.updateTime }),
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

  private isNotFoundError(error: unknown): boolean {
    return error instanceof EmailProviderErrorClass && error.code === 'NOT_FOUND';
  }

  private wrapError(error: unknown, message: string): EmailProviderError {
    if (error instanceof EmailProviderErrorClass) {
      return error;
    }

    return new EmailProviderErrorClass(
      `${message}: ${this.getErrorMessage(error)}`,
      'GMAIL',
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
  // Incremental Sync — History API
  // ===========================================================================

  /**
   * Get the current historyId from the user's Gmail profile.
   * Used as a sync starting point after a full email fetch.
   */
  async getProfileHistoryId(): Promise<string> {
    const profile = await this.gmailRequest<{
      emailAddress: string;
      messagesTotal: number;
      threadsTotal: number;
      historyId: string;
    }>('/users/me/profile');

    return profile.historyId;
  }

  /**
   * Check if the user's inbox has changed since a given historyId.
   *
   * Uses Gmail History API to detect additions/deletions without
   * fetching full message content. Returns whether changes occurred
   * and the current historyId for next check.
   *
   * On 404 (historyId too old / expired), returns hasChanges: true
   * so the caller falls back to a full refetch.
   */
  async fetchHistory(startHistoryId: string): Promise<{
    hasChanges: boolean;
    currentHistoryId: string;
  }> {
    try {
      const params = new URLSearchParams();
      params.append('startHistoryId', startHistoryId);
      params.append('historyTypes', 'messageAdded');
      params.append('historyTypes', 'messageDeleted');
      params.append('maxResults', '1'); // We only need to know IF changes exist

      const response = await this.gmailRequest<{
        history?: Array<{
          id: string;
          messagesAdded?: Array<{ message: { id: string } }>;
          messagesDeleted?: Array<{ message: { id: string } }>;
        }>;
        historyId: string;
      }>(`/users/me/history?${params.toString()}`);

      const hasChanges = (response.history ?? []).length > 0;

      return {
        hasChanges,
        currentHistoryId: response.historyId,
      };
    } catch (error) {
      // Gmail returns 404 when historyId is too old or invalid
      if (
        error instanceof Error &&
        (error.message.includes('404') || error.message.includes('notFound'))
      ) {
        return { hasChanges: true, currentHistoryId: startHistoryId };
      }
      throw error;
    }
  }
}
