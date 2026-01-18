/**
 * Draft Sync Service
 * Syncs draft references between mobile and desktop in real-time
 */

import Store from 'electron-store';
import { addAuditEntry } from './audit-trail';
import { Draft, getDrafts, saveDraft, updateDraft, getDraftById } from './drafts';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

/**
 * Sync state
 */
interface SyncState {
  status: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt?: string;
  lastError?: string;
  pendingChanges: number;
}

/**
 * Draft change event
 */
interface DraftChangeEvent {
  type: 'created' | 'updated' | 'deleted';
  draftId: string;
  timestamp: string;
  source: 'local' | 'remote';
}

// Store for sync state
const syncStore = new Store<{ syncState: SyncState; changeLog: DraftChangeEvent[] }>({
  name: 'draft-sync',
  defaults: {
    syncState: {
      status: 'idle',
      pendingChanges: 0,
    },
    changeLog: [],
  },
});

// Event listeners
type SyncListener = (state: SyncState) => void;
const listeners: SyncListener[] = [];

/**
 * Subscribe to sync state changes
 */
export function onSyncStateChange(listener: SyncListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

/**
 * Notify listeners of state changes
 */
function notifyListeners(): void {
  const state = getSyncState();
  listeners.forEach((listener) => listener(state));
}

/**
 * Get current sync state
 */
export function getSyncState(): SyncState {
  return syncStore.get('syncState');
}

/**
 * Update sync state
 */
function updateSyncState(updates: Partial<SyncState>): void {
  const current = syncStore.get('syncState');
  syncStore.set('syncState', { ...current, ...updates });
  notifyListeners();
}

/**
 * Log a draft change for sync
 */
export function logDraftChange(
  type: 'created' | 'updated' | 'deleted',
  draftId: string
): void {
  const changeLog = syncStore.get('changeLog');
  changeLog.push({
    type,
    draftId,
    timestamp: new Date().toISOString(),
    source: 'local',
  });
  syncStore.set('changeLog', changeLog);

  const currentState = getSyncState();
  updateSyncState({ pendingChanges: currentState.pendingChanges + 1 });
}

/**
 * Sync drafts with remote server
 */
export async function syncDrafts(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  updateSyncState({ status: 'syncing' });

  try {
    // Fetch remote drafts
    const response = await fetch(`${API_BASE_URL}/sync/drafts`, {
      headers: {
        'Content-Type': 'application/json',
        // In production, add auth header
      },
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }

    const remoteDrafts = (await response.json()) as Draft[];
    const { drafts: localDrafts } = getDrafts();

    let syncedCount = 0;

    // Merge remote drafts with local
    for (const remoteDraft of remoteDrafts) {
      const localDraft = localDrafts.find((d) => d.id === remoteDraft.id);

      if (!localDraft) {
        // Remote-only: save locally
        saveDraft({
          ...remoteDraft,
          // Remove id fields since saveDraft generates them
        } as Omit<Draft, 'id' | 'createdAt' | 'updatedAt'>);
        syncedCount++;
      } else {
        // Both exist: compare timestamps for last-write-wins
        const localTime = new Date(localDraft.updatedAt);
        const remoteTime = new Date(remoteDraft.updatedAt);

        if (remoteTime > localTime) {
          updateDraft(localDraft.id, remoteDraft);
          syncedCount++;
        }
      }
    }

    // Push local changes to remote
    const changeLog = syncStore.get('changeLog');
    const pendingChanges = changeLog.filter((c) => c.source === 'local');

    if (pendingChanges.length > 0) {
      const changedDrafts = pendingChanges
        .map((change) => getDraftById(change.draftId))
        .filter((d): d is Draft => d !== undefined);

      await fetch(`${API_BASE_URL}/sync/drafts`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ drafts: changedDrafts }),
      });

      // Clear the change log
      syncStore.set('changeLog', []);
      syncedCount += changedDrafts.length;
    }

    updateSyncState({
      status: 'synced',
      lastSyncedAt: new Date().toISOString(),
      lastError: undefined,
      pendingChanges: 0,
    });

    addAuditEntry({
      sessionId: 'desktop',
      action: 'drafts_synced',
      target: `${syncedCount} drafts`,
      outcome: 'success',
      undoable: false,
    });

    return { success: true, synced: syncedCount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Sync failed';

    updateSyncState({
      status: 'error',
      lastError: errorMessage,
    });

    addAuditEntry({
      sessionId: 'desktop',
      action: 'drafts_synced',
      target: 'sync attempt',
      outcome: 'failure',
      details: { error: errorMessage },
      undoable: false,
    });

    return { success: false, synced: 0, error: errorMessage };
  }
}

/**
 * Start periodic sync
 */
let syncInterval: NodeJS.Timeout | null = null;

export function startPeriodicSync(intervalMs = 30000): void {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  syncInterval = setInterval(() => {
    const state = getSyncState();
    // Only sync if there are pending changes or if we haven't synced recently
    if (state.pendingChanges > 0 || state.status === 'error') {
      syncDrafts();
    }
  }, intervalMs);

  // Initial sync
  syncDrafts();
}

/**
 * Stop periodic sync
 */
export function stopPeriodicSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Force a manual sync
 */
export async function forceSync(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  return syncDrafts();
}

/**
 * Get sync statistics
 */
export function getSyncStats(): {
  totalSynced: number;
  lastSyncedAt?: string;
  pendingChanges: number;
} {
  const state = getSyncState();
  const { total } = getDrafts();

  return {
    totalSynced: total,
    lastSyncedAt: state.lastSyncedAt,
    pendingChanges: state.pendingChanges,
  };
}
