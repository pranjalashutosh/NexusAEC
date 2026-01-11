/**
 * @nexus-aec/email-providers
 *
 * Unified email provider adapters for Outlook and Gmail.
 *
 * This package provides:
 * - EmailProvider interface for consistent API across providers
 * - OutlookAdapter for Microsoft Graph API
 * - GmailAdapter for Google Gmail/Calendar APIs
 * - UnifiedInboxService for aggregating multiple providers
 * - SmartDraftService for intelligent draft routing
 * - OAuth implementations with secure token management
 *
 * @example
 * ```typescript
 * import { OutlookAdapter, GmailAdapter, UnifiedInboxService } from '@nexus-aec/email-providers';
 *
 * // Create adapters with OAuth tokens
 * const outlook = new OutlookAdapter({ userId: 'user1', tokens: outlookTokens });
 * const gmail = new GmailAdapter({ userId: 'user1', tokens: gmailTokens });
 *
 * // Create unified service
 * const inbox = new UnifiedInboxService([outlook, gmail]);
 *
 * // Fetch all unread emails from both providers
 * const unread = await inbox.fetchUnread();
 * ```
 */

// Interfaces and Types
export * from './interfaces';

// OAuth
export * from './oauth';

// Adapters
export { OutlookAdapter } from './adapters/outlook-adapter';
export { GmailAdapter } from './adapters/gmail-adapter';

// Services
export { UnifiedInboxService } from './services/unified-inbox';
export { SmartDraftService } from './services/smart-draft';
export { CalendarSyncService } from './services/calendar-sync';
export { ContactsSyncService } from './services/contacts-sync';

