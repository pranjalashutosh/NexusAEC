/**
 * @nexus-aec/email-providers - EmailProvider Interface
 *
 * Common interface that both OutlookAdapter and GmailAdapter must implement.
 * This allows the UnifiedInboxService to treat all providers identically.
 */

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
  OAuthTokens,
} from './types';

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Configuration required to initialize an email provider
 */
export interface EmailProviderConfig {
  /** User identifier for multi-account support */
  userId: string;
  /** OAuth tokens for API authentication */
  tokens: OAuthTokens;
  /** Optional: custom API endpoint (for testing) */
  apiEndpoint?: string;
}

// =============================================================================
// EmailProvider Interface
// =============================================================================

/**
 * EmailProvider interface - The unified contract for email providers.
 *
 * Both OutlookAdapter (Microsoft Graph) and GmailAdapter (Google API) implement
 * this interface, allowing the UnifiedInboxService to work with either provider
 * without knowing implementation details.
 *
 * All methods return standardized types (StandardEmail, StandardThread, etc.)
 * that abstract away provider-specific differences.
 */
export interface EmailProvider {
  // ===========================================================================
  // Provider Identity
  // ===========================================================================

  /**
   * Returns the provider source identifier
   */
  readonly source: EmailSource;

  /**
   * Returns the user ID this provider instance is for
   */
  readonly userId: string;

  // ===========================================================================
  // Connection & Lifecycle
  // ===========================================================================

  /**
   * Test if the provider connection is healthy (tokens valid, API reachable)
   */
  testConnection(): Promise<{ connected: boolean; error?: string }>;

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus;

  /**
   * Disconnect and clean up resources
   */
  disconnect(): Promise<void>;

  // ===========================================================================
  // Email Operations
  // ===========================================================================

