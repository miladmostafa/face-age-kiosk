import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import Store from 'electron-store';
import type { BootstrapPayload } from '../shared/bootstrap';
import { resolveClientId } from '../shared/client-id';
import { applyEnvLayers, parseEnvFile } from '../shared/env-file';
import { isAllowedExternalUrl } from '../shared/external-url';
import { IDLE_TIMEOUT_MS } from '../shared/idle';
import { IpcChannel } from '../shared/ipc';
import { pinsMatch, validatePinFormat, DEFAULT_ADMIN_PIN } from '../shared/pin';
import { resolveCatalog } from '../shared/products';
import { validateSettingsDraft, type SettingsDraft } from '../shared/settings';

interface StoreShape {
  clientId: string;
  productsJson: string;
  productsPath: string;
  language: string;
  pin: string;
}

const DEV_SERVER = 'http://127.0.0.1:5173';

function loadProjectEnv(): void {
  const roots = [process.cwd(), path.resolve(__dirname, '..', '..')];
  const seen = new Set<string>();
  const layers: Record<string, string>[] = [];
  for (const root of roots) {
    for (const name of ['.env', '.env.local']) {
      const file = path.join(root, name);
      if (seen.has(file) || !fs.existsSync(file)) continue;
      seen.add(file);
      layers.push(parseEnvFile(fs.readFileSync(file, 'utf8')));
    }
  }
  applyEnvLayers(process.env, layers);
}

function guestDir(): string {
  return path.join(app.getPath('temp'), 'clinic-salon-kiosk-guest');
}

function deleteGuestFiles(): void {
  fs.rmSync(guestDir(), { recursive: true, force: true });
}

async function clearGuestWebData(): Promise<void> {
  deleteGuestFiles();
  await session.defaultSession.clearStorageData();
  await session.defaultSession.clearCache();
}

function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

