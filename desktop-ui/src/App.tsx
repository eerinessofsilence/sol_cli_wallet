import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  AtSign,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardPaste,
  Copy,
  Download,
  EllipsisVertical,
  ExternalLink,
  FilePlus2,
  FileUp,
  FolderOpen,
  LayoutDashboard,
  LoaderCircle,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Trash2,
  Upload,
  WalletCards,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, ApiError } from './api';
import { WalletCarousel3D } from './WalletCarousel3D';
import type {
  ActivityEntry,
  BatchMode,
  OperationMode,
  PageId,
  TransactionSendResult,
  TransactionStatus,
  TransferPreview,
  WalletRow,
  WalletState,
} from './types';

const navItems: Array<{ id: PageId; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'wallets', label: 'Wallets', icon: WalletCards },
  { id: 'operations', label: 'Operations', icon: SlidersHorizontal },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
];
const primaryNavItems = navItems.filter((item) => item.id !== 'settings');
const settingsNavItem = navItems.find((item) => item.id === 'settings')!;
const rpcPresets = [
  { id: 'mainnet', label: 'Mainnet', url: 'https://api.mainnet-beta.solana.com' },
  { id: 'devnet', label: 'Devnet', url: 'https://api.devnet.solana.com' },
  { id: 'testnet', label: 'Testnet', url: 'https://api.testnet.solana.com' },
] as const;
const estimatedTransferFee = 0.000005;
const nodalLogoUrl = `${import.meta.env.BASE_URL}nodal-logo.png`;

const pageIds = new Set(navItems.map((item) => item.id));
const solFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 9,
});
const compactSolFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});
const portfolioPercentFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function formatSol(value: number, compact = false) {
  return (compact ? compactSolFormatter : solFormatter).format(value);
}

function formatAmountInput(value: number) {
  return value.toFixed(9).replace(/\.?0+$/, '');
}

