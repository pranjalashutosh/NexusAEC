/**
 * @nexus-aec/email-providers - Contacts Sync Service
 *
 * Aggregates contacts from multiple providers for VIP suggestions
 * and email address autocomplete functionality.
 */

import type { EmailProvider } from '../interfaces/email-provider';
import type {
  EmailSource,
  Contact,
  EmailAddress,
} from '../interfaces/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Contacts sync configuration
 */
export interface ContactsSyncConfig {
  /** Cache TTL for contacts (ms) */
  cacheTtlMs?: number;
  /** Default page size */
  defaultPageSize?: number;
  /** Maximum contacts to load per provider */
  maxContactsPerProvider?: number;
  /** Continue on provider error */
  continueOnError?: boolean;
}

/**
 * VIP contact with priority level
 */
export interface VIPContact extends Contact {
  /** Priority level (1 = highest) */
  priority: number;
  /** Reason for VIP status */
  reason?: string;
  /** Interaction frequency (emails per month) */
  interactionFrequency?: number;
}

/**
 * Contact suggestion with relevance score
 */
export interface ContactSuggestion {
  /** The contact */
  contact: Contact;
  /** Relevance score (0-100) */
  score: number;
  /** Why this contact was suggested */
  matchReason: 'name' | 'email' | 'company' | 'recent';
}

/**
 * Contact directory entry (simplified)
 */
export interface DirectoryEntry {
  email: string;
  name?: string;
  company?: string;
  jobTitle?: string;
  source: EmailSource;
}

// =============================================================================
// Contacts Sync Service
// =============================================================================

/**
 * ContactsSyncService - Unified contact access across providers
 *
 * @example
 * ```typescript
 * const contactsSync = new ContactsSyncService([outlookAdapter, gmailAdapter]);
 *
 * // Search contacts
 * const suggestions = await contactsSync.searchContacts('John');
 *
 * // Get VIP list
 * const vips = await contactsSync.getVIPContacts(['ceo@company.com', 'boss@company.com']);
 *
 * // Build directory
 * const directory = await contactsSync.buildDirectory();
 * ```
 */
export class ContactsSyncService {
  private readonly providers: Map<EmailSource, EmailProvider>;
  private readonly config: Required<ContactsSyncConfig>;

  /** In-memory contact cache */
  private contactCache: Map<string, { contact: Contact; cachedAt: number }> = new Map();
  private cacheLastUpdated = 0;

  /** Directory cache (email -> DirectoryEntry) */
  private directoryCache: Map<string, DirectoryEntry> = new Map();

  constructor(
    providers: EmailProvider[],
    config: ContactsSyncConfig = {}
  ) {
    this.providers = new Map();
    for (const provider of providers) {
      this.providers.set(provider.source, provider);
    }

    this.config = {
      cacheTtlMs: config.cacheTtlMs ?? 30 * 60 * 1000, // 30 minutes
      defaultPageSize: config.defaultPageSize ?? 50,
      maxContactsPerProvider: config.maxContactsPerProvider ?? 500,
      continueOnError: config.continueOnError ?? true,
    };
  }

  // ===========================================================================
  // Contact Fetching
  // ===========================================================================

