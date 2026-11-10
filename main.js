'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, nativeTheme, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { registerIpc } = require('./src/main/ipc');
const { watchSmokeTest, startSmokeAI, stopSmokeAI } = require('./src/main/smoke');

const isDev = process.argv.includes('--dev') || !app.isPackaged;
const smokeMode = process.argv.includes('--smoke-test');

app.setName('OpsDeck');
app.setAppUserModelId('com.opsdeck.studio');

let mainWindow = null;
let splash = null;

const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
let zoomFactor = 1;

function clampZoom(value) {
  const factor = Number(value);
  if (!Number.isFinite(factor)) return 1;
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor)) * 100) / 100;
}

function loadZoomFactor() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'zoom.json'), 'utf8'));
    return clampZoom(data.factor);
  } catch {
    return 1;
  }
}

function saveZoomFactor() {
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'zoom.json'), JSON.stringify({ factor: zoomFactor }));
  } catch { /* zoom is a convenience, never block the app */ }
}

function zoomPayload() {
  return { ok: true, factor: zoomFactor, percent: Math.round(zoomFactor * 100) };
}

function applyZoom(value, { persist = true } = {}) {
  const next = clampZoom(value);
  zoomFactor = Math.abs(next - 1) < 0.005 ? 1 : next;
  const webContents = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null;
  if (webContents && !webContents.isDestroyed()) {
    webContents.setZoomFactor(zoomFactor);
    webContents.send('window:zoom-changed', zoomPayload());
  }
  if (persist) saveZoomFactor();
  return zoomPayload();
}

function stepZoom(direction) {
  const levels = direction > 0 ? ZOOM_LEVELS : [...ZOOM_LEVELS].reverse();
  const next = levels.find((level) => (direction > 0 ? level > zoomFactor + 0.001 : level < zoomFactor - 0.001));
  return applyZoom(next == null ? zoomFactor : next);
}

function createWindow() {
  const state = loadWindowState();
  zoomFactor = loadZoomFactor();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#0a0e17',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: isDev,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.setZoomFactor(zoomFactor);
  }
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.setZoomFactor(zoomFactor);
    mainWindow.webContents.send('window:zoom-changed', zoomPayload());
  });

  if (smokeMode) {
    mainWindow.webContents.once('did-finish-load', () => {
      watchSmokeTest(mainWindow, (code) => {
        // app.exit() skips will-quit, so remove the mock provider and its
        // throwaway config before leaving.
        stopSmokeAI();
        app.exit(code);
      });
    });
  }

  mainWindow.once('ready-to-show', () => {
    if (splash && !splash.isDestroyed()) splash.close();
    if (smokeMode) return;
    mainWindow.show();
    if (state.maximized) mainWindow.maximize();
  });

  mainWindow.on('resize', debounce(saveWindowState, 400));
  mainWindow.on('move', debounce(saveWindowState, 400));
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12' && isDev) {
      mainWindow.webContents.toggleDevTools();
      return;
    }
    const meta = input.control || input.meta;
    if (input.type !== 'keyDown' || !meta) return;
    if (input.key === '+' || input.key === '=') {
      event.preventDefault();
      stepZoom(1);
    } else if (input.key === '-' || input.key === '_') {
      event.preventDefault();
      stepZoom(-1);
    } else if (input.key === '0') {
      event.preventDefault();
      applyZoom(1);
    }
  });
}

function createSplash() {
  splash = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    transparent: false,
    resizable: false,
    show: true,
    backgroundColor: '#0a0e17',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{height:100%;margin:0;background:#0a0e17;color:#e9eefb;font-family:Inter,system-ui,sans-serif;overflow:hidden}
    .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
      background:radial-gradient(500px 220px at 50% 0%,rgba(36,150,237,.20),transparent 70%)}
    .mark{width:56px;height:56px;border-radius:16px;background:linear-gradient(145deg,#2496ed,#1557b0);
      display:flex;align-items:center;justify-content:center;box-shadow:0 14px 40px rgba(36,150,237,.35)}
    h1{font-size:20px;font-weight:650;letter-spacing:-.02em;margin:0}
    p{margin:0;color:#8794ad;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
    .bar{width:150px;height:2px;background:#1b2436;border-radius:2px;overflow:hidden;margin-top:8px}
    .bar i{display:block;height:100%;width:45%;background:linear-gradient(90deg,transparent,#2496ed,transparent);animation:run 1.1s infinite}
    @keyframes run{from{transform:translateX(-150px)}to{transform:translateX(200px)}}
  </style></head><body><div class="wrap">
  <div class="mark"><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M3 14h3v3H3v-3Zm4.5 0h3v3h-3v-3Zm4.5 0h3v3h-3v-3Zm4.5 0h3v3h-3v-3Zm-9-4.5h3v3h-3v-3Zm4.5 0h3v3h-3v-3Zm4.5 0h3v3h-3v-3Zm-4.5-4.5h3v3h-3V5Z" fill="#fff" opacity=".92"/><path d="M20.5 13.5c1.3-.8 2.4-2.2 2.7-3.9-1.6-.2-3 .3-4 1.2" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg></div>
  <div style="text-align:center"><h1>OpsDeck</h1><p>Operations Studio</p></div>
  <div class="bar"><i></i></div></div></body></html>`;
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function loadWindowState() {
  try {
    const p = path.join(app.getPath('userData'), 'window-state.json');
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { width: s.width || 1440, height: s.height || 900, x: s.x, y: s.y, maximized: !!s.maximized };
  } catch {
    return { width: 1440, height: 900, maximized: true };
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const b = mainWindow.getNormalBounds();
    fs.writeFileSync(path.join(app.getPath('userData'), 'window-state.json'), JSON.stringify({
      width: b.width, height: b.height, x: b.x, y: b.y, maximized: mainWindow.isMaximized(),
    }));
  } catch { /* ignore */ }
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    // The mock provider and its isolated config path must exist before the AI
    // service is constructed by registerIpc.
    if (smokeMode) await startSmokeAI(app);
    registerIpc({ getWindow: () => mainWindow, dialog, shell, clipboard, app });
    if (!smokeMode) createSplash();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (smokeMode) stopSmokeAI();
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.handle('window:is-maximized', () => !!mainWindow?.isMaximized());
ipcMain.handle('window:state', () => ({ maximized: !!mainWindow?.isMaximized(), fullscreen: !!mainWindow?.isFullScreen() }));
ipcMain.handle('window:zoom', (_event, payload = {}) => {
  const action = typeof payload === 'string' ? payload : payload?.action;
  if (action === 'in') return stepZoom(1);
  if (action === 'out') return stepZoom(-1);
  if (action === 'reset') return applyZoom(1);
  if (action === 'set') return applyZoom(payload?.factor ?? payload?.value);
  return zoomPayload();
});

module.exports = { isDev };
