/**
 * Audit Trail Management
 */

import * as fs from 'fs';
import * as path from 'path';

import { app, dialog } from 'electron';
import Store from 'electron-store';

/**
 * Audit entry
 */
export interface AuditEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  action: string;
  target: string;
  outcome: 'success' | 'failure' | 'pending';
  details?: Record<string, unknown>;
  undoable: boolean;
  undoneAt?: string;
}

/**
 * Audit trail options
 */
interface AuditOptions {
  sessionId?: string;
  startDate?: string;
  endDate?: string;
  actionType?: string;
  limit?: number;
  offset?: number;
}

// Encrypted store for audit entries
const store = new Store<{ entries: AuditEntry[] }>({
  name: 'audit-trail',
  encryptionKey: 'nexus-aec-audit-key', // In production, use secure key management
  defaults: {
    entries: [],
  },
});

// Default retention period (30 days)
const RETENTION_DAYS = 30;

/**
 * Add an audit entry
 */
export function addAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
  const entries = store.get('entries');

  const newEntry: AuditEntry = {
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
  };

  entries.push(newEntry);

  // Clean up old entries
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  const filteredEntries = entries.filter(
    (e) => new Date(e.timestamp) > cutoffDate
  );

  store.set('entries', filteredEntries);

  return newEntry;
}

/**
 * Get audit trail with optional filters
 */
export function getAuditTrail(options?: AuditOptions): {
  entries: AuditEntry[];
  total: number;
} {
  let entries = store.get('entries');

  // Apply filters
  if (options?.sessionId) {
    entries = entries.filter((e) => e.sessionId === options.sessionId);
  }

  if (options?.startDate) {
    const start = new Date(options.startDate);
    entries = entries.filter((e) => new Date(e.timestamp) >= start);
  }

  if (options?.endDate) {
    const end = new Date(options.endDate);
    entries = entries.filter((e) => new Date(e.timestamp) <= end);
  }

  if (options?.actionType) {
    entries = entries.filter((e) => e.action === options.actionType);
  }

  // Sort by timestamp descending
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const total = entries.length;

  // Apply pagination
  if (options?.offset !== undefined) {
    entries = entries.slice(options.offset);
  }

  if (options?.limit !== undefined) {
    entries = entries.slice(0, options.limit);
  }

  return { entries, total };
}

/**
 * Mark an entry as undone
 */
export function undoAuditEntry(entryId: string): boolean {
  const entries = store.get('entries');
  const entry = entries.find((e) => e.id === entryId);

  if (!entry?.undoable) {
    return false;
  }

  // Check if within 24-hour window
  const entryTime = new Date(entry.timestamp);
  const now = new Date();
  const hoursDiff = (now.getTime() - entryTime.getTime()) / (1000 * 60 * 60);

  if (hoursDiff > 24) {
    return false;
  }

  entry.undoneAt = new Date().toISOString();
  store.set('entries', entries);

  return true;
}

/**
 * Export audit trail to file
 */
export async function exportAuditTrail(
  format: 'csv' | 'json',
  options?: AuditOptions
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const { entries } = getAuditTrail(options);

    const defaultPath = path.join(
      app.getPath('downloads'),
      `nexus-audit-${Date.now()}.${format}`
    );

    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath,
      filters: [
        format === 'csv'
          ? { name: 'CSV', extensions: ['csv'] }
          : { name: 'JSON', extensions: ['json'] },
      ],
    });

    if (canceled || !filePath) {
      return { success: false, error: 'Export cancelled' };
    }

    let content: string;

    if (format === 'json') {
      content = JSON.stringify(entries, null, 2);
    } else {
      // CSV format
      const headers = ['ID', 'Timestamp', 'Session ID', 'Action', 'Target', 'Outcome', 'Undoable'];
      const rows = entries.map((e) => [
        e.id,
        e.timestamp,
        e.sessionId,
        e.action,
        e.target,
        e.outcome,
        e.undoable ? 'Yes' : 'No',
      ]);
      content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    fs.writeFileSync(filePath, content);

    return { success: true, path: filePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Export failed',
    };
  }
}

/**
 * Clear all audit entries
 */
export function clearAuditTrail(): void {
  store.set('entries', []);
}
