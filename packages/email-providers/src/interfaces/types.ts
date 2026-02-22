/**
 * @nexus-aec/email-providers - Type Definitions
 *
 * Standardized types for email, thread, draft, calendar, and contact data
 * that abstract differences between Outlook and Gmail APIs.
 */

// =============================================================================
// Email Source Discriminator
// =============================================================================

/**
 * Identifies the source email provider for routing and API calls
 */
export type EmailSource = 'OUTLOOK' | 'GMAIL';

// =============================================================================
// Participant Types
// =============================================================================

/**
 * Standardized email address with optional display name
 */
export interface EmailAddress {
  email: string;
  name?: string;
}

/**
 * Attachment metadata (actual content fetched on-demand)
 */
export interface Attachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  /** True if embedded in message body (e.g., inline images) */
  isInline: boolean;
}

// =============================================================================
// Email & Thread Types
// =============================================================================

/**
 * Standardized email message normalized from Outlook/Gmail
 */
export interface StandardEmail {
  /** Unique identifier (provider-specific, prefixed with source) */
  id: string;
  /** Source provider for routing */
  source: EmailSource;
  /** Provider's native message ID (for API calls) */
  providerMessageId: string;
  /** Thread/conversation ID this message belongs to */
  threadId: string;
  /** Subject line (may be empty) */
  subject: string;
  /** Sender information */
  from: EmailAddress;
  /** Primary recipients */
  to: EmailAddress[];
  /** Carbon copy recipients */
  cc: EmailAddress[];
  /** Blind carbon copy recipients (only visible to sender) */
  bcc: EmailAddress[];
  /** When the email was received (ISO timestamp) */
  receivedAt: string;
  /** When the email was sent (ISO timestamp) */
  sentAt: string;
  /** Plain text body (truncated if very long) */
  bodyPreview: string;
  /** Full plain text body */
  bodyText?: string;
  /** Full HTML body */
  bodyHtml?: string;
  /** Whether the email has been read */
  isRead: boolean;
  /** Whether the email is flagged/starred */
  isFlagged: boolean;
  /** Whether the email has attachments */
  hasAttachments: boolean;
  /** Attachment metadata (content fetched separately) */
  attachments: Attachment[];
  /** Folder/label the email is in */
  folder: string;
  /** Labels/categories applied (Gmail labels, Outlook categories) */
  labels: string[];
  /** Email importance level */
  importance: 'low' | 'normal' | 'high';
  /** Reply-to addresses if different from sender */
  replyTo?: EmailAddress[];
  /** Message-ID header for threading */
  internetMessageId?: string;
  /** In-Reply-To header for threading */
  inReplyTo?: string;
  /** References header for threading */
  references?: string[];
}

/**
 * Standardized email thread/conversation
 */
export interface StandardThread {
  /** Unique thread identifier (provider-specific, prefixed with source) */
  id: string;
  /** Source provider */
  source: EmailSource;
  /** Provider's native thread/conversation ID */
  providerThreadId: string;
  /** Thread subject (from first message) */
  subject: string;
  /** All participants in the thread */
  participants: EmailAddress[];
  /** Number of messages in thread */
  messageCount: number;
  /** IDs of messages in this thread (ordered by date) */
  messageIds: string[];
  /** Most recent message in thread */
  latestMessage: StandardEmail;
  /** When the thread was last updated */
  lastUpdatedAt: string;
  /** Whether thread contains unread messages */
  hasUnread: boolean;
  /** Snippet/preview of the thread */
  snippet: string;
  /** Labels/categories on the thread */
  labels: string[];
}

/**
 * Standardized draft message
 */
