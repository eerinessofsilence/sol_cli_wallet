import type { ActivityEntry, TransactionSendResult, TransferPreview, WalletState } from './types';

const apiBaseUrl =
  window.desktopShell?.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8765';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Sol-Wallet-Client', 'desktop');
  const clientToken = window.desktopShell?.clientToken;
  if (clientToken) headers.set('X-Sol-Wallet-Token', clientToken);
  if (!(init.body instanceof FormData) && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  } & T;
  if (!response.ok) {
    throw new ApiError(payload.error || `HTTP ${response.status}`, payload.code);
  }
  return payload;
}

export const api = {
  state: (refresh = false) => request<WalletState>(`/api/state${refresh ? '?refresh=1' : ''}`),
  activity: async () => (await request<{ entries: ActivityEntry[] }>('/api/activity')).entries,
  preview: (payload: Record<string, unknown>) =>
    request<TransferPreview>('/api/transaction/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  send: (previewId: string) =>
    request<TransactionSendResult>('/api/transaction/send', {
      method: 'POST',
      body: JSON.stringify({ preview_id: previewId }),
    }),
  testRpc: (url: string) =>
    request<{
      ok: boolean;
      latency_ms: number;
      version: string;
      genesis_hash: string;
      network: string;
    }>('/api/rpc/test', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  saveRpc: (url: string) =>
    request<{
      ok: boolean;
      rpc_url: string;
      latency_ms: number;
      version: string;
      genesis_hash: string;
      network: string;
    }>('/api/rpc', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  selectWalletFile: (name: string) =>
    request<{ ok: boolean; wallet_count: number }>('/api/wallet-file/select', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  createWalletFile: (name: string) =>
    request<{ ok: boolean; wallet_file: string; wallet_count: number }>('/api/wallet-file/create', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  createWallet: (name: string, privkey: string) =>
    request<{ ok: boolean; wallet_count: number; pubkey: string }>('/api/wallet/create', {
      method: 'POST',
      body: JSON.stringify({ name, privkey }),
    }),
  updateWallet: (id: string, name: string) =>
    request<{ ok: boolean; name: string }>('/api/wallet/update', {
      method: 'POST',
      body: JSON.stringify({ id, name }),
    }),
  deleteWallet: (id: string) =>
    request<{ ok: boolean; wallet_count: number }>('/api/wallet/delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
  importWalletFile: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ ok: boolean; wallet_count: number; warnings: string[] }>(
      '/api/wallet-file/import',
      { method: 'POST', body: form },
    );
  },
};