function sampleProductsJson(): string {
  const candidates = [
    path.join(process.cwd(), 'sample', 'salon-products.json'),
    path.join(app.getAppPath(), 'sample', 'salon-products.json'),
    path.resolve(__dirname, '..', '..', 'sample', 'salon-products.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return readText(file);
  }
  return '[]';
}

function readProductsFromPath(filePath: string): { ok: true; json: string } | { ok: false; error: string } {
  if (!filePath.trim()) return { ok: false, error: 'No products file path is set.' };
  const resolved = path.resolve(filePath.trim());
  if (!resolved.toLowerCase().endsWith('.json')) return { ok: false, error: 'Choose a .json file.' };
  if (!fs.existsSync(resolved)) return { ok: false, error: 'Products file was not found.' };
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return { ok: false, error: 'Products path is not a file.' };
  if (stat.size > 1_000_000) return { ok: false, error: 'Products file is larger than 1 MB.' };
  return { ok: true, json: readText(resolved) };
}

function buildBootstrap(store: Store<StoreShape>): BootstrapPayload {
  const settings: SettingsDraft = {
    clientId: store.get('clientId'),
    productsJson: store.get('productsJson'),
    productsPath: store.get('productsPath'),
    language: store.get('language'),
  };
  const sample = sampleProductsJson();
  let fileJson: string | null = null;
  let fileError: string | null = null;
  if (settings.productsPath) {
    const file = readProductsFromPath(settings.productsPath);
    if (file.ok) fileJson = file.json;
    else fileError = file.error;
  }
  const catalog = resolveCatalog({
    fileJson,
    fileError,
    storedJson: settings.productsJson,
    sampleJson: sample,
  });
  const resolved = resolveClientId(settings.clientId, process.env.FACEAGE_CLIENT_ID);
  return {
    settings,
    sampleProductsJson: sample,
    products: catalog.products,
    catalogSource: catalog.source,
    catalogWarning: catalog.warning,
    clientId: resolved.clientId,
    clientIdSource: resolved.source,
    allowDemo: process.env.KIOSK_DEMO === '1',
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    kioskLocked: process.env.KIOSK_MODE !== '0',
  };
}

function registerIpc(store: Store<StoreShape>, allowQuit: { value: boolean }): void {
  ipcMain.handle(IpcChannel.bootstrap, () => buildBootstrap(store));

  ipcMain.handle(IpcChannel.verifyPin, (_event, pin: unknown) => {
    return pinsMatch(typeof pin === 'string' ? pin : '', store.get('pin'));
  });

  ipcMain.handle(IpcChannel.saveSettings, (_event, draft: SettingsDraft, pin: unknown) => {
    if (!pinsMatch(typeof pin === 'string' ? pin : '', store.get('pin'))) {
      return { ok: false, error: 'Incorrect PIN.' };
    }
    const validated = validateSettingsDraft(draft);
    if (!validated.ok) return validated;
    store.set('clientId', validated.value.clientId);
    store.set('productsJson', validated.value.productsJson);
    store.set('productsPath', validated.value.productsPath);
    store.set('language', validated.value.language);
    return { ok: true, bootstrap: buildBootstrap(store) };
  });

  ipcMain.handle(IpcChannel.changePin, (_event, currentPin: unknown, nextPin: unknown) => {
    const current = typeof currentPin === 'string' ? currentPin : '';
    const next = typeof nextPin === 'string' ? nextPin : '';
    if (!pinsMatch(current, store.get('pin'))) return { ok: false, error: 'Incorrect PIN.' };
    const format = validatePinFormat(next);
    if (format) return { ok: false, error: format };
    store.set('pin', next);
    return { ok: true };
  });

  ipcMain.handle(IpcChannel.readProducts, (_event, filePath: unknown) => {
    if (typeof filePath !== 'string') return { ok: false, error: 'Missing products file path.' };
    return readProductsFromPath(filePath);
  });

  ipcMain.handle(IpcChannel.pickProducts, async () => {
    const options = {
      title: 'Salon products JSON',
      properties: ['openFile'] as Array<'openFile'>,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const parent = BrowserWindow.getFocusedWindow();
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IpcChannel.openExternal, async (_event, url: unknown) => {
    if (typeof url !== 'string' || !isAllowedExternalUrl(url)) return;
    await shell.openExternal(url);
  });

  ipcMain.handle(IpcChannel.wipe, async () => {
    await clearGuestWebData();
  });

  ipcMain.handle(IpcChannel.quit, (_event, pin: unknown) => {
    if (!pinsMatch(typeof pin === 'string' ? pin : '', store.get('pin'))) {
      return { ok: false, error: 'Incorrect PIN.' };
    }
    allowQuit.value = true;
    app.quit();
    return { ok: true };
  });
}

function attachGuestDownloads(): void {
  session.defaultSession.on('will-download', (_event, item) => {
    fs.mkdirSync(guestDir(), { recursive: true });
    const filename = path.basename(item.getFilename()).replace(/[^a-zA-Z0-9._-]/g, '_') || 'report.pdf';
    const target = path.join(guestDir(), `${Date.now()}-${filename}`);
    item.setSavePath(target);
    item.once('done', (_doneEvent, state) => {
      if (state === 'completed') void shell.openPath(target);
    });
  });
}

function createWindow(locked: boolean, allowQuit: { value: boolean }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    fullscreen: locked,
    kiosk: locked,
    autoHideMenuBar: true,
    frame: !locked,
    backgroundColor: '#16120f',
    title: 'Clinic & Salon Kiosk',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  win.on('close', (event) => {
    if (locked && !allowQuit.value) event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const devNavigation = url.startsWith(DEV_SERVER);
    const fileNavigation = url.startsWith('file://');
    if (!devNavigation && !fileNavigation) event.preventDefault();
  });

  win.once('ready-to-show', () => win.show());

  const rendererFile = path.join(__dirname, '../renderer/index.html');
  const useDevServer = process.env.KIOSK_MODE === '0' && process.env.ELECTRON_USE_DIST !== '1';
  if (useDevServer) void win.loadURL(DEV_SERVER);
  else if (fs.existsSync(rendererFile)) void win.loadFile(rendererFile);
  else void win.loadURL(DEV_SERVER);

  return win;
}

loadProjectEnv();

const allowQuit = { value: false };

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media');

  await clearGuestWebData();
  attachGuestDownloads();

  const store = new Store<StoreShape>({
    name: 'kiosk-settings',
    defaults: {
      clientId: '',
      productsJson: '',
      productsPath: '',
      language: 'en',
      pin: DEFAULT_ADMIN_PIN,
    },
  });

  registerIpc(store, allowQuit);
  const locked = process.env.KIOSK_MODE !== '0';
  createWindow(locked, allowQuit);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(locked, allowQuit);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || allowQuit.value) app.quit();
});