export interface StandardDraft {
  /** Unique draft identifier (provider-specific, prefixed with source) */
  id: string;
  /** Source provider */
  source: EmailSource;
  /** Provider's native draft ID */
  providerDraftId: string;
  /** Thread ID if this is a reply draft */
  threadId?: string;
  /** Message ID this draft is replying to */
  inReplyToMessageId?: string;
  /** Draft subject */
  subject: string;
  /** Recipients */
  to: EmailAddress[];
  /** CC recipients */
  cc: EmailAddress[];
  /** BCC recipients */
  bcc: EmailAddress[];
  /** Plain text body */
  bodyText?: string;
  /** HTML body */
  bodyHtml?: string;
  /** When the draft was created */
  createdAt: string;
  /** When the draft was last modified */
  modifiedAt: string;
  /** Whether this draft is pending review (created via voice) */
  isPendingReview: boolean;
  /** Reason this draft needs review (e.g., red flag context) */
  reviewRationale?: string;
  /** Attachments on the draft */
  attachments: Attachment[];
}

/**
 * Input for creating a new draft
 */
export interface CreateDraftInput {
  /** Subject line */
  subject: string;
  /** Recipients */
  to: EmailAddress[];
  /** CC recipients */
  cc?: EmailAddress[];
  /** BCC recipients */
  bcc?: EmailAddress[];
  /** Plain text body */
  bodyText?: string;
  /** HTML body */
  bodyHtml?: string;
  /** Thread ID if replying */
  threadId?: string;
  /** Message ID being replied to */
  inReplyToMessageId?: string;
  /** Flag as pending review */
  isPendingReview?: boolean;
  /** Review rationale */
  reviewRationale?: string;
}

/**
 * Input for updating an existing draft
 */
export interface UpdateDraftInput {
  /** Subject line */
  subject?: string;
  /** Recipients */
  to?: EmailAddress[];
  /** CC recipients */
  cc?: EmailAddress[];
  /** BCC recipients */
  bcc?: EmailAddress[];
  /** Plain text body */
  bodyText?: string;
  /** HTML body */
  bodyHtml?: string;
  /** Flag as pending review */
  isPendingReview?: boolean;
  /** Review rationale */
  reviewRationale?: string;
}

// =============================================================================
// Calendar Types
// =============================================================================

/**
 * Standardized calendar event
 */
export interface CalendarEvent {
  /** Unique event identifier */
  id: string;
  /** Source provider */
  source: EmailSource;
  /** Provider's native event ID */
  providerEventId: string;
  /** Event title/subject */
  title: string;
  /** Event description/body */
  description?: string;
  /** Start time (ISO timestamp) */
  startTime: string;
  /** End time (ISO timestamp) */
  endTime: string;
  /** Whether this is an all-day event */
  isAllDay: boolean;
  /** Event location (physical or virtual) */
  location?: string;
  /** Online meeting URL (Teams, Meet, Zoom) */
  onlineMeetingUrl?: string;
  /** Event organizer */
  organizer: EmailAddress;
  /** Attendees */
  attendees: CalendarAttendee[];
  /** User's response status */
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction' | 'none';
  /** Whether this is a recurring event */
  isRecurring: boolean;
  /** Calendar this event belongs to */
  calendarId: string;
  /** Calendar name */
  calendarName: string;
  /** Event visibility */
  visibility: 'public' | 'private' | 'confidential';
  /** Reminder time in minutes before event */
  reminderMinutes?: number;
}

/**
 * Calendar event attendee
 */
export interface CalendarAttendee extends EmailAddress {
  /** Response status */
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction' | 'none';
  /** Whether this attendee is required */
  isRequired: boolean;
  /** Whether this attendee is the organizer */
  isOrganizer: boolean;
}

// =============================================================================
// Contact Types
// =============================================================================

/**
 * Standardized contact
 */
export interface Contact {
  /** Unique contact identifier */
  id: string;
  /** Source provider */
  source: EmailSource;
  /** Provider's native contact ID */
  providerContactId: string;
  /** Display name */
  displayName: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Email addresses */
  emailAddresses: EmailAddress[];
  /** Phone numbers */
  phoneNumbers: PhoneNumber[];
  /** Company/organization name */
  company?: string;
  /** Job title */
  jobTitle?: string;
  /** Department */
  department?: string;
  /** Profile photo URL */
  photoUrl?: string;
  /** When contact was last modified */
  modifiedAt?: string;
}

