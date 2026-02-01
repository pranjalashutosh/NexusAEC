/**
 * Electron Main Process
 */

import * as path from 'path';

import { app, BrowserWindow, ipcMain, shell } from 'electron';

import { exportAuditTrail, getAuditTrail } from './audit-trail';
import { approveDraft, deleteDraft, getDrafts } from './drafts';
import { handleOAuthCallback, initiateOAuth } from './oauth';
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
    webPreferences: { //This tells Electron to run the app in a sandboxed environment, Renderer doesnot get Node.js, Renderer JS runs in isolated environment.Only the preload script can access the main process and act like an bridge.
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // Load the app
  /**
   * What problem does this solve?
   * We are actually running two different systems depending on the environments.
   * In development UI is served by a dev server. we want Hot reload, Fast iterations, Source maps, DevTools alaways open
   * In Production UI is static files
   * Everything is packages into an executables
   * No dev server 
   * No hot reload
   * DvTools diabled
   * So isDev is not about logic it's about where the UI comes from.
   * **/
  
  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173'); //this tells chromium inside this window to behave like a browser and navigate to this url.
    mainWindow.webContents.openDevTools();
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html')); // this is for production environment.
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => { // this is a professional polish detail to ensure the window is fully initialized and ready to be shown. If you show the window immediately: USers see white flash half rendered UI and layout jumps
    mainWindow?.show(); // therefore we have show:false to create the window but do not show it yet. Only show the window when chromium has rendered the first frame.
  }); // using .once the event Listner runs only once and then removes itself.

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { // any attempts to opena new window are intercepted and handled by this function.
    void shell.openExternal(url);
    return { action: 'deny' }; //Electron window is or created. This keeps the application a single window trusted surface.
  });

  mainWindow.on('closed', () => { // .on() event listenr runs every time the event happens.  USed for lifecycle management of the window.
    mainWindow = null; // this allows garbage coolection and prevents accidental access to a closed window.
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
void app.whenReady().then(() => {
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