  /**
   * Fetch all contacts from all providers
   */
  async fetchAllContacts(): Promise<{
    contacts: Contact[];
    errors: Array<{ source: EmailSource; error: string }>;
  }> {
    const contacts: Contact[] = [];
    const errors: Array<{ source: EmailSource; error: string }> = [];

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([source, provider]) => {
        try {
          let pageToken: string | undefined;
          let fetched = 0;

          do {
            const pagination = {
              pageSize: this.config.defaultPageSize,
              ...(pageToken && { pageToken }),
            };

            const response = await provider.fetchContacts(pagination);

            for (const contact of response.items) {
              // Cache contact
              this.contactCache.set(contact.id, {
                contact,
                cachedAt: Date.now(),
              });

              // Add to directory
              for (const email of contact.emailAddresses) {
                this.directoryCache.set(email.email.toLowerCase(), {
                  email: email.email,
                  name: contact.displayName,
                  ...(contact.company && { company: contact.company }),
                  ...(contact.jobTitle && { jobTitle: contact.jobTitle }),
                  source,
                });
              }

              contacts.push(contact);
              fetched++;
            }

            pageToken = response.nextPageToken;
          } while (pageToken && fetched < this.config.maxContactsPerProvider);
        } catch (error) {
          if (!this.config.continueOnError) throw error;
          errors.push({ source, error: this.getErrorMessage(error) });
        }
      })
    );

    this.cacheLastUpdated = Date.now();

    // Deduplicate by email
    const deduped = this.deduplicateContacts(contacts);

    // Sort by display name
    deduped.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { contacts: deduped, errors };
  }

  /**
   * Fetch a single contact by ID
   */
  async fetchContact(contactId: string): Promise<Contact | null> {
    // Check cache first
    const cached = this.contactCache.get(contactId);
    if (cached && Date.now() - cached.cachedAt < this.config.cacheTtlMs) {
      return cached.contact;
    }

    // This would require fetching from the provider, but most providers
    // don't support fetching a single contact by ID directly.
    // For now, return from cache or null.
    return cached?.contact ?? null;
  }

  // ===========================================================================
  // Contact Search
  // ===========================================================================

  /**
   * Search contacts across all providers
   */
  async searchContacts(query: string, limit = 10): Promise<ContactSuggestion[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const results: ContactSuggestion[] = [];
    const queryLower = query.toLowerCase();

    // Search in providers
    await Promise.all(
      Array.from(this.providers.values()).map(async (provider) => {
        try {
          const contacts = await provider.searchContacts(query, limit);
          for (const contact of contacts) {
            const score = this.calculateSearchScore(contact, queryLower);
            const matchReason = this.determineMatchReason(contact, queryLower);

            results.push({ contact, score, matchReason });
          }
        } catch {
          // Ignore provider errors for search
        }
      })
    );

    // Also search in directory cache for faster results
    for (const [email, entry] of this.directoryCache) {
      if (
        email.includes(queryLower) ||
        entry.name?.toLowerCase().includes(queryLower) ||
        entry.company?.toLowerCase().includes(queryLower)
      ) {
        // Create a Contact from DirectoryEntry
        const contact: Contact = {
          id: `directory:${email}`,
          source: entry.source,
          providerContactId: email,
          displayName: entry.name ?? email,
          emailAddresses: [
            {
              email: entry.email,
              ...(entry.name && { name: entry.name }),
            },
          ],
          phoneNumbers: [],
          ...(entry.company && { company: entry.company }),
          ...(entry.jobTitle && { jobTitle: entry.jobTitle }),
        };

        const score = this.calculateSearchScore(contact, queryLower);
        results.push({
          contact,
          score,
          matchReason: this.determineMatchReason(contact, queryLower),
        });
      }
    }

    // Deduplicate by email
    const seen = new Set<string>();
    const deduped = results.filter((r) => {
      const primaryEmail = r.contact.emailAddresses[0]?.email.toLowerCase();
      if (!primaryEmail || seen.has(primaryEmail)) return false;
      seen.add(primaryEmail);
      return true;
    });

    // Sort by score (highest first) and limit
    deduped.sort((a, b) => b.score - a.score);

    return deduped.slice(0, limit);
  }

  /**
   * Get autocomplete suggestions for email input
   */
  async autocomplete(partial: string, limit = 5): Promise<EmailAddress[]> {
    const suggestions = await this.searchContacts(partial, limit);

    return suggestions.map((s) => ({
      email: s.contact.emailAddresses[0]?.email ?? '',
      name: s.contact.displayName,
    }));
  }

  // ===========================================================================
  // VIP Management
  // ===========================================================================

  /**
   * Get VIP contacts based on email list
   */
  async getVIPContacts(vipEmails: string[]): Promise<VIPContact[]> {
    const vips: VIPContact[] = [];
    const emailSet = new Set(vipEmails.map((e) => e.toLowerCase()));

    // Search for each VIP email
    for (const email of emailSet) {
      const suggestions = await this.searchContacts(email, 1);

      if (suggestions.length > 0) {
        const contact = suggestions[0]!.contact;
        vips.push({
          ...contact,
          priority: vipEmails.indexOf(email) + 1,
          reason: 'User-defined VIP',
        });
      } else {
        // Create a minimal VIP entry even if not found in contacts
        vips.push({
          id: `vip:${email}`,
          source: 'OUTLOOK', // Default
          providerContactId: email,
          displayName: email,
          emailAddresses: [{ email }],
          phoneNumbers: [],
          priority: vipEmails.indexOf(email) + 1,
          reason: 'User-defined VIP',
        });
      }
    }

    return vips;
  }

  /**
   * Check if an email belongs to a VIP
   */
  isVIP(email: string, vipEmails: string[]): boolean {
    const emailLower = email.toLowerCase();
    return vipEmails.some((vip) => vip.toLowerCase() === emailLower);
  }

  /**
   * Suggest potential VIPs based on interaction frequency
   */
  async suggestVIPs(existingVips: string[] = [], limit = 10): Promise<Contact[]> {
    // This would ideally analyze email history for frequent contacts
    // For now, return top contacts not already in VIP list

    const { contacts } = await this.fetchAllContacts();
    const vipSet = new Set(existingVips.map((e) => e.toLowerCase()));

    return contacts
      .filter((c) => {
        const primaryEmail = c.emailAddresses[0]?.email.toLowerCase();
        return primaryEmail && !vipSet.has(primaryEmail);
      })
      .slice(0, limit);
  }

  // ===========================================================================
  // Directory Operations
  // ===========================================================================

  /**
   * Build/refresh the contact directory
   */
  async buildDirectory(): Promise<Map<string, DirectoryEntry>> {
    await this.fetchAllContacts();
    return new Map(this.directoryCache);
  }

  /**
   * Look up a contact by email in the directory
   */
  lookupByEmail(email: string): DirectoryEntry | undefined {
    return this.directoryCache.get(email.toLowerCase());
  }

  /**
   * Look up multiple emails in the directory
   */
  lookupEmails(emails: string[]): Map<string, DirectoryEntry | undefined> {
    const results = new Map<string, DirectoryEntry | undefined>();
    for (const email of emails) {
      results.set(email, this.lookupByEmail(email));
    }
    return results;
  }

  /**
   * Get directory size
   */
  getDirectorySize(): number {
    return this.directoryCache.size;
  }

  // ===========================================================================
  // Contact Analysis
  // ===========================================================================

  /**
   * Find contacts from a specific company
   */
  async findByCompany(company: string): Promise<Contact[]> {
    const { contacts } = await this.fetchAllContacts();
    const companyLower = company.toLowerCase();

    return contacts.filter(
      (c) => c.company?.toLowerCase().includes(companyLower)
    );
  }

  /**
   * Get contacts with phone numbers
   */
  async getContactsWithPhone(): Promise<Contact[]> {
    const { contacts } = await this.fetchAllContacts();
    return contacts.filter((c) => c.phoneNumbers.length > 0);
  }

  /**
   * Group contacts by company
   */
  async groupByCompany(): Promise<Map<string, Contact[]>> {
    const { contacts } = await this.fetchAllContacts();
    const groups = new Map<string, Contact[]>();

    for (const contact of contacts) {
      const company = contact.company ?? 'Unknown';
      if (!groups.has(company)) {
        groups.set(company, []);
      }
      groups.get(company)!.push(contact);
    }

    return groups;
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.contactCache.clear();
    this.directoryCache.clear();
    this.cacheLastUpdated = 0;
  }

  /**
   * Check if cache needs refresh
   */
  isCacheStale(): boolean {
    return Date.now() - this.cacheLastUpdated > this.config.cacheTtlMs;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Deduplicate contacts by email
   */
  private deduplicateContacts(contacts: Contact[]): Contact[] {
    const seen = new Set<string>();
    return contacts.filter((c) => {
      const primaryEmail = c.emailAddresses[0]?.email.toLowerCase();
      if (!primaryEmail || seen.has(primaryEmail)) return false;
      seen.add(primaryEmail);
      return true;
    });
  }

  /**
   * Calculate search relevance score
   */
  private calculateSearchScore(contact: Contact, query: string): number {
    let score = 0;

    // Name matches
    const nameLower = contact.displayName.toLowerCase();
    if (nameLower === query) {
      score += 100; // Exact match
    } else if (nameLower.startsWith(query)) {
      score += 80; // Starts with
    } else if (nameLower.includes(query)) {
      score += 60; // Contains
    }

    // Email matches
    for (const email of contact.emailAddresses) {
      const emailLower = email.email.toLowerCase();
      if (emailLower === query) {
        score += 90;
      } else if (emailLower.startsWith(query)) {
        score += 70;
      } else if (emailLower.includes(query)) {
        score += 50;
      }
    }

    // Company matches (lower priority)
    if (contact.company?.toLowerCase().includes(query)) {
      score += 30;
    }

    return Math.min(100, score);
  }

  /**
   * Determine why a contact matched the search
   */
  private determineMatchReason(
    contact: Contact,
    query: string
  ): ContactSuggestion['matchReason'] {
    if (contact.displayName.toLowerCase().includes(query)) {
      return 'name';
    }

    for (const email of contact.emailAddresses) {
      if (email.email.toLowerCase().includes(query)) {
        return 'email';
      }
    }

    if (contact.company?.toLowerCase().includes(query)) {
      return 'company';
    }

    return 'recent';
  }

  /**
   * Get error message from unknown error
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}

