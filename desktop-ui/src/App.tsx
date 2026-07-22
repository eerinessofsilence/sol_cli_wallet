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
  Gauge,
  LayoutDashboard,
  LoaderCircle,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
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
  { id: 'overview', label: 'Обзор', icon: LayoutDashboard },
  { id: 'wallets', label: 'Кошельки', icon: WalletCards },
  { id: 'operations', label: 'Операции', icon: SlidersHorizontal },
  { id: 'activity', label: 'Активность', icon: Activity },
  { id: 'settings', label: 'Настройки', icon: Settings },
];
const primaryNavItems = navItems.filter((item) => item.id !== 'settings');
const settingsNavItem = navItems.find((item) => item.id === 'settings')!;
const rpcPresets = [
  { id: 'mainnet', label: 'Mainnet', url: 'https://api.mainnet-beta.solana.com' },
  { id: 'devnet', label: 'Devnet', url: 'https://api.devnet.solana.com' },
  { id: 'testnet', label: 'Testnet', url: 'https://api.testnet.solana.com' },
] as const;
const estimatedTransferFee = 0.000005;

const pageIds = new Set(navItems.map((item) => item.id));
const solFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 9,
});
const compactSolFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});
const portfolioPercentFormatter = new Intl.NumberFormat('ru-RU', {
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
  return /^[0-9]+$/.test(value) ? `Кошелёк ${value}` : value;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatWalletCount(value: number) {
  const lastTwoDigits = value % 100;
  const lastDigit = value % 10;
  const noun =
    lastTwoDigits >= 11 && lastTwoDigits <= 14
      ? 'кошельков'
      : lastDigit === 1
        ? 'кошелёк'
        : lastDigit >= 2 && lastDigit <= 4
          ? 'кошелька'
          : 'кошельков';
  return `${value} ${noun}`;
}

function formatActivityTime(value: string) {
  if (!value) return 'Время не указано';
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat('ru-RU', {
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

function formatFileSize(value: number) {
  if (value < 1_024) return `${value} Б`;
  if (value < 1_024 ** 2)
    return `${(value / 1_024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} КБ`;
  return `${(value / 1_024 ** 2).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
}

function formatFileModifiedAt(value: string | null) {
  if (!value) return 'дата изменения неизвестна';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'дата изменения неизвестна';
  return `изменён ${new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)}`;
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
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-[9px] border text-[13px] font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${compact ? 'min-h-9 px-3' : 'min-h-10 px-3.5'} ${variant === 'solid' ? (tone === 'danger' ? 'border-danger bg-danger text-surface hover:brightness-105' : 'border-primary bg-primary text-surface hover:border-primary-strong hover:bg-primary-strong') : variant === 'ghost' ? 'border-transparent bg-transparent text-dim hover:bg-muted hover:text-ink' : tone === 'danger' ? 'border-danger/25 bg-danger/10 text-danger hover:border-danger/40' : 'border-line bg-raised text-copy hover:border-line-strong hover:bg-muted'} ${className}`}
      type="button"
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" size={17} /> : null}
      {children}
    </button>
  );
}

function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-6 max-[680px]:flex-col max-[680px]:items-stretch">
      <div>
        <h1 className="m-0 text-[28px] leading-tight font-bold tracking-[-0.035em] text-ink">
          {title}
        </h1>
        {description ? <p className="mt-2 mb-0 text-sm text-dim">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
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
      className={`rounded-[13px] border border-line-soft bg-surface ${compact ? 'p-4' : 'p-5'} ${className}`}
    >
      {title || actions ? (
        <div
          className={`${compact ? 'mb-3' : 'mb-4'} flex items-center justify-between gap-4 max-[680px]:flex-col max-[680px]:items-stretch`}
        >
          <div>
            {title ? <h2 className="m-0 text-[17px] font-bold text-ink">{title}</h2> : null}
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
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <article className="relative flex flex-col gap-4 overflow-hidden rounded-[13px] border border-line-soft bg-surface p-4 text-primary before:pointer-events-none before:absolute before:-top-17.5 before:-left-12.5 before:h-37.5 before:w-37.5 before:rounded-full before:bg-current before:opacity-[0.08] before:blur-[55px]">
      <div className="flex items-center gap-2.5 text-sm font-bold tracking-[-0.01em] text-copy">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary/15 text-primary">
          <Icon size={24} />
        </span>
        <span>{label}</span>
      </div>
      <strong className="z-10 overflow-hidden text-2xl leading-tight font-semibold tracking-[-0.035em] text-ellipsis whitespace-nowrap text-ink">
        {value}
      </strong>
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
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[11px] border border-dashed border-line bg-muted/45 p-[30px] text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Icon size={26} />
      </span>
      <h3 className="mt-3.5 mb-0 text-[15px] font-bold text-copy">{title}</h3>
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
  placeholder = 'Выбери кошелёк',
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
        className={`flex h-12 w-full cursor-pointer items-center gap-3 rounded-[10px] border bg-raised px-3.5 text-left transition focus-visible:ring-3 focus-visible:ring-primary/15 focus-visible:outline-none ${open ? 'border-primary ring-3 ring-primary/15' : 'border-line hover:border-line-strong'}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        {selectedWallet ? (
          detailed ? (
            <>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[13px] font-semibold text-copy">
                  {/^[0-9]+$/.test(selectedWallet.name)
                    ? `Кошелёк ${selectedWallet.name}`
                    : selectedWallet.name}
                </strong>
                <small className="mt-0.5 block truncate font-mono text-[11px] text-faint">
                  {selectedWallet.short_address}
                </small>
              </span>
              <span className="shrink-0 rounded-full bg-soft px-2.5 py-1 text-xs font-semibold text-dim tabular-nums max-[420px]:hidden">
                {formatSol(selectedWallet.balance, true)} SOL
              </span>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 overflow-hidden text-sm font-medium text-ellipsis whitespace-nowrap text-ink">
                {/^[0-9]+$/.test(selectedWallet.name)
                  ? `Кошелёк ${selectedWallet.name}`
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
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 max-h-[280px] overflow-y-auto rounded-[10px] border border-line bg-raised p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.38)]"
          role="listbox"
        >
          {available.length ? (
            available.map((wallet) => (
              <button
                aria-selected={wallet.id === value}
                className={`grid min-h-[52px] w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[7px] border-0 px-3 text-left transition ${wallet.id === value ? 'bg-primary/15' : 'bg-transparent hover:bg-muted'}`}
                key={wallet.id}
                role="option"
                type="button"
                onClick={() => {
                  onChange(wallet.id);
                  setOpen(false);
                }}
              >
                <span className="min-w-0">
                  <strong className="block overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap text-copy">
                    {/^[0-9]+$/.test(wallet.name) ? `Кошелёк ${wallet.name}` : wallet.name}
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
              Нет доступных кошельков
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
  placeholder = 'Выбери значение',
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
        className={`flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-[9px] border bg-raised px-3.5 text-left text-[13px] transition focus-visible:ring-2 focus-visible:ring-primary/15 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${
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
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 min-w-[220px] overflow-hidden rounded-[10px] border border-line bg-raised p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.38)]"
          role="listbox"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                aria-selected={selected}
                className={`flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-[7px] border-0 px-3 py-2 text-left transition ${
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
                  <strong className="block truncate text-[13px] font-semibold">
                    {option.label}
                  </strong>
                  {option.description ? (
                    <small className="mt-0.5 block truncate text-[11px] font-normal text-faint">
                      {option.description}
                    </small>
                  ) : null}
                </span>
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] ${
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
    <div className="overflow-hidden rounded-[10px] border border-line-soft bg-raised/30">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line-soft bg-raised px-3.5">
        <button
          className="flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left text-xs font-semibold text-dim transition hover:text-copy"
          type="button"
          onClick={() => onChange(allSelected ? [] : available.map((wallet) => wallet.id))}
        >
          <span
            className={`inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border transition ${allSelected ? 'border-primary bg-primary text-surface' : 'border-line bg-surface text-transparent'}`}
          >
            {allSelected ? <Check size={14} /> : null}
          </span>
          {allSelected ? 'Снять выбор' : 'Выбрать все'}
        </button>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-soft px-2.5 py-1 text-[11px] font-semibold text-dim">
            {selectedWallets.length} из {available.length}
          </span>
          <span className="text-[11px] font-medium text-faint tabular-nums max-[520px]:hidden">
            {formatSol(selectedBalance, true)} SOL выбрано
          </span>
        </div>
      </div>
      <div className="max-h-[352px] overflow-y-auto">
        {available.length ? (
          available.map((wallet) => {
            const checked = selected.includes(wallet.id);
            const walletName = /^[0-9]+$/.test(wallet.name)
              ? `Кошелёк ${wallet.name}`
              : wallet.name;
            return (
              <button
                aria-pressed={checked}
                key={wallet.id}
                className={`grid min-h-[60px] w-full cursor-pointer grid-cols-[18px_36px_minmax(0,1fr)_auto] items-center gap-2.5 border-0 border-t border-line-soft px-3.5 text-left transition first:border-t-0 ${checked ? 'bg-primary/10' : 'bg-surface hover:bg-muted/55'}`}
                type="button"
                onClick={() => toggle(wallet.id)}
              >
                <span
                  className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition ${checked ? 'border-primary bg-primary text-surface' : 'border-line bg-surface text-transparent'}`}
                >
                  {checked ? <Check size={14} /> : null}
                </span>
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-[9px] border text-xs font-bold transition ${
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
                  <small className="mt-0.5 block truncate font-mono text-[11px] text-faint">
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
            Нет доступных кошельков
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-danger/25 bg-danger/10 px-3 py-2.5 text-xs leading-relaxed text-danger">
      <TriangleAlert size={19} />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <Button compact tone="danger" onClick={onRetry}>
          Повторить
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
        className="max-h-[calc(100vh-48px)] w-full max-w-[760px] overflow-y-auto rounded-[15px] border border-line bg-surface shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-[18px]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary/15 text-primary">
              <ShieldCheck size={22} />
            </span>
            <div>
              <h2 className="m-0 text-[17px] font-bold text-ink" id="preview-title">
                Проверь перевод
              </h2>
              <p className="mt-1 mb-0 text-xs text-dim">
                {preview.network} · {preview.rpc_host}
              </p>
            </div>
          </div>
          <button
            aria-label="Закрыть"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
            disabled={sending}
            type="button"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 px-5 pt-[18px] max-[680px]:grid-cols-1">
          <div className="rounded-[10px] border border-line-soft bg-raised p-3">
            <span className="block text-xs text-faint">Получатели</span>
            <strong className="mt-1 block text-sm font-bold text-ink">
              {preview.transfer_count}
            </strong>
          </div>
          <div className="rounded-[10px] border border-line-soft bg-raised p-3">
            <span className="block text-xs text-faint">Сумма</span>
            <strong className="mt-1 block text-sm font-bold text-ink">
              {formatSol(preview.total_amount)} SOL
            </strong>
          </div>
          <div className="rounded-[10px] border border-line-soft bg-raised p-3">
            <span className="block text-xs text-faint">Комиссия ≈</span>
            <strong className="mt-1 block text-sm font-bold text-ink">
              {formatSol(preview.estimated_fee)} SOL
            </strong>
          </div>
        </div>

        {visibleWarnings.length ? (
          <div className="mx-5 mt-3 flex flex-col gap-2">
            {visibleWarnings.map((warning) => (
              <div
                className={`flex items-start gap-2.5 rounded-[9px] border px-3 py-2.5 text-xs leading-relaxed ${
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

        <div className="mx-5 mt-3 max-h-[280px] overflow-y-auto rounded-[10px] border border-line-soft">
          {preview.transfers.map((transfer, index) => (
            <div
              className="grid min-h-[82px] grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line-soft px-3 py-2.5 first:border-t-0 max-[620px]:grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)]"
              key={`${transfer.sender_id}-${transfer.recipient}-${index}`}
            >
              <div className="min-w-0">
                <span className="block text-[9px] font-semibold tracking-[0.06em] text-faint uppercase">
                  Отправитель
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
                <span className="block text-[9px] font-semibold tracking-[0.06em] text-faint uppercase">
                  Получатель
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

        <div className="mx-5 mt-3.5 flex items-center justify-between gap-3 rounded-[9px] bg-primary/15 px-3.5 py-3">
          <span className="text-xs text-dim">Итого спишется с комиссиями</span>
          <strong className="text-[13px] font-bold text-primary">
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
              ? 'Предпросмотр истёк. Вернись к форме и подготовь перевод ещё раз.'
              : `Транзакции необратимы. На подтверждение осталось ${remainingSeconds} сек.`}
          </span>
        </div>
        {preview.requires_acknowledgement ? (
          <label className="mx-5 mt-3 flex cursor-pointer items-start gap-3 rounded-[9px] border border-line bg-raised px-3.5 py-3 text-xs leading-relaxed text-copy">
            <input
              checked={acknowledged}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              type="checkbox"
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>Я сверил получателей, сеть и итоговую сумму операции.</span>
          </label>
        ) : null}
        <div className="mt-[18px] flex justify-end gap-2 border-t border-line-soft px-5 py-[15px]">
          <Button disabled={sending} onClick={onClose}>
            Вернуться
          </Button>
          <Button
            disabled={sending || !acknowledged || expired}
            icon={sending ? LoaderCircle : Send}
            tone="primary"
            variant="solid"
            onClick={onConfirm}
          >
            {sending ? 'Отправляем…' : expired ? 'Предпросмотр истёк' : 'Подтвердить и отправить'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function transactionStatusLabel(status: TransactionStatus) {
  if (status === 'submitted') return 'Отправлено в сеть';
  if (status === 'confirmed') return 'Подтверждено';
  if (status === 'finalized') return 'Финализировано';
  return 'Ошибка';
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
        className="max-h-[calc(100vh-48px)] w-full max-w-[760px] overflow-y-auto rounded-[15px] border border-line bg-surface shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-[18px]">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] ${
                result.ok ? 'bg-primary/15 text-primary' : 'bg-warning/10 text-warning'
              }`}
            >
              {result.ok ? <CheckCircle2 size={22} /> : <TriangleAlert size={22} />}
            </span>
            <div>
              <h2 className="m-0 text-[17px] font-bold text-ink" id="send-result-title">
                {result.ok ? 'Операция отправлена' : 'Операция выполнена частично'}
              </h2>
              <p className="mt-1 mb-0 text-xs text-dim">Статусы продолжат обновляться в журнале</p>
            </div>
          </div>
          <button
            aria-label="Закрыть результат"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-ink"
            type="button"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 px-5 pt-[18px] max-[680px]:grid-cols-1">
          <div className="rounded-[10px] border border-line-soft bg-raised p-3">
            <span className="block text-xs text-faint">Запланировано</span>
            <strong className="mt-1 block text-sm font-bold text-ink">{result.planned}</strong>
          </div>
          <div className="rounded-[10px] border border-primary/20 bg-primary/10 p-3">
            <span className="block text-xs text-dim">Отправлено</span>
            <strong className="mt-1 block text-sm font-bold text-primary">
              {result.submitted}
            </strong>
          </div>
          <div
            className={`rounded-[10px] border p-3 ${
              result.failed ? 'border-danger/20 bg-danger/10' : 'border-line-soft bg-raised'
            }`}
          >
            <span className="block text-xs text-faint">Ошибки</span>
            <strong
              className={`mt-1 block text-sm font-bold ${
                result.failed ? 'text-danger' : 'text-ink'
              }`}
            >
              {result.failed}
            </strong>
          </div>
        </div>

        <div className="mx-5 mt-3 max-h-[320px] overflow-y-auto rounded-[10px] border border-line-soft">
          {result.results.map((item, index) => (
            <div
              className="grid min-h-[66px] grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line-soft px-3 py-2 first:border-t-0"
              key={`${item.sender_id}-${item.recipient}-${index}`}
            >
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
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
                  className={`mt-1 block truncate text-[11px] ${
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
          <div className="mx-5 mt-3 flex items-start gap-2.5 rounded-[9px] border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-warning">
            <TriangleAlert className="mt-0.5 shrink-0" size={17} />
            <span>Неудачные переводы можно заново проверить и отправить отдельно.</span>
          </div>
        ) : null}

        <div className="mt-[18px] flex flex-wrap justify-end gap-2 border-t border-line-soft px-5 py-[15px]">
          {result.retry_preview ? (
            <Button icon={RotateCcw} tone="primary" onClick={() => onRetry(result.retry_preview!)}>
              Повторить неудачные
            </Button>
          ) : null}
          <Button onClick={onActivity}>Открыть журнал</Button>
          <Button tone="primary" variant="solid" onClick={onClose}>
            Готово
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
  onCopy,
  onOpenOperation,
}: {
  state: WalletState;
  onRetry: () => void;
  onNavigate: (page: PageId) => void;
  onCopy: (value: string, message: string) => void;
  onOpenOperation: (mode: OperationMode) => void;
}) {
  const topWallets = [...state.wallets].sort((a, b) => b.balance - a.balance).slice(0, 5);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Обзор" />
      {state.rpc_error ? <ErrorBanner message={state.rpc_error} onRetry={onRetry} /> : null}
      {state.pending_transaction_count ? (
        <button
          className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[10px] border border-primary/25 bg-primary/10 px-3.5 text-left text-xs text-copy transition hover:border-primary/40 hover:bg-primary/15"
          type="button"
          onClick={() => onNavigate('activity')}
        >
          <LoaderCircle className="shrink-0 animate-spin text-primary" size={18} />
          <span className="flex-1">
            В обработке транзакций: <b>{state.pending_transaction_count}</b>. Статусы обновляются
            автоматически.
          </span>
          <ChevronRight className="shrink-0 text-primary" size={17} />
        </button>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)] gap-4 max-[1180px]:grid-cols-1">
        <div className="col-start-1 row-start-1 grid grid-cols-3 gap-3.5 max-[680px]:grid-cols-1">
          <MetricCard
            icon={CircleDollarSign}
            label="Портфель"
            value={`${formatSol(state.total_balance, true)} SOL`}
          />
          <MetricCard icon={WalletCards} label="Кошельки" value={String(state.wallet_count)} />
          <MetricCard
            icon={Gauge}
            label="Отклик RPC"
            value={state.rpc_latency_ms === null ? '—' : `${state.rpc_latency_ms} мс`}
          />
        </div>

        <Panel
          className="col-start-1 row-start-2 max-[1180px]:row-start-3"
          title="Распределение портфеля"
          subtitle="Топ-5 кошельков по балансу"
          actions={
            <Button compact onClick={() => onNavigate('wallets')}>
              Все кошельки <ChevronRight size={16} />
            </Button>
          }
        >
          {topWallets.length ? (
            <div className="flex flex-col">
              {topWallets.map((wallet, index) => {
                const portfolioShare =
                  state.total_balance > 0 ? (wallet.balance / state.total_balance) * 100 : 0;
                return (
                  <div
                    className="grid min-h-12 cursor-pointer grid-cols-[minmax(190px,0.9fr)_minmax(300px,1.5fr)] items-center gap-3 border-t border-line-soft px-1 transition first:border-t-0 hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-2 focus-visible:outline-primary/50 max-[680px]:grid-cols-1 max-[680px]:gap-y-1.5 max-[680px]:py-2"
                    key={wallet.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onNavigate('wallets')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') onNavigate('wallets');
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-6 shrink-0 font-mono text-xs font-semibold text-faint tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <strong className="block overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap text-copy">
                          {/^[0-9]+$/.test(wallet.name) ? `Кошелёк ${wallet.name}` : wallet.name}
                        </strong>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1">
                          <small className="block overflow-hidden font-mono text-xs text-ellipsis whitespace-nowrap text-faint">
                            {wallet.short_address}
                          </small>
                          <button
                            aria-label="Копировать адрес"
                            className="inline-flex shrink-0 cursor-pointer items-center border-0 bg-transparent p-1 text-faint transition hover:text-primary"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onCopy(wallet.pubkey, 'Адрес скопирован');
                            }}
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="w-12 shrink-0 text-right text-xs font-semibold text-dim tabular-nums">
                        {portfolioPercentFormatter.format(portfolioShare)}%
                      </span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-soft">
                        <i
                          className="block h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{ width: `${Math.min(100, portfolioShare)}%` }}
                        />
                      </div>
                      <b className="min-w-[98px] text-right text-[13px] font-bold whitespace-nowrap text-ink tabular-nums">
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
                  Добавить CSV
                </Button>
              }
              icon={WalletCards}
              text="Импортируй CSV с колонками name, pubkey и privkey."
              title="Кошельков пока нет"
            />
          )}
        </Panel>

        <div className="col-start-2 row-span-2 row-start-1 flex flex-col gap-4 self-start max-[1180px]:col-start-1 max-[1180px]:row-start-2">
          <div
            className={`flex min-h-[72px] w-full items-center gap-3 rounded-[13px] border bg-surface p-4 ${state.rpc_error ? 'border-danger/25' : 'border-line-soft'}`}
          >
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${state.rpc_error ? 'bg-danger/10 text-danger' : 'bg-primary/15 text-primary'}`}
            >
              <Network size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block text-[15px] font-bold text-copy">{state.network}</strong>
              <small className="mt-1 block overflow-hidden text-[13px] text-ellipsis whitespace-nowrap text-faint">
                {state.rpc_error ? 'RPC недоступен' : state.rpc_host}
              </small>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span
                aria-label={
                  state.rpc_error
                    ? 'Сеть недоступна'
                    : state.rpc_latency_ms === null
                      ? 'Проверяем состояние сети'
                      : 'Сеть доступна'
                }
                className={`h-2.5 w-2.5 rounded-full ${state.rpc_error ? 'bg-danger shadow-[0_0_0_5px_rgba(255,127,111,0.12)]' : state.rpc_latency_ms === null ? 'bg-warning shadow-[0_0_0_5px_rgba(240,191,99,0.12)]' : 'bg-emerald-400 shadow-[0_0_0_5px_rgba(52,211,153,0.12)]'}`}
                role="status"
                title={
                  state.rpc_error
                    ? 'Сеть недоступна'
                    : state.rpc_latency_ms === null
                      ? 'Проверяем состояние сети'
                      : 'Сеть доступна'
                }
              />
              <button
                aria-label="Изменить сеть"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border border-line bg-raised text-faint transition hover:border-line-strong hover:bg-muted hover:text-primary"
                title="Изменить сеть"
                type="button"
                onClick={() => onNavigate('settings')}
              >
                <Pencil size={16} />
              </button>
            </div>
          </div>

          <Panel title="Быстрые действия">
            <div className="flex flex-col gap-2">
              <button
                className="flex min-h-[58px] w-full cursor-pointer items-center gap-3 rounded-[10px] border border-line-soft bg-raised p-2.5 text-left transition hover:-translate-y-px hover:border-line-strong hover:bg-muted"
                type="button"
                onClick={() => onOpenOperation('single')}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-primary/15 text-primary">
                  <Send size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-[13px] font-semibold text-copy">
                    Перевести SOL
                  </strong>
                  <small className="mt-0.5 block text-xs text-faint">Один получатель</small>
                </div>
                <ChevronRight className="text-faint" size={18} />
              </button>
              <button
                className="flex min-h-[58px] w-full cursor-pointer items-center gap-3 rounded-[10px] border border-line-soft bg-raised p-2.5 text-left transition hover:-translate-y-px hover:border-line-strong hover:bg-muted"
                type="button"
                onClick={() => onOpenOperation('distribute')}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-primary/15 text-primary">
                  <Zap size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-[13px] font-semibold text-copy">
                    Массовые операции
                  </strong>
                  <small className="mt-0.5 block text-xs text-faint">
                    Раздать, собрать, выровнять
                  </small>
                </div>
                <ChevronRight className="text-faint" size={18} />
              </button>
              <button
                className="flex min-h-[58px] w-full cursor-pointer items-center gap-3 rounded-[10px] border border-line-soft bg-raised p-2.5 text-left transition hover:-translate-y-px hover:border-line-strong hover:bg-muted"
                type="button"
                onClick={() => onNavigate('settings')}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-primary/15 text-primary">
                  <Network size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-[13px] font-semibold text-copy">
                    Настроить RPC
                  </strong>
                  <small className="mt-0.5 block overflow-hidden text-xs text-ellipsis whitespace-nowrap text-faint">
                    {state.rpc_host}
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
  type SortKey = 'number' | 'name' | 'pubkey' | 'balance';

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'number',
    direction: 'asc',
  });
  const [addingWallet, setAddingWallet] = useState(false);
  const [editingWallet, setEditingWallet] = useState<WalletRow | null>(null);
  const [deletingWallet, setDeletingWallet] = useState<WalletRow | null>(null);
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

      if (sort.key === 'number') comparison = left.index - right.index;
      if (sort.key === 'name') {
        comparison = left.wallet.name.localeCompare(right.wallet.name, 'ru', {
          numeric: true,
          sensitivity: 'base',
        });
      }
      if (sort.key === 'pubkey') comparison = left.wallet.pubkey.localeCompare(right.wallet.pubkey);
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
        aria-label={`Сортировать по полю «${label}»`}
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
      onToast('Кошелёк добавлен');
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
      onToast('Название кошелька изменено');
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
      onToast('Кошелёк удалён');
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : String(reason), 'error');
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Кошельки" />
      <Panel className="p-0">
        <div className="flex items-center justify-between gap-4 p-[18px] max-[680px]:flex-col max-[680px]:items-stretch">
          <label className="relative block w-full max-w-[280px] max-[680px]:max-w-none">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
              size={17}
            />
            <input
              className="h-10 w-full rounded-[9px] border border-line bg-raised py-2.5 pr-3.5 pl-10 text-[13px] text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Поиск по имени или адресу"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 max-[680px]:grid max-[680px]:grid-cols-2">
            <input ref={inputRef} accept=".csv,text/csv" hidden type="file" onChange={handleFile} />
            <Button
              className="h-10"
              icon={Plus}
              tone="primary"
              variant="solid"
              onClick={() => setAddingWallet(true)}
            >
              Добавить
            </Button>
            <Button className="h-10" icon={Upload} onClick={() => inputRef.current?.click()}>
              Импорт CSV
            </Button>
          </div>
        </div>
        {filtered.length ? (
          <div className="relative mx-[18px] mb-[18px] rounded-[11px] border border-line-soft">
            <div className="grid h-10 grid-cols-[52px_minmax(140px,0.45fr)_minmax(420px,2fr)_190px_132px] items-center gap-4 rounded-t-[10px] bg-muted/65 px-5 text-xs font-semibold tracking-[0.06em] text-faint uppercase max-[1180px]:grid-cols-[44px_minmax(120px,0.45fr)_minmax(300px,1.55fr)_150px_40px] max-[680px]:hidden">
              {sortHeader('number', '№')}
              {sortHeader('name', 'Название')}
              {sortHeader('pubkey', 'Публичный адрес')}
              {sortHeader('balance', 'Баланс')}
              <span className="max-[1180px]:sr-only">Действие</span>
            </div>
            {filtered.map((wallet) => {
              const walletNumber = state.wallets.findIndex((item) => item.id === wallet.id) + 1;
              return (
                <div
                  className="relative grid min-h-[72px] grid-cols-[52px_minmax(140px,0.45fr)_minmax(420px,2fr)_190px_132px] items-center gap-4 border-t border-line-soft px-5 transition hover:z-20 hover:bg-muted/40 max-[1180px]:grid-cols-[44px_minmax(120px,0.45fr)_minmax(300px,1.55fr)_150px_40px] max-[680px]:grid-cols-[36px_minmax(0,1fr)_auto] max-[680px]:gap-2 max-[680px]:py-3"
                  key={wallet.id}
                >
                  <span className="text-sm font-semibold text-faint tabular-nums">
                    {String(walletNumber).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <strong className="block overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap text-copy">
                      {/^[0-9]+$/.test(wallet.name) ? `Кошелёк ${wallet.name}` : wallet.name}
                    </strong>
                  </div>
                  <button
                    className="flex min-w-0 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-copy hover:text-primary max-[680px]:col-span-full max-[680px]:row-start-2"
                    title={wallet.pubkey}
                    type="button"
                    onClick={() => onCopy(wallet.pubkey, 'Адрес скопирован')}
                  >
                    <code className="overflow-hidden font-mono text-[15px] font-medium text-ellipsis whitespace-nowrap">
                      {wallet.pubkey}
                    </code>
                    <Copy className="shrink-0 text-faint" size={16} />
                  </button>
                  <div className="flex items-baseline justify-start gap-1.5 tabular-nums max-[680px]:col-start-3 max-[680px]:row-start-1">
                    <strong className="text-sm font-bold text-ink">
                      {formatSol(wallet.balance)}
                    </strong>
                    <small className="text-xs text-faint">SOL</small>
                  </div>
                  <div className="group/actions relative justify-self-start max-[680px]:hidden">
                    <button
                      aria-label={`Действия с кошельком ${wallet.name}`}
                      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border border-transparent bg-transparent text-faint transition hover:border-line hover:bg-muted hover:text-ink focus:border-line focus:bg-muted focus:text-ink"
                      type="button"
                    >
                      <EllipsisVertical size={19} />
                    </button>
                    <div className="pointer-events-none invisible absolute top-0 right-full z-40 mr-2 w-[160px] rounded-[10px] border border-line bg-raised p-1.5 opacity-0 shadow-[0_16px_42px_rgba(0,0,0,0.38)] transition group-focus-within/actions:pointer-events-auto group-focus-within/actions:visible group-focus-within/actions:opacity-100 group-hover/actions:pointer-events-auto group-hover/actions:visible group-hover/actions:opacity-100">
                      <button
                        className="flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-[7px] border-0 bg-transparent px-2.5 text-left text-[13px] font-medium text-copy transition hover:bg-muted"
                        type="button"
                        onClick={() => onTransfer(wallet.id)}
                      >
                        <ArrowUpRight className="text-faint" size={16} />
                        Перевести
                      </button>
                      <button
                        className="flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-[7px] border-0 bg-transparent px-2.5 text-left text-[13px] font-medium text-copy transition hover:bg-muted"
                        type="button"
                        onClick={() => {
                          setEditingWallet(wallet);
                          setEditName(wallet.name);
                        }}
                      >
                        <Pencil className="text-faint" size={16} />
                        Изменить
                      </button>
                      <button
                        className="flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-[7px] border-0 bg-transparent px-2.5 text-left text-[13px] font-medium text-danger transition hover:bg-danger/10"
                        type="button"
                        onClick={() => setDeletingWallet(wallet)}
                      >
                        <Trash2 size={16} />
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Search}
            text={
              state.wallets.length
                ? 'Попробуй изменить поисковый запрос.'
                : 'Импортируй CSV, чтобы начать работу.'
            }
            title={state.wallets.length ? 'Ничего не найдено' : 'Список пуст'}
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
            className="w-full max-w-[480px] rounded-[15px] border border-line bg-surface shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-[18px]">
              <div>
                <h2 className="m-0 text-[17px] font-bold text-ink" id="add-wallet-title">
                  Добавить кошелёк
                </h2>
                <p className="mt-1.5 mb-0 text-xs text-dim">
                  Публичный адрес будет вычислен автоматически
                </p>
              </div>
              <button
                aria-label="Закрыть"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-ink"
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
                  className="mb-2 block text-[13px] font-semibold text-copy"
                  htmlFor="new-wallet-name"
                >
                  Название
                </label>
                <input
                  autoFocus
                  className="min-h-12 w-full rounded-[9px] border border-line bg-raised px-3.5 text-sm text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
                  id="new-wallet-name"
                  maxLength={80}
                  placeholder="Например, Основной"
                  value={addName}
                  onChange={(event) => setAddName(event.target.value)}
                />
              </div>
              <div>
                <label
                  className="mb-2 block text-[13px] font-semibold text-copy"
                  htmlFor="new-wallet-key"
                >
                  Приватный ключ
                </label>
                <input
                  autoComplete="new-password"
                  className="min-h-12 w-full rounded-[9px] border border-line bg-raised px-3.5 font-mono text-[13px] text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
                  id="new-wallet-key"
                  placeholder="Base58 или JSON-массив"
                  spellCheck={false}
                  type="password"
                  value={addPrivateKey}
                  onChange={(event) => setAddPrivateKey(event.target.value)}
                />
              </div>
              <div className="mt-1 flex justify-end gap-2 border-t border-line-soft pt-4">
                <Button disabled={actionPending} type="button" onClick={closeAddWallet}>
                  Отмена
                </Button>
                <Button
                  disabled={actionPending || !addName.trim() || !addPrivateKey.trim()}
                  icon={actionPending ? LoaderCircle : Plus}
                  tone="primary"
                  type="submit"
                  variant="solid"
                >
                  {actionPending ? 'Добавляем…' : 'Добавить'}
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
            className="w-full max-w-[460px] rounded-[15px] border border-line bg-surface shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-[18px]">
              <div>
                <h2 className="m-0 text-[17px] font-bold text-ink" id="edit-wallet-title">
                  Изменить кошелёк
                </h2>
                <p className="mt-1.5 mb-0 text-xs text-dim">Публичный адрес останется прежним</p>
              </div>
              <button
                aria-label="Закрыть"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-ink"
                disabled={actionPending}
                type="button"
                onClick={() => setEditingWallet(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form className="p-5" onSubmit={(event) => void saveWallet(event)}>
              <label
                className="mb-2 block text-[13px] font-semibold text-copy"
                htmlFor="wallet-name"
              >
                Название
              </label>
              <input
                autoFocus
                className="min-h-12 w-full rounded-[9px] border border-line bg-raised px-3.5 text-sm text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
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
                  Отмена
                </Button>
                <Button
                  disabled={actionPending || !editName.trim()}
                  icon={actionPending ? LoaderCircle : Check}
                  tone="primary"
                  type="submit"
                  variant="solid"
                >
                  {actionPending ? 'Сохраняем…' : 'Сохранить'}
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
            className="w-full max-w-[460px] rounded-[15px] border border-line bg-surface p-5 shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
            role="dialog"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-danger/10 text-danger">
              <Trash2 size={21} />
            </span>
            <h2 className="mt-4 mb-0 text-[17px] font-bold text-ink" id="delete-wallet-title">
              Удалить {deletingWallet.name}?
            </h2>
            <p className="mt-2 mb-0 text-[13px] leading-5 text-dim">
              Запись будет удалена из файла {state.wallet_file}. Отменить это действие из приложения
              не получится.
            </p>
            <div className="mt-5 flex justify-end gap-2 border-t border-line-soft pt-4">
              <Button disabled={actionPending} onClick={() => setDeletingWallet(null)}>
                Отмена
              </Button>
              <Button
                disabled={actionPending}
                icon={actionPending ? LoaderCircle : Trash2}
                tone="danger"
                variant="solid"
                onClick={() => void deleteWallet()}
              >
                {actionPending ? 'Удаляем…' : 'Удалить'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function TransferFieldLabel({ label }: { label: string }) {
  return <span className="text-[13px] font-bold text-copy">{label}</span>;
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
    ? 'Выбери отправителя'
    : recipientMissing
      ? 'Выбери получателя'
      : amountInvalid
        ? 'Укажи сумму'
        : amountExceedsBalance
          ? 'Сумма превышает доступный баланс с учётом комиссии'
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
        text="Добавь CSV-файл в настройках, прежде чем отправлять SOL."
        title="Нет кошельков для отправки"
      />
    );
  }

  return (
    <div className="w-full">
      <Panel
        className="p-5"
        title="Новый перевод"
        subtitle="Заполни детали — отправка произойдёт только после подтверждения"
      >
        <form className="flex flex-col gap-3.5" onSubmit={submit}>
          <div className="flex flex-col gap-2.5">
            <TransferFieldLabel label="Откуда" />
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

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3 max-[520px]:flex-col max-[520px]:items-stretch">
              <TransferFieldLabel label="Куда" />
              <div className="inline-flex shrink-0 rounded-[9px] border border-line bg-raised p-0.5 max-[520px]:w-full">
                <button
                  aria-pressed={recipientType === 'wallet'}
                  className={`inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border-0 px-3 text-xs font-semibold transition max-[520px]:flex-1 ${recipientType === 'wallet' ? 'bg-primary text-surface' : 'bg-transparent text-dim hover:text-copy'}`}
                  type="button"
                  onClick={() => setRecipientType('wallet')}
                >
                  <WalletCards size={14} />
                  Мой кошелёк
                </button>
                <button
                  aria-pressed={recipientType === 'address'}
                  className={`inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border-0 px-3 text-xs font-semibold transition max-[520px]:flex-1 ${recipientType === 'address' ? 'bg-primary text-surface' : 'bg-transparent text-dim hover:text-copy'}`}
                  type="button"
                  onClick={() => setRecipientType('address')}
                >
                  <AtSign size={14} />
                  По адресу
                </button>
              </div>
            </div>
            {recipientType === 'wallet' ? (
              <WalletSelect
                detailed
                excludeIds={[sourceId]}
                placeholder="Выбери получателя"
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
                  className="h-12 w-full rounded-[10px] border border-line bg-raised pr-12 pl-12 font-mono text-sm text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-3 focus:ring-primary/15"
                  autoComplete="off"
                  placeholder="Solana address"
                  spellCheck={false}
                  value={recipientAddress}
                  onChange={(event) => setRecipientAddress(event.target.value.trim())}
                />
                <button
                  aria-label="Вставить адрес"
                  className="absolute top-1/2 right-2.5 inline-flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-primary"
                  title="Вставить адрес"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      .readText()
                      .then((text) => setRecipientAddress(text.trim()))
                      .catch(() => onToast('Не удалось прочитать буфер обмена', 'error'));
                  }}
                >
                  <ClipboardPaste size={17} />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <TransferFieldLabel label="Сумма" />
              <button
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line-soft bg-raised px-2.5 py-1 text-[11px] font-medium text-faint transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                title="Подставить максимальную доступную сумму"
                type="button"
                onClick={() => applyPreset(100)}
              >
                Доступно{' '}
                <b className="font-semibold text-dim">{formatSol(source?.balance ?? 0)} SOL</b>
              </button>
            </div>
            <div className="relative">
              <input
                className="h-12 w-full rounded-[10px] border border-line bg-raised px-4 pr-24 text-[22px] leading-none font-semibold text-ink tabular-nums transition outline-none placeholder:text-faint focus:border-primary focus:ring-3 focus:ring-primary/15"
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
                className={`min-h-8 cursor-pointer rounded-full border px-3 text-xs font-semibold transition ${selectedPreset === 25 ? 'border-primary/40 bg-primary/15 text-primary' : 'border-line bg-raised text-dim hover:border-line-strong hover:text-copy'}`}
                type="button"
                onClick={() => applyPreset(25)}
              >
                25%
              </button>
              <button
                className={`min-h-8 cursor-pointer rounded-full border px-3 text-xs font-semibold transition ${selectedPreset === 50 ? 'border-primary/40 bg-primary/15 text-primary' : 'border-line bg-raised text-dim hover:border-line-strong hover:text-copy'}`}
                type="button"
                onClick={() => applyPreset(50)}
              >
                50%
              </button>
              <button
                className={`min-h-8 cursor-pointer rounded-full border px-3 text-xs font-semibold transition ${selectedPreset === 75 ? 'border-primary/40 bg-primary/15 text-primary' : 'border-line bg-raised text-dim hover:border-line-strong hover:text-copy'}`}
                type="button"
                onClick={() => applyPreset(75)}
              >
                75%
              </button>
              <button
                className={`min-h-8 cursor-pointer rounded-full border px-3 text-xs font-semibold transition ${selectedPreset === 100 ? 'border-primary/40 bg-primary/15 text-primary' : 'border-line bg-raised text-dim hover:border-line-strong hover:text-copy'}`}
                type="button"
                onClick={() => applyPreset(100)}
              >
                Максимум
              </button>
            </div>
          </div>
          {!amountInvalid ? (
            <div className="grid grid-cols-3 overflow-hidden rounded-[10px] border border-line-soft bg-app/40 max-[520px]:grid-cols-1">
              <div className="px-3 py-2.5 max-[520px]:flex max-[520px]:items-center max-[520px]:justify-between">
                <span className="block text-[10px] font-semibold tracking-[0.05em] text-faint uppercase">
                  Сумма
                </span>
                <strong className="mt-1 block text-xs font-semibold text-copy max-[520px]:mt-0">
                  {formatSol(amountNumber)} SOL
                </strong>
              </div>
              <div className="border-x border-line-soft px-3 py-2.5 max-[520px]:flex max-[520px]:items-center max-[520px]:justify-between max-[520px]:border-x-0 max-[520px]:border-y">
                <span className="block text-[10px] font-semibold tracking-[0.05em] text-faint uppercase">
                  Комиссия ≈
                </span>
                <strong className="mt-1 block text-xs font-semibold text-copy max-[520px]:mt-0">
                  {formatSol(estimatedTransferFee)} SOL
                </strong>
              </div>
              <div className="px-3 py-2.5 max-[520px]:flex max-[520px]:items-center max-[520px]:justify-between">
                <span className="block text-[10px] font-semibold tracking-[0.05em] text-faint uppercase">
                  Спишется ≈
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
              {pending ? 'Проверяем…' : 'Проверить перевод'}
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
      ? 'Выбери минимум два кошелька'
      : selectedIds.length === 0
        ? mode === 'distribute'
          ? 'Выбери получателей'
          : 'Выбери кошельки-источники'
        : mode === 'distribute' && !sourceId
          ? 'Выбери кошелёк-отправитель'
          : mode === 'consolidate' && !recipientId
            ? 'Выбери кошелёк-получатель'
            : mode !== 'equalize' && !amountValid
              ? mode === 'consolidate' && amountIsPercent && amountNumber > 100
                ? 'Процент должен быть от 0 до 100'
                : 'Укажи корректную сумму'
              : mode === 'distribute' && sourceWallet && estimatedDebit > sourceWallet.balance
                ? 'На кошельке недостаточно SOL с учётом комиссий'
                : '';
  const ctaLabel =
    mode === 'distribute'
      ? 'Проверить рассылку'
      : mode === 'consolidate'
        ? 'Проверить сбор'
        : 'Проверить выравнивание';
  const showSummary = selectedIds.length > 0 && (mode === 'equalize' || amountValid);
  const summaryItems =
    mode === 'distribute'
      ? [
          { label: 'Получателей', value: String(selectedIds.length) },
          { label: 'Комиссия ≈', value: `${formatSol(estimatedFee)} SOL` },
          { label: 'Всего спишется ≈', value: `${formatSol(estimatedDebit)} SOL` },
        ]
      : mode === 'consolidate'
        ? [
            { label: 'Источников', value: String(selectedIds.length) },
            { label: 'Комиссия ≈', value: `${formatSol(estimatedFee)} SOL` },
            { label: 'Получит ≈', value: `${formatSol(estimatedAmount)} SOL` },
          ]
        : [
            { label: 'Участников', value: String(selectedIds.length) },
            { label: 'Общий баланс', value: `${formatSol(selectedBalance)} SOL` },
            { label: 'Цель на кошелёк ≈', value: `${formatSol(equalizedShare)} SOL` },
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
            ? 'Новая рассылка'
            : mode === 'consolidate'
              ? 'Новый сбор'
              : 'Выравнивание группы'
        }
        subtitle={
          mode === 'distribute'
            ? 'Одна сумма — сразу нескольким получателям'
            : mode === 'consolidate'
              ? 'Собери средства с выбранных кошельков в один'
              : 'Баланс выбранной группы будет распределён поровну'
        }
      >
        {mode === 'distribute' ? (
          <div className="flex flex-col gap-4">
            <div>
              <TransferFieldLabel label="Отправитель" />
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
              <TransferFieldLabel label="Сумма на каждого" />
              <div className="relative mt-2">
                <input
                  className="h-12 w-full rounded-[10px] border border-line bg-raised px-4 pr-20 text-[22px] leading-none font-semibold text-ink tabular-nums transition outline-none placeholder:text-faint focus:border-primary focus:ring-3 focus:ring-primary/15"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[20px] leading-none font-semibold text-faint">
                  SOL
                </span>
              </div>
              <p className="mt-2 mb-0 text-[11px] leading-relaxed text-faint">
                Эта сумма будет отправлена каждому выбранному получателю
              </p>
            </div>
          </div>
        ) : null}
        {mode === 'consolidate' ? (
          <div className="flex flex-col gap-4">
            <div>
              <TransferFieldLabel label="Получатель" />
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
                <TransferFieldLabel label="Сумма с каждого" />
                <span className="rounded-full bg-soft px-2.5 py-1 text-[11px] font-medium text-faint max-[420px]:hidden">
                  Можно указать SOL или %
                </span>
              </div>
              <div className="relative mt-2">
                <input
                  className="h-12 w-full rounded-[10px] border border-line bg-raised px-4 pr-20 text-[22px] leading-none font-semibold text-ink tabular-nums transition outline-none placeholder:text-faint focus:border-primary focus:ring-3 focus:ring-primary/15"
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
            <TransferFieldLabel label="Результат расчёта" />
            <div className="mt-2 flex min-h-[126px] items-center gap-3 rounded-[11px] border border-line-soft bg-raised/60 p-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-primary/15 text-primary">
                <WalletCards size={21} />
              </span>
              <div className="min-w-0">
                <strong className="block text-[13px] font-semibold text-copy">
                  Равная доля для каждого
                </strong>
                <small className="mt-1 block text-xs leading-relaxed text-faint">
                  Система найдёт минимальный набор переводов и учтёт комиссии сети
                </small>
              </div>
            </div>
          </div>
        ) : null}
        <div className="mt-auto pt-5">
          {showSummary ? (
            <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-line-soft bg-app/40">
              {summaryItems.map((item, index) => (
                <div
                  className={`px-3 py-2.5 ${
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
              {pending ? 'Считаем…' : ctaLabel}
            </Button>
          </div>
        </div>
      </Panel>
      <Panel
        className="min-h-[456px] max-[980px]:min-h-0"
        title={
          mode === 'distribute' ? 'Получатели' : mode === 'consolidate' ? 'Источники' : 'Участники'
        }
        subtitle={
          mode === 'equalize'
            ? 'Выбери минимум два кошелька для общей группы'
            : 'Отметь кошельки, которые войдут в операцию'
        }
      >
        <div className="mb-2">
          <TransferFieldLabel
            label={
              mode === 'distribute'
                ? 'Кошельки-получатели'
                : mode === 'consolidate'
                  ? 'Кошельки-источники'
                  : 'Состав группы'
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
      className={`flex min-h-[68px] w-full cursor-pointer items-center justify-start gap-3 rounded-[8px] border px-3.5 text-left transition focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none ${active ? 'border-primary/30 bg-primary/15 text-primary' : 'border-transparent bg-transparent text-dim hover:bg-raised hover:text-copy'}`}
      type="button"
      onClick={onClick}
    >
      <Icon className="shrink-0" size={22} />
      <span className="min-w-0">
        <strong className="block text-sm font-semibold">{label}</strong>
        <small className="mt-0.5 block text-[13px] opacity-75">{description}</small>
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
      <PageHeader title="Операции" />
      <div className="grid grid-cols-[250px_minmax(0,1fr)] items-start gap-4 max-[1180px]:grid-cols-1">
        <div
          aria-label="Тип операции"
          className="grid grid-cols-1 gap-1 rounded-[11px] border border-line-soft bg-surface p-1.5 max-[1180px]:grid-cols-4 max-[760px]:grid-cols-2"
          role="group"
        >
          <OperationModeTab
            active={mode === 'single'}
            description="Один → одному"
            icon={Send}
            label="Перевод"
            onClick={() => onModeChange('single')}
          />
          <OperationModeTab
            active={mode === 'distribute'}
            description="Один → многим"
            icon={ArrowUpRight}
            label="Раздать"
            onClick={() => onModeChange('distribute')}
          />
          <OperationModeTab
            active={mode === 'consolidate'}
            description="Многие → одному"
            icon={ArrowDownLeft}
            label="Собрать"
            onClick={() => onModeChange('consolidate')}
          />
          <OperationModeTab
            active={mode === 'equalize'}
            description="Общий баланс поровну"
            icon={SlidersHorizontal}
            label="Выровнять"
            onClick={() => onModeChange('equalize')}
          />
        </div>
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
      /транзакц|перевод|подтвержден|отправлен/i.test(entry.title),
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
        const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
        const matchesQuery =
          !normalizedQuery ||
          [entry.title, entry.message, entry.signature, entry.error]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase('ru-RU').includes(normalizedQuery));
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
      setError('Не удалось скопировать запись в буфер обмена.');
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
      <PageHeader title="Активность" />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      <Panel className="p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-11 min-w-[240px] flex-1 items-center gap-2 rounded-[9px] border border-line bg-raised px-3 text-dim transition focus-within:border-primary/70 focus-within:text-copy">
            <Search aria-hidden="true" size={16} />
            <input
              aria-label="Поиск по журналу"
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
              placeholder="Событие, адрес или сигнатура…"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button
                aria-label="Очистить поиск"
                className="cursor-pointer border-0 bg-transparent p-0 text-faint hover:text-copy"
                type="button"
                onClick={() => setQuery('')}
              >
                <X size={15} />
              </button>
            ) : null}
          </label>
          <div
            aria-label="Фильтр журнала"
            className="inline-flex h-11 shrink-0 flex-wrap gap-1 rounded-[10px] border border-line-soft bg-surface p-1"
            role="group"
          >
            {(
              [
                ['transactions', 'Транзакции'],
                ['errors', 'Ошибки'],
                ['all', 'Все события'],
              ] as const
            ).map(([value, label]) => (
              <button
                className={`inline-flex h-full cursor-pointer items-center gap-2 rounded-[7px] border-0 px-3 text-xs font-semibold transition ${view === value ? 'bg-primary text-surface' : 'bg-transparent text-dim hover:bg-raised hover:text-copy'}`}
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
            aria-label="Экспорт"
            className="h-11"
            compact
            disabled={!filteredEntries.length}
            icon={Download}
            onClick={exportEntries}
          >
            <span className="max-[1180px]:sr-only">Экспорт</span>
          </Button>
        </div>
      </Panel>
      <div className="relative overflow-hidden rounded-[11px] border border-line-soft bg-surface">
        {filteredEntries.length ? (
          <div>
            <div className="grid h-10 grid-cols-[52px_minmax(280px,1fr)_170px_84px] items-center gap-4 rounded-t-[10px] bg-muted/65 px-5 text-xs font-semibold tracking-[0.06em] text-faint uppercase max-[1180px]:grid-cols-[44px_minmax(240px,1fr)_140px_72px] max-[900px]:hidden">
              <span />
              <span>Событие</span>
              <span>Дата и время</span>
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
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-[9px] ${entry.tone === 'success' ? 'bg-primary/15 text-primary' : entry.tone === 'error' ? 'bg-danger/10 text-danger' : 'bg-soft text-dim'}`}
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
                      <small className="mt-1 hidden text-[11px] text-faint max-[900px]:block">
                        {formatActivityTime(entry.timestamp)}
                      </small>
                    </div>
                    <time
                      className="text-[13px] whitespace-nowrap text-faint tabular-nums max-[900px]:hidden"
                      dateTime={entry.timestamp}
                    >
                      {formatActivityTime(entry.timestamp)}
                    </time>
                    <div className="flex items-center gap-1 justify-self-start">
                      {entry.signature ? (
                        <a
                          aria-label="Открыть транзакцию в Solscan"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] border border-transparent text-faint transition hover:border-line hover:bg-muted hover:text-copy"
                          href={explorerUrl(entry.signature)}
                          rel="noreferrer"
                          target="_blank"
                          title="Открыть в Solscan"
                        >
                          <ExternalLink size={15} />
                        </a>
                      ) : null}
                      <button
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Скрыть детали' : 'Показать детали'}
                        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border border-transparent bg-transparent text-faint transition hover:border-line hover:bg-muted hover:text-copy"
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                      >
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="mt-3 ml-[68px] rounded-[10px] border border-line-soft bg-app/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.015)] max-[900px]:ml-0">
                      <div className="mb-3 flex items-center justify-between gap-3 border-b border-line-soft pb-3">
                        <strong className="text-xs font-semibold text-copy">Детали события</strong>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-faint">
                            {formatActivityTime(entry.timestamp)}
                          </span>
                          <Button
                            compact
                            icon={copiedId === entry.id ? Check : Copy}
                            onClick={() => void copyEntry(entry)}
                          >
                            {copiedId === entry.id ? 'Скопировано' : 'Копировать'}
                          </Button>
                        </div>
                      </div>
                      <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-5 gap-y-3 text-xs leading-relaxed max-[540px]:grid-cols-1 max-[540px]:gap-y-1">
                        <dt className="font-medium text-faint">Сообщение</dt>
                        <dd className="m-0 break-words text-copy">{entry.message}</dd>
                        {entry.status ? (
                          <>
                            <dt className="font-medium text-faint max-[540px]:mt-2">Статус</dt>
                            <dd className="m-0 text-copy">
                              {transactionStatusLabel(entry.status)}
                            </dd>
                          </>
                        ) : null}
                        {entry.signature ? (
                          <>
                            <dt className="font-medium text-faint max-[540px]:mt-2">Сигнатура</dt>
                            <dd className="m-0 font-mono break-all text-copy">{entry.signature}</dd>
                          </>
                        ) : null}
                        {entry.error ? (
                          <>
                            <dt className="font-medium text-faint max-[540px]:mt-2">Ошибка</dt>
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
          <div className="flex min-h-[240px] items-center justify-center gap-3 text-[13px] text-dim">
            <LoaderCircle className="animate-spin" size={24} /> Загружаем активность…
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            text={
              entries.length
                ? 'Измени фильтры или поисковый запрос.'
                : 'Здесь появятся отправленные транзакции и события приложения.'
            }
            title={entries.length ? 'Ничего не найдено' : 'История пока пуста'}
          />
        )}
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
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const normalizedRpcDraft = rpcDraft.trim();
  const rpcHasChanges = normalizedRpcDraft !== state.rpc_url;
  const rpcStatus =
    rpcResult ??
    (rpcHasChanges
      ? { message: 'Проверь подключение перед сохранением', tone: 'neutral' as const }
      : state.rpc_error
        ? { message: 'RPC недоступен', tone: 'error' as const }
        : {
            message: `${state.network}${state.rpc_latency_ms !== null ? ` · ${state.rpc_latency_ms} мс` : ''}`,
            tone: 'success' as const,
          });

  useEffect(() => {
    setRpcDraft(state.rpc_url);
    setRpcPresetMode(rpcPresets.find((preset) => preset.url === state.rpc_url)?.id ?? 'custom');
    setRpcVerifiedUrl(state.rpc_error ? null : state.rpc_url);
    setRpcResult(null);
  }, [state.rpc_error, state.rpc_url]);

  const testRpc = async () => {
    setRpcPending('test');
    setRpcResult(null);
    try {
      const result = await api.testRpc(normalizedRpcDraft);
      setRpcDraft(normalizedRpcDraft);
      setRpcVerifiedUrl(normalizedRpcDraft);
      setRpcResult({
        message: `${result.network} · ${result.latency_ms} мс · Solana ${result.version}`,
        tone: 'success',
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setRpcVerifiedUrl(null);
      setRpcResult({ message: 'Не удалось подключиться', tone: 'error' });
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
      onToast('RPC сохранён');
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
      onToast(`Файл ${name} выбран`);
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
      onToast(`Файл ${result.wallet_file} создан`);
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : String(reason), 'error');
    } finally {
      setFilePending(false);
    }
  };
  const reloadFile = async () => {
    setFilePending(true);
    try {
      await onReload();
      onToast('CSV перечитан и проверен');
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
      <PageHeader title="Настройки" />
      <div className="grid grid-cols-2 items-start gap-3 max-[980px]:grid-cols-1">
        <Panel compact title="RPC-подключение">
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2.5 max-[560px]:grid-cols-1">
              <div className="flex flex-col gap-1.5 text-[13px] font-semibold text-copy">
                <span>Сеть</span>
                <AppSelect
                  ariaLabel="Выбор сети"
                  options={[
                    ...rpcPresets.map((preset) => ({
                      value: preset.id,
                      label: preset.label,
                      description: new URL(preset.url).hostname,
                    })),
                    {
                      value: 'custom',
                      label: 'Custom',
                      description: 'Свой RPC endpoint',
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
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-copy">
                HTTP(S) endpoint
                <input
                  className="min-h-10 w-full rounded-[9px] border border-line bg-raised px-3.5 text-[13px] font-normal text-ink transition outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
                  spellCheck={false}
                  value={rpcDraft}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRpcDraft(value);
                    setRpcPresetMode(
                      rpcPresets.find((preset) => preset.url === value)?.id ?? 'custom',
                    );
                    setRpcVerifiedUrl(null);
                    setRpcResult(null);
                  }}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={`mr-auto inline-flex items-center gap-2 text-xs ${rpcStatus.tone === 'success' ? 'text-primary' : rpcStatus.tone === 'error' ? 'text-danger' : 'text-dim'}`}
              >
                <i
                  className={`h-2 w-2 rounded-full ${rpcStatus.tone === 'success' ? 'bg-primary' : rpcStatus.tone === 'error' ? 'bg-danger' : 'bg-faint'}`}
                />
                {rpcStatus.message}
              </div>
              <Button
                compact
                disabled={Boolean(rpcPending) || !normalizedRpcDraft}
                onClick={() => void testRpc()}
              >
                {rpcPending === 'test' ? 'Проверяем…' : 'Проверить'}
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
                {rpcPending === 'save' ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel
          compact
          title="Файлы кошельков"
          subtitle="Импорт создаёт отдельный CSV и делает его активным"
          actions={
            <>
              <input
                ref={fileRef}
                accept=".csv,text/csv"
                hidden
                type="file"
                onChange={(event) => void handleFile(event)}
              />
              <Button
                compact
                disabled={filePending}
                icon={FilePlus2}
                onClick={() => setNewFileOpen(true)}
              >
                Создать
              </Button>
              <Button
                compact
                disabled={filePending}
                icon={Upload}
                onClick={() => fileRef.current?.click()}
              >
                Импорт CSV
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-copy">Активный файл</label>
            <AppSelect
              ariaLabel="Выбор активного файла кошельков"
              disabled={filePending}
              options={state.wallet_files.map((name) => ({
                value: name,
                label: name,
                description: name === state.wallet_file ? 'Активный файл' : 'CSV-файл кошельков',
              }))}
              value={state.wallet_file}
              onChange={(value) => void selectFile(value)}
            />
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
              <span>{formatWalletCount(state.wallet_count)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatFileSize(state.wallet_file_size_bytes)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatFileModifiedAt(state.wallet_file_modified_at)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Button
                compact
                disabled={filePending}
                icon={filePending ? LoaderCircle : RefreshCw}
                onClick={() => void reloadFile()}
              >
                Проверить файл
              </Button>
              {window.desktopShell?.openWalletFolder ? (
                <Button compact icon={FolderOpen} onClick={() => void openWalletFolder()}>
                  Открыть папку
                </Button>
              ) : null}
            </div>
            {state.warnings.length ? (
              <div className="mt-1.5 flex items-start gap-2 rounded-[8px] border border-danger/25 bg-danger/10 px-2.5 py-2 text-xs leading-relaxed text-danger">
                <TriangleAlert className="mt-0.5 shrink-0" size={15} />
                <span>
                  {state.warnings[0]}
                  {state.warnings.length > 1
                    ? ` Ещё предупреждений: ${state.warnings.length - 1}.`
                    : ''}
                </span>
              </div>
            ) : null}
            <div className="mt-1.5 flex items-start gap-2 rounded-[8px] border border-warning/25 bg-warning/10 px-2.5 py-2 text-xs leading-relaxed text-warning">
              <TriangleAlert className="mt-0.5 shrink-0" size={15} />
              <span>
                CSV содержит приватные ключи и хранится локально без шифрования. Не передавай файл
                третьим лицам.
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
            className="w-full max-w-[440px] rounded-[15px] border border-line bg-surface shadow-[0_18px_50px_rgba(8,8,11,0.32)]"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-[18px]">
              <div>
                <h2 className="m-0 text-[17px] font-bold text-ink" id="create-wallet-file-title">
                  Создать файл кошельков
                </h2>
                <p className="mt-1.5 mb-0 text-xs text-dim">
                  Пустой CSV станет активным сразу после создания
                </p>
              </div>
              <button
                aria-label="Закрыть"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent text-faint transition hover:bg-muted hover:text-ink"
                disabled={filePending}
                type="button"
                onClick={() => setNewFileOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form className="p-5" onSubmit={(event) => void createFile(event)}>
              <label
                className="mb-2 block text-[13px] font-semibold text-copy"
                htmlFor="new-wallet-file-name"
              >
                Название
              </label>
              <div className="flex min-h-12 items-center rounded-[9px] border border-line bg-raised transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <input
                  autoFocus
                  className="min-w-0 flex-1 border-0 bg-transparent px-3.5 text-sm text-ink outline-none placeholder:text-faint"
                  id="new-wallet-file-name"
                  maxLength={80}
                  placeholder="Например, trading"
                  spellCheck={false}
                  value={newFileName}
                  onChange={(event) => setNewFileName(event.target.value)}
                />
                <span className="pr-3.5 text-sm text-faint">.csv</span>
              </div>
              <div className="mt-5 flex justify-end gap-2 border-t border-line-soft pt-4">
                <Button disabled={filePending} type="button" onClick={() => setNewFileOpen(false)}>
                  Отмена
                </Button>
                <Button
                  disabled={filePending || !newFileName.trim()}
                  icon={filePending ? LoaderCircle : FilePlus2}
                  tone="primary"
                  type="submit"
                  variant="solid"
                >
                  {filePending ? 'Создаём…' : 'Создать'}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SidebarNavItem({
  active,
  collapsed,
  item: { id, label, icon: Icon },
  onNavigate,
}: {
  active: boolean;
  collapsed: boolean;
  item: (typeof navItems)[number];
  onNavigate: (page: PageId) => void;
}) {
  return (
    <div className="group/sidebar-item relative">
      <button
        aria-current={active ? 'page' : undefined}
        className={`relative flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[9px] border-0 px-1.5 text-left transition focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none focus-visible:ring-inset ${active ? 'bg-primary/15 text-primary' : 'text-dim hover:bg-raised hover:text-copy'} ${collapsed ? 'justify-center' : ''} max-[900px]:justify-center`}
        type="button"
        onClick={() => onNavigate(id)}
      >
        {active ? (
          <i className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
        ) : null}
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center">
          <Icon size={19} />
        </span>
        <b
          className={`${collapsed ? 'hidden' : 'block'} min-w-0 flex-1 overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap max-[900px]:hidden`}
        >
          {label}
        </b>
      </button>
      <span
        className={`${collapsed ? 'group-focus-within/sidebar-item:flex group-hover/sidebar-item:flex' : 'hidden max-[900px]:group-focus-within/sidebar-item:flex max-[900px]:group-hover/sidebar-item:flex'} pointer-events-none absolute top-1/2 left-[calc(100%+10px)] z-50 hidden -translate-y-1/2 items-center rounded-[7px] border border-line bg-raised px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-copy shadow-[0_10px_30px_rgba(0,0,0,0.32)]`}
        role="tooltip"
      >
        {label}
      </span>
    </div>
  );
}

function Sidebar({
  activePage,
  collapsed,
  onCollapse,
  onNavigate,
}: {
  activePage: PageId;
  collapsed: boolean;
  onCollapse: () => void;
  onNavigate: (page: PageId) => void;
}) {
  return (
    <aside
      className={`sticky top-0 z-30 flex h-screen flex-col overflow-visible border-r border-line-soft bg-sidebar px-3 py-4 transition-[width] duration-200 ${collapsed ? 'w-[72px]' : 'w-[248px]'} max-[900px]:w-[72px]`}
    >
      <div
        className={`flex min-h-12 items-center gap-2 ${collapsed ? 'justify-center' : 'justify-between'} max-[900px]:justify-center`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/15 text-primary">
            <Sparkles size={21} />
          </span>
          <div className={`${collapsed ? 'hidden' : 'block'} min-w-0 max-[900px]:hidden`}>
            <strong className="block text-sm font-bold text-ink">Solana</strong>
            <small className="mt-0.5 block text-xs font-medium text-faint">Wallet</small>
          </div>
        </div>
        <button
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          className={`${collapsed ? 'hidden' : 'inline-flex'} h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-transparent bg-transparent text-faint transition hover:bg-raised hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none max-[900px]:hidden`}
          type="button"
          onClick={onCollapse}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <nav className="mt-4 flex flex-col gap-1">
        {primaryNavItems.map((item) => (
          <SidebarNavItem
            active={activePage === item.id}
            collapsed={collapsed}
            item={item}
            key={item.id}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
      <div className="mt-auto border-t border-line-soft pt-3">
        <SidebarNavItem
          active={activePage === settingsNavItem.id}
          collapsed={collapsed}
          item={settingsNavItem}
          onNavigate={onNavigate}
        />
        <button
          aria-label="Развернуть меню"
          className={`${collapsed ? 'mt-2 inline-flex' : 'hidden'} h-10 w-full cursor-pointer items-center justify-center rounded-[9px] border border-transparent bg-transparent text-faint transition hover:bg-raised hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none max-[900px]:hidden`}
          type="button"
          onClick={onCollapse}
        >
          <PanelLeftOpen size={18} />
        </button>
      </div>
    </aside>
  );
}

function App() {
  const [activePage, setActivePage] = useState<PageId>(getInitialPage);
  const [operationMode, setOperationMode] = useState<OperationMode>(getInitialOperationMode);
  const [transferSourceId, setTransferSourceId] = useState('');
  const [collapsed, setCollapsed] = useState(false);
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
          `${result.submitted} транзакц${result.submitted === 1 ? 'ия отправлена' : 'ии отправлены'} в сеть`,
        );
      } else {
        showToast(
          result.submitted
            ? `Отправлено ${result.submitted} из ${result.planned}. ${result.error ?? ''}`
            : (result.error ?? 'Операция не выполнена'),
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
      .catch(() => showToast('Не удалось скопировать', 'error'));
  };

  const importFile = async (file: File) => {
    try {
      const result = await api.importWalletFile(file);
      await loadState(true);
      showToast(`Импортировано кошельков: ${result.wallet_count}`);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : String(reason), 'error');
    }
  };

  const content = state ? (
    activePage === 'overview' ? (
      <OverviewPage
        state={state}
        onCopy={copy}
        onNavigate={navigate}
        onOpenOperation={openOperation}
        onRetry={() => void loadState(true)}
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
    <div
      className={`grid min-h-screen bg-app font-sans text-ink transition-[grid-template-columns] duration-200 ${collapsed ? 'grid-cols-[72px_minmax(0,1fr)]' : 'grid-cols-[248px_minmax(0,1fr)]'} max-[900px]:grid-cols-[72px_minmax(0,1fr)]`}
    >
      <Sidebar
        activePage={activePage}
        collapsed={collapsed}
        onCollapse={() => setCollapsed((value) => !value)}
        onNavigate={navigate}
      />
      <main className="min-w-0">
        {loadError && !state ? (
          <div className="mx-auto flex min-h-screen max-w-[560px] flex-col items-center justify-center px-6 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-[12px] bg-danger/10 text-danger">
              <TriangleAlert size={28} />
            </span>
            <h1 className="mt-4 text-[28px] font-bold tracking-[-0.03em] text-ink">
              Не удалось открыть кошелёк
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-dim">{loadError}</p>
            <Button
              className="mt-5"
              icon={RefreshCw}
              tone="primary"
              variant="solid"
              onClick={() => void loadState(true)}
            >
              Повторить подключение
            </Button>
            <code className="mt-4 rounded-[8px] bg-raised px-3 py-2 font-mono text-xs text-faint">
              pip install -r requirements.txt
            </code>
          </div>
        ) : loading && !state ? (
          <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-[13px] text-dim">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-[11px] border border-primary/25 bg-primary/15 text-primary">
              <Sparkles size={25} />
            </span>
            <LoaderCircle className="animate-spin text-primary" size={24} />
            <p>Подключаем локальный кошелёк…</p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[1540px] px-7 py-6 max-[680px]:px-4 max-[680px]:py-5">
            {content}
          </div>
        )}
      </main>
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
          className={`fixed right-6 bottom-6 z-[120] flex min-h-12 max-w-[420px] items-center gap-2.5 rounded-[10px] border bg-surface px-3.5 py-3 text-[13px] font-medium shadow-[0_18px_55px_rgba(0,0,0,0.35)] ${toast.tone === 'success' ? 'border-primary/30 text-copy' : 'border-danger/30 text-danger'}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span className={toast.tone === 'success' ? 'text-primary' : 'text-danger'}>
            {toast.tone === 'success' ? <CheckCircle2 size={19} /> : <TriangleAlert size={19} />}
          </span>
          {toast.message}
          <button
            className="ml-1 inline-flex cursor-pointer items-center border-0 bg-transparent p-1 text-faint hover:text-ink"
            aria-label="Закрыть"
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