  /**
   * Fetch unread emails with optional filtering
   *
   * @param filters - Optional query filters
   * @param pagination - Pagination parameters
   * @returns Paginated list of unread emails
   */
  fetchUnread(
    filters?: EmailQueryFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<StandardEmail>>;

  /**
   * Fetch email threads (conversations) with optional filtering
   *
   * @param filters - Optional query filters
   * @param pagination - Pagination parameters
   * @returns Paginated list of threads
   */
  fetchThreads(
    filters?: EmailQueryFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<StandardThread>>;

  /**
   * Fetch a single email by ID
   *
   * @param emailId - The standardized email ID
   * @returns The email or null if not found
   */
  fetchEmail(emailId: string): Promise<StandardEmail | null>;

  /**
   * Fetch a single thread by ID with all messages
   *
   * @param threadId - The standardized thread ID
   * @returns The thread with all messages or null if not found
   */
  fetchThread(threadId: string): Promise<StandardThread | null>;

  /**
   * Fetch all messages in a thread
   *
   * @param threadId - The standardized thread ID
   * @returns Array of emails in the thread, ordered by date
   */
  fetchThreadMessages(threadId: string): Promise<StandardEmail[]>;

  /**
   * Mark email(s) as read
   *
   * @param emailIds - IDs of emails to mark as read
   */
  markRead(emailIds: string[]): Promise<void>;

  /**
   * Mark email(s) as unread
   *
   * @param emailIds - IDs of emails to mark as unread
   */
  markUnread(emailIds: string[]): Promise<void>;

  /**
   * Flag/star email(s)
   *
   * @param emailIds - IDs of emails to flag
   */
  flagEmails(emailIds: string[]): Promise<void>;

  /**
   * Unflag/unstar email(s)
   *
   * @param emailIds - IDs of emails to unflag
   */
  unflagEmails(emailIds: string[]): Promise<void>;

  /**
   * Move email(s) to a folder
   *
   * @param emailIds - IDs of emails to move
   * @param folderId - Destination folder ID
   */
  moveToFolder(emailIds: string[], folderId: string): Promise<void>;

  /**
   * Apply label(s) to email(s) - Gmail specific, Outlook uses categories
   *
   * @param emailIds - IDs of emails to label
   * @param labelIds - Label IDs to apply
   */
  applyLabels(emailIds: string[], labelIds: string[]): Promise<void>;

  /**
   * Remove label(s) from email(s)
   *
   * @param emailIds - IDs of emails
   * @param labelIds - Label IDs to remove
   */
  removeLabels(emailIds: string[], labelIds: string[]): Promise<void>;

  /**
   * Archive email(s) - moves to Archive folder
   *
   * @param emailIds - IDs of emails to archive
   */
  archiveEmails(emailIds: string[]): Promise<void>;

  /**
   * Delete email(s) - moves to Trash
   *
   * @param emailIds - IDs of emails to delete
   */
  deleteEmails(emailIds: string[]): Promise<void>;

  // ===========================================================================
  // Draft Operations
  // ===========================================================================

  /**
   * Fetch all drafts
   *
   * @param pagination - Pagination parameters
   * @returns Paginated list of drafts
   */
  fetchDrafts(pagination?: PaginationParams): Promise<PaginatedResponse<StandardDraft>>;

  /**
   * Fetch a single draft by ID
   *
   * @param draftId - The standardized draft ID
   * @returns The draft or null if not found
   */
  fetchDraft(draftId: string): Promise<StandardDraft | null>;

  /**
   * Create a new draft
   *
   * @param input - Draft content and metadata
   * @returns The created draft
   */
  createDraft(input: CreateDraftInput): Promise<StandardDraft>;

  /**
   * Update an existing draft
   *
   * @param draftId - ID of draft to update
   * @param input - Updated content
   * @returns The updated draft
   */
  updateDraft(draftId: string, input: UpdateDraftInput): Promise<StandardDraft>;

  /**
   * Delete a draft
   *
   * @param draftId - ID of draft to delete
   */
  deleteDraft(draftId: string): Promise<void>;

  /**
   * Send a draft
   *
   * @param draftId - ID of draft to send
   * @returns The sent email ID
   */
  sendDraft(draftId: string): Promise<string>;

  // ===========================================================================
  // Folder/Label Operations
  // ===========================================================================

  /**
   * Fetch all folders/labels
   *
   * @returns List of folders/labels
   */
  fetchFolders(): Promise<Folder[]>;

  /**
   * Create a new folder/label
   *
   * @param name - Folder name
   * @param parentId - Optional parent folder ID
   * @returns The created folder
   */
  createFolder(name: string, parentId?: string): Promise<Folder>;

  /**
   * Delete a folder/label
   *
   * @param folderId - ID of folder to delete
   */
  deleteFolder(folderId: string): Promise<void>;

  // ===========================================================================
  // Calendar Operations
  // ===========================================================================

  /**
   * Fetch calendar events within a time range
   *
   * @param filters - Time range and other filters
   * @param pagination - Pagination parameters
   * @returns Paginated list of calendar events
   */
  fetchCalendarEvents(
    filters: CalendarQueryFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<CalendarEvent>>;

  /**
   * Fetch a single calendar event by ID
   *
   * @param eventId - The standardized event ID
   * @returns The event or null if not found
   */
  fetchCalendarEvent(eventId: string): Promise<CalendarEvent | null>;

  // ===========================================================================
  // Contact Operations
  // ===========================================================================

  /**
   * Fetch contacts from directory
   *
   * @param pagination - Pagination parameters
   * @returns Paginated list of contacts
   */
  fetchContacts(pagination?: PaginationParams): Promise<PaginatedResponse<Contact>>;

  /**
   * Search contacts by name or email
   *
   * @param query - Search query
   * @param limit - Maximum results
   * @returns Matching contacts
   */
  searchContacts(query: string, limit?: number): Promise<Contact[]>;
}

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Error thrown by provider operations
 */
export class EmailProviderError extends Error {
  constructor(
    message: string,
    public readonly source: EmailSource,
    public readonly code: EmailProviderErrorCode,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'EmailProviderError';
  }
}

/**
 * Standard error codes for provider operations
 */
export type EmailProviderErrorCode =
  | 'AUTH_EXPIRED' // Access token expired, needs refresh
  | 'AUTH_INVALID' // Refresh token invalid, needs re-auth
  | 'NOT_FOUND' // Resource not found
  | 'RATE_LIMITED' // API rate limit hit
  | 'NETWORK_ERROR' // Network connectivity issue
  | 'PERMISSION_DENIED' // Missing required scope
  | 'INVALID_REQUEST' // Bad request parameters
  | 'SERVER_ERROR' // Provider API error
  | 'UNKNOWN'; // Unknown error

/**
 * Type guard to check if error is EmailProviderError
 */
export function isEmailProviderError(error: unknown): error is EmailProviderError {
  return error instanceof EmailProviderError;
}

/**
 * Create a standardized email ID from provider ID
 */
export function createStandardId(source: EmailSource, providerId: string): string {
  return `${source.toLowerCase()}:${providerId}`;
}

/**
 * Parse a standardized ID to get source and provider ID
 */
export function parseStandardId(
  standardId: string
): { source: EmailSource; providerId: string } | null {
  const parts = standardId.split(':');
  if (parts.length < 2) {
    return null;
  }

  const sourceStr = parts[0]?.toUpperCase();
  if (sourceStr !== 'OUTLOOK' && sourceStr !== 'GMAIL') {
    return null;
  }

  return {
    source: sourceStr,
    providerId: parts.slice(1).join(':'), // Handle IDs that contain colons
  };
}
