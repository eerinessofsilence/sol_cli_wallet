export type PageId = 'overview' | 'wallets' | 'operations' | 'activity' | 'settings';

export interface WalletRow {
  id: string;
  name: string;
  pubkey: string;
  short_address: string;
  lamports: number;
  balance: number;
}

export interface WalletState {
  wallets: WalletRow[];
  wallet_count: number;
  total_lamports: number;
  total_balance: number;
  rpc_url: string;
  rpc_host: string;
  rpc_latency_ms: number | null;
  rpc_error: string | null;
  network: string;
  wallet_file: string;
  wallet_files: string[];
  wallet_file_size_bytes: number;
  wallet_file_modified_at: string | null;
  pending_transaction_count: number;
  warnings: string[];
  updated_at: string;
}

export interface PreviewWarning {
  code: 'external-recipient' | 'mainnet' | 'batch';
  message: string;
  severity: 'warning' | 'danger';
}

export interface TransferPreview {
  preview_id: string;
  expires_in: number;
  mode: string;
  network: string;
  rpc_host: string;
  transfers: Array<{
    sender_id: string;
    sender_name: string;
    sender_pubkey: string;
    recipient: string;
    recipient_label: string;
    lamports: number;
    amount: number;
    fee: number;
  }>;
  transfer_count: number;
  total_amount: number;
  estimated_fee: number;
  total_debit: number;
  warnings: PreviewWarning[];
  requires_acknowledgement: boolean;
}

export type TransactionStatus = 'submitted' | 'confirmed' | 'finalized' | 'failed';

export interface TransactionResult {
  sender_id: string;
  sender_name: string;
  sender_pubkey: string;
  recipient: string;
  recipient_label: string;
  amount: number;
  fee: number;
  signature?: string;
  status: TransactionStatus;
  error?: string;
}

export interface TransactionSendResult {
  ok: boolean;
  operation_id: string;
  submitted: number;
  failed: number;
  planned: number;
  results: TransactionResult[];
  error?: string;
  retry_preview?: TransferPreview;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'error';
  status?: TransactionStatus;
  occurrences?: number;
  signature?: string;
  error?: string;
}

export type BatchMode = 'distribute' | 'consolidate' | 'equalize';
export type OperationMode = 'single' | BatchMode;
