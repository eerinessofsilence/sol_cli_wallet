import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

const API_BASE_URL = 'http://127.0.0.1:8765';
const DESKTOP_TOKEN = randomBytes(32).toString('hex');
let backendProcess: ChildProcess | null = null;
let quitting = false;

function repoRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

function resolvePython(): string {
  const root = repoRoot();
  const configured = process.env.SOL_WALLET_PYTHON?.trim();
  const candidates = [
    configured,
    process.platform === 'win32'
      ? path.join(root, 'venv', 'Scripts', 'python.exe')
      : path.join(root, 'venv', 'bin', 'python'),
    process.platform === 'win32'
      ? path.join(root, '.venv', 'Scripts', 'python.exe')
      : path.join(root, '.venv', 'bin', 'python'),
  ].filter((value): value is string => Boolean(value));
  return (
    candidates.find((candidate) => fs.existsSync(candidate)) ??
    (process.platform === 'win32' ? 'python' : 'python3')
  );
}

async function backendIsReady(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      headers: { 'X-Sol-Wallet-Token': DESKTOP_TOKEN },
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function startBackend(): Promise<void> {
  if (await backendIsReady()) {
    return;
  }
  const root = repoRoot();
  backendProcess = spawn(resolvePython(), [path.join(root, 'desktop_backend.py')], {
    cwd: root,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      SOL_WALLET_BACKEND_HOST: '127.0.0.1',
      SOL_WALLET_BACKEND_PORT: '8765',
      SOL_WALLET_DESKTOP_TOKEN: DESKTOP_TOKEN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backendProcess.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  backendProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk));

  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (await backendIsReady()) {
      return;
    }
    if (backendProcess.exitCode !== null) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error('The backend did not start. Check the Python environment and requirements.txt.');
}

function createWindow(): BrowserWindow {
  process.env.SOL_WALLET_DESKTOP_TOKEN = DESKTOP_TOKEN;
  const window = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#e2e0d9',
    title: 'NODAL — Solana Operations Desk',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  return window;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  try {
    ipcMain.handle('wallet-folder:open', async () => {
      const error = await shell.openPath(path.join(repoRoot(), 'data'));
      if (error) throw new Error(error);
    });
    await startBackend();
    createWindow();
  } catch (error) {
    dialog.showErrorBox('NODAL', String(error));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  quitting = true;
  backendProcess?.kill();
  backendProcess = null;
});

app.on('activate', () => {
  if (!quitting && BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
