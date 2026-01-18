/**
 * @nexus-aec/email-providers - Unified Inbox Service
 *
 * Aggregates email from multiple providers (Outlook, Gmail) into a single
 * unified timeline. Normalizes data, handles pagination, and merges results.
 */

import { parseStandardId } from '../interfaces/email-provider';

import type { EmailProvider } from '../interfaces/email-provider';
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
} from '../interfaces/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for UnifiedInboxService
 */
export interface UnifiedInboxConfig {
  /** Default page size for queries */
  defaultPageSize?: number;
  /** Maximum concurrent requests per provider */
  maxConcurrent?: number;
  /** Timeout for individual provider requests (ms) */
  requestTimeoutMs?: number;
  /** Continue on provider error (return partial results) */
  continueOnError?: boolean;
}

/**
 * Unified sync status across all providers
 */
export interface UnifiedSyncStatus {
  /** Overall sync state */
  state: SyncState;
  /** Per-provider status */
  providers: Record<EmailSource, SyncStatus>;
  /** Last sync time */
  lastSyncAt?: string;
  /** Total items synced across all providers */
  totalItemsSynced?: number;
  /** Any errors from providers */
  errors: Array<{ source: EmailSource; error: string }>;
}

/**
 * Result from multi-provider operation
 */
export interface MultiProviderResult<T> {
  /** Successful results */
  items: T[];
  /** Errors from providers that failed */
  errors: Array<{ source: EmailSource; error: string }>;
  /** Whether all providers succeeded */
  allSucceeded: boolean;
}

// =============================================================================
// Unified Inbox Service
// =============================================================================

/**
 * UnifiedInboxService - Aggregates multiple email providers into one interface
 *
 * @example
 * ```typescript
 * const outlook = new OutlookAdapter({ userId: 'user1', tokens: outlookTokens });
 * const gmail = new GmailAdapter({ userId: 'user1', tokens: gmailTokens });
 *
 * const inbox = new UnifiedInboxService([outlook, gmail]);
 *
 * // Fetch all unread from both providers, merged by date
 * const unread = await inbox.fetchUnread();
 *
 * // Operations route to correct provider based on ID
 * await inbox.markRead(['outlook:msg-1', 'gmail:msg-2']);
 * ```
 */
export class UnifiedInboxService {
  private readonly providers: Map<EmailSource, EmailProvider>;
  private readonly config: Required<UnifiedInboxConfig>;
  private syncStatus: UnifiedSyncStatus;

  constructor(
    providers: EmailProvider[],
    config: UnifiedInboxConfig = {}
  ) {
    this.providers = new Map();
    for (const provider of providers) {
      this.providers.set(provider.source, provider);
    }

    this.config = {
      defaultPageSize: config.defaultPageSize ?? 25,
      maxConcurrent: config.maxConcurrent ?? 3,
      requestTimeoutMs: config.requestTimeoutMs ?? 30000,
      continueOnError: config.continueOnError ?? true,
    };

    this.syncStatus = this.createInitialSyncStatus();
  }

  // ===========================================================================
  // Provider Management
  // ===========================================================================

  /**
   * Add a provider to the unified inbox
   */
  addProvider(provider: EmailProvider): void {
    this.providers.set(provider.source, provider);
    this.syncStatus.providers[provider.source] = { state: 'idle' };
  }

  /**
   * Remove a provider from the unified inbox
   */
  removeProvider(source: EmailSource): void {
    this.providers.delete(source);
    delete this.syncStatus.providers[source];
  }

  /**
   * Get a specific provider
   */
  getProvider(source: EmailSource): EmailProvider | undefined {
    return this.providers.get(source);
  }

  /**
   * Get all active provider sources
   */
  getActiveSources(): EmailSource[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a specific provider is connected
   */
  hasProvider(source: EmailSource): boolean {
    return this.providers.has(source);
  }

  // ===========================================================================
  // Connection & Status
  // ===========================================================================

  /**
   * Test connection to all providers
   */
  async testConnections(): Promise<Record<EmailSource, { connected: boolean; error?: string }>> {
    const results: Record<string, { connected: boolean; error?: string }> = {};

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([source, provider]) => {
        results[source] = await provider.testConnection();
      })
    );

