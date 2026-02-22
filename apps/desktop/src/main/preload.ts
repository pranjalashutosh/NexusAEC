/**
 * Preload Script - Exposes IPC to renderer
 */

import { contextBridge, ipcRenderer } from 'electron';
// ipcRenderer: This is the renderer-side code that will be used to communicate with the main process.
// contextBridge: This is the security tool that lets preload script expose limited APIs to the renderer process.

/**
 * Exposed API for renderer process
 */
//This object is basically the apps internal client library for the renderer process. Instead of the renderer doing messy ipcRenderer.invoke() calls everywehre, this centralize all IPC entry points in one place.
const api = {
  // OAuth
  oauth: {
    initiate: (provider: 'google' | 'microsoft') => ipcRenderer.invoke('oauth:initiate', provider),
    onComplete: (callback: (data: { provider: string; code: string }) => void) =>
      ipcRenderer.on('oauth:complete', (_, data) => callback(data)), //This is a event listener for the oauth:complete event. Main process can emit events whenever something happens, Rendere listens and reacts.
  },

  // Drafts
  drafts: {
    list: (filters?: Record<string, unknown>) => ipcRenderer.invoke('drafts:list', filters),
    approve: (draftId: string) => ipcRenderer.invoke('drafts:approve', draftId),
    delete: (draftId: string) => ipcRenderer.invoke('drafts:delete', draftId),
  },

  // Audit Trail
  audit: {
    list: (options?: Record<string, unknown>) => ipcRenderer.invoke('audit:list', options),
    export: (format: 'csv' | 'json', options?: Record<string, unknown>) =>
      ipcRenderer.invoke('audit:export', format, options),
  },

  // Preferences
  preferences: {
    get: () => ipcRenderer.invoke('preferences:get'),
    set: (prefs: Record<string, unknown>) => ipcRenderer.invoke('preferences:set', prefs),
    sync: () => ipcRenderer.invoke('preferences:sync'),
  },
};

// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', api);

// Type declaration for renderer
export type ElectronAPI = typeof api;