function formatWalletLabel(value: string) {
  return /^[0-9]+$/.test(value) ? `Wallet ${value}` : value;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatWalletCount(value: number) {
  return `${value} ${value === 1 ? 'wallet' : 'wallets'}`;
}

function formatActivityTime(value: string) {
  if (!value) return 'Time unavailable';
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function getInitialPage(): PageId {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'transfer' || hash === 'batch') return 'operations';
  const value = hash as PageId;
  return pageIds.has(value) ? value : 'overview';
}

function getInitialOperationMode(): OperationMode {
  return window.location.hash.replace('#', '') === 'batch' ? 'distribute' : 'single';
}

function Button({
  children,
  icon: Icon,
  tone = 'neutral',
  variant = 'soft',
  compact = false,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  tone?: 'neutral' | 'primary' | 'success' | 'danger';
  variant?: 'soft' | 'solid' | 'ghost';
  compact?: boolean;
}) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-3 rounded-[18px] border text-sm font-bold tracking-[0.04em] uppercase transition duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${compact ? 'min-h-10 px-4 py-1.5' : 'min-h-11 min-w-32 px-5 py-2'} ${variant === 'solid' ? (tone === 'danger' ? 'border-danger bg-danger text-surface hover:brightness-105' : 'border-primary bg-primary text-surface hover:border-primary-strong hover:bg-primary-strong') : variant === 'ghost' ? 'border-transparent bg-transparent text-dim hover:bg-muted hover:text-ink' : tone === 'danger' ? 'border-danger/25 bg-danger/10 text-danger hover:border-danger/40' : 'border-line bg-raised text-copy hover:border-line-strong hover:bg-muted'} ${className}`}
      type="button"
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" size={17} /> : null}
      {children}
    </button>
  );
}

function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-6 max-[680px]:flex-col max-[680px]:items-stretch">
      <div>
        <h1 className="m-0 text-[28px] leading-tight font-bold tracking-[0.06em] text-primary uppercase">
          {title}
        </h1>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}

function Panel({
  title,
  subtitle,
  actions,
  children,
  compact = false,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[18px] border border-line bg-surface ${compact ? 'p-4' : 'p-5'} ${className}`}
    >
      {title || actions ? (
        <div
          className={`${compact ? 'mb-3' : 'mb-4'} flex items-center justify-between gap-4 max-[680px]:flex-col max-[680px]:items-stretch`}
        >
          <div>
            {title ? (
              <h2 className="m-0 text-[14px] font-bold tracking-[0.045em] text-primary uppercase">
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p className={`${compact ? 'mt-1' : 'mt-1.5'} mb-0 text-xs leading-relaxed text-dim`}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <article className="relative flex flex-col gap-4 overflow-hidden rounded-[18px] border border-line bg-surface p-4 text-primary before:pointer-events-none before:absolute before:top-0 before:right-0 before:left-0 before:h-1 before:bg-current">
      <div className="flex items-center gap-3 text-sm font-bold tracking-[-0.01em] text-copy">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-primary/35 bg-primary/10 text-primary">
          <Icon size={24} />
        </span>
        <span>{label}</span>
      </div>
      <strong className="z-10 overflow-hidden text-2xl leading-tight font-semibold tracking-[-0.035em] text-ellipsis whitespace-nowrap text-ink">
        {value}
      </strong>
      {detail ? <span className="-mt-2 text-xs leading-relaxed text-dim">{detail}</span> : null}
    </article>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[18px] border border-dashed border-line bg-muted/45 p-[30px] text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-[12px] bg-primary/15 text-primary">
        <Icon size={26} />
      </span>
      <h3 className="mt-4 mb-0 text-[16px] font-bold text-copy">{title}</h3>
      <p className="mt-1.5 mb-4 max-w-[440px] text-xs leading-relaxed text-dim">{text}</p>
      {action}
    </div>
  );
}

function WalletSelect({
  wallets,
  value,
  onChange,
  detailed = false,
  excludeIds = [],
  placeholder = 'Select a wallet',
}: {
  wallets: WalletRow[];
  value: string;
  onChange: (value: string) => void;
  detailed?: boolean;
  excludeIds?: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const available = wallets.filter((wallet) => !excludeIds.includes(wallet.id));
  const selectedWallet = available.find((wallet) => wallet.id === value);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex h-12 w-full cursor-pointer items-center gap-3 rounded-[16px] border bg-raised px-4 text-left transition focus-visible:ring-3 focus-visible:ring-primary/15 focus-visible:outline-none ${open ? 'border-primary ring-3 ring-primary/15' : 'border-line hover:border-line-strong'}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        {selectedWallet ? (
          detailed ? (
            <>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-semibold text-copy">
                  {/^[0-9]+$/.test(selectedWallet.name)
                    ? `Wallet ${selectedWallet.name}`
                    : selectedWallet.name}
                </strong>
                <small className="mt-0.5 block truncate font-mono text-xs text-faint">
                  {selectedWallet.short_address}
                </small>
              </span>
              <span className="shrink-0 rounded-full bg-soft px-3 py-1 text-xs font-semibold text-dim tabular-nums max-[420px]:hidden">
                {formatSol(selectedWallet.balance, true)} SOL
              </span>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 overflow-hidden text-sm font-medium text-ellipsis whitespace-nowrap text-ink">
                {/^[0-9]+$/.test(selectedWallet.name)
                  ? `Wallet ${selectedWallet.name}`
                  : selectedWallet.name}
              </span>
              <span className="shrink-0 text-sm font-medium text-dim tabular-nums">
                {formatSol(selectedWallet.balance, true)} SOL
              </span>
            </>
          )
        ) : (
          <span className="min-w-0 flex-1 text-sm text-faint">{placeholder}</span>
        )}
        <ChevronDown
          className={`shrink-0 text-faint transition-transform ${open ? 'rotate-180 text-primary' : ''}`}
          size={18}
        />
      </button>
      {open ? (
        <div
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 max-h-[280px] overflow-y-auto rounded-[16px] border border-line bg-raised p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.38)]"
          role="listbox"
        >
          {available.length ? (
            available.map((wallet) => (
              <button
                aria-selected={wallet.id === value}
                className={`grid min-h-14 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border-0 px-3 text-left transition ${wallet.id === value ? 'bg-primary/15' : 'bg-transparent hover:bg-muted'}`}
                key={wallet.id}
                role="option"
                type="button"
                onClick={() => {
                  onChange(wallet.id);
                  setOpen(false);
                }}
              >
                <span className="min-w-0">
                  <strong className="block overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap text-copy">
                    {/^[0-9]+$/.test(wallet.name) ? `Wallet ${wallet.name}` : wallet.name}
                  </strong>
                  <small className="mt-0.5 block overflow-hidden font-mono text-xs text-ellipsis whitespace-nowrap text-faint">
                    {wallet.short_address}
                  </small>
                </span>
                <b className="text-xs font-semibold whitespace-nowrap text-ink tabular-nums">
                  {formatSol(wallet.balance, true)} SOL
                </b>
              </button>
            ))
          ) : (
            <span className="block px-3 py-4 text-center text-xs text-faint">
              No wallets available
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AppSelect({
  ariaLabel,
  disabled = false,
  onChange,
  options,
  placeholder = 'Select a value',
  value,
}: {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; description?: string }>;
  placeholder?: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`flex h-12 w-full cursor-pointer items-center gap-2 rounded-[16px] border bg-raised px-4 text-left text-sm transition focus-visible:ring-2 focus-visible:ring-primary/15 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${
          open ? 'border-primary ring-2 ring-primary/15' : 'border-line hover:border-line-strong'
        }`}
        disabled={disabled}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span
          className={`min-w-0 flex-1 truncate ${
            selectedOption ? 'font-medium text-ink' : 'text-faint'
          }`}
        >
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`shrink-0 text-faint transition-transform ${
            open ? 'rotate-180 text-primary' : ''
          }`}
          size={16}
        />
      </button>
      {open ? (
        <div
          aria-label={ariaLabel}
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 min-w-[220px] overflow-hidden rounded-[16px] border border-line bg-raised p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.38)]"
          role="listbox"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                aria-selected={selected}
                className={`flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-[12px] border-0 px-3 py-2 text-left transition ${
                  selected
                    ? 'bg-primary/15 text-primary'
                    : 'bg-transparent text-copy hover:bg-muted'
                }`}
                key={option.value}
                role="option"
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-semibold">{option.label}</strong>
                  {option.description ? (
                    <small className="mt-0.5 block truncate text-xs font-normal text-faint">
                      {option.description}
                    </small>
                  ) : null}
                </span>
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[12px] ${
                    selected ? 'bg-primary text-surface' : 'text-transparent'
                  }`}
                >
                  <Check size={13} />
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function WalletChecklist({
  wallets,
  selected,
  onChange,
  excludeIds = [],
}: {
  wallets: WalletRow[];
  selected: string[];
  onChange: (value: string[]) => void;
  excludeIds?: string[];
}) {
  const available = wallets.filter((wallet) => !excludeIds.includes(wallet.id));
  const selectedWallets = available.filter((wallet) => selected.includes(wallet.id));
  const selectedBalance = selectedWallets.reduce((total, wallet) => total + wallet.balance, 0);
  const allSelected =
    available.length > 0 && available.every((wallet) => selected.includes(wallet.id));

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  return (
    <div className="overflow-hidden rounded-[16px] border border-line-soft bg-raised/30">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line-soft bg-raised px-4">
        <button
          className="flex cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-xs font-semibold text-dim transition hover:text-copy"
          type="button"
          onClick={() => onChange(allSelected ? [] : available.map((wallet) => wallet.id))}
        >
          <span
            className={`inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[12px] border transition ${allSelected ? 'border-primary bg-primary text-surface' : 'border-line bg-surface text-transparent'}`}
          >
            {allSelected ? <Check size={14} /> : null}
          </span>
          {allSelected ? 'Clear selection' : 'Select all'}
        </button>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-soft px-3 py-1 text-xs font-semibold text-dim">
            {selectedWallets.length} of {available.length}
          </span>
          <span className="text-xs font-medium text-faint tabular-nums max-[520px]:hidden">
            {formatSol(selectedBalance, true)} SOL selected
          </span>
        </div>
      </div>
      <div className="max-h-[352px] overflow-y-auto">
        {available.length ? (
          available.map((wallet) => {
            const checked = selected.includes(wallet.id);
            const walletName = /^[0-9]+$/.test(wallet.name) ? `Wallet ${wallet.name}` : wallet.name;
            return (
              <button
                aria-pressed={checked}
                key={wallet.id}
                className={`grid min-h-14 w-full cursor-pointer grid-cols-[18px_36px_minmax(0,1fr)_auto] items-center gap-3 border-0 border-t border-line-soft px-4 text-left transition first:border-t-0 ${checked ? 'bg-primary/10' : 'bg-surface hover:bg-muted/55'}`}
                type="button"
                onClick={() => toggle(wallet.id)}
              >
                <span
                  className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[12px] border transition ${checked ? 'border-primary bg-primary text-surface' : 'border-line bg-surface text-transparent'}`}
                >
                  {checked ? <Check size={14} /> : null}
                </span>
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-[16px] border text-xs font-bold transition ${
                    checked
                      ? 'border-primary/35 bg-primary/20 text-primary'
                      : 'border-line bg-raised text-dim'
                  }`}
                >
                  {wallet.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-xs font-semibold text-copy">
                    {walletName}
                  </strong>
                  <small className="mt-0.5 block truncate font-mono text-xs text-faint">
                    {wallet.short_address}
                  </small>
                </span>
                <b className="text-xs font-semibold text-ink tabular-nums max-[420px]:hidden">
                  {formatSol(wallet.balance, true)} SOL
                </b>
              </button>
            );
          })
        ) : (
          <div className="flex min-h-28 items-center justify-center px-4 text-center text-xs text-faint">
            No wallets available
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-danger/25 bg-danger/10 px-3 py-3 text-xs leading-relaxed text-danger">
      <TriangleAlert size={19} />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <Button compact tone="danger" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function PreviewDialog({
  preview,
  sending,
  onClose,
  onConfirm,
}: {
  preview: TransferPreview;
  sending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(!preview.requires_acknowledgement);
  const [remainingSeconds, setRemainingSeconds] = useState(preview.expires_in);
  const visibleWarnings = preview.warnings.filter((warning) => warning.code !== 'mainnet');
  const expired = remainingSeconds <= 0;

  useEffect(() => {
    setAcknowledged(!preview.requires_acknowledgement);
  }, [preview.preview_id, preview.requires_acknowledgement]);
  useEffect(() => {
    const expiresAt = Date.now() + preview.expires_in * 1000;
    const updateRemaining = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [preview.expires_in, preview.preview_id]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#121116]/75 p-6 backdrop-blur-[5px]"
      role="presentation"
      onMouseDown={sending ? undefined : onClose}
    >
      <section
        aria-labelledby="preview-title"
        aria-modal="true"
        className="max-h-[calc(100vh-48px)] w-full max-w-[760px] overflow-y-auto rounded-[22px] border border-line bg-surface shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-[18px]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] bg-primary/15 text-primary">
              <ShieldCheck size={22} />
            </span>
            <div>
              <h2 className="m-0 text-[18px] font-bold text-ink" id="preview-title">
                Review transfer
              </h2>
              <p className="mt-1 mb-0 text-xs text-dim">
                {preview.network} · {preview.rpc_host}
              </p>
            </div>
          </div>
          <button
            aria-label="Close"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[16px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
            disabled={sending}
            type="button"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 px-5 pt-[18px] max-[680px]:grid-cols-1">
          <div className="rounded-[16px] border border-line-soft bg-raised p-3">
            <span className="block text-xs text-faint">Recipients</span>
            <strong className="mt-1 block text-sm font-bold text-ink">
              {preview.transfer_count}
            </strong>
          </div>
          <div className="rounded-[16px] border border-line-soft bg-raised p-3">
            <span className="block text-xs text-faint">Amount</span>
            <strong className="mt-1 block text-sm font-bold text-ink">
              {formatSol(preview.total_amount)} SOL
            </strong>
          </div>
          <div className="rounded-[16px] border border-line-soft bg-raised p-3">
            <span className="block text-xs text-faint">Est. fee</span>
            <strong className="mt-1 block text-sm font-bold text-ink">
              {formatSol(preview.estimated_fee)} SOL
            </strong>
          </div>
        </div>

        {visibleWarnings.length ? (
          <div className="mx-5 mt-3 flex flex-col gap-2">
            {visibleWarnings.map((warning) => (
              <div
                className={`flex items-start gap-3 rounded-[16px] border px-3 py-3 text-xs leading-relaxed ${
                  warning.severity === 'danger'
                    ? 'border-danger/25 bg-danger/10 text-danger'
                    : 'border-warning/25 bg-warning/10 text-warning'
                }`}
                key={warning.code}
              >
                <TriangleAlert className="mt-0.5 shrink-0" size={17} />
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mx-5 mt-3 max-h-[280px] overflow-y-auto rounded-[16px] border border-line-soft">
          {preview.transfers.map((transfer, index) => (
            <div
              className="grid min-h-20 grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line-soft px-3 py-3 first:border-t-0 max-[620px]:grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)]"
              key={`${transfer.sender_id}-${transfer.recipient}-${index}`}
            >
              <div className="min-w-0">
                <span className="block text-[10px] font-semibold tracking-[0.06em] text-faint uppercase">
                  Sender
                </span>
                <strong className="mt-0.5 block truncate text-xs font-semibold text-copy">
                  {formatWalletLabel(transfer.sender_name)}
                </strong>
                <small className="mt-0.5 block font-mono text-[10px] leading-4 break-all text-faint">
                  {transfer.sender_pubkey}
                </small>
              </div>
              <ArrowRight className="shrink-0 text-primary" size={16} />
              <div className="min-w-0">
                <span className="block text-[10px] font-semibold tracking-[0.06em] text-faint uppercase">
                  Recipient
                </span>
                <strong className="mt-0.5 block truncate text-xs font-semibold text-copy">
                  {formatWalletLabel(transfer.recipient_label)}
                </strong>
                <small className="mt-0.5 block font-mono text-[10px] leading-4 break-all text-faint">
                  {transfer.recipient}
                </small>
              </div>
              <b className="text-xs font-semibold whitespace-nowrap text-ink max-[620px]:col-span-3 max-[620px]:justify-self-end">
                {formatSol(transfer.amount)} SOL
              </b>
            </div>
          ))}
        </div>

        <div className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-[16px] bg-primary/15 px-4 py-3">
          <span className="text-xs text-dim">Total debit including fees</span>
          <strong className="text-sm font-bold text-primary">
            ≈ {formatSol(preview.total_debit)} SOL
          </strong>
        </div>
        <div
          className={`mx-5 mt-3 flex items-center gap-2 text-xs ${
            expired ? 'text-danger' : 'text-warning'
          }`}
        >
          <TriangleAlert size={18} />
          <span>
            {expired
              ? 'This preview has expired. Return to the form and prepare the transfer again.'
              : `Transactions are irreversible. ${remainingSeconds}s left to confirm.`}
          </span>
        </div>
        {preview.requires_acknowledgement ? (
          <label className="mx-5 mt-3 flex cursor-pointer items-start gap-3 rounded-[16px] border border-line bg-raised px-4 py-3 text-xs leading-relaxed text-copy">
            <input
              checked={acknowledged}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              type="checkbox"
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>I verified the recipients, network, and total amount.</span>
          </label>
        ) : null}
        <div className="mt-[18px] flex justify-end gap-2 border-t border-line-soft px-5 py-[15px]">
          <Button disabled={sending} onClick={onClose}>
            Back
          </Button>
          <Button
            disabled={sending || !acknowledged || expired}
            icon={sending ? LoaderCircle : Send}
            tone="primary"
            variant="solid"
            onClick={onConfirm}
          >
            {sending ? 'Sending…' : expired ? 'Preview expired' : 'Confirm and send'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function transactionStatusLabel(status: TransactionStatus) {
  if (status === 'submitted') return 'Submitted';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'finalized') return 'Finalized';
  return 'Failed';
}

function SendResultDialog({
  result,
  onActivity,
  onClose,
  onRetry,
}: {
  result: TransactionSendResult;
  onActivity: () => void;
  onClose: () => void;
  onRetry: (preview: TransferPreview) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#121116]/75 p-6 backdrop-blur-[5px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        aria-labelledby="send-result-title"
        aria-modal="true"
        className="max-h-[calc(100vh-48px)] w-full max-w-[760px] overflow-y-auto rounded-[22px] border border-line bg-surface shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-[18px]">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-10 w-10 items-center justify-center rounded-[16px] ${
                result.ok ? 'bg-primary/15 text-primary' : 'bg-warning/10 text-warning'
              }`}
            >
              {result.ok ? <CheckCircle2 size={22} /> : <TriangleAlert size={22} />}
            </span>
            <div>
              <h2 className="m-0 text-[18px] font-bold text-ink" id="send-result-title">
                {result.ok ? 'Operation submitted' : 'Operation partially completed'}
              </h2>
              <p className="mt-1 mb-0 text-xs text-dim">
                Statuses will continue updating in Activity
              </p>
            </div>
          </div>
          <button
            aria-label="Close result"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[16px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-ink"
            type="button"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 px-5 pt-[18px] max-[680px]:grid-cols-1">
          <div className="rounded-[16px] border border-line-soft bg-raised p-3">
            <span className="block text-xs text-faint">Planned</span>
            <strong className="mt-1 block text-sm font-bold text-ink">{result.planned}</strong>
          </div>
          <div className="rounded-[16px] border border-primary/20 bg-primary/10 p-3">
            <span className="block text-xs text-dim">Submitted</span>
            <strong className="mt-1 block text-sm font-bold text-primary">
              {result.submitted}
            </strong>
          </div>
          <div
            className={`rounded-[16px] border p-3 ${
              result.failed ? 'border-danger/20 bg-danger/10' : 'border-line-soft bg-raised'
            }`}
          >
            <span className="block text-xs text-faint">Failed</span>
            <strong
              className={`mt-1 block text-sm font-bold ${
                result.failed ? 'text-danger' : 'text-ink'
              }`}
            >
              {result.failed}
            </strong>
          </div>
        </div>

        <div className="mx-5 mt-3 max-h-[320px] overflow-y-auto rounded-[16px] border border-line-soft">
          {result.results.map((item, index) => (
            <div
              className="grid min-h-20 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line-soft px-3 py-2 first:border-t-0"
              key={`${item.sender_id}-${item.recipient}-${index}`}
            >
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-[12px] ${
                  item.status === 'failed'
                    ? 'bg-danger/10 text-danger'
                    : 'bg-primary/15 text-primary'
                }`}
              >
                {item.status === 'failed' ? <TriangleAlert size={14} /> : <Check size={14} />}
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-xs font-semibold text-copy">
                  {item.sender_name} → {item.recipient_label}
                </strong>
                <small
                  className={`mt-1 block truncate text-xs ${
                    item.status === 'failed' ? 'text-danger' : 'text-faint'
                  }`}
                >
                  {item.error ??
                    (item.signature
                      ? `${transactionStatusLabel(item.status)} · ${item.signature.slice(0, 8)}…${item.signature.slice(-8)}`
                      : transactionStatusLabel(item.status))}
                </small>
              </div>
              <b className="text-xs font-semibold whitespace-nowrap text-ink">
                {formatSol(item.amount)} SOL
              </b>
            </div>
          ))}
        </div>

        {result.retry_preview ? (
          <div className="mx-5 mt-3 flex items-start gap-3 rounded-[16px] border border-warning/25 bg-warning/10 px-3 py-3 text-xs leading-relaxed text-warning">
            <TriangleAlert className="mt-0.5 shrink-0" size={17} />
            <span>Failed transfers can be reviewed and submitted separately.</span>
          </div>
        ) : null}

        <div className="mt-[18px] flex flex-wrap justify-end gap-2 border-t border-line-soft px-5 py-[15px]">
          {result.retry_preview ? (
            <Button icon={RotateCcw} tone="primary" onClick={() => onRetry(result.retry_preview!)}>
              Retry failed
            </Button>
          ) : null}
          <Button onClick={onActivity}>Open activity</Button>
          <Button tone="primary" variant="solid" onClick={onClose}>
            Done
          </Button>
        </div>
      </section>
    </div>
  );
}

function OverviewPage({
  state,
  onRetry,
  onNavigate,
  onOpenOperation,
  onTransfer,
}: {
  state: WalletState;
  onRetry: () => void;
  onNavigate: (page: PageId) => void;
  onOpenOperation: (mode: OperationMode) => void;
  onTransfer: (walletId: string) => void;
}) {
  const topWallets = [...state.wallets].sort((a, b) => b.balance - a.balance).slice(0, 5);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api
      .activity()
      .then((entries) => {
        if (!cancelled) setActivity(entries);
      })
      .catch(() => {
        // The overview stays useful if the optional activity feed is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const transferAmount = (entry: ActivityEntry) => {
    const match = entry.message.match(/([0-9]+(?:\.[0-9]+)?)\s*SOL/i);
    return match ? Number(match[1]) : 0;
  };
  const movement24h = activity
    .filter((entry) => {
      const timestamp = new Date(entry.timestamp).getTime();
      return Number.isFinite(timestamp) && timestamp >= dayAgo && Boolean(entry.status);
    })
    .reduce((total, entry) => total + transferAmount(entry), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Overview" />
      {state.rpc_error ? <ErrorBanner message={state.rpc_error} onRetry={onRetry} /> : null}
      {state.pending_transaction_count ? (
        <button
          className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[16px] border border-primary/25 bg-primary/10 px-4 text-left text-xs text-copy transition hover:border-primary/40 hover:bg-primary/15"
          type="button"
          onClick={() => onNavigate('activity')}
        >
          <LoaderCircle className="shrink-0 animate-spin text-primary" size={18} />
          <span className="flex-1">
            Transactions in progress: <b>{state.pending_transaction_count}</b>. Statuses update
            automatically.
          </span>
          <ChevronRight className="shrink-0 text-primary" size={17} />
        </button>
      ) : null}
      {state.wallets.length ? (
        <WalletCarousel3D
          wallets={state.wallets}
          onManage={() => onNavigate('wallets')}
          onTransfer={onTransfer}
        />
      ) : null}
      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)] gap-4 max-[1180px]:grid-cols-1">
        <div className="col-start-1 row-start-1 grid grid-cols-2 gap-4 max-[680px]:grid-cols-1">
          <MetricCard
            icon={CircleDollarSign}
            label="Portfolio value"
            value={`${formatSol(state.total_balance, true)} SOL`}
            detail="USD quote is not connected"
          />
          <MetricCard
            icon={Activity}
            label="24h movement"
            value={movement24h ? `${formatSol(movement24h, true)} SOL` : 'No transfers'}
            detail={
              movement24h ? 'Submitted from this wallet set' : 'No local activity in the last 24h'
            }
          />
        </div>

        <Panel
          className="col-start-1 row-start-2 max-[1180px]:row-start-3"
          title="Portfolio distribution"
          subtitle="Top five wallets by balance"
          actions={
            <Button compact onClick={() => onNavigate('wallets')}>
              All wallets <ChevronRight size={16} />
            </Button>
          }
        >
          {topWallets.length ? (
            <div className="flex flex-col">
              {topWallets.map((wallet) => {
                const portfolioShare =
                  state.total_balance > 0 ? (wallet.balance / state.total_balance) * 100 : 0;
                return (
                  <div
                    className="grid min-h-12 grid-cols-[minmax(150px,0.65fr)_minmax(300px,1.5fr)] items-center gap-3 border-t border-line-soft px-1 first:border-t-0 max-[680px]:grid-cols-1 max-[680px]:gap-y-1.5 max-[680px]:py-2"
                    key={wallet.id}
                  >
                    <strong className="block min-w-0 overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap text-copy">
                      {/^[0-9]+$/.test(wallet.name) ? `Wallet ${wallet.name}` : wallet.name}
                    </strong>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-12 shrink-0 text-right text-xs font-semibold text-dim tabular-nums">
                        {portfolioPercentFormatter.format(portfolioShare)}%
                      </span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-soft">
                        <i
                          className="block h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{ width: `${Math.min(100, portfolioShare)}%` }}
                        />
                      </div>
                      <b className="min-w-[98px] text-right text-sm font-bold whitespace-nowrap text-ink tabular-nums">
                        {formatSol(wallet.balance, true)}{' '}
                        <small className="text-xs font-medium text-faint">SOL</small>
                      </b>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              action={
                <Button icon={FileUp} tone="primary" onClick={() => onNavigate('settings')}>
                  Add CSV
                </Button>
              }
              icon={WalletCards}
              text="Import a CSV with name, pubkey, and privkey columns."
              title="No wallets yet"
            />
          )}
        </Panel>

        <div className="col-start-2 row-span-2 row-start-1 flex flex-col gap-4 self-start max-[1180px]:col-start-1 max-[1180px]:row-span-1 max-[1180px]:row-start-2">
          <div
            className={`flex min-h-[72px] w-full items-center gap-3 rounded-[18px] border bg-surface p-4 ${state.rpc_error ? 'border-danger/25' : 'border-line'}`}
          >
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] ${state.rpc_error ? 'bg-danger/10 text-danger' : 'bg-solana/10 text-solana'}`}
            >
              <Network size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block text-[16px] font-bold text-copy">{state.network}</strong>
              <small className="mt-1 block overflow-hidden text-sm text-ellipsis whitespace-nowrap text-faint">
                {state.rpc_error ? 'RPC unavailable' : state.rpc_host}
              </small>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {!state.rpc_error && state.rpc_latency_ms !== null ? (
                <span className="text-xs whitespace-nowrap text-faint tabular-nums">
                  {state.rpc_latency_ms} ms
                </span>
              ) : null}
              <span
                aria-label={
                  state.rpc_error
                    ? 'Network unavailable'
                    : state.rpc_latency_ms === null
                      ? 'Checking network'
                      : 'Network online'
                }
                className={`h-2.5 w-2.5 rounded-full ${state.rpc_error ? 'bg-danger shadow-[0_0_0_5px_rgba(185,75,58,0.12)]' : state.rpc_latency_ms === null ? 'bg-warning shadow-[0_0_0_5px_rgba(184,120,36,0.12)]' : 'bg-solana shadow-[0_0_0_5px_rgba(139,92,246,0.12)]'}`}
                role="status"
                title={
                  state.rpc_error
                    ? 'Network unavailable'
                    : state.rpc_latency_ms === null
                      ? 'Checking network'
                      : 'Network online'
                }
              />
              <button
                aria-label="Change network"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[16px] border border-line bg-raised text-faint transition hover:border-line-strong hover:bg-muted hover:text-primary"
                title="Change network"
                type="button"
                onClick={() => onNavigate('settings')}
              >
                <Pencil size={16} />
              </button>
            </div>
          </div>

          <Panel title="Quick actions">
            <div className="flex flex-col gap-2">
              <button
                className="flex min-h-[72px] w-full cursor-pointer items-center gap-3 rounded-[16px] border border-line-soft bg-raised p-3 text-left transition hover:-translate-y-px hover:border-line-strong hover:bg-muted"
                type="button"
                onClick={() => onOpenOperation('single')}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] bg-primary/15 text-primary">
                  <Send size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm font-semibold text-copy">Send SOL</strong>
                  <small className="mt-0.5 block text-xs text-faint">Single recipient</small>
                </div>
                <ChevronRight className="text-faint" size={18} />
              </button>
              <button
                className="flex min-h-[72px] w-full cursor-pointer items-center gap-3 rounded-[16px] border border-line-soft bg-raised p-3 text-left transition hover:-translate-y-px hover:border-line-strong hover:bg-muted"
                type="button"
                onClick={() => onOpenOperation('distribute')}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] bg-primary/15 text-primary">
                  <Zap size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm font-semibold text-copy">
                    Batch operations
                  </strong>
                  <small className="mt-0.5 block text-xs text-faint">
                    Distribute, collect, equalize
                  </small>
                </div>
                <ChevronRight className="text-faint" size={18} />
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function WalletsPage({
  state,
  onCopy,
  onImport,
  onReload,
  onToast,
  onTransfer,
}: {
  state: WalletState;
  onCopy: (value: string, message: string) => void;
  onImport: (file: File) => Promise<void>;
  onReload: () => Promise<void>;
  onToast: (message: string, tone?: 'success' | 'error') => void;
  onTransfer: (walletId: string) => void;
}) {
  type SortKey = 'name' | 'balance';

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });
  const [addingWallet, setAddingWallet] = useState(false);
  const [editingWallet, setEditingWallet] = useState<WalletRow | null>(null);
  const [deletingWallet, setDeletingWallet] = useState<WalletRow | null>(null);
  const [openWalletActionsId, setOpenWalletActionsId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [addName, setAddName] = useState('');
  const [addPrivateKey, setAddPrivateKey] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = state.wallets
    .map((wallet, index) => ({ wallet, index }))
    .filter(({ wallet }) =>
      `${wallet.name} ${wallet.pubkey}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((left, right) => {
      let comparison = 0;

      if (sort.key === 'name') {
        comparison = left.wallet.name.localeCompare(right.wallet.name, 'en', {
          numeric: true,
          sensitivity: 'base',
        });
      }
      if (sort.key === 'balance') comparison = left.wallet.balance - right.wallet.balance;

      return (sort.direction === 'asc' ? comparison : -comparison) || left.index - right.index;
    })
    .map(({ wallet }) => wallet);
  const toggleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };
  const sortHeader = (key: SortKey, label: string) => {
    const isActive = sort.key === key;

    return (
      <button
        aria-label={`Sort by ${label}`}
        className={`font-inherit tracking-inherit flex w-fit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left uppercase transition hover:text-copy ${isActive ? 'text-copy' : 'text-faint'}`}
        type="button"
        onClick={() => toggleSort(key)}
      >
        <span>{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`shrink-0 transition-transform ${isActive ? 'opacity-100' : 'opacity-50'} ${isActive && sort.direction === 'asc' ? 'rotate-180' : ''}`}
          size={14}
          strokeWidth={2.25}
        />
      </button>
    );
  };
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void onImport(file);
    event.target.value = '';
  };
  const closeAddWallet = () => {
    if (actionPending) return;
    setAddingWallet(false);
    setAddName('');
    setAddPrivateKey('');
  };
  const createWallet = async (event: FormEvent) => {
    event.preventDefault();
    if (!addName.trim() || !addPrivateKey.trim()) return;
    setActionPending(true);
    try {
      await api.createWallet(addName.trim(), addPrivateKey.trim());
      setAddingWallet(false);
      setAddName('');
      setAddPrivateKey('');
      await onReload();
      onToast('Wallet added');
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : String(reason), 'error');
    } finally {
      setActionPending(false);
    }
  };
  const saveWallet = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingWallet || !editName.trim()) return;
    setActionPending(true);
    try {
      await api.updateWallet(editingWallet.id, editName.trim());
      setEditingWallet(null);
      await onReload();
      onToast('Wallet name updated');
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : String(reason), 'error');
    } finally {
      setActionPending(false);
    }
  };
  const deleteWallet = async () => {
    if (!deletingWallet) return;
    setActionPending(true);
    try {
      await api.deleteWallet(deletingWallet.id);
      setDeletingWallet(null);
      await onReload();
      onToast('Wallet deleted');
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : String(reason), 'error');
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Wallets" />
      <Panel className="p-0">
        <div className="flex items-center justify-between gap-4 p-[18px] max-[680px]:flex-col max-[680px]:items-stretch">
          <label className="relative block w-full max-w-[280px] max-[680px]:max-w-none">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
              size={17}
            />
            <input
              className="h-10 w-full rounded-[16px] border border-line bg-raised py-3 pr-3.5 pl-10 text-sm text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Search by name or address"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="flex shrink-0 items-center gap-3 max-[680px]:grid max-[680px]:grid-cols-2">
            <input ref={inputRef} accept=".csv,text/csv" hidden type="file" onChange={handleFile} />
            <Button
              className="h-10"
              icon={Plus}
              tone="primary"
              variant="solid"
              onClick={() => setAddingWallet(true)}
            >
              Add
            </Button>
            <Button className="h-10" icon={Upload} onClick={() => inputRef.current?.click()}>
              Import CSV
            </Button>
          </div>
        </div>
        {filtered.length ? (
          <div className="relative mx-[18px] mb-[18px] rounded-[16px]">
            <div className="grid h-10 grid-cols-[minmax(160px,0.55fr)_minmax(220px,1.4fr)_190px_52px] items-center gap-4 bg-muted/65 px-5 text-xs font-semibold tracking-[0.06em] text-faint uppercase max-[1180px]:grid-cols-[minmax(140px,0.55fr)_minmax(180px,1fr)_150px_40px] max-[680px]:hidden">
              {sortHeader('name', 'Name')}
              <span>Public address</span>
              {sortHeader('balance', 'Balance')}
              <span className="max-[1180px]:sr-only">Action</span>
            </div>
            {filtered.map((wallet) => (
              <div
                className={`relative grid min-h-[72px] grid-cols-[minmax(160px,0.55fr)_minmax(220px,1.4fr)_190px_52px] items-center gap-4 border-t border-line-soft bg-raised/45 px-5 transition hover:bg-muted/55 max-[1180px]:grid-cols-[minmax(140px,0.55fr)_minmax(180px,1fr)_150px_40px] max-[680px]:grid-cols-[minmax(0,1fr)_auto] max-[680px]:gap-2 max-[680px]:py-3 ${openWalletActionsId === wallet.id ? 'z-30' : 'hover:z-20'}`}
                key={wallet.id}
              >
                <div className="min-w-0">
                  <strong className="block overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap text-copy">
                    {/^[0-9]+$/.test(wallet.name) ? `Wallet ${wallet.name}` : wallet.name}
                  </strong>
                </div>
                <button
                  className="flex min-w-0 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-copy hover:text-primary max-[680px]:col-span-full max-[680px]:row-start-2"
                  title={wallet.pubkey}
                  type="button"
                  onClick={() => onCopy(wallet.pubkey, 'Address copied')}
                >
                  <code className="overflow-hidden font-mono text-[16px] font-medium text-ellipsis whitespace-nowrap">
                    {wallet.short_address}
                  </code>
                  <Copy className="shrink-0 text-faint" size={16} />
                </button>
                <div className="flex items-baseline justify-start gap-1.5 tabular-nums max-[680px]:col-start-2 max-[680px]:row-start-1">
                  <strong className="text-sm font-bold text-ink">
                    {formatSol(wallet.balance)}
                  </strong>
                  <small className="text-xs text-faint">SOL</small>
                </div>
                <div className="relative justify-self-start max-[680px]:hidden">
                  <button
                    aria-expanded={openWalletActionsId === wallet.id}
                    aria-label={`Actions for ${wallet.name}`}
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[16px] border border-transparent bg-transparent text-faint transition hover:border-line hover:bg-muted hover:text-ink focus:border-line focus:bg-muted focus:text-ink"
                    type="button"
                    onClick={() =>
                      setOpenWalletActionsId((current) =>
                        current === wallet.id ? null : wallet.id,
                      )
                    }
                  >
                    <EllipsisVertical size={19} />
                  </button>
                  {openWalletActionsId === wallet.id ? (
                    <div className="absolute top-0 right-full z-50 mr-2 w-[160px] rounded-[16px] border border-line bg-raised p-1.5 shadow-[0_8px_22px_rgba(65,55,43,0.16)]">
                      <button
                        className="flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-[12px] border-0 bg-transparent px-3 text-left text-sm font-bold text-copy transition hover:bg-muted"
                        type="button"
                        onClick={() => {
                          setOpenWalletActionsId(null);
                          onTransfer(wallet.id);
                        }}
                      >
                        <ArrowUpRight className="text-faint" size={16} />
                        Send
                      </button>
                      <button
                        className="flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-[12px] border-0 bg-transparent px-3 text-left text-sm font-bold text-copy transition hover:bg-muted"
                        type="button"
                        onClick={() => {
                          setOpenWalletActionsId(null);
                          setEditingWallet(wallet);
                          setEditName(wallet.name);
                        }}
                      >
                        <Pencil className="text-faint" size={16} />
                        Rename
                      </button>
                      <button
                        className="flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-[12px] border-0 bg-transparent px-3 text-left text-sm font-bold text-danger transition hover:bg-danger/10"
                        type="button"
                        onClick={() => {
                          setOpenWalletActionsId(null);
                          setDeletingWallet(wallet);
                        }}
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Search}
            text={
              state.wallets.length
                ? 'Try a different search query.'
                : 'Import a CSV to get started.'
            }
            title={state.wallets.length ? 'Nothing found' : 'No wallets'}
          />
        )}
      </Panel>
      {addingWallet ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#121116]/75 p-6 backdrop-blur-[5px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAddWallet();
          }}
        >
          <section
            aria-labelledby="add-wallet-title"
            aria-modal="true"
            className="w-full max-w-[480px] rounded-[22px] border border-line bg-surface shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-[18px]">
              <div>
                <h2 className="m-0 text-[18px] font-bold text-ink" id="add-wallet-title">
                  Add wallet
                </h2>
                <p className="mt-1.5 mb-0 text-xs text-dim">
                  The public address will be derived automatically
                </p>
              </div>
              <button
                aria-label="Close"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[16px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-ink"
                disabled={actionPending}
                type="button"
                onClick={closeAddWallet}
              >
                <X size={18} />
              </button>
            </div>
            <form
              className="flex flex-col gap-4 p-5"
              onSubmit={(event) => void createWallet(event)}
            >
              <div>
                <label
                  className="mb-2 block text-sm font-semibold text-copy"
                  htmlFor="new-wallet-name"
                >
                  Name
                </label>
                <input
                  autoFocus
                  className="min-h-12 w-full rounded-[16px] border border-line bg-raised px-4 text-sm text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
                  id="new-wallet-name"
                  maxLength={80}
                  placeholder="For example, Primary"
                  value={addName}
                  onChange={(event) => setAddName(event.target.value)}
                />
              </div>
              <div>
                <label
                  className="mb-2 block text-sm font-semibold text-copy"
                  htmlFor="new-wallet-key"
                >
                  Private key
                </label>
                <input
                  autoComplete="new-password"
                  className="min-h-12 w-full rounded-[16px] border border-line bg-raised px-4 font-mono text-sm text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
                  id="new-wallet-key"
                  placeholder="Base58 or JSON array"
                  spellCheck={false}
                  type="password"
                  value={addPrivateKey}
                  onChange={(event) => setAddPrivateKey(event.target.value)}
                />
              </div>
              <div className="mt-1 flex justify-end gap-2 border-t border-line-soft pt-4">
                <Button disabled={actionPending} type="button" onClick={closeAddWallet}>
                  Cancel
                </Button>
                <Button
                  disabled={actionPending || !addName.trim() || !addPrivateKey.trim()}
                  icon={actionPending ? LoaderCircle : Plus}
                  tone="primary"
                  type="submit"
                  variant="solid"
                >
                  {actionPending ? 'Adding…' : 'Add'}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {editingWallet ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#121116]/75 p-6 backdrop-blur-[5px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !actionPending) setEditingWallet(null);
          }}
        >
          <section
            aria-labelledby="edit-wallet-title"
            aria-modal="true"
            className="w-full max-w-[460px] rounded-[22px] border border-line bg-surface shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-[18px]">
              <div>
                <h2 className="m-0 text-[18px] font-bold text-ink" id="edit-wallet-title">
                  Rename wallet
                </h2>
                <p className="mt-1.5 mb-0 text-xs text-dim">
                  The public address will stay unchanged
                </p>
              </div>
              <button
                aria-label="Close"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[16px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-ink"
                disabled={actionPending}
                type="button"
                onClick={() => setEditingWallet(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form className="p-5" onSubmit={(event) => void saveWallet(event)}>
              <label className="mb-2 block text-sm font-semibold text-copy" htmlFor="wallet-name">
                Name
              </label>
              <input
                autoFocus
                className="min-h-12 w-full rounded-[16px] border border-line bg-raised px-4 text-sm text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
                id="wallet-name"
                maxLength={80}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
              <code className="mt-3 block overflow-hidden font-mono text-xs text-ellipsis whitespace-nowrap text-faint">
                {editingWallet.pubkey}
              </code>
              <div className="mt-5 flex justify-end gap-2 border-t border-line-soft pt-4">
                <Button
                  disabled={actionPending}
                  type="button"
                  onClick={() => setEditingWallet(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={actionPending || !editName.trim()}
                  icon={actionPending ? LoaderCircle : Check}
                  tone="primary"
                  type="submit"
                  variant="solid"
                >
                  {actionPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {deletingWallet ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#121116]/75 p-6 backdrop-blur-[5px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !actionPending) setDeletingWallet(null);
          }}
        >
          <section
            aria-labelledby="delete-wallet-title"
            aria-modal="true"
            className="w-full max-w-[460px] rounded-[22px] border border-line bg-surface p-5 shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
            role="dialog"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-danger/10 text-danger">
              <Trash2 size={21} />
            </span>
            <h2 className="mt-4 mb-0 text-[18px] font-bold text-ink" id="delete-wallet-title">
              Delete {deletingWallet.name}?
            </h2>
            <p className="mt-2 mb-0 text-sm leading-5 text-dim">
              This entry will be removed from {state.wallet_file}. This action cannot be undone in
              the app.
            </p>
            <div className="mt-5 flex justify-end gap-2 border-t border-line-soft pt-4">
              <Button disabled={actionPending} onClick={() => setDeletingWallet(null)}>
                Cancel
              </Button>
              <Button
                disabled={actionPending}
                icon={actionPending ? LoaderCircle : Trash2}
                tone="danger"
                variant="solid"
                onClick={() => void deleteWallet()}
              >
                {actionPending ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function TransferFieldLabel({ label }: { label: string }) {
  return <span className="text-sm font-bold text-copy">{label}</span>;
}

function SingleTransferForm({
  state,
  initialSourceId,
  onPreview,
  onToast,
}: {
  state: WalletState;
  initialSourceId?: string;
  onPreview: (payload: Record<string, unknown>) => Promise<void>;
  onToast: (message: string, tone?: 'success' | 'error') => void;
}) {
  const [sourceId, setSourceId] = useState(
    state.wallets.some((wallet) => wallet.id === initialSourceId)
      ? (initialSourceId ?? '')
      : (state.wallets[0]?.id ?? ''),
  );
  const [recipientType, setRecipientType] = useState<'wallet' | 'address'>('wallet');
  const [recipientId, setRecipientId] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<25 | 50 | 75 | 100 | null>(null);
  const [pending, setPending] = useState(false);
  const source = state.wallets.find((wallet) => wallet.id === sourceId);
  const spendableBalance = Math.max(0, (source?.balance ?? 0) - estimatedTransferFee);
  const recipientMissing = recipientType === 'wallet' ? !recipientId : !recipientAddress;
  const amountNumber = Number(amount.replace(',', '.'));
  const amountInvalid = !amount || !Number.isFinite(amountNumber) || amountNumber <= 0;
  const amountExceedsBalance = !amountInvalid && amountNumber > spendableBalance;
  const formHint = !sourceId
    ? 'Select a sender'
    : recipientMissing
      ? 'Select a recipient'
      : amountInvalid
        ? 'Enter an amount'
        : amountExceedsBalance
          ? 'The amount exceeds the available balance including fees'
          : '';
  useEffect(() => {
    if (!sourceId && state.wallets[0]) setSourceId(state.wallets[0].id);
  }, [sourceId, state.wallets]);
  useEffect(() => {
    if (initialSourceId) setSourceId(initialSourceId);
  }, [initialSourceId]);

  const applyPreset = (percent: 25 | 50 | 75 | 100) => {
    setSelectedPreset(percent);
    setAmount(formatAmountInput(spendableBalance * (percent / 100)));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      await onPreview({
        mode: 'single',
        source_ids: [sourceId],
        recipient_id: recipientType === 'wallet' ? recipientId : '',
        recipient_address: recipientType === 'address' ? recipientAddress : '',
        amount,
      });
    } finally {
      setPending(false);
    }
  };

  if (!state.wallets.length) {
    return (
      <EmptyState
        icon={WalletCards}
        text="Add a CSV file in Settings before sending SOL."
        title="No wallets available"
      />
    );
  }

  return (
    <div className="w-full">
      <Panel
        className="p-5"
        title="New transfer"
        subtitle="Set the details — funds move only after confirmation"
      >
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-3">
            <TransferFieldLabel label="From" />
            <WalletSelect
              detailed
              wallets={state.wallets}
              value={sourceId}
              onChange={(value) => {
                setSourceId(value);
                if (recipientId === value) setRecipientId('');
                setAmount('');
                setSelectedPreset(null);
              }}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 max-[520px]:flex-col max-[520px]:items-stretch">
              <TransferFieldLabel label="To" />
              <div className="inline-flex shrink-0 rounded-[16px] border border-line bg-raised p-0.5 max-[520px]:w-full">
                <button
                  aria-pressed={recipientType === 'wallet'}
                  className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[12px] border-0 px-4 text-sm font-bold transition max-[520px]:flex-1 ${recipientType === 'wallet' ? 'bg-primary text-surface' : 'bg-transparent text-dim hover:text-copy'}`}
                  type="button"
                  onClick={() => setRecipientType('wallet')}
                >
                  <WalletCards size={14} />
                  My wallet
                </button>
                <button
                  aria-pressed={recipientType === 'address'}
                  className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[12px] border-0 px-4 text-sm font-bold transition max-[520px]:flex-1 ${recipientType === 'address' ? 'bg-primary text-surface' : 'bg-transparent text-dim hover:text-copy'}`}
                  type="button"
                  onClick={() => setRecipientType('address')}
                >
                  <AtSign size={14} />
                  External address
                </button>
              </div>
            </div>
            {recipientType === 'wallet' ? (
              <WalletSelect
                detailed
                excludeIds={[sourceId]}
                placeholder="Select a recipient"
                wallets={state.wallets}
                value={recipientId}
                onChange={setRecipientId}
              />
            ) : (
              <div className="relative">
                <AtSign
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-faint"
                  size={17}
                />
                <input
                  className="h-12 w-full rounded-[16px] border border-line bg-raised pr-12 pl-12 font-mono text-sm text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-3 focus:ring-primary/15"
                  autoComplete="off"
                  placeholder="Solana address"
                  spellCheck={false}
                  value={recipientAddress}
                  onChange={(event) => setRecipientAddress(event.target.value.trim())}
                />
                <button
                  aria-label="Paste address"
                  className="absolute top-1/2 right-2.5 inline-flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[16px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-primary"
                  title="Paste address"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      .readText()
                      .then((text) => setRecipientAddress(text.trim()))
                      .catch(() => onToast('Could not read the clipboard', 'error'));
                  }}
                >
                  <ClipboardPaste size={17} />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <TransferFieldLabel label="Amount" />
              <button
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line-soft bg-raised px-3 py-1 text-xs font-medium text-faint transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                title="Use the maximum available amount"
                type="button"
                onClick={() => applyPreset(100)}
              >
                Available{' '}
                <b className="font-semibold text-dim">{formatSol(source?.balance ?? 0)} SOL</b>
              </button>
            </div>
            <div className="relative">
              <input
                className="h-12 w-full rounded-[16px] border border-line bg-raised px-4 pr-24 text-[22px] leading-none font-semibold text-ink tabular-nums transition outline-none placeholder:text-faint focus:border-primary focus:ring-3 focus:ring-primary/15"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setSelectedPreset(null);
                }}
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[20px] leading-none font-semibold text-faint">
                SOL
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 max-[480px]:grid-cols-2">
              <button
                className={`min-h-10 cursor-pointer rounded-full border px-4 py-2 text-sm font-bold transition ${selectedPreset === 25 ? 'border-primary/40 bg-primary/15 text-primary' : 'border-line bg-raised text-dim hover:border-line-strong hover:text-copy'}`}
                type="button"
                onClick={() => applyPreset(25)}
              >
                25%
              </button>
              <button
                className={`min-h-10 cursor-pointer rounded-full border px-4 py-2 text-sm font-bold transition ${selectedPreset === 50 ? 'border-primary/40 bg-primary/15 text-primary' : 'border-line bg-raised text-dim hover:border-line-strong hover:text-copy'}`}
                type="button"
                onClick={() => applyPreset(50)}
              >
                50%
              </button>
              <button
                className={`min-h-10 cursor-pointer rounded-full border px-4 py-2 text-sm font-bold transition ${selectedPreset === 75 ? 'border-primary/40 bg-primary/15 text-primary' : 'border-line bg-raised text-dim hover:border-line-strong hover:text-copy'}`}
                type="button"
                onClick={() => applyPreset(75)}
              >
                75%
              </button>
              <button
                className={`min-h-10 cursor-pointer rounded-full border px-4 py-2 text-sm font-bold transition ${selectedPreset === 100 ? 'border-primary/40 bg-primary/15 text-primary' : 'border-line bg-raised text-dim hover:border-line-strong hover:text-copy'}`}
                type="button"
                onClick={() => applyPreset(100)}
              >
                Maximum
              </button>
            </div>
          </div>
          {!amountInvalid ? (
            <div className="grid grid-cols-3 overflow-hidden rounded-[16px] border border-line-soft bg-app/40 max-[520px]:grid-cols-1">
              <div className="px-3 py-3 max-[520px]:flex max-[520px]:items-center max-[520px]:justify-between">
                <span className="block text-[10px] font-semibold tracking-[0.05em] text-faint uppercase">
                  Amount
                </span>
                <strong className="mt-1 block text-xs font-semibold text-copy max-[520px]:mt-0">
                  {formatSol(amountNumber)} SOL
                </strong>
              </div>
              <div className="border-x border-line-soft px-3 py-3 max-[520px]:flex max-[520px]:items-center max-[520px]:justify-between max-[520px]:border-x-0 max-[520px]:border-y">
                <span className="block text-[10px] font-semibold tracking-[0.05em] text-faint uppercase">
                  Est. fee
                </span>
                <strong className="mt-1 block text-xs font-semibold text-copy max-[520px]:mt-0">
                  {formatSol(estimatedTransferFee)} SOL
                </strong>
              </div>
              <div className="px-3 py-3 max-[520px]:flex max-[520px]:items-center max-[520px]:justify-between">
                <span className="block text-[10px] font-semibold tracking-[0.05em] text-faint uppercase">
                  Est. debit
                </span>
                <strong className="mt-1 block text-xs font-bold text-primary max-[520px]:mt-0">
                  {formatSol(amountNumber + estimatedTransferFee)} SOL
                </strong>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4 border-t border-line-soft pt-4 max-[520px]:flex-col max-[520px]:items-stretch">
            {formHint ? <small className="mr-auto text-xs text-faint">{formHint}</small> : null}
            <Button
              disabled={pending || Boolean(formHint)}
              icon={pending ? LoaderCircle : ArrowRight}
              tone="primary"
              variant="solid"
              className="min-w-[190px] max-[520px]:w-full"
              type="submit"
            >
              {pending ? 'Reviewing…' : 'Review transfer'}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function BatchOperationForm({
  state,
  mode,
  onPreview,
}: {
  state: WalletState;
  mode: BatchMode;
  onPreview: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState(state.wallets[0]?.id ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setSelectedIds([]);
    setRecipientId('');
    setAmount(mode === 'consolidate' ? '100%' : '');
  }, [mode]);

  const sourceWallet = state.wallets.find((wallet) => wallet.id === sourceId);
  const selectedWallets = state.wallets.filter((wallet) => selectedIds.includes(wallet.id));
  const selectedBalance = selectedWallets.reduce((total, wallet) => total + wallet.balance, 0);
  const amountValue = amount.trim();
  const amountIsPercent = amountValue.endsWith('%');
  const amountNumber = Number(amountValue.replace(',', '.').replace('%', ''));
  const amountValid =
    Number.isFinite(amountNumber) &&
    amountNumber > 0 &&
    !(mode === 'distribute' && amountIsPercent) &&
    !(mode === 'consolidate' && amountIsPercent && amountNumber > 100);
  const estimatedFee = selectedIds.length * estimatedTransferFee;
  const estimatedAmount =
    mode === 'distribute'
      ? amountValid
        ? amountNumber * selectedIds.length
        : 0
      : mode === 'consolidate'
        ? amountValid
          ? amountIsPercent
            ? selectedWallets.reduce(
                (total, wallet) =>
                  total + Math.max(0, wallet.balance - estimatedTransferFee) * (amountNumber / 100),
                0,
              )
            : amountNumber * selectedIds.length
          : 0
        : 0;
  const estimatedDebit = mode === 'distribute' ? estimatedAmount + estimatedFee : estimatedAmount;
  const equalizedShare = selectedIds.length > 0 ? selectedBalance / selectedIds.length : 0;

  const formHint =
    mode === 'equalize' && selectedIds.length < 2
      ? 'Select at least two wallets'
      : selectedIds.length === 0
        ? mode === 'distribute'
          ? 'Select recipients'
          : 'Select source wallets'
        : mode === 'distribute' && !sourceId
          ? 'Select the sender wallet'
          : mode === 'consolidate' && !recipientId
            ? 'Select the recipient wallet'
            : mode !== 'equalize' && !amountValid
              ? mode === 'consolidate' && amountIsPercent && amountNumber > 100
                ? 'Percentage must be between 0 and 100'
                : 'Enter a valid amount'
              : mode === 'distribute' && sourceWallet && estimatedDebit > sourceWallet.balance
                ? 'The wallet does not have enough SOL including fees'
                : '';
  const ctaLabel =
    mode === 'distribute'
      ? 'Review distribution'
      : mode === 'consolidate'
        ? 'Review collection'
        : 'Review equalization';
  const showSummary = selectedIds.length > 0 && (mode === 'equalize' || amountValid);
  const summaryItems =
    mode === 'distribute'
      ? [
          { label: 'Recipients', value: String(selectedIds.length) },
          { label: 'Est. fee', value: `${formatSol(estimatedFee)} SOL` },
          { label: 'Est. debit', value: `${formatSol(estimatedDebit)} SOL` },
        ]
      : mode === 'consolidate'
        ? [
            { label: 'Sources', value: String(selectedIds.length) },
            { label: 'Est. fee', value: `${formatSol(estimatedFee)} SOL` },
            { label: 'Est. received', value: `${formatSol(estimatedAmount)} SOL` },
          ]
        : [
            { label: 'Participants', value: String(selectedIds.length) },
            { label: 'Combined balance', value: `${formatSol(selectedBalance)} SOL` },
            { label: 'Target per wallet', value: `${formatSol(equalizedShare)} SOL` },
          ];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (formHint) return;
    setPending(true);
    try {
      if (mode === 'distribute') {
        await onPreview({ mode, source_ids: [sourceId], destination_ids: selectedIds, amount });
      } else if (mode === 'consolidate') {
        await onPreview({ mode, source_ids: selectedIds, recipient_id: recipientId, amount });
      } else {
        await onPreview({ mode, source_ids: selectedIds });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="grid grid-cols-[minmax(0,0.95fr)_minmax(340px,1.05fr)] items-stretch gap-4 max-[980px]:grid-cols-1"
      onSubmit={submit}
    >
      <Panel
        className="flex min-h-[456px] flex-col max-[980px]:min-h-0"
        title={
          mode === 'distribute'
            ? 'New distribution'
            : mode === 'consolidate'
              ? 'New collection'
              : 'Equalize group'
        }
        subtitle={
          mode === 'distribute'
            ? 'Send one amount to multiple recipients'
            : mode === 'consolidate'
              ? 'Collect funds from selected wallets into one'
              : 'Distribute the selected group balance evenly'
        }
      >
        {mode === 'distribute' ? (
          <div className="flex flex-col gap-4">
            <div>
              <TransferFieldLabel label="Sender" />
              <div className="mt-2">
                <WalletSelect
                  detailed
                  wallets={state.wallets}
                  value={sourceId}
                  onChange={(value) => {
                    setSourceId(value);
                    setSelectedIds((ids) => ids.filter((id) => id !== value));
                  }}
                />
              </div>
            </div>
            <div>
              <TransferFieldLabel label="Amount per recipient" />
              <div className="relative mt-2">
                <input
                  className="h-12 w-full rounded-[16px] border border-line bg-raised px-4 pr-20 text-[22px] leading-none font-semibold text-ink tabular-nums transition outline-none placeholder:text-faint focus:border-primary focus:ring-3 focus:ring-primary/15"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[20px] leading-none font-semibold text-faint">
                  SOL
                </span>
              </div>
              <p className="mt-2 mb-0 text-xs leading-relaxed text-faint">
                This amount will be sent to each selected recipient
              </p>
            </div>
          </div>
        ) : null}
        {mode === 'consolidate' ? (
          <div className="flex flex-col gap-4">
            <div>
              <TransferFieldLabel label="Recipient" />
              <div className="mt-2">
                <WalletSelect
                  detailed
                  excludeIds={selectedIds}
                  wallets={state.wallets}
                  value={recipientId}
                  onChange={setRecipientId}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <TransferFieldLabel label="Amount from each" />
                <span className="rounded-full bg-soft px-3 py-1 text-xs font-medium text-faint max-[420px]:hidden">
                  Enter SOL or %
                </span>
              </div>
              <div className="relative mt-2">
                <input
                  className="h-12 w-full rounded-[16px] border border-line bg-raised px-4 pr-20 text-[22px] leading-none font-semibold text-ink tabular-nums transition outline-none placeholder:text-faint focus:border-primary focus:ring-3 focus:ring-primary/15"
                  inputMode="decimal"
                  placeholder="100%"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                {!amountIsPercent ? (
                  <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[20px] leading-none font-semibold text-faint">
                    SOL
                  </span>
                ) : null}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {[25, 50, 75, 100].map((preset) => (
                  <button
                    className={`min-h-8 cursor-pointer rounded-full border px-2 text-xs font-semibold transition ${
                      amount === `${preset}%`
                        ? 'border-primary/40 bg-primary/15 text-primary'
                        : 'border-line bg-raised text-dim hover:border-line-strong hover:text-copy'
                    }`}
                    key={preset}
                    type="button"
                    onClick={() => setAmount(`${preset}%`)}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {mode === 'equalize' ? (
          <div>
            <TransferFieldLabel label="Calculated result" />
            <div className="mt-2 flex min-h-[126px] items-center gap-3 rounded-[18px] border border-line-soft bg-raised/60 p-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-primary/15 text-primary">
                <WalletCards size={21} />
              </span>
              <div className="min-w-0">
                <strong className="block text-sm font-semibold text-copy">
                  Equal share for each wallet
                </strong>
                <small className="mt-1 block text-xs leading-relaxed text-faint">
                  NODAL will find the smallest transfer set and account for network fees
                </small>
              </div>
            </div>
          </div>
        ) : null}
        <div className="mt-auto pt-5">
          {showSummary ? (
            <div className="grid grid-cols-2 overflow-hidden rounded-[16px] border border-line-soft bg-app/40">
              {summaryItems.map((item, index) => (
                <div
                  className={`px-3 py-3 ${
                    index === 1
                      ? 'border-l border-line-soft'
                      : index === 2
                        ? 'col-span-2 flex items-center justify-between border-t border-line-soft'
                        : ''
                  }`}
                  key={item.label}
                >
                  <span className="block text-[10px] font-semibold tracking-[0.05em] text-faint uppercase">
                    {item.label}
                  </span>
                  <strong
                    className={`block text-xs font-semibold whitespace-nowrap tabular-nums ${
                      index === 2 ? 'mt-0' : 'mt-1'
                    } ${index === summaryItems.length - 1 ? 'text-primary' : 'text-copy'}`}
                  >
                    {item.value}
                  </strong>
                </div>
              ))}
            </div>
          ) : null}
          <div className={`${showSummary ? 'mt-4 border-t border-line-soft pt-4' : ''}`}>
            {formHint ? <small className="text-xs text-faint">{formHint}</small> : null}
            <Button
              className="mt-3 w-full"
              disabled={pending || Boolean(formHint)}
              icon={pending ? LoaderCircle : ArrowRight}
              tone="primary"
              variant="solid"
              type="submit"
            >
              {pending ? 'Calculating…' : ctaLabel}
            </Button>
          </div>
        </div>
      </Panel>
      <Panel
        className="min-h-[456px] max-[980px]:min-h-0"
        title={
          mode === 'distribute' ? 'Recipients' : mode === 'consolidate' ? 'Sources' : 'Participants'
        }
        subtitle={
          mode === 'equalize'
            ? 'Select at least two wallets for the group'
            : 'Choose the wallets included in this operation'
        }
      >
        <div className="mb-2">
          <TransferFieldLabel
            label={
              mode === 'distribute'
                ? 'Recipient wallets'
                : mode === 'consolidate'
                  ? 'Source wallets'
                  : 'Group members'
            }
          />
        </div>
        <WalletChecklist
          excludeIds={
            mode === 'distribute' ? [sourceId] : mode === 'consolidate' ? [recipientId] : []
          }
          wallets={state.wallets}
          selected={selectedIds}
          onChange={setSelectedIds}
        />
      </Panel>
    </form>
  );
}

function OperationModeTab({
  active,
  description,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`flex min-h-[72px] w-full cursor-pointer items-center justify-start gap-4 rounded-[16px] border px-4 py-3 text-left transition focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none ${active ? 'border-primary/30 bg-primary/15 text-primary' : 'border-transparent bg-transparent text-dim hover:bg-raised hover:text-copy'}`}
      type="button"
      onClick={onClick}
    >
      <Icon className="shrink-0" size={22} />
      <span className="min-w-0">
        <strong className="block text-[16px] font-bold">{label}</strong>
        <small className="mt-0.5 block text-sm opacity-75">{description}</small>
      </span>
    </button>
  );
}

function OperationsPage({
  state,
  mode,
  initialSourceId,
  onModeChange,
  onPreview,
  onToast,
}: {
  state: WalletState;
  mode: OperationMode;
  initialSourceId?: string;
  onModeChange: (mode: OperationMode) => void;
  onPreview: (payload: Record<string, unknown>) => Promise<void>;
  onToast: (message: string, tone?: 'success' | 'error') => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Operations" />
      <div className="grid grid-cols-[minmax(0,900px)_280px] items-start gap-4 max-[1280px]:grid-cols-1">
        <div className={`min-w-0 ${mode === 'single' ? 'max-w-[900px]' : ''}`}>
          {mode === 'single' ? (
            <SingleTransferForm
              initialSourceId={initialSourceId}
              state={state}
              onPreview={onPreview}
              onToast={onToast}
            />
          ) : (
            <BatchOperationForm mode={mode} state={state} onPreview={onPreview} />
          )}
        </div>
        <div
          aria-label="Operation type"
          className="grid grid-cols-1 gap-1 rounded-[18px] border border-line-soft bg-surface p-1.5 max-[1280px]:grid-cols-4 max-[760px]:grid-cols-2"
          role="group"
        >
          <OperationModeTab
            active={mode === 'single'}
            description="One → one"
            icon={Send}
            label="Transfer"
            onClick={() => onModeChange('single')}
          />
          <OperationModeTab
            active={mode === 'distribute'}
            description="One → many"
            icon={ArrowUpRight}
            label="Distribute"
            onClick={() => onModeChange('distribute')}
          />
          <OperationModeTab
            active={mode === 'consolidate'}
            description="Many → one"
            icon={ArrowDownLeft}
            label="Collect"
            onClick={() => onModeChange('consolidate')}
          />
          <OperationModeTab
            active={mode === 'equalize'}
            description="Even group balance"
            icon={SlidersHorizontal}
            label="Equalize"
            onClick={() => onModeChange('equalize')}
          />
        </div>
      </div>
    </div>
  );
}

function ActivityPage({ state }: { state: WalletState }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [view, setView] = useState<'transactions' | 'errors' | 'all'>('transactions');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      setEntries(await api.activity());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => void load(true);
    const interval = window.setInterval(refresh, 7_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load]);

  const isTransactionEntry = useCallback(
    (entry: ActivityEntry) =>
      Boolean(entry.signature || entry.status) ||
      /transaction|transfer|confirmed|submitted/i.test(entry.title),
    [],
  );
  const counts = useMemo(
    () => ({
      transactions: entries.filter(isTransactionEntry).length,
      errors: entries.filter((entry) => entry.tone === 'error').length,
      all: entries.length,
    }),
    [entries, isTransactionEntry],
  );
  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const matchesView =
          view === 'all' ||
          (view === 'errors' ? entry.tone === 'error' : isTransactionEntry(entry));
        const normalizedQuery = query.trim().toLocaleLowerCase('en-US');
        const matchesQuery =
          !normalizedQuery ||
          [entry.title, entry.message, entry.signature, entry.error]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase('en-US').includes(normalizedQuery));
        return matchesView && matchesQuery;
      }),
    [entries, isTransactionEntry, query, view],
  );

  const explorerUrl = (signature: string) => {
    const cluster =
      state.network === 'Devnet'
        ? '?cluster=devnet'
        : state.network === 'Testnet'
          ? '?cluster=testnet'
          : '';
    return `https://solscan.io/tx/${signature}${cluster}`;
  };

  const copyEntry = async (entry: ActivityEntry) => {
    const text = [formatActivityTime(entry.timestamp), entry.title, entry.message, entry.signature]
      .filter(Boolean)
      .join(' · ');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 1_500);
    } catch {
      setError('Could not copy the entry to the clipboard.');
    }
  };

  const exportEntries = () => {
    const exportedEntries = filteredEntries.map(
      ({ id, timestamp, title, message, tone, status, occurrences, signature, error }) => ({
        id,
        timestamp,
        title,
        message,
        tone,
        status,
        occurrences,
        signature,
        error,
      }),
    );
    const blob = new Blob([JSON.stringify(exportedEntries, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sol-wallet-events-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Activity" />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      <div className="grid grid-cols-1 items-start gap-4 min-[1281px]:grid-cols-[minmax(0,1fr)_280px]">
        <Panel className="p-4 min-[1281px]:col-start-2 min-[1281px]:row-start-1">
          <div className="flex flex-wrap items-center gap-3 min-[1281px]:flex-col min-[1281px]:items-stretch">
            <label className="flex h-14 min-w-[240px] flex-1 items-center gap-2 rounded-[16px] border border-line bg-raised px-3 text-dim transition focus-within:border-primary/70 focus-within:text-copy min-[1281px]:w-full min-[1281px]:min-w-0">
              <Search aria-hidden="true" size={16} />
              <input
                aria-label="Search activity"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
                placeholder="Event, address, or signature…"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <button
                  aria-label="Clear search"
                  className="cursor-pointer border-0 bg-transparent p-0 text-faint hover:text-copy"
                  type="button"
                  onClick={() => setQuery('')}
                >
                  <X size={15} />
                </button>
              ) : null}
            </label>
            <div
              aria-label="Activity filter"
              className="inline-flex h-10 shrink-0 flex-wrap gap-1 rounded-[16px] border border-line-soft bg-surface p-1 min-[1281px]:h-auto min-[1281px]:w-full min-[1281px]:flex-col"
              role="group"
            >
              {(
                [
                  ['transactions', 'Transactions'],
                  ['errors', 'Errors'],
                  ['all', 'All events'],
                ] as const
              ).map(([value, label]) => (
                <button
                  className={`inline-flex h-full cursor-pointer items-center gap-3 rounded-[12px] border-0 px-4 text-sm font-bold transition min-[1281px]:h-10 min-[1281px]:justify-between ${view === value ? 'bg-primary text-surface' : 'bg-transparent text-dim hover:bg-raised hover:text-copy'}`}
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                >
                  <span>{label}</span>
                  <b
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${view === value ? 'bg-surface/20' : 'bg-soft text-faint'}`}
                  >
                    {counts[value]}
                  </b>
                </button>
              ))}
            </div>
            <Button
              aria-label="Export"
              className="h-11 min-[1281px]:w-full"
              compact
              disabled={!filteredEntries.length}
              icon={Download}
              onClick={exportEntries}
            >
              <span>Export</span>
            </Button>
          </div>
        </Panel>
        <div className="relative overflow-hidden rounded-[18px] border border-line-soft bg-surface min-[1281px]:col-start-1 min-[1281px]:row-start-1">
          {filteredEntries.length ? (
            <div>
              <div className="grid h-10 grid-cols-[52px_minmax(280px,1fr)_170px_84px] items-center gap-4 rounded-t-[10px] bg-muted/65 px-5 text-xs font-semibold tracking-[0.06em] text-faint uppercase max-[1180px]:grid-cols-[44px_minmax(240px,1fr)_140px_72px] max-[900px]:hidden">
                <span />
                <span>Event</span>
                <span>Date and time</span>
                <span />
              </div>
              {filteredEntries.map((entry) => {
                const expanded = expandedId === entry.id;
                return (
                  <article
                    className={`relative border-t border-line-soft px-5 transition hover:z-20 hover:bg-muted/40 ${
                      expanded ? 'bg-muted/20 pt-3 pb-4' : 'py-2'
                    }`}
                    key={entry.id}
                  >
                    <div className="grid min-h-14 grid-cols-[52px_minmax(280px,1fr)_170px_84px] items-center gap-4 max-[1180px]:grid-cols-[44px_minmax(240px,1fr)_140px_72px] max-[900px]:grid-cols-[36px_minmax(0,1fr)_auto] max-[900px]:gap-2">
                      <span
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-[16px] ${entry.tone === 'success' ? 'bg-primary/15 text-primary' : entry.tone === 'error' ? 'bg-danger/10 text-danger' : 'bg-soft text-dim'}`}
                      >
                        {entry.status === 'submitted' ? (
                          <LoaderCircle className="animate-spin" size={17} />
                        ) : entry.tone === 'success' ? (
                          <CheckCircle2 size={17} />
                        ) : entry.tone === 'error' ? (
                          <TriangleAlert size={17} />
                        ) : (
                          <Activity size={17} />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <strong className="truncate text-sm font-semibold text-copy">
                            {entry.title}
                          </strong>
                          {(entry.occurrences ?? 1) > 1 ? (
                            <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-[10px] font-semibold text-faint">
                              ×{entry.occurrences}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 mb-0 truncate text-xs leading-relaxed text-dim">
                          {entry.message}
                        </p>
                        <small className="mt-1 hidden text-xs text-faint max-[900px]:block">
                          {formatActivityTime(entry.timestamp)}
                        </small>
                      </div>
                      <time
                        className="text-sm whitespace-nowrap text-faint tabular-nums max-[900px]:hidden"
                        dateTime={entry.timestamp}
                      >
                        {formatActivityTime(entry.timestamp)}
                      </time>
                      <div className="flex items-center gap-1 justify-self-start">
                        {entry.signature ? (
                          <a
                            aria-label="Open transaction in Solscan"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-transparent text-faint transition hover:border-line hover:bg-muted hover:text-copy"
                            href={explorerUrl(entry.signature)}
                            rel="noreferrer"
                            target="_blank"
                            title="Open in Solscan"
                          >
                            <ExternalLink size={15} />
                          </a>
                        ) : null}
                        <button
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Hide details' : 'Show details'}
                          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[16px] border border-transparent bg-transparent text-faint transition hover:border-line hover:bg-muted hover:text-copy"
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : entry.id)}
                        >
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      </div>
                    </div>
                    {expanded ? (
                      <div className="mt-3 ml-[68px] rounded-[16px] border border-line-soft bg-app/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.015)] max-[900px]:ml-0">
                        <div className="mb-3 flex items-center justify-between gap-3 border-b border-line-soft pb-3">
                          <strong className="text-xs font-semibold text-copy">Event details</strong>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-faint">
                              {formatActivityTime(entry.timestamp)}
                            </span>
                            <Button
                              compact
                              icon={copiedId === entry.id ? Check : Copy}
                              onClick={() => void copyEntry(entry)}
                            >
                              {copiedId === entry.id ? 'Copied' : 'Copy'}
                            </Button>
                          </div>
                        </div>
                        <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-5 gap-y-3 text-xs leading-relaxed max-[540px]:grid-cols-1 max-[540px]:gap-y-1">
                          <dt className="font-medium text-faint">Message</dt>
                          <dd className="m-0 break-words text-copy">{entry.message}</dd>
                          {entry.status ? (
                            <>
                              <dt className="font-medium text-faint max-[540px]:mt-2">Status</dt>
                              <dd className="m-0 text-copy">
                                {transactionStatusLabel(entry.status)}
                              </dd>
                            </>
                          ) : null}
                          {entry.signature ? (
                            <>
                              <dt className="font-medium text-faint max-[540px]:mt-2">Signature</dt>
                              <dd className="m-0 font-mono break-all text-copy">
                                {entry.signature}
                              </dd>
                            </>
                          ) : null}
                          {entry.error ? (
                            <>
                              <dt className="font-medium text-faint max-[540px]:mt-2">Error</dt>
                              <dd className="m-0 break-words text-danger">{entry.error}</dd>
                            </>
                          ) : null}
                        </dl>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : loading ? (
            <div className="flex min-h-[240px] items-center justify-center gap-3 text-sm text-dim">
              <LoaderCircle className="animate-spin" size={24} /> Loading activity…
            </div>
          ) : (
            <EmptyState
              icon={Activity}
              text={
                entries.length
                  ? 'Change the filters or search query.'
                  : 'Submitted transactions and application events will appear here.'
              }
              title={entries.length ? 'Nothing found' : 'No activity yet'}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsPage({
  state,
  onReload,
  onImport,
  onToast,
}: {
  state: WalletState;
  onReload: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
  onToast: (message: string, tone?: 'success' | 'error') => void;
}) {
  const [rpcDraft, setRpcDraft] = useState(state.rpc_url);
  const [rpcPresetMode, setRpcPresetMode] = useState(
    rpcPresets.find((preset) => preset.url === state.rpc_url)?.id ?? 'custom',
  );
  const [rpcPending, setRpcPending] = useState<'test' | 'save' | null>(null);
  const [rpcResult, setRpcResult] = useState<{
    message: string;
    tone: 'success' | 'error' | 'neutral';
  } | null>(null);
  const [rpcVerifiedUrl, setRpcVerifiedUrl] = useState<string | null>(
    state.rpc_error ? null : state.rpc_url,
  );
  const [filePending, setFilePending] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const normalizedRpcDraft = rpcDraft.trim();
  const rpcHasChanges = normalizedRpcDraft !== state.rpc_url;
  const rpcStatus =
    rpcResult ??
    (rpcHasChanges
      ? { message: 'Test the connection before saving', tone: 'neutral' as const }
      : state.rpc_error
        ? { message: 'RPC unavailable', tone: 'error' as const }
        : {
            message: `${state.network}${state.rpc_latency_ms !== null ? ` · ${state.rpc_latency_ms} ms` : ''}`,
            tone: 'success' as const,
          });

  useEffect(() => {
    setRpcDraft(state.rpc_url);
    setRpcPresetMode(rpcPresets.find((preset) => preset.url === state.rpc_url)?.id ?? 'custom');
    setRpcVerifiedUrl(state.rpc_error ? null : state.rpc_url);
    setRpcResult(null);
  }, [state.rpc_error, state.rpc_url]);
  useEffect(() => {
    if (!fileMenuOpen) return;
    const closeFileMenu = (event: MouseEvent) => {
      if (!fileMenuRef.current?.contains(event.target as Node)) setFileMenuOpen(false);
    };
    document.addEventListener('mousedown', closeFileMenu);
    return () => document.removeEventListener('mousedown', closeFileMenu);
  }, [fileMenuOpen]);

  const testRpc = async () => {
    setRpcPending('test');
    setRpcResult(null);
    try {
      const result = await api.testRpc(normalizedRpcDraft);
      setRpcDraft(normalizedRpcDraft);
      setRpcVerifiedUrl(normalizedRpcDraft);
      setRpcResult({
        message: `${result.network} · ${result.latency_ms} ms · Solana ${result.version}`,
        tone: 'success',
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setRpcVerifiedUrl(null);
      setRpcResult({ message: 'Connection failed', tone: 'error' });
      onToast(message, 'error');
    } finally {
      setRpcPending(null);
    }
  };
  const saveRpc = async () => {
    setRpcPending('save');
    try {
      await api.saveRpc(normalizedRpcDraft);
      await onReload();
      onToast('RPC saved');
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : String(reason), 'error');
    } finally {
      setRpcPending(null);
    }
  };
  const selectFile = async (name: string) => {
    setFilePending(true);
    try {
      await api.selectWalletFile(name);
      await onReload();
      onToast(`${name} selected`);
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : String(reason), 'error');
    } finally {
      setFilePending(false);
    }
  };
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFilePending(true);
      try {
        await onImport(file);
      } finally {
        setFilePending(false);
      }
    }
    event.target.value = '';
  };
  const createFile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilePending(true);
    try {
      const result = await api.createWalletFile(newFileName);
      setNewFileOpen(false);
      setNewFileName('');
      await onReload();
      onToast(`${result.wallet_file} created`);
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : String(reason), 'error');
    } finally {
      setFilePending(false);
    }
  };
  const openWalletFolder = async () => {
    try {
      await window.desktopShell?.openWalletFolder();
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : String(reason), 'error');
    }
  };

  return (
    <div className="flex max-w-[1180px] flex-col gap-4">
      <PageHeader title="Settings" />
      <div className="grid grid-cols-2 items-start gap-3 max-[980px]:grid-cols-1">
        <Panel compact title="RPC connection">
          <div className="flex flex-col gap-3">
            <div
              className={`grid gap-3 max-[560px]:grid-cols-1 ${rpcPresetMode === 'custom' ? 'grid-cols-[140px_minmax(0,1fr)]' : 'grid-cols-1'}`}
            >
              <div
                className={`flex flex-col gap-1.5 text-sm font-semibold text-copy ${rpcPresetMode === 'custom' ? '' : 'max-w-[240px]'}`}
              >
                <span>Network</span>
                <AppSelect
                  ariaLabel="Select network"
                  options={[
                    ...rpcPresets.map((preset) => ({
                      value: preset.id,
                      label: preset.label,
                      description: new URL(preset.url).hostname,
                    })),
                    {
                      value: 'custom',
                      label: 'Custom',
                      description: 'Custom RPC endpoint',
                    },
                  ]}
                  value={rpcPresetMode}
                  onChange={(value) => {
                    const preset = rpcPresets.find((item) => item.id === value);
                    setRpcPresetMode(value);
                    if (preset) setRpcDraft(preset.url);
                    setRpcVerifiedUrl(null);
                    setRpcResult(null);
                  }}
                />
              </div>
              {rpcPresetMode === 'custom' ? (
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-copy">
                  HTTP(S) endpoint
                  <input
                    className="min-h-10 w-full rounded-[16px] border border-line bg-raised px-4 text-sm font-normal text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
                    spellCheck={false}
                    value={rpcDraft}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRpcDraft(value);
                      setRpcVerifiedUrl(null);
                      setRpcResult(null);
                    }}
                  />
                </label>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={`mr-auto inline-flex items-center gap-2 text-xs ${rpcStatus.tone === 'success' ? 'text-solana' : rpcStatus.tone === 'error' ? 'text-danger' : 'text-dim'}`}
              >
                <i
                  className={`h-2 w-2 rounded-full ${rpcStatus.tone === 'success' ? 'bg-solana' : rpcStatus.tone === 'error' ? 'bg-danger' : 'bg-faint'}`}
                />
                {rpcStatus.message}
              </div>
              <Button
                compact
                disabled={Boolean(rpcPending) || !normalizedRpcDraft}
                onClick={() => void testRpc()}
              >
                {rpcPending === 'test' ? 'Testing…' : 'Test'}
              </Button>
              <Button
                compact
                disabled={
                  Boolean(rpcPending) || !rpcHasChanges || rpcVerifiedUrl !== normalizedRpcDraft
                }
                tone="primary"
                variant="solid"
                onClick={() => void saveRpc()}
              >
                {rpcPending === 'save' ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel
          compact
          title="Wallet files"
          actions={
            <div className="relative" ref={fileMenuRef}>
              <input
                ref={fileRef}
                accept=".csv,text/csv"
                hidden
                type="file"
                onChange={(event) => void handleFile(event)}
              />
              <button
                aria-expanded={fileMenuOpen}
                aria-label="Manage files"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[16px] border border-line bg-raised text-faint transition hover:border-line-strong hover:bg-muted hover:text-copy"
                disabled={filePending}
                type="button"
                onClick={() => setFileMenuOpen((value) => !value)}
              >
                <EllipsisVertical size={18} />
              </button>
              {fileMenuOpen ? (
                <div className="absolute top-[calc(100%+6px)] right-0 z-40 w-[190px] rounded-[16px] border border-line bg-raised p-1.5 shadow-[0_16px_42px_rgba(0,0,0,0.38)]">
                  <button
                    className="flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-[12px] border-0 bg-transparent px-3 text-left text-sm font-bold text-copy transition hover:bg-muted"
                    type="button"
                    onClick={() => {
                      setFileMenuOpen(false);
                      setNewFileOpen(true);
                    }}
                  >
                    <FilePlus2 className="text-faint" size={16} />
                    Create file
                  </button>
                  <button
                    className="flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-[12px] border-0 bg-transparent px-3 text-left text-sm font-bold text-copy transition hover:bg-muted"
                    type="button"
                    onClick={() => {
                      setFileMenuOpen(false);
                      fileRef.current?.click();
                    }}
                  >
                    <Upload className="text-faint" size={16} />
                    Import CSV
                  </button>
                </div>
              ) : null}
            </div>
          }
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-copy">Active file</label>
            <AppSelect
              ariaLabel="Select active wallet file"
              disabled={filePending}
              options={state.wallet_files.map((name) => ({
                value: name,
                label: name,
                description: name === state.wallet_file ? 'Active file' : 'Wallet CSV',
              }))}
              value={state.wallet_file}
              onChange={(value) => void selectFile(value)}
            />
            <div className="mt-1 text-xs text-faint">{formatWalletCount(state.wallet_count)}</div>
            {window.desktopShell?.openWalletFolder ? (
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Button compact icon={FolderOpen} onClick={() => void openWalletFolder()}>
                  Open folder
                </Button>
              </div>
            ) : null}
            {state.warnings.length ? (
              <div className="mt-1.5 flex items-start gap-2 rounded-[16px] border border-danger/25 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger">
                <TriangleAlert className="mt-0.5 shrink-0" size={15} />
                <span>
                  {state.warnings[0]}
                  {state.warnings.length > 1 ? ` ${state.warnings.length - 1} more warnings.` : ''}
                </span>
              </div>
            ) : null}
            <div className="mt-1.5 flex items-start gap-2 rounded-[16px] border border-warning/25 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
              <TriangleAlert className="mt-0.5 shrink-0" size={15} />
              <span>
                The CSV contains private keys and is stored locally without encryption. Never share
                this file.
              </span>
            </div>
          </div>
        </Panel>
      </div>
      {newFileOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#121116]/75 p-6 backdrop-blur-[5px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !filePending) setNewFileOpen(false);
          }}
        >
          <section
            aria-labelledby="create-wallet-file-title"
            aria-modal="true"
            className="w-full max-w-[440px] rounded-[22px] border border-line bg-surface shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-[18px]">
              <div>
                <h2 className="m-0 text-[18px] font-bold text-ink" id="create-wallet-file-title">
                  Create wallet file
                </h2>
                <p className="mt-1.5 mb-0 text-xs text-dim">
                  The empty CSV will become active immediately
                </p>
              </div>
              <button
                aria-label="Close"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[16px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-ink"
                disabled={filePending}
                type="button"
                onClick={() => setNewFileOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form className="p-5" onSubmit={(event) => void createFile(event)}>
              <label
                className="mb-2 block text-sm font-semibold text-copy"
                htmlFor="new-wallet-file-name"
              >
                Name
              </label>
              <div className="flex min-h-12 items-center rounded-[16px] border border-line bg-raised transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <input
                  autoFocus
                  className="min-w-0 flex-1 border-0 bg-transparent px-4 text-sm text-ink outline-none placeholder:text-faint"
                  id="new-wallet-file-name"
                  maxLength={80}
                  placeholder="For example, trading"
                  spellCheck={false}
                  value={newFileName}
                  onChange={(event) => setNewFileName(event.target.value)}
                />
                <span className="pr-3.5 text-sm text-faint">.csv</span>
              </div>
              <div className="mt-5 flex justify-end gap-2 border-t border-line-soft pt-4">
                <Button disabled={filePending} type="button" onClick={() => setNewFileOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={filePending || !newFileName.trim()}
                  icon={filePending ? LoaderCircle : FilePlus2}
                  tone="primary"
                  type="submit"
                  variant="solid"
                >
                  {filePending ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function BottomNavItem({
  active,
  item: { id, label, icon: Icon },
  onNavigate,
}: {
  active: boolean;
  item: (typeof navItems)[number];
  onNavigate: (page: PageId) => void;
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={`liquid-nav-item group relative flex min-h-12 min-w-[58px] cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-[18px] border-0 px-4 text-left focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:outline-none max-[620px]:min-w-[48px] max-[620px]:px-3 ${active ? 'is-active text-primary' : 'text-dim hover:text-copy'}`}
      type="button"
      onClick={() => onNavigate(id)}
    >
      {active ? <span aria-hidden="true" className="liquid-nav-active" /> : null}
      <span className="liquid-nav-icon relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center">
        <Icon strokeWidth={active ? 2.35 : 1.9} size={20} />
      </span>
      <span className="liquid-nav-label relative z-10 text-[14px] font-bold whitespace-nowrap max-[880px]:hidden">
        {label}
      </span>
    </button>
  );
}

function BottomNav({
  activePage,
  onNavigate,
}: {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}) {
  return (
    <div className="pointer-events-none fixed right-0 bottom-0 left-0 z-[100] px-3 pb-[max(14px,env(safe-area-inset-bottom))]">
      <nav
        aria-label="Main navigation"
        className="liquid-glass-bar pointer-events-auto mx-auto flex w-fit max-w-full items-center gap-1 rounded-[30px] p-[7px]"
      >
        <button
          aria-label="NODAL home"
          className="liquid-brand group flex h-[52px] shrink-0 cursor-pointer items-center gap-3 rounded-[22px] border-0 bg-transparent pr-3 pl-1.5 text-left focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:outline-none max-[620px]:hidden"
          type="button"
          onClick={() => onNavigate('overview')}
        >
          <span className="brand-mark inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-primary/25 bg-surface/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_6px_16px_rgba(89,60,39,0.08)]">
            <img alt="" aria-hidden="true" className="h-8 w-8 object-contain" src={nodalLogoUrl} />
          </span>
          <span className="max-[1120px]:hidden">
            <strong className="block font-display text-[22px] leading-none font-extrabold tracking-[0.055em] text-primary">
              NODAL
            </strong>
          </span>
        </button>
        <span
          aria-hidden="true"
          className="mx-0.5 h-7 w-px shrink-0 bg-line-soft max-[620px]:hidden"
        />
        {primaryNavItems.map((item) => (
          <BottomNavItem
            active={activePage === item.id}
            item={item}
            key={item.id}
            onNavigate={onNavigate}
          />
        ))}
        <span aria-hidden="true" className="mx-0.5 h-7 w-px shrink-0 bg-line-soft" />
        <BottomNavItem
          active={activePage === settingsNavItem.id}
          item={settingsNavItem}
          onNavigate={onNavigate}
        />
      </nav>
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState<PageId>(getInitialPage);
  const [operationMode, setOperationMode] = useState<OperationMode>(getInitialOperationMode);
  const [transferSourceId, setTransferSourceId] = useState('');
  const [state, setState] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [sendResult, setSendResult] = useState<TransactionSendResult | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const navigate = useCallback((page: PageId) => {
    setActivePage(page);
    window.location.hash = page;
  }, []);
  const openOperation = useCallback(
    (mode: OperationMode) => {
      setOperationMode(mode);
      navigate('operations');
    },
    [navigate],
  );
  const startTransfer = useCallback(
    (walletId: string) => {
      setTransferSourceId(walletId);
      openOperation('single');
    },
    [openOperation],
  );

  useEffect(() => {
    const handleHash = () => {
      setActivePage(getInitialPage());
      const legacyPage = window.location.hash.replace('#', '');
      if (legacyPage === 'transfer') setOperationMode('single');
      if (legacyPage === 'batch') setOperationMode('distribute');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const loadState = useCallback(async (force = false) => {
    setLoading(true);
    setLoadError('');
    try {
      setState(await api.state(force));
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);
  useEffect(() => {
    const refresh = () => void loadState(false);
    const interval = window.setInterval(refresh, 15_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadState]);

  const createPreview = async (payload: Record<string, unknown>) => {
    try {
      setPreview(await api.preview(payload));
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : String(reason), 'error');
    }
  };

  const confirmSend = async () => {
    if (!preview) return;
    setSending(true);
    try {
      const result = await api.send(preview.preview_id);
      setPreview(null);
      setSendResult(result);
      if (result.ok) {
        showToast(
          `${result.submitted} ${result.submitted === 1 ? 'transaction' : 'transactions'} submitted`,
        );
      } else {
        showToast(
          result.submitted
            ? `Submitted ${result.submitted} of ${result.planned}. ${result.error ?? ''}`
            : (result.error ?? 'Operation failed'),
          'error',
        );
      }
      await loadState(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'preview_expired') {
        setPreview(null);
      }
      showToast(reason instanceof Error ? reason.message : String(reason), 'error');
    } finally {
      setSending(false);
    }
  };

  const copy = (value: string, message: string) => {
    void navigator.clipboard
      .writeText(value)
      .then(() => showToast(message))
      .catch(() => showToast('Could not copy', 'error'));
  };

  const importFile = async (file: File) => {
    try {
      const result = await api.importWalletFile(file);
      await loadState(true);
      showToast(`Wallets imported: ${result.wallet_count}`);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : String(reason), 'error');
    }
  };

  const content = state ? (
    activePage === 'overview' ? (
      <OverviewPage
        state={state}
        onNavigate={navigate}
        onOpenOperation={openOperation}
        onRetry={() => void loadState(true)}
        onTransfer={startTransfer}
      />
    ) : activePage === 'wallets' ? (
      <WalletsPage
        state={state}
        onCopy={copy}
        onImport={importFile}
        onReload={() => loadState(true)}
        onToast={showToast}
        onTransfer={startTransfer}
      />
    ) : activePage === 'operations' ? (
      <OperationsPage
        initialSourceId={transferSourceId}
        mode={operationMode}
        state={state}
        onModeChange={setOperationMode}
        onPreview={createPreview}
        onToast={showToast}
      />
    ) : activePage === 'activity' ? (
      <ActivityPage state={state} />
    ) : (
      <SettingsPage
        state={state}
        onImport={importFile}
        onReload={() => loadState(true)}
        onToast={showToast}
      />
    )
  ) : null;

  return (
    <div className="min-h-screen bg-app font-sans text-ink">
      <main className="min-w-0">
        {loadError && !state ? (
          <div className="mx-auto flex min-h-screen max-w-[560px] flex-col items-center justify-center px-6 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-[22px] bg-danger/10 text-danger">
              <TriangleAlert size={28} />
            </span>
            <h1 className="mt-4 text-[28px] font-bold tracking-[-0.03em] text-ink">
              Could not open NODAL
            </h1>
            <p className="mt-2 text-sm leading-5 text-dim">{loadError}</p>
            <Button
              className="mt-5"
              icon={RefreshCw}
              tone="primary"
              variant="solid"
              onClick={() => void loadState(true)}
            >
              Retry connection
            </Button>
            <code className="mt-4 rounded-[16px] bg-raised px-3 py-2 font-mono text-xs text-faint">
              pip install -r requirements.txt
            </code>
          </div>
        ) : loading && !state ? (
          <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-dim">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-primary/25 bg-primary/15 text-primary">
              <Sparkles size={25} />
            </span>
            <LoaderCircle className="animate-spin text-primary" size={24} />
            <p>Connecting to the local operations desk…</p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[1540px] px-[84px] pt-7 pb-32 max-[680px]:px-8 max-[680px]:pt-5 max-[680px]:pb-28">
            <div className="page-enter" key={activePage}>
              {content}
            </div>
          </div>
        )}
      </main>
      <BottomNav activePage={activePage} onNavigate={navigate} />
      {preview ? (
        <PreviewDialog
          preview={preview}
          sending={sending}
          onClose={() => setPreview(null)}
          onConfirm={() => void confirmSend()}
        />
      ) : null}
      {sendResult ? (
        <SendResultDialog
          result={sendResult}
          onActivity={() => {
            setSendResult(null);
            navigate('activity');
          }}
          onClose={() => setSendResult(null)}
          onRetry={(retryPreview) => {
            setSendResult(null);
            setPreview(retryPreview);
          }}
        />
      ) : null}
      {toast ? (
        <div
          aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
          className={`fixed right-6 bottom-24 z-[120] flex min-h-12 max-w-[420px] items-center gap-3 rounded-[16px] border bg-surface px-4 py-3 text-sm font-medium shadow-[0_18px_55px_rgba(0,0,0,0.35)] max-[680px]:right-3 max-[680px]:left-3 ${toast.tone === 'success' ? 'border-primary/30 text-copy' : 'border-danger/30 text-danger'}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span className={toast.tone === 'success' ? 'text-primary' : 'text-danger'}>
            {toast.tone === 'success' ? <CheckCircle2 size={19} /> : <TriangleAlert size={19} />}
          </span>
          {toast.message}
          <button
            className="ml-1 inline-flex cursor-pointer items-center border-0 bg-transparent p-1 text-faint hover:text-ink"
            aria-label="Close"
            type="button"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default App;
