import { app, BrowserWindow, ipcMain, Menu, net, protocol, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Vite's build output, beside this file's own folder in the repo and inside app.asar. */
const DIST = path.join(import.meta.dirname, '..', '..', 'dist');
const ORIGIN = 'app://game';
/** Set by `pnpm desktop:dev` to load the Vite dev server instead of dist/. */
const DEV_URL = process.env.SUPERBREAKER_DEV_URL;

// A standard, secure scheme gives the game a fixed origin, so its localStorage save survives
// restarts, and fetch() works for levels and audio the way it does over https.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
]);

// Controller-only players never click, and Chromium doesn't count pad presses as a gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win: BrowserWindow | undefined;

function serveDist(): void {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const file = path.join(DIST, decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    const rel = path.relative(DIST, file);
    if (rel.startsWith('..') || path.isAbsolute(rel))
      return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function toggleFullscreen(): void {
  if (win) win.setFullScreen(!win.isFullScreen());
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: 'Super Breaker',
    backgroundColor: '#0b0820',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const w = win;
  // The game shows the window once it has read the saved fullscreen choice, so a windowed
  // player doesn't see a fullscreen flash. The timer covers a page that fails to boot.
  const fallback = setTimeout(() => w.show(), 5000);
  w.on('show', () => clearTimeout(fallback));
  const notify = () => w.webContents.send('window:fullscreen', w.isFullScreen());
  w.on('enter-full-screen', notify);
  w.on('leave-full-screen', notify);
  w.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    // W launches the ball, so a stray Ctrl/Cmd+W mid-game must not close a fullscreen window.
    if ((input.control || input.meta) && input.code === 'KeyW' && w.isFullScreen()) {
      event.preventDefault();
      return;
    }
    if (input.isAutoRepeat) return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      event.preventDefault();
      toggleFullscreen();
    }
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(DEV_URL ?? ORIGIN)) event.preventDefault();
  });
  w.on('closed', () => {
    win = undefined;
  });
  void w.loadURL(DEV_URL ?? `${ORIGIN}/index.html`);
}

ipcMain.on('window:ready', (_event, fullscreen: boolean) => {
  if (!win || win.isVisible()) return;
  // macOS can't enter fullscreen on a hidden window; elsewhere showing first would flash.
  if (process.platform === 'darwin') {
    win.show();
    if (fullscreen) win.setFullScreen(true);
  } else {
    if (fullscreen) win.setFullScreen(true);
    win.show();
  }
});
ipcMain.on('window:set-fullscreen', (_event, on: boolean) => win?.setFullScreen(on));
ipcMain.handle('window:is-fullscreen', () => win?.isFullScreen() ?? false);
ipcMain.on('app:quit', () => app.quit());

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  void app.whenReady().then(() => {
    // macOS keeps its default app menu for Cmd+Q; elsewhere a menu bar only gets in the way.
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    serveDist();
    createWindow();
    app.on('activate', () => {
      if (!win) createWindow();
    });
  });
  app.on('window-all-closed', () => app.quit());
}
