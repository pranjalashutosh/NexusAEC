/**
 * @nexus-aec/shared-types
 *
 * Shared TypeScript type definitions for the Voice Executive Assistant.
 * These types are used across all packages and apps in the monorepo.
 */

// =============================================================================
// Email Types
// =============================================================================

/** Email source discriminator */
export type EmailSource = 'OUTLOOK' | 'GMAIL';

/** Standardized email representation across providers */
export interface StandardEmail {
  id: string;
  threadId: string;
  source: EmailSource;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  snippet: string;
  body?: string;
  bodyHtml?: string;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  attachments?: Attachment[];
}

/** Standardized email thread */
export interface StandardThread {
  id: string;
  source: EmailSource;
  subject: string;
  participants: EmailAddress[];
  messageCount: number;
  messages: StandardEmail[];
  lastMessageAt: Date;
  isRead: boolean;
}

/** Standardized draft */
export interface StandardDraft {
  id: string;
  source: EmailSource;
  threadId?: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: string;
  bodyHtml?: string;
  createdAt: Date;
  updatedAt: Date;
  isPendingReview: boolean;
  redFlagRationale?: string;
}

/** Email address with optional name */
export interface EmailAddress {
  email: string;
  name?: string;
}

/** Email attachment */
export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

// =============================================================================
// Calendar Types
// =============================================================================

/** Standardized calendar event */
export interface CalendarEvent {
  id: string;
  source: EmailSource;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  attendees: EmailAddress[];
  organizer: EmailAddress;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

// =============================================================================
// Contact Types
// =============================================================================

/** Contact for VIP suggestions */
export interface Contact {
  id: string;
  source: EmailSource;
  email: string;
  name?: string;
  company?: string;
  jobTitle?: string;
  interactionCount?: number;
  lastInteractionAt?: Date;
}

// =============================================================================
// Red Flag & Intelligence Types
// =============================================================================

/** Red flag severity levels */
export type RedFlagSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Red flag detected on an email/thread */
export interface RedFlag {
  id: string;
  emailId: string;
  threadId: string;
  severity: RedFlagSeverity;
  score: number;
  reasons: RedFlagReason[];
  detectedAt: Date;
}

/** Reason why something was flagged */
export interface RedFlagReason {
  type: 'keyword' | 'vip' | 'thread_velocity' | 'calendar_proximity' | 'deadline' | 'escalation';
  description: string;
  matchedValue?: string;
}

/** VIP (Very Important Person) configuration */
export interface VIP {
  id: string;
  email: string;
  name?: string;
  addedAt: Date;
  source: 'manual' | 'suggested' | 'learned';
}

/** Topic/Project for grouping */
export interface Topic {
  id: string;
  name: string;
  keywords: string[];
  emailCount: number;
  lastActivityAt: Date;
  source: 'manual' | 'suggested' | 'inferred';
}

// =============================================================================
// Session & Drive State Types
// =============================================================================

/** Live session state stored in Redis */
export interface DriveState {
  sessionId: string;
  userId: string;
  currentTopicIndex: number;
  currentItemIndex: number;
  itemsRemaining: number;
  interruptStatus: 'none' | 'interrupted' | 'processing';
  lastPosition: number;
  startedAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Audit & Activity Types
// =============================================================================

/** Action types for audit trail */
export type AuditActionType =
  | 'mark_read'
  | 'mark_unread'
  | 'move_to_folder'
  | 'apply_label'
  | 'create_draft'
  | 'send_draft'
  | 'flag_followup'
  | 'mute_sender'
  | 'add_vip'
  | 'remove_vip'
  | 'undo';

/** Audit entry for tracking actions */
export interface AuditEntry {
  id: string;
  sessionId: string;
  userId: string;
  actionType: AuditActionType;
  target: {
    emailId?: string;
    threadId?: string;
    sender?: string;
    folderName?: string;
    labelName?: string;
  };
  outcome: 'success' | 'failed' | 'undone';
  timestamp: Date;
  undoneAt?: Date;
}

// =============================================================================
// User Preferences Types
// =============================================================================

/** User preferences for personalization */
export interface UserPreferences {
  userId: string;
  vips: VIP[];
  topics: Topic[];
  redFlagKeywords: string[];
  mutedSenders: string[];
  verbosity: 'concise' | 'standard' | 'verbose';
  languageVariant: 'en-US' | 'en-GB' | 'en-IN' | 'en-AU';
  quietModeEnabled: boolean;
  updatedAt: Date;
}

// =============================================================================
// Asset & Knowledge Base Types
// =============================================================================

/** Asset for knowledge base (NCE Asset IDs, etc.) */
export interface Asset {
  assetId: string;
  name: string;
  description: string;
  category: string;
  location: string;
  criticality?: 'high' | 'medium' | 'low';
  metadata: Record<string, string>;
}

/** Document source types for vector store */
export type DocumentSourceType = 'ASSET' | 'SAFETY_MANUAL' | 'PROCEDURE';

/** Document stored in vector store */
export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  sourceType: DocumentSourceType;
  metadata: {
    assetId?: string;
    category?: string;
    location?: string;
    sourceFile?: string;
    chunkIndex?: number;
  };
  createdAt: Date;
}

// =============================================================================
// API Response Types
// =============================================================================

/** Generic API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Pagination info */
export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

/** Paginated response */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationInfo;
}