    return results as Record<EmailSource, { connected: boolean; error?: string }>;
  }

  /**
   * Get unified sync status
   */
  getSyncStatus(): UnifiedSyncStatus {
    // Update provider statuses
    for (const [source, provider] of this.providers) {
      this.syncStatus.providers[source] = provider.getSyncStatus();
    }

    // Calculate overall state
    const states = Object.values(this.syncStatus.providers);
    if (states.some((s) => s.state === 'syncing')) {
      this.syncStatus.state = 'syncing';
    } else if (states.some((s) => s.state === 'error')) {
      this.syncStatus.state = 'error';
    } else if (states.every((s) => s.state === 'synced')) {
      this.syncStatus.state = 'synced';
    } else {
      this.syncStatus.state = 'idle';
    }

    return { ...this.syncStatus };
  }

  /**
   * Disconnect all providers
   */
  async disconnectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.providers.values()).map((p) => p.disconnect())
    );
  }

  // ===========================================================================
  // Email Operations
  // ===========================================================================

  /**
   * Fetch unread emails from all providers, merged by date
   */
  async fetchUnread(
    filters?: EmailQueryFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<StandardEmail> & { errors: Array<{ source: EmailSource; error: string }> }> {
    return this.fetchEmailsFromAll(
      (provider, pag) => provider.fetchUnread(filters, pag),
      pagination
    );
  }

  /**
   * Fetch threads from all providers, merged by date
   */
  async fetchThreads(
    filters?: EmailQueryFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<StandardThread> & { errors: Array<{ source: EmailSource; error: string }> }> {
    const pageSize = pagination?.pageSize ?? this.config.defaultPageSize;
    const results: StandardThread[] = [];
    const errors: Array<{ source: EmailSource; error: string }> = [];

    // Fetch from all providers
    await Promise.all(
      Array.from(this.providers.entries()).map(async ([source, provider]) => {
        try {
          const response = await provider.fetchThreads(filters, { pageSize });
          results.push(...response.items);
        } catch (error) {
          if (!this.config.continueOnError) {throw error;}
          errors.push({ source, error: this.getErrorMessage(error) });
        }
      })
    );

    // Sort by last updated date (newest first)
    results.sort((a, b) =>
      new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()
    );

    // Limit to requested page size
    const items = results.slice(0, pageSize);

    return {
      items,
      errors,
      ...(results.length > pageSize && { nextPageToken: 'has-more' }),
    };
  }

  /**
   * Fetch a single email by ID (routes to correct provider)
   */
  async fetchEmail(emailId: string): Promise<StandardEmail | null> {
    const provider = this.getProviderForId(emailId);
    if (!provider) {return null;}
    return provider.fetchEmail(emailId);
  }

  /**
   * Fetch a single thread by ID (routes to correct provider)
   */
  async fetchThread(threadId: string): Promise<StandardThread | null> {
    const provider = this.getProviderForId(threadId);
    if (!provider) {return null;}
    return provider.fetchThread(threadId);
  }

  /**
   * Fetch all messages in a thread
   */
  async fetchThreadMessages(threadId: string): Promise<StandardEmail[]> {
    const provider = this.getProviderForId(threadId);
    if (!provider) {return [];}
    return provider.fetchThreadMessages(threadId);
  }

  /**
   * Mark emails as read (routes to correct providers)
   */
  async markRead(emailIds: string[]): Promise<MultiProviderResult<void>> {
    return this.routeToProviders(emailIds, (provider, ids) => provider.markRead(ids));
  }

  /**
   * Mark emails as unread (routes to correct providers)
   */
  async markUnread(emailIds: string[]): Promise<MultiProviderResult<void>> {
    return this.routeToProviders(emailIds, (provider, ids) => provider.markUnread(ids));
  }

  /**
   * Flag/star emails (routes to correct providers)
   */
  async flagEmails(emailIds: string[]): Promise<MultiProviderResult<void>> {
    return this.routeToProviders(emailIds, (provider, ids) => provider.flagEmails(ids));
  }

  /**
   * Unflag/unstar emails (routes to correct providers)
   */
  async unflagEmails(emailIds: string[]): Promise<MultiProviderResult<void>> {
    return this.routeToProviders(emailIds, (provider, ids) => provider.unflagEmails(ids));
  }

  /**
   * Move emails to folder (must all be from same provider)
   */
  async moveToFolder(emailIds: string[], folderId: string): Promise<void> {
    const parsed = parseStandardId(folderId);
    if (!parsed) {
      throw new Error('Invalid folder ID');
    }

    const provider = this.providers.get(parsed.source);
    if (!provider) {
      throw new Error(`No provider for source: ${parsed.source}`);
    }

    // Filter to only emails from this provider
    const providerEmailIds = emailIds.filter((id) => {
      const p = parseStandardId(id);
      return p?.source === parsed.source;
    });

    await provider.moveToFolder(providerEmailIds, folderId);
  }

  /**
   * Apply labels to emails (routes to correct providers)
   */
  async applyLabels(emailIds: string[], labelIds: string[]): Promise<MultiProviderResult<void>> {
    return this.routeToProviders(emailIds, (provider, ids) =>
      provider.applyLabels(ids, labelIds)
    );
  }

  /**
   * Remove labels from emails (routes to correct providers)
   */
  async removeLabels(emailIds: string[], labelIds: string[]): Promise<MultiProviderResult<void>> {
    return this.routeToProviders(emailIds, (provider, ids) =>
      provider.removeLabels(ids, labelIds)
    );
  }

  /**
   * Archive emails (routes to correct providers)
   */
  async archiveEmails(emailIds: string[]): Promise<MultiProviderResult<void>> {
    return this.routeToProviders(emailIds, (provider, ids) => provider.archiveEmails(ids));
  }

  /**
   * Delete emails (routes to correct providers)
   */
  async deleteEmails(emailIds: string[]): Promise<MultiProviderResult<void>> {
    return this.routeToProviders(emailIds, (provider, ids) => provider.deleteEmails(ids));
  }

  // ===========================================================================
  // Draft Operations
  // ===========================================================================

  /**
   * Fetch drafts from all providers
   */
  async fetchDrafts(
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<StandardDraft> & { errors: Array<{ source: EmailSource; error: string }> }> {
    const pageSize = pagination?.pageSize ?? this.config.defaultPageSize;
    const results: StandardDraft[] = [];
    const errors: Array<{ source: EmailSource; error: string }> = [];

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([source, provider]) => {
        try {
          const response = await provider.fetchDrafts({ pageSize });
          results.push(...response.items);
        } catch (error) {
          if (!this.config.continueOnError) {throw error;}
          errors.push({ source, error: this.getErrorMessage(error) });
        }
      })
    );

    // Sort by modified date (newest first)
    results.sort((a, b) =>
      new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    );

    return {
      items: results.slice(0, pageSize),
      errors,
      ...(results.length > pageSize && { nextPageToken: 'has-more' }),
    };
  }

  /**
   * Fetch a single draft by ID
   */
  async fetchDraft(draftId: string): Promise<StandardDraft | null> {
    const provider = this.getProviderForId(draftId);
    if (!provider) {return null;}
    return provider.fetchDraft(draftId);
  }

  /**
   * Create a draft in specified provider (defaults to Outlook)
   */
  async createDraft(
    input: CreateDraftInput,
    preferredSource?: EmailSource
  ): Promise<StandardDraft> {
    // Use preferred source, or default to Outlook, or first available
    let source = preferredSource;
    if (!source || !this.providers.has(source)) {
      source = this.providers.has('OUTLOOK') ? 'OUTLOOK' : this.getActiveSources()[0];
    }

    if (!source) {
      throw new Error('No email provider available');
    }

    const provider = this.providers.get(source);
    if (!provider) {
      throw new Error(`Provider not found: ${source}`);
    }

    return provider.createDraft(input);
  }

  /**
   * Update a draft (routes to correct provider)
   */
  async updateDraft(draftId: string, input: UpdateDraftInput): Promise<StandardDraft> {
    const provider = this.getProviderForId(draftId);
    if (!provider) {
      throw new Error('Provider not found for draft');
    }
    return provider.updateDraft(draftId, input);
  }

  /**
   * Delete a draft (routes to correct provider)
   */
  async deleteDraft(draftId: string): Promise<void> {
    const provider = this.getProviderForId(draftId);
    if (!provider) {return;}
    await provider.deleteDraft(draftId);
  }

  /**
   * Send a draft (routes to correct provider)
   */
  async sendDraft(draftId: string): Promise<string> {
    const provider = this.getProviderForId(draftId);
    if (!provider) {
      throw new Error('Provider not found for draft');
    }
    return provider.sendDraft(draftId);
  }

  // ===========================================================================
  // Folder Operations
  // ===========================================================================

  /**
   * Fetch folders from all providers
   */
  async fetchFolders(): Promise<{
    folders: Folder[];
    errors: Array<{ source: EmailSource; error: string }>;
  }> {
    const folders: Folder[] = [];
    const errors: Array<{ source: EmailSource; error: string }> = [];

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([source, provider]) => {
        try {
          const result = await provider.fetchFolders();
          folders.push(...result);
        } catch (error) {
          if (!this.config.continueOnError) {throw error;}
          errors.push({ source, error: this.getErrorMessage(error) });
        }
      })
    );

    return { folders, errors };
  }

  /**
   * Create a folder in specified provider
   */
  async createFolder(name: string, source: EmailSource, parentId?: string): Promise<Folder> {
    const provider = this.providers.get(source);
    if (!provider) {
      throw new Error(`Provider not found: ${source}`);
    }
    return provider.createFolder(name, parentId);
  }

  /**
   * Delete a folder (routes to correct provider)
   */
  async deleteFolder(folderId: string): Promise<void> {
    const provider = this.getProviderForId(folderId);
    if (!provider) {return;}
    await provider.deleteFolder(folderId);
  }

  // ===========================================================================
  // Calendar Operations
  // ===========================================================================

  /**
   * Fetch calendar events from all providers
   */
  async fetchCalendarEvents(
    filters: CalendarQueryFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<CalendarEvent> & { errors: Array<{ source: EmailSource; error: string }> }> {
    const pageSize = pagination?.pageSize ?? this.config.defaultPageSize;
    const results: CalendarEvent[] = [];
    const errors: Array<{ source: EmailSource; error: string }> = [];

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([source, provider]) => {
        try {
          const response = await provider.fetchCalendarEvents(filters, { pageSize });
          results.push(...response.items);
        } catch (error) {
          if (!this.config.continueOnError) {throw error;}
          errors.push({ source, error: this.getErrorMessage(error) });
        }
      })
    );

    // Sort by start time
    results.sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return {
      items: results.slice(0, pageSize * 2), // Allow more calendar events
      errors,
    };
  }

  /**
   * Fetch a single calendar event by ID
   */
  async fetchCalendarEvent(eventId: string): Promise<CalendarEvent | null> {
    const provider = this.getProviderForId(eventId);
    if (!provider) {return null;}
    return provider.fetchCalendarEvent(eventId);
  }

  // ===========================================================================
  // Contact Operations
  // ===========================================================================

  /**
   * Fetch contacts from all providers
   */
  async fetchContacts(
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<Contact> & { errors: Array<{ source: EmailSource; error: string }> }> {
    const pageSize = pagination?.pageSize ?? this.config.defaultPageSize;
    const results: Contact[] = [];
    const errors: Array<{ source: EmailSource; error: string }> = [];

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([source, provider]) => {
        try {
          const response = await provider.fetchContacts({ pageSize });
          results.push(...response.items);
        } catch (error) {
          if (!this.config.continueOnError) {throw error;}
          errors.push({ source, error: this.getErrorMessage(error) });
        }
      })
    );

    // Sort by display name
    results.sort((a, b) => a.displayName.localeCompare(b.displayName));

    // Deduplicate by email
    const seen = new Set<string>();
    const deduped = results.filter((c) => {
      const primaryEmail = c.emailAddresses[0]?.email;
      if (!primaryEmail || seen.has(primaryEmail)) {return false;}
      seen.add(primaryEmail);
      return true;
    });

    return {
      items: deduped.slice(0, pageSize),
      errors,
      ...(deduped.length > pageSize && { nextPageToken: 'has-more' }),
    };
  }

  /**
   * Search contacts across all providers
   */
  async searchContacts(query: string, limit = 10): Promise<{
    contacts: Contact[];
    errors: Array<{ source: EmailSource; error: string }>;
  }> {
    const results: Contact[] = [];
    const errors: Array<{ source: EmailSource; error: string }> = [];

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([source, provider]) => {
        try {
          const contacts = await provider.searchContacts(query, limit);
          results.push(...contacts);
        } catch (error) {
          if (!this.config.continueOnError) {throw error;}
          errors.push({ source, error: this.getErrorMessage(error) });
        }
      })
    );

    // Sort by relevance (name starts with query first)
    const queryLower = query.toLowerCase();
    results.sort((a, b) => {
      const aStarts = a.displayName.toLowerCase().startsWith(queryLower) ? 0 : 1;
      const bStarts = b.displayName.toLowerCase().startsWith(queryLower) ? 0 : 1;
      if (aStarts !== bStarts) {return aStarts - bStarts;}
      return a.displayName.localeCompare(b.displayName);
    });

    // Deduplicate and limit
    const seen = new Set<string>();
    const contacts = results.filter((c) => {
      const primaryEmail = c.emailAddresses[0]?.email;
      if (!primaryEmail || seen.has(primaryEmail)) {return false;}
      seen.add(primaryEmail);
      return true;
    }).slice(0, limit);

    return { contacts, errors };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Fetch emails from all providers and merge by date
   */
  private async fetchEmailsFromAll(
    fetcher: (provider: EmailProvider, pagination: PaginationParams) => Promise<PaginatedResponse<StandardEmail>>,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<StandardEmail> & { errors: Array<{ source: EmailSource; error: string }> }> {
    const pageSize = pagination?.pageSize ?? this.config.defaultPageSize;
    const results: StandardEmail[] = [];
    const errors: Array<{ source: EmailSource; error: string }> = [];

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([source, provider]) => {
        try {
          const response = await fetcher(provider, { pageSize });
          results.push(...response.items);
        } catch (error) {
          if (!this.config.continueOnError) {throw error;}
          errors.push({ source, error: this.getErrorMessage(error) });
        }
      })
    );

    // Sort by received date (newest first)
    results.sort((a, b) =>
      new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );

    // Limit to requested page size
    const items = results.slice(0, pageSize);

    this.updateSyncStatus(items.length, errors);

    return {
      items,
      errors,
      ...(results.length > pageSize && { nextPageToken: 'has-more' }),
      totalCount: results.length,
    };
  }

  /**
   * Route IDs to their respective providers and execute operation
   */
  private async routeToProviders<T>(
    ids: string[],
    operation: (provider: EmailProvider, ids: string[]) => Promise<T>
  ): Promise<MultiProviderResult<T>> {
    // Group IDs by provider
    const byProvider = new Map<EmailSource, string[]>();

    for (const id of ids) {
      const parsed = parseStandardId(id);
      if (!parsed) {continue;}

      if (!byProvider.has(parsed.source)) {
        byProvider.set(parsed.source, []);
      }
      byProvider.get(parsed.source)!.push(id);
    }

    const results: T[] = [];
    const errors: Array<{ source: EmailSource; error: string }> = [];

    // Execute on each provider
    await Promise.all(
      Array.from(byProvider.entries()).map(async ([source, providerIds]) => {
        const provider = this.providers.get(source);
        if (!provider) {
          errors.push({ source, error: 'Provider not found' });
          return;
        }

        try {
          const result = await operation(provider, providerIds);
          if (result !== undefined) {
            results.push(result);
          }
        } catch (error) {
          if (!this.config.continueOnError) {throw error;}
          errors.push({ source, error: this.getErrorMessage(error) });
        }
      })
    );

    return {
      items: results,
      errors,
      allSucceeded: errors.length === 0,
    };
  }

  /**
   * Get provider for a standard ID
   */
  private getProviderForId(id: string): EmailProvider | undefined {
    const parsed = parseStandardId(id);
    if (!parsed) {return undefined;}
    return this.providers.get(parsed.source);
  }

  /**
   * Create initial sync status
   */
  private createInitialSyncStatus(): UnifiedSyncStatus {
    const providers: Record<string, SyncStatus> = {};
    for (const source of this.providers.keys()) {
      providers[source] = { state: 'idle' };
    }

    return {
      state: 'idle',
      providers: providers as Record<EmailSource, SyncStatus>,
      errors: [],
    };
  }

  /**
   * Update unified sync status
   */
  private updateSyncStatus(
    itemsSynced: number,
    errors: Array<{ source: EmailSource; error: string }>
  ): void {
    this.syncStatus = {
      state: errors.length > 0 ? 'error' : 'synced',
      providers: this.syncStatus.providers,
      lastSyncAt: new Date().toISOString(),
      totalItemsSynced: itemsSynced,
      errors,
    };
  }

  /**
   * Get error message from unknown error
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {return error.message;}
    return String(error);
  }
}

