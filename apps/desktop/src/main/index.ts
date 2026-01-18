/**
 * Electron Main Process
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { handleOAuthCallback, initiateOAuth } from './oauth';
import { getAuditTrail, exportAuditTrail } from './audit-trail';
import { getDrafts, approveDraft, deleteDraft } from './drafts';
import { getPreferences, setPreferences, syncPreferences } from './preferences';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Register IPC handlers
 */
function registerIpcHandlers(): void {
  // OAuth
  ipcMain.handle('oauth:initiate', async (_, provider: 'google' | 'microsoft') => {
    return initiateOAuth(provider);
  });

  ipcMain.handle('oauth:callback', async (_, provider: string, code: string) => {
    return handleOAuthCallback(provider, code);
  });

  // Drafts
  ipcMain.handle('drafts:list', async (_, filters?: Record<string, unknown>) => {
    return getDrafts(filters);
  });

  ipcMain.handle('drafts:approve', async (_, draftId: string) => {
    return approveDraft(draftId);
  });

  ipcMain.handle('drafts:delete', async (_, draftId: string) => {
    return deleteDraft(draftId);
  });

  // Audit Trail
  ipcMain.handle('audit:list', async (_, options?: Record<string, unknown>) => {
    return getAuditTrail(options);
  });

  ipcMain.handle('audit:export', async (_, format: 'csv' | 'json', options?: Record<string, unknown>) => {
    return exportAuditTrail(format, options);
  });

  // Preferences
  ipcMain.handle('preferences:get', async () => {
    return getPreferences();
  });

  ipcMain.handle('preferences:set', async (_, prefs: Record<string, unknown>) => {
    return setPreferences(prefs);
  });

  ipcMain.handle('preferences:sync', async () => {
    return syncPreferences();
  });
}

// App lifecycle
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle deep links for OAuth
app.on('open-url', (event, url) => {
  event.preventDefault();
  // Parse OAuth callback URL
  const parsedUrl = new URL(url);
  if (parsedUrl.pathname.includes('callback')) {
    const code = parsedUrl.searchParams.get('code');
    const provider = parsedUrl.pathname.includes('google') ? 'google' : 'microsoft';
    if (code && mainWindow) {
      mainWindow.webContents.send('oauth:complete', { provider, code });
    }
  }
});

// Register custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nexusaec', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('nexusaec');
}
