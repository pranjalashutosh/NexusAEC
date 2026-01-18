/**
 * Draft Management
 */

import Store from 'electron-store';
import { addAuditEntry } from './audit-trail';

/**
 * Draft reference
 */
export interface Draft {
  id: string;
  source: 'google' | 'microsoft';
  accountId: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  bodyPreview: string;
  fullBody?: string;
  threadId?: string;
  threadContext?: string;
  redFlagScore?: number;
  redFlagReasons?: string[];
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'approved' | 'sent' | 'deleted';
}

/**
 * Draft filters
 */
interface DraftFilters {
  source?: 'google' | 'microsoft';
  status?: Draft['status'];
  minRedFlagScore?: number;
  search?: string;
}

// Store for draft references
const store = new Store<{ drafts: Draft[] }>({
  name: 'drafts',
  defaults: {
    drafts: [],
  },
});

/**
 * Get drafts with optional filters
 */
export function getDrafts(filters?: DraftFilters): {
  drafts: Draft[];
  total: number;
  pendingCount: number;
} {
  let drafts = store.get('drafts');

  if (filters?.source) {
    drafts = drafts.filter((d) => d.source === filters.source);
  }

  if (filters?.status) {
    drafts = drafts.filter((d) => d.status === filters.status);
  }

  if (filters?.minRedFlagScore !== undefined) {
    drafts = drafts.filter((d) => (d.redFlagScore ?? 0) >= filters.minRedFlagScore!);
  }

  if (filters?.search) {
    const search = filters.search.toLowerCase();
    drafts = drafts.filter(
      (d) =>
        d.subject.toLowerCase().includes(search) ||
        d.recipientEmail.toLowerCase().includes(search) ||
        d.recipientName?.toLowerCase().includes(search)
    );
  }

  // Sort by creation date descending
  drafts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingDrafts = store.get('drafts').filter((d) => d.status === 'pending');

  return {
    drafts,
    total: drafts.length,
    pendingCount: pendingDrafts.length,
  };
}

/**
 * Get a single draft by ID
 */
export function getDraftById(id: string): Draft | undefined {
  const drafts = store.get('drafts');
  return drafts.find((d) => d.id === id);
}

/**
 * Add or update a draft
 */
export function saveDraft(draft: Omit<Draft, 'id' | 'createdAt' | 'updatedAt'>): Draft {
  const drafts = store.get('drafts');

  const newDraft: Draft = {
    ...draft,
    id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  drafts.push(newDraft);
  store.set('drafts', drafts);

  return newDraft;
}

/**
 * Update a draft
 */
export function updateDraft(id: string, updates: Partial<Draft>): Draft | undefined {
  const drafts = store.get('drafts');
  const index = drafts.findIndex((d) => d.id === id);

  if (index === -1) {
    return undefined;
  }

  drafts[index] = {
    ...drafts[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  store.set('drafts', drafts);

  return drafts[index];
}

/**
 * Approve and send a draft
 */
export async function approveDraft(draftId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const draft = getDraftById(draftId);

  if (!draft) {
    return { success: false, error: 'Draft not found' };
  }

  if (draft.status !== 'pending') {
    return { success: false, error: 'Draft is not pending' };
  }

  try {
    // In production, this would call the email provider API
    // await emailProvider.sendDraft(draft);

    // Update draft status
    updateDraft(draftId, { status: 'sent' });

    // Add audit entry
    addAuditEntry({
      sessionId: 'desktop',
      action: 'draft_approved',
      target: `${draft.recipientEmail}: ${draft.subject}`,
      outcome: 'success',
      details: { draftId, source: draft.source },
      undoable: false,
    });

    return { success: true };
  } catch (error) {
    addAuditEntry({
      sessionId: 'desktop',
      action: 'draft_approved',
      target: `${draft.recipientEmail}: ${draft.subject}`,
      outcome: 'failure',
      details: { draftId, error: error instanceof Error ? error.message : 'Unknown error' },
      undoable: false,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send draft',
    };
  }
}

/**
 * Delete a draft
 */
export function deleteDraft(draftId: string): { success: boolean; error?: string } {
  const draft = getDraftById(draftId);

  if (!draft) {
    return { success: false, error: 'Draft not found' };
  }

  updateDraft(draftId, { status: 'deleted' });

  addAuditEntry({
    sessionId: 'desktop',
    action: 'draft_deleted',
    target: `${draft.recipientEmail}: ${draft.subject}`,
    outcome: 'success',
    details: { draftId },
    undoable: true,
  });

  return { success: true };
}

/**
 * Sync drafts from API
 */
export async function syncDrafts(): Promise<void> {
  // In production, this would fetch drafts from the backend API
  // const response = await fetch(`${API_URL}/sync/drafts`);
  // const remoteDrafts = await response.json();
  // Merge with local drafts
}