/**
 * Phone number with type
 */
export interface PhoneNumber {
  number: string;
  type: 'mobile' | 'work' | 'home' | 'other';
}

// =============================================================================
// Folder/Label Types
// =============================================================================

/**
 * Email folder (Outlook) or label (Gmail)
 */
export interface Folder {
  /** Unique folder identifier */
  id: string;
  /** Source provider */
  source: EmailSource;
  /** Provider's native folder/label ID */
  providerId: string;
  /** Display name */
  name: string;
  /** Parent folder ID (for nested folders) */
  parentId?: string;
  /** Total items in folder */
  totalCount: number;
  /** Unread items in folder */
  unreadCount: number;
  /** Whether this is a system folder (Inbox, Sent, etc.) */
  isSystem: boolean;
  /** System folder type if applicable */
  systemType?: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive';
}

// =============================================================================
// Pagination & Query Types
// =============================================================================

/**
 * Pagination parameters for list queries
 */
export interface PaginationParams {
  /** Number of items per page */
  pageSize: number;
  /** Cursor for next page (provider-specific) */
  pageToken?: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  /** Items in this page */
  items: T[];
  /** Token for next page (undefined if last page) */
  nextPageToken?: string;
  /** Total count if available */
  totalCount?: number;
}

/**
 * Email query filters
 */
export interface EmailQueryFilters {
  /** Filter by folder ID */
  folderId?: string;
  /** Filter by label IDs */
  labelIds?: string[];
  /** Only unread emails */
  unreadOnly?: boolean;
  /** Only flagged/starred emails */
  flaggedOnly?: boolean;
  /** Only emails with attachments */
  hasAttachments?: boolean;
  /** Search query string */
  query?: string;
  /** From specific sender */
  from?: string;
  /** Received after this date */
  after?: Date;
  /** Received before this date */
  before?: Date;
}

/**
 * Calendar query filters
 */
export interface CalendarQueryFilters {
  /** Specific calendar ID (null for all calendars) */
  calendarId?: string;
  /** Events starting after this time */
  timeMin: Date;
  /** Events starting before this time */
  timeMax: Date;
  /** Include cancelled events */
  showCancelled?: boolean;
}

// =============================================================================
// Sync Status Types
// =============================================================================

/**
 * Sync state for a provider
 */
export type SyncState = 'idle' | 'syncing' | 'synced' | 'error';

/**
 * Detailed sync status for a provider
 */
export interface SyncStatus {
  /** Current sync state */
  state: SyncState;
  /** Last successful sync time */
  lastSyncAt?: string;
  /** Error message if state is 'error' */
  error?: string;
  /** Number of items synced in last sync */
  itemsSynced?: number;
}

// =============================================================================
// OAuth Types
// =============================================================================

/**
 * OAuth tokens from provider
 */
export interface OAuthTokens {
  /** Access token for API calls */
  accessToken: string;
  /** Refresh token for obtaining new access tokens */
  refreshToken: string;
  /** Token type (usually 'Bearer') */
  tokenType: string;
  /** Access token expiration time (ISO timestamp) */
  expiresAt: string;
  /** Scopes granted */
  scopes: string[];
}

/**
 * OAuth token refresh result
 */
export interface TokenRefreshResult {
  success: boolean;
  tokens?: OAuthTokens;
  error?: string;
}

/**
 * OAuth state for authorization flow
 */
export interface OAuthState {
  /** PKCE code verifier */
  codeVerifier: string;
  /** CSRF state parameter */
  state: string;
  /** Redirect URI used */
  redirectUri: string;
  /** Provider being authenticated */
  provider: EmailSource;
}
