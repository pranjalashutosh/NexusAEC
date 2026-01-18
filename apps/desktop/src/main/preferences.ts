/**
 * Preferences Management
 */

import Store from 'electron-store';

/**
 * User preferences
 */
export interface Preferences {
  vips: string[];
  keywords: string[];
  topics: string[];
  mutedSenders: string[];
  verbosity: 'concise' | 'standard' | 'detailed';
  language: 'en-US' | 'en-GB' | 'en-IN' | 'en-AU';
  theme: 'light' | 'dark' | 'system';
  auditRetentionDays: number;
  lastSyncedAt?: string;
}

const DEFAULT_PREFERENCES: Preferences = {
  vips: [],
  keywords: [],
  topics: [],
  mutedSenders: [],
  verbosity: 'standard',
  language: 'en-US',
  theme: 'system',
  auditRetentionDays: 30,
};

// Store for preferences
const store = new Store<{ preferences: Preferences }>({
  name: 'preferences',
  defaults: {
    preferences: DEFAULT_PREFERENCES,
  },
});

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

/**
 * Get preferences
 */
export function getPreferences(): Preferences {
  return store.get('preferences');
}

/**
 * Set preferences
 */
export function setPreferences(updates: Partial<Preferences>): Preferences {
  const current = store.get('preferences');
  const updated = { ...current, ...updates };
  store.set('preferences', updated);
  return updated;
}

/**
 * Sync preferences with server
 */
export async function syncPreferences(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const local = getPreferences();

    // Fetch remote preferences
    const response = await fetch(`${API_BASE_URL}/sync/preferences`);

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }

    const remote = (await response.json()) as Preferences;

    // Last-write-wins conflict resolution
    const localTime = local.lastSyncedAt ? new Date(local.lastSyncedAt) : new Date(0);
    const remoteTime = remote.lastSyncedAt ? new Date(remote.lastSyncedAt) : new Date(0);

    let merged: Preferences;

    if (remoteTime > localTime) {
      // Remote is newer, use remote
      merged = { ...local, ...remote, lastSyncedAt: new Date().toISOString() };
    } else {
      // Local is newer, push to remote
      merged = { ...local, lastSyncedAt: new Date().toISOString() };

      await fetch(`${API_BASE_URL}/sync/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
    }

    store.set('preferences', merged);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Sync failed',
    };
  }
}

/**
 * Reset preferences to defaults
 */
export function resetPreferences(): Preferences {
  store.set('preferences', DEFAULT_PREFERENCES);
  return DEFAULT_PREFERENCES;
}
