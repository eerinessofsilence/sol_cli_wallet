/// <reference types="vite/client" />

interface Window {
  desktopShell?: {
    apiBaseUrl: string;
    clientToken: string;
    platform: string;
    openWalletFolder: () => Promise<void>;
  };
}
