import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopShell', {
  apiBaseUrl: process.env.SOL_WALLET_API_BASE_URL ?? 'http://127.0.0.1:8765',
  clientToken: process.env.SOL_WALLET_DESKTOP_TOKEN ?? '',
  platform: process.platform,
  openWalletFolder: () => ipcRenderer.invoke('wallet-folder:open') as Promise<void>,
});
