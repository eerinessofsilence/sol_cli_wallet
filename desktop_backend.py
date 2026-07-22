from __future__ import annotations

import asyncio
import csv
import hashlib
import json
import math
import os
import re
import secrets
import shutil
import time
from collections import deque
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import base58
from aiohttp import web
from dotenv import dotenv_values, set_key
from solana.rpc.async_api import AsyncClient
from solana.rpc.types import TxOpts
from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import Transaction

from utils.logger import logger


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
ENV_FILE = ROOT / ".env"
LOG_FILE = ROOT / "logs" / "transactions.log"
DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com"
DEFAULT_WALLET_FILE = "wallets.csv"
MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
LAMPORTS_PER_SOL = 1_000_000_000
TRANSACTION_FEE_LAMPORTS = 5_000
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
PREVIEW_TTL_SECONDS = 120
SYSTEM_PROGRAM_ID = Pubkey.from_string("11111111111111111111111111111111")
ALLOWED_ORIGINS = {
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "null",
}


@dataclass(frozen=True)
class Wallet:
    id: str
    name: str
    pubkey: str
    privkey: str

    def public_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "name": self.name,
            "pubkey": self.pubkey,
        }


@dataclass
class Preview:
    created_at: float
    rpc_url: str
    wallet_file: str
    mode: str
    transfers: list[dict[str, Any]]
    network: str | None = None


class DesktopState:
    def __init__(self) -> None:
        self.balance_cache: dict[str, tuple[float, dict[str, Any]]] = {}
        self.balance_lock = asyncio.Lock()
        self.wallet_file_lock = asyncio.Lock()
        self.pending_lock = asyncio.Lock()
        self.previews: dict[str, Preview] = {}
        self.pending_transactions: dict[str, dict[str, Any]] = {}
        self.activity: deque[dict[str, Any]] = deque(maxlen=200)
        self.rpc_network_cache: dict[str, str] = {}


STATE = DesktopState()


def _env() -> dict[str, str]:
    values = dotenv_values(ENV_FILE)
    return {key: value for key, value in values.items() if value is not None}


def rpc_url() -> str:
    return _env().get("RPC_URL", DEFAULT_RPC_URL).strip() or DEFAULT_RPC_URL


def wallet_file_name() -> str:
    configured = _env().get("CSV_FILE", DEFAULT_WALLET_FILE).strip()
    return Path(configured).name or DEFAULT_WALLET_FILE


def wallet_file_path() -> Path:
    return DATA_DIR / wallet_file_name()


def _wallet_id(index: int, pubkey: str) -> str:
    digest = hashlib.sha256(f"{index}:{pubkey}".encode("utf-8")).hexdigest()
    return digest[:16]


def _convert_private_key(value: str) -> tuple[str, str | None]:
    raw = value.strip()
    if not raw.startswith("["):
        return raw, None

    try:
        array = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ValueError("Приватный ключ в формате массива содержит ошибку.") from error

    if not (
        isinstance(array, list)
        and len(array) in {32, 64}
        and all(isinstance(item, int) and 0 <= item <= 255 for item in array)
    ):
        raise ValueError("Приватный ключ должен содержать 32 или 64 байта.")

    keypair = Keypair.from_seed(bytes(array[:32]))
    return base58.b58encode(bytes(keypair)).decode("ascii"), str(keypair.pubkey())


def load_wallets(path: Path | None = None) -> tuple[list[Wallet], list[str]]:
    source = path or wallet_file_path()
    wallets: list[Wallet] = []
    warnings: list[str] = []
    seen_private_keys: set[str] = set()

    if not source.exists():
        return [], [f"Файл {source.name} не найден."]

    try:
        with source.open(newline="", encoding="utf-8-sig") as stream:
            reader = csv.DictReader(stream)
            fields = set(reader.fieldnames or [])
            if "privkey" not in fields:
                return [], ["В CSV отсутствует обязательная колонка privkey."]

            for index, row in enumerate(reader, start=1):
                name = (row.get("name") or str(index)).strip() or str(index)
                private_key_raw = (row.get("privkey") or "").strip()
                public_key = (row.get("pubkey") or "").strip()

                if not private_key_raw:
                    warnings.append(f"{name}: отсутствует приватный ключ.")
                    continue

                try:
                    private_key, derived_public_key = _convert_private_key(
                        private_key_raw
                    )
                    keypair = Keypair.from_base58_string(private_key)
                    expected_public_key = str(keypair.pubkey())
                    if derived_public_key:
                        expected_public_key = derived_public_key
                    if public_key and public_key != expected_public_key:
                        warnings.append(
                            f"{name}: pubkey не совпадает с приватным ключом; "
                            "использован вычисленный адрес."
                        )
                    public_key = expected_public_key
                except Exception as error:
                    warnings.append(f"{name}: некорректный приватный ключ ({error}).")
                    continue

                if private_key in seen_private_keys:
                    warnings.append(f"{name}: дубликат кошелька пропущен.")
                    continue
                seen_private_keys.add(private_key)
                wallets.append(
                    Wallet(
                        id=_wallet_id(index, public_key),
                        name=name,
                        pubkey=public_key,
                        privkey=private_key,
                    )
                )
    except (OSError, csv.Error) as error:
        return [], [f"Не удалось прочитать {source.name}: {error}"]

    return wallets, warnings


def _network_name(url: str, genesis_hash: str | None = None) -> str:
    if genesis_hash == MAINNET_GENESIS_HASH:
        return "Mainnet"
    lowered = url.lower()
    if "devnet" in lowered:
        return "Devnet"
    if "testnet" in lowered:
        return "Testnet"
    if "mainnet" in lowered:
        return "Mainnet"
    if "127.0.0.1" in lowered or "localhost" in lowered:
        return "Localnet"
    return "Custom cluster"


async def _probe_rpc(url: str) -> dict[str, Any]:
    started = time.perf_counter()
    async with AsyncClient(url, timeout=12) as client:
        version_response, genesis_response = await asyncio.gather(
            client.get_version(),
            client.get_genesis_hash(),
        )
    genesis_hash = str(genesis_response.value)
    network = _network_name(url, genesis_hash)
    STATE.rpc_network_cache[url] = network
    return {
        "latency_ms": round((time.perf_counter() - started) * 1000),
        "version": str(
            getattr(version_response.value, "solana_core", version_response.value)
        ),
        "genesis_hash": genesis_hash,
        "network": network,
    }


async def _resolve_rpc_network(url: str) -> str:
    cached = STATE.rpc_network_cache.get(url)
    if cached:
        return cached
    return str((await _probe_rpc(url))["network"])


def _short_address(value: str) -> str:
    return f"{value[:5]}…{value[-5:]}" if len(value) > 13 else value


async def _fetch_balances(
    wallets: list[Wallet], url: str
) -> tuple[dict[str, int], str | None, int | None]:
    balances: dict[str, int] = {}
    latency_ms: int | None = None
    started = time.perf_counter()

    try:
        async with AsyncClient(url, timeout=12) as client:
            async def fetch(wallet: Wallet) -> tuple[str, int]:
                response = await client.get_balance(Pubkey.from_string(wallet.pubkey))
                return wallet.id, int(response.value or 0)

            results = await asyncio.gather(
                *(fetch(wallet) for wallet in wallets), return_exceptions=True
            )
            latency_ms = round((time.perf_counter() - started) * 1000)
            failures = 0
            for wallet, result in zip(wallets, results):
                if isinstance(result, Exception):
                    balances[wallet.id] = 0
                    failures += 1
                else:
                    wallet_id, value = result
                    balances[wallet_id] = value
            if failures == len(wallets) and wallets:
                return balances, "RPC не вернул баланс ни для одного кошелька.", latency_ms
            if failures:
                return (
                    balances,
                    f"Не удалось обновить {failures} из {len(wallets)} балансов.",
                    latency_ms,
                )
    except Exception as error:
        latency_ms = round((time.perf_counter() - started) * 1000)
        return (
            {wallet.id: 0 for wallet in wallets},
            f"RPC недоступен: {error}",
            latency_ms,
        )

    return balances, None, latency_ms


async def build_state(force_refresh: bool = False) -> dict[str, Any]:
    wallets, warnings = load_wallets()
    url = rpc_url()
    active_wallet_file = wallet_file_path()
    try:
        wallet_file_stat = active_wallet_file.stat()
        wallet_file_size_bytes = wallet_file_stat.st_size
        wallet_file_modified_at = datetime.fromtimestamp(
            wallet_file_stat.st_mtime, timezone.utc
        ).isoformat()
    except OSError:
        wallet_file_size_bytes = 0
        wallet_file_modified_at = None
    cache_key = f"{wallet_file_name()}:{url}"
    cached = STATE.balance_cache.get(cache_key)

    async with STATE.balance_lock:
        if not force_refresh and cached and time.time() - cached[0] < 15:
            snapshot = cached[1]
        else:
            balances, rpc_error, latency_ms = await _fetch_balances(wallets, url)
            snapshot = {
                "balances": balances,
                "rpc_error": rpc_error,
                "latency_ms": latency_ms,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            STATE.balance_cache = {cache_key: (time.time(), snapshot)}

    network = _network_name(url)
    if not snapshot["rpc_error"]:
        try:
            network = await _resolve_rpc_network(url)
        except Exception:
            pass

    public_wallets = []
    total_lamports = 0
    for wallet in wallets:
        lamports = int(snapshot["balances"].get(wallet.id, 0))
        total_lamports += lamports
        public_wallets.append(
            {
                **wallet.public_dict(),
                "short_address": _short_address(wallet.pubkey),
                "lamports": lamports,
                "balance": lamports / LAMPORTS_PER_SOL,
            }
        )

    return {
        "wallets": public_wallets,
        "wallet_count": len(public_wallets),
        "total_lamports": total_lamports,
        "total_balance": total_lamports / LAMPORTS_PER_SOL,
        "rpc_url": url,
        "rpc_host": urlparse(url).hostname or url,
        "rpc_latency_ms": snapshot["latency_ms"],
        "rpc_error": snapshot["rpc_error"],
        "network": network,
        "wallet_file": wallet_file_name(),
        "wallet_files": sorted(path.name for path in DATA_DIR.glob("*.csv")),
        "wallet_file_size_bytes": wallet_file_size_bytes,
        "wallet_file_modified_at": wallet_file_modified_at,
        "pending_transaction_count": len(STATE.pending_transactions),
        "warnings": warnings,
        "updated_at": snapshot["updated_at"],
    }


def _json_error(
    message: str, status: int = 400, code: str | None = None
) -> web.Response:
    payload = {"error": message}
    if code:
        payload["code"] = code
    return web.json_response(payload, status=status)


async def health_handler(_: web.Request) -> web.Response:
    return web.json_response({"status": "ok", "service": "sol-wallet-desktop"})


async def state_handler(request: web.Request) -> web.Response:
    await _refresh_pending_transactions()
    force_refresh = request.query.get("refresh") == "1"
    return web.json_response(await build_state(force_refresh=force_refresh))


CLI_LOG_PATTERN = re.compile(
    r"^\[(?P<marker>[^\]]+)\]\s*"
    r"(?:(?P<date>\d{4}-\d{2}-\d{2})\s+)?"
    r"(?P<time>\d{2}:\d{2}:\d{2})\s*\|\s*(?P<message>.*)$"
)
CLI_WALLET_BALANCE_PATTERN = re.compile(r"^\d+\s*:\s*\d+(?:\.\d+)?$")
CLI_VERBOSE_BALANCE_PATTERN = re.compile(
    r"^(?:\[[^\]]*\]\s*)?(?:[1-9A-HJ-NP-Za-km-z]{32,44}\s*)?:?\s*"
    r"\d+(?:\.\d+)?\s*(?:SOL)?$",
    flags=re.IGNORECASE,
)


def _infer_cli_log_timestamps(lines: list[str], modified_at: float) -> dict[int, str]:
    modified = datetime.fromtimestamp(modified_at)
    current_date = modified.date()
    next_clock = modified.time().replace(microsecond=0)
    timestamps: dict[int, str] = {}

    for index in range(len(lines) - 1, -1, -1):
        match = CLI_LOG_PATTERN.match(lines[index].strip())
        if not match:
            continue
        clock = datetime.strptime(match.group("time"), "%H:%M:%S").time()
        explicit_date = match.group("date")
        if explicit_date:
            current_date = date.fromisoformat(explicit_date)
        elif clock > next_clock:
            current_date -= timedelta(days=1)
        timestamps[index] = f"{current_date.isoformat()}T{match.group('time')}"
        next_clock = clock

    return timestamps


def _parse_cli_log_line(
    line: str,
    index: int,
    timestamp_override: str | None = None,
) -> dict[str, Any] | None:
    raw = line.strip()
    if not raw:
        return None

    match = CLI_LOG_PATTERN.match(raw)
    marker = match.group("marker") if match else ""
    timestamp = (
        timestamp_override
        or (
            f"{match.group('date')}T{match.group('time')}"
            if match and match.group("date")
            else match.group("time")
            if match
            else ""
        )
    )
    message = match.group("message").strip() if match else raw

    lowered = message.lower()
    if (
        "privkey" in lowered
        or CLI_WALLET_BALANCE_PATTERN.fullmatch(message)
        or CLI_VERBOSE_BALANCE_PATTERN.fullmatch(message)
        or re.fullmatch(r"Balance:\s*\d+(?:\.\d+)?(?:\s+SOL)?", message, re.IGNORECASE)
    ):
        return None

    if (
        marker in {"!", "✗", "×"}
        or any(
            word in lowered
            for word in (
                "error",
                "failed",
                "exception",
                "not found",
                "insufficient",
                "invalid",
                "rejected",
                "не удалось",
                "недостаточно",
                "отклон",
            )
        )
    ):
        tone = "error"
        title = "Ошибка приложения"
    elif (
        marker in {"✓", "+"}
        or any(word in lowered for word in ("success", "confirmed", "completed", "успеш"))
    ):
        tone = "success"
        title = "Операция выполнена"
    else:
        tone = "info"
        title = "Системное событие"

    signature: str | None = None
    balance_match = re.fullmatch(
        r"Total balance of all wallets:\s*(.+)", message, flags=re.IGNORECASE
    )
    if balance_match:
        title = "Баланс кошельков"
        message = f"Общий баланс: {balance_match.group(1)}"
    elif lowered == "program interrupted by user.":
        title = "Работа остановлена"
        message = "Работа программы остановлена пользователем"
    elif signature_match := re.fullmatch(
        r"Signature:\s*([1-9A-HJ-NP-Za-km-z]{64,88})", message, re.IGNORECASE
    ):
        signature = signature_match.group(1)
        tone = "success"
        title = "Транзакция отправлена"
        message = f"Сигнатура: {signature[:8]}…{signature[-8:]}"
    elif lowered == "transaction created successfully.":
        tone = "success"
        title = "Транзакция создана"
        message = "Транзакция создана и подписана"
    elif lowered == "waiting for transaction confirmation...":
        title = "Ожидание подтверждения"
        message = "Транзакция подтверждается в сети"
    elif lowered == "transaction confirmed.":
        tone = "success"
        title = "Транзакция подтверждена"
        message = "Сеть подтвердила транзакцию"
    elif receiver_balance_match := re.fullmatch(
        r"Receiver balance:\s*(.+)", message, re.IGNORECASE
    ):
        title = "Баланс получателя"
        message = f"После перевода: {receiver_balance_match.group(1)}"
    elif total_amount_match := re.fullmatch(
        r"Total amount to send:\s*(.+)", message, re.IGNORECASE
    ):
        title = "Сумма операции"
        message = f"К отправке: {total_amount_match.group(1)}"

    digest = hashlib.sha256(f"{index}:{raw}".encode("utf-8")).hexdigest()[:16]
    entry: dict[str, Any] = {
        "id": f"log-{digest}",
        "timestamp": timestamp,
        "title": title,
        "message": message,
        "tone": tone,
        "source": "cli",
        "raw_message": raw,
        "occurrences": 1,
    }
    if signature:
        entry["signature"] = signature
    return entry


async def _refresh_pending_transactions() -> None:
    if not STATE.pending_transactions:
        return

    async with STATE.pending_lock:
        grouped: dict[str, list[tuple[str, dict[str, Any]]]] = {}
        for signature, pending in STATE.pending_transactions.items():
            grouped.setdefault(pending["rpc_url"], []).append((signature, pending))

        completed: set[str] = set()
        for url, pending_items in grouped.items():
            try:
                signatures = [
                    Signature.from_string(signature) for signature, _ in pending_items
                ]
                async with AsyncClient(url, timeout=8) as client:
                    response = await client.get_signature_statuses(
                        signatures, search_transaction_history=True
                    )
            except Exception:
                continue

            for (signature, pending), status in zip(
                pending_items, response.value
            ):
                if status is None:
                    continue
                entry = pending["entry"]
                if status.err is not None:
                    entry["tone"] = "error"
                    entry["status"] = "failed"
                    entry["message"] = (
                        f"Транзакция отклонена · {pending['amount']:.9f} SOL"
                    )
                    entry["error"] = str(status.err)
                    completed.add(signature)
                    continue

                confirmation = str(status.confirmation_status or "").lower()
                if "finalized" in confirmation:
                    entry["tone"] = "success"
                    entry["status"] = "finalized"
                    entry["message"] = (
                        f"Финализировано · {pending['amount']:.9f} SOL"
                    )
                    completed.add(signature)
                elif "confirmed" in confirmation:
                    entry["tone"] = "success"
                    entry["status"] = "confirmed"
                    entry["message"] = (
                        f"Подтверждено сетью · {pending['amount']:.9f} SOL"
                    )

        for signature in completed:
            STATE.pending_transactions.pop(signature, None)


async def activity_handler(_: web.Request) -> web.Response:
    await _refresh_pending_transactions()
    disk_entries: list[dict[str, Any]] = []
    if LOG_FILE.exists():
        try:
            lines = LOG_FILE.read_text(encoding="utf-8", errors="replace").splitlines()
            timestamps = _infer_cli_log_timestamps(lines, LOG_FILE.stat().st_mtime)
            start_index = max(0, len(lines) - 240)
            for index, line in enumerate(lines[-240:], start=start_index):
                entry = _parse_cli_log_line(line, index, timestamps.get(index))
                if entry:
                    disk_entries.append(entry)
        except OSError:
            disk_entries = []
    unique_disk_entries: list[dict[str, Any]] = []
    seen_disk_entries: set[tuple[str, str, str]] = set()
    for entry in reversed(disk_entries):
        key = (entry["tone"], entry["title"], entry["message"])
        if key in seen_disk_entries:
            for existing in unique_disk_entries:
                if (existing["tone"], existing["title"], existing["message"]) == key:
                    existing["occurrences"] = int(existing["occurrences"]) + 1
                    break
            continue
        seen_disk_entries.add(key)
        unique_disk_entries.append(entry)
    entries = list(STATE.activity) + unique_disk_entries
    return web.json_response({"entries": entries[:100]})


def _validate_rpc_url(value: str) -> str:
    value = value.strip()
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("RPC должен быть корректным HTTP(S)-адресом.")
    return value


async def rpc_test_handler(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
        url = _validate_rpc_url(str(payload.get("url", "")))
        return web.json_response({"ok": True, **(await _probe_rpc(url))})
    except ValueError as error:
        return _json_error(str(error))
    except Exception as error:
        return _json_error(f"Не удалось подключиться к RPC: {error}", 502)


async def rpc_save_handler(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
        url = _validate_rpc_url(str(payload.get("url", "")))
        try:
            rpc_details = await _probe_rpc(url)
        except Exception as error:
            return _json_error(f"Не удалось подключиться к RPC: {error}", 502)
        set_key(str(ENV_FILE), "RPC_URL", url)
        STATE.balance_cache.clear()
        return web.json_response(
            {"ok": True, "rpc_url": url, **rpc_details}
        )
    except ValueError as error:
        return _json_error(str(error))
    except OSError as error:
        return _json_error(f"Не удалось сохранить .env: {error}", 500)


async def wallet_file_select_handler(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
        name = Path(str(payload.get("name", ""))).name
        if not name or name != payload.get("name") or not name.endswith(".csv"):
            raise ValueError("Некорректное имя CSV-файла.")
        path = DATA_DIR / name
        if not path.exists():
            raise ValueError(f"Файл {name} не найден.")
        wallets, warnings = load_wallets(path)
        if warnings and not wallets:
            raise ValueError(warnings[0])
        set_key(str(ENV_FILE), "CSV_FILE", name)
        STATE.balance_cache.clear()
        return web.json_response(
            {"ok": True, "wallet_file": name, "wallet_count": len(wallets)}
        )
    except ValueError as error:
        return _json_error(str(error))


def _safe_upload_name(filename: str) -> str:
    name = Path(filename).name
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(name).stem).strip("-.")
    return f"{stem or 'wallets'}.csv"


def _new_wallet_file_name(value: str) -> str:
    raw = value.strip()
    if raw.lower().endswith(".csv"):
        raw = raw[:-4]
    stem = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "-", raw).strip(" .-")
    if not stem:
        raise ValueError("Укажи название файла.")
    if len(stem) > 80:
        raise ValueError("Название файла должно быть короче 80 символов.")
    return f"{stem}.csv"


async def wallet_file_create_handler(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
        name = _new_wallet_file_name(str(payload.get("name", "")))
        destination = DATA_DIR / name
        async with STATE.wallet_file_lock:
            if destination.exists():
                raise ValueError(f"Файл {name} уже существует.")
            _write_wallet_rows(destination, ["name", "pubkey", "privkey"], [])
            try:
                set_key(str(ENV_FILE), "CSV_FILE", name)
            except Exception:
                destination.unlink(missing_ok=True)
                raise
        STATE.balance_cache.clear()
        return web.json_response(
            {"ok": True, "wallet_file": name, "wallet_count": 0}
        )
    except ValueError as error:
        return _json_error(str(error))
    except OSError as error:
        return _json_error(f"Не удалось создать CSV-файл: {error}", 500)


async def wallet_file_import_handler(request: web.Request) -> web.Response:
    try:
        reader = await request.multipart()
        part = await reader.next()
        if part is None or part.name != "file" or not part.filename:
            raise ValueError("Выбери CSV-файл для импорта.")
        if not part.filename.lower().endswith(".csv"):
            raise ValueError("Поддерживаются только CSV-файлы.")

        name = _safe_upload_name(part.filename)
        destination = DATA_DIR / name
        if destination.exists():
            destination = DATA_DIR / f"{Path(name).stem}-{int(time.time())}.csv"
        temporary = destination.with_suffix(".upload")
        size = 0
        with temporary.open("wb") as stream:
            while True:
                chunk = await part.read_chunk()
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise ValueError("CSV-файл больше 5 МБ.")
                stream.write(chunk)

        _deduplicate_wallet_rows(temporary)
        wallets, warnings = load_wallets(temporary)
        if not wallets:
            temporary.unlink(missing_ok=True)
            raise ValueError(warnings[0] if warnings else "В CSV нет кошельков.")
        shutil.move(str(temporary), str(destination))
        set_key(str(ENV_FILE), "CSV_FILE", destination.name)
        STATE.balance_cache.clear()
        return web.json_response(
            {
                "ok": True,
                "wallet_file": destination.name,
                "wallet_count": len(wallets),
                "warnings": warnings,
            }
        )
    except ValueError as error:
        return _json_error(str(error))
    except Exception as error:
        return _json_error(f"Не удалось импортировать файл: {error}", 500)


def _wallet_row_public_key(row: dict[str, str]) -> str:
    private_key_raw = (row.get("privkey") or "").strip()
    if not private_key_raw:
        return ""
    private_key, derived_public_key = _convert_private_key(private_key_raw)
    if derived_public_key:
        return derived_public_key
    return str(Keypair.from_base58_string(private_key).pubkey())


def _read_wallet_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        fieldnames = list(reader.fieldnames or [])
        if "privkey" not in fieldnames:
            raise ValueError("В CSV отсутствует обязательная колонка privkey.")
        rows = [
            {field: str(row.get(field) or "") for field in fieldnames}
            for row in reader
        ]
    return fieldnames, rows


def _find_wallet_row(rows: list[dict[str, str]], wallet_id: str) -> int:
    for index, row in enumerate(rows, start=1):
        try:
            public_key = _wallet_row_public_key(row)
        except Exception:
            continue
        if public_key and _wallet_id(index, public_key) == wallet_id:
            return index - 1
    raise ValueError("Кошелёк не найден в активном CSV-файле.")


def _write_wallet_rows(
    path: Path, fieldnames: list[str], rows: list[dict[str, str]]
) -> None:
    temporary = path.with_name(f".{path.name}.{secrets.token_hex(4)}.tmp")
    try:
        with temporary.open("w", newline="", encoding="utf-8-sig") as stream:
            writer = csv.DictWriter(stream, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _deduplicate_wallet_rows(path: Path) -> int:
    fieldnames, rows = _read_wallet_rows(path)
    unique_rows: list[dict[str, str]] = []
    seen_private_keys: set[str] = set()
    removed = 0
    for row in rows:
        try:
            private_key, _ = _convert_private_key((row.get("privkey") or "").strip())
        except Exception:
            unique_rows.append(row)
            continue
        if private_key and private_key in seen_private_keys:
            removed += 1
            continue
        if private_key:
            seen_private_keys.add(private_key)
        unique_rows.append(row)
    if removed:
        _write_wallet_rows(path, fieldnames, unique_rows)
    return removed


async def wallet_create_handler(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
        name = str(payload.get("name", "")).strip()
        private_key_raw = str(payload.get("privkey", "")).strip()
        if not name:
            raise ValueError("Название кошелька не может быть пустым.")
        if len(name) > 80 or any(character in name for character in "\r\n"):
            raise ValueError("Название должно быть короче 80 символов и занимать одну строку.")
        if not private_key_raw:
            raise ValueError("Укажи приватный ключ.")

        private_key, derived_public_key = _convert_private_key(private_key_raw)
        keypair = Keypair.from_base58_string(private_key)
        public_key = derived_public_key or str(keypair.pubkey())

        async with STATE.wallet_file_lock:
            path = wallet_file_path()
            fieldnames, rows = _read_wallet_rows(path)
            for row in rows:
                try:
                    existing_public_key = _wallet_row_public_key(row)
                except Exception:
                    continue
                if existing_public_key == public_key:
                    raise ValueError("Этот кошелёк уже есть в активном CSV-файле.")

            for field in ("name", "pubkey"):
                if field not in fieldnames:
                    fieldnames.append(field)
                    for row in rows:
                        row[field] = ""
            new_row = {field: "" for field in fieldnames}
            new_row.update({"name": name, "pubkey": public_key, "privkey": private_key})
            rows.append(new_row)
            _write_wallet_rows(path, fieldnames, rows)
            wallets, _ = load_wallets(path)

        STATE.balance_cache.clear()
        return web.json_response(
            {"ok": True, "wallet_count": len(wallets), "pubkey": public_key}
        )
    except ValueError as error:
        return _json_error(str(error))
    except Exception as error:
        return _json_error(f"Не удалось добавить кошелёк: {error}")


async def wallet_update_handler(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
        wallet_id = str(payload.get("id", "")).strip()
        name = str(payload.get("name", "")).strip()
        if not wallet_id:
            raise ValueError("Не указан кошелёк.")
        if not name:
            raise ValueError("Название кошелька не может быть пустым.")
        if len(name) > 80 or any(character in name for character in "\r\n"):
            raise ValueError("Название должно быть короче 80 символов и занимать одну строку.")

        async with STATE.wallet_file_lock:
            path = wallet_file_path()
            fieldnames, rows = _read_wallet_rows(path)
            row_index = _find_wallet_row(rows, wallet_id)
            if "name" not in fieldnames:
                fieldnames.insert(0, "name")
                for row in rows:
                    row["name"] = ""
            rows[row_index]["name"] = name
            _write_wallet_rows(path, fieldnames, rows)

        STATE.balance_cache.clear()
        return web.json_response({"ok": True, "name": name})
    except (ValueError, csv.Error) as error:
        return _json_error(str(error))
    except OSError as error:
        return _json_error(f"Не удалось изменить CSV-файл: {error}", 500)


async def wallet_delete_handler(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
        wallet_id = str(payload.get("id", "")).strip()
        if not wallet_id:
            raise ValueError("Не указан кошелёк.")

        async with STATE.wallet_file_lock:
            path = wallet_file_path()
            fieldnames, rows = _read_wallet_rows(path)
            del rows[_find_wallet_row(rows, wallet_id)]
            _write_wallet_rows(path, fieldnames, rows)
            wallets, _ = load_wallets(path)

        STATE.balance_cache.clear()
        return web.json_response({"ok": True, "wallet_count": len(wallets)})
    except (ValueError, csv.Error) as error:
        return _json_error(str(error))
    except OSError as error:
        return _json_error(f"Не удалось изменить CSV-файл: {error}", 500)


def _parse_amount(value: Any) -> tuple[float, bool]:
    raw = str(value).strip().replace(",", ".")
    is_percent = raw.endswith("%")
    if is_percent:
        raw = raw[:-1].strip()
    try:
        amount = float(raw)
    except ValueError as error:
        raise ValueError("Укажи корректную сумму.") from error
    if not math.isfinite(amount) or amount <= 0:
        raise ValueError("Сумма должна быть больше нуля.")
    if is_percent and amount > 100:
        raise ValueError("Процент должен быть в диапазоне от 0 до 100.")
    if not is_percent and amount <= 0.000005:
        raise ValueError("Минимальная сумма — больше 0.000005 SOL.")
    return amount, is_percent


def _get_wallet_map() -> tuple[dict[str, Wallet], list[str]]:
    wallets, warnings = load_wallets()
    return {wallet.id: wallet for wallet in wallets}, warnings


def _wallets_by_ids(wallet_map: dict[str, Wallet], ids: Any) -> list[Wallet]:
    if not isinstance(ids, list):
        raise ValueError("Некорректный список кошельков.")
    result = []
    seen = set()
    for wallet_id in ids:
        if wallet_id in seen:
            continue
        wallet = wallet_map.get(str(wallet_id))
        if not wallet:
            raise ValueError("Один из выбранных кошельков больше не существует.")
        seen.add(wallet_id)
        result.append(wallet)
    return result


def _recipient_from_payload(
    payload: dict[str, Any], wallet_map: dict[str, Wallet]
) -> tuple[str, str]:
    recipient_id = str(payload.get("recipient_id", "")).strip()
    if recipient_id:
        wallet = wallet_map.get(recipient_id)
        if not wallet:
            raise ValueError("Кошелёк получателя не найден.")
        return wallet.pubkey, wallet.name
    address = str(payload.get("recipient_address", "")).strip()
    try:
        Pubkey.from_string(address)
    except Exception as error:
        raise ValueError("Укажи корректный Solana-адрес получателя.") from error
    return address, _short_address(address)


async def _source_balances(sources: list[Wallet], url: str) -> dict[str, int]:
    balances, error, _ = await _fetch_balances(sources, url)
    if error and all(value == 0 for value in balances.values()):
        raise ValueError(error)
    return balances


def _make_transfer(
    sender: Wallet, recipient: str, recipient_label: str, lamports: int
) -> dict[str, Any]:
    return {
        "sender_id": sender.id,
        "sender_name": sender.name,
        "sender_pubkey": sender.pubkey,
        "recipient": recipient,
        "recipient_label": recipient_label,
        "lamports": lamports,
        "amount": lamports / LAMPORTS_PER_SOL,
        "fee_lamports": TRANSACTION_FEE_LAMPORTS,
        "fee": TRANSACTION_FEE_LAMPORTS / LAMPORTS_PER_SOL,
    }


async def _build_preview(payload: dict[str, Any]) -> Preview:
    mode = str(payload.get("mode", "single"))
    wallet_map, _ = _get_wallet_map()
    if not wallet_map:
        raise ValueError("Сначала добавь хотя бы один кошелёк.")
    url = rpc_url()
    transfers: list[dict[str, Any]] = []

    if mode in {"single", "consolidate"}:
        sources = _wallets_by_ids(wallet_map, payload.get("source_ids", []))
        if mode == "single" and len(sources) != 1:
            raise ValueError("Выбери один кошелёк-отправитель.")
        if mode == "consolidate" and not sources:
            raise ValueError("Выбери кошельки-источники.")
        recipient, recipient_label = _recipient_from_payload(payload, wallet_map)
        if any(source.pubkey == recipient for source in sources):
            raise ValueError("Получатель не может совпадать с отправителем.")
        amount, is_percent = _parse_amount(payload.get("amount"))
        balances = await _source_balances(sources, url)
        for source in sources:
            balance = balances[source.id]
            spendable = max(0, balance - TRANSACTION_FEE_LAMPORTS)
            lamports = (
                int(spendable * amount / 100)
                if is_percent
                else int(amount * LAMPORTS_PER_SOL)
            )
            if lamports <= 0 or lamports + TRANSACTION_FEE_LAMPORTS > balance:
                raise ValueError(f"Недостаточно SOL на кошельке «{source.name}».")
            transfers.append(
                _make_transfer(source, recipient, recipient_label, lamports)
            )

    elif mode == "distribute":
        sources = _wallets_by_ids(wallet_map, payload.get("source_ids", []))
        destinations = _wallets_by_ids(
            wallet_map, payload.get("destination_ids", [])
        )
        if len(sources) != 1:
            raise ValueError("Выбери один кошелёк-отправитель.")
        if not destinations:
            raise ValueError("Выбери хотя бы одного получателя.")
        source = sources[0]
        destinations = [item for item in destinations if item.id != source.id]
        if not destinations:
            raise ValueError("Отправитель не может быть единственным получателем.")
        amount, is_percent = _parse_amount(payload.get("amount"))
        if is_percent:
            raise ValueError("Для массовой отправки укажи сумму в SOL на получателя.")
        lamports = int(amount * LAMPORTS_PER_SOL)
        balances = await _source_balances([source], url)
        total_cost = len(destinations) * (lamports + TRANSACTION_FEE_LAMPORTS)
        if total_cost > balances[source.id]:
            required = total_cost / LAMPORTS_PER_SOL
            raise ValueError(
                f"Недостаточно SOL: потребуется примерно {required:.6f} SOL с комиссиями."
            )
        transfers.extend(
            _make_transfer(source, item.pubkey, item.name, lamports)
            for item in destinations
        )

    elif mode == "equalize":
        wallets = _wallets_by_ids(wallet_map, payload.get("source_ids", []))
        if len(wallets) < 2:
            raise ValueError("Для выравнивания выбери минимум два кошелька.")
        balances = await _source_balances(wallets, url)
        target = sum(balances.values()) // len(wallets)
        donors = [
            [wallet, balances[wallet.id] - target]
            for wallet in wallets
            if balances[wallet.id] > target + TRANSACTION_FEE_LAMPORTS
        ]
        receivers = [
            [wallet, target - balances[wallet.id]]
            for wallet in wallets
            if balances[wallet.id] < target
        ]
        donor_index = 0
        for receiver_entry in receivers:
            receiver, needed = receiver_entry
            while needed > 0 and donor_index < len(donors):
                donor, surplus = donors[donor_index]
                available = max(0, surplus - TRANSACTION_FEE_LAMPORTS)
                amount = min(needed, available)
                if amount > 0:
                    transfers.append(
                        _make_transfer(donor, receiver.pubkey, receiver.name, amount)
                    )
                    donors[donor_index][1] -= amount + TRANSACTION_FEE_LAMPORTS
                    needed -= amount
                if donors[donor_index][1] <= TRANSACTION_FEE_LAMPORTS:
                    donor_index += 1
                elif amount <= 0:
                    donor_index += 1
        if not transfers:
            raise ValueError("Балансы уже выровнены или недостаточны для комиссий.")
    else:
        raise ValueError("Неизвестный режим перевода.")

    network = await _resolve_rpc_network(url)
    return Preview(
        created_at=time.time(),
        rpc_url=url,
        wallet_file=wallet_file_name(),
        mode=mode,
        transfers=transfers,
        network=network,
    )


def _public_preview(preview_id: str, preview: Preview) -> dict[str, Any]:
    total_lamports = sum(item["lamports"] for item in preview.transfers)
    total_fees = sum(item["fee_lamports"] for item in preview.transfers)
    wallet_pubkeys = {wallet.pubkey for wallet in load_wallets()[0]}
    has_external_recipient = any(
        item["recipient"] not in wallet_pubkeys for item in preview.transfers
    )
    network = (
        preview.network
        or STATE.rpc_network_cache.get(preview.rpc_url)
        or _network_name(preview.rpc_url)
    )
    warnings: list[dict[str, str]] = []
    if has_external_recipient:
        warnings.append(
            {
                "code": "external-recipient",
                "severity": "danger",
                "message": (
                    "Среди получателей есть внешний адрес. Сверь его полностью "
                    "перед отправкой."
                ),
            }
        )
    if network == "Mainnet":
        warnings.append(
            {
                "code": "mainnet",
                "severity": "warning",
                "message": "Операция будет выполнена в основной сети Mainnet.",
            }
        )
    if len(preview.transfers) > 1:
        warnings.append(
            {
                "code": "batch",
                "severity": "warning",
                "message": (
                    f"Будет отправлено транзакций: {len(preview.transfers)}. "
                    "Каждая из них необратима."
                ),
            }
        )
    return {
        "preview_id": preview_id,
        "expires_in": PREVIEW_TTL_SECONDS,
        "mode": preview.mode,
        "network": network,
        "rpc_host": urlparse(preview.rpc_url).hostname or preview.rpc_url,
        "transfers": preview.transfers,
        "transfer_count": len(preview.transfers),
        "total_amount": total_lamports / LAMPORTS_PER_SOL,
        "estimated_fee": total_fees / LAMPORTS_PER_SOL,
        "total_debit": (total_lamports + total_fees) / LAMPORTS_PER_SOL,
        "warnings": warnings,
        "requires_acknowledgement": has_external_recipient
        or (network == "Mainnet" and len(preview.transfers) > 1),
    }


async def transaction_preview_handler(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            raise ValueError("Некорректные параметры перевода.")
        preview = await _build_preview(payload)
        preview_id = secrets.token_urlsafe(24)
        STATE.previews = {
            key: value
            for key, value in STATE.previews.items()
            if time.time() - value.created_at < PREVIEW_TTL_SECONDS
        }
        STATE.previews[preview_id] = preview
        return web.json_response(_public_preview(preview_id, preview))
    except ValueError as error:
        return _json_error(str(error))
    except Exception as error:
        logger.exception("Failed to build transaction preview")
        return _json_error(f"Не удалось подготовить перевод: {error}", 500)


async def _submit_transfer(
    client: AsyncClient, sender: Keypair, recipient: Pubkey, lamports: int
) -> str:
    blockhash_response = await client.get_latest_blockhash()
    recent_blockhash: Hash = blockhash_response.value.blockhash
    instruction = Instruction(
        program_id=SYSTEM_PROGRAM_ID,
        accounts=[
            AccountMeta(sender.pubkey(), True, True),
            AccountMeta(recipient, False, True),
        ],
        data=(2).to_bytes(4, "little") + lamports.to_bytes(8, "little"),
    )
    message = Message([instruction], sender.pubkey())
    transaction = Transaction([sender], message, recent_blockhash)
    response = await client.send_raw_transaction(
        bytes(transaction), opts=TxOpts(skip_preflight=False)
    )
    return str(response.value)


async def transaction_send_handler(request: web.Request) -> web.Response:
    preview_id = ""
    try:
        payload = await request.json()
        preview_id = str(payload.get("preview_id", ""))
        preview = STATE.previews.pop(preview_id, None)
        if not preview:
            return _json_error(
                "Предпросмотр истёк. Подготовь перевод ещё раз.",
                code="preview_expired",
            )
        if time.time() - preview.created_at >= PREVIEW_TTL_SECONDS:
            return _json_error(
                "Предпросмотр истёк. Подготовь перевод ещё раз.",
                code="preview_expired",
            )
        if preview.wallet_file != wallet_file_name() or preview.rpc_url != rpc_url():
            raise ValueError("Настройки изменились. Подготовь перевод заново.")

        wallet_map, _ = _get_wallet_map()
        operation_id = secrets.token_hex(8)
        results: list[dict[str, Any]] = []
        failed_items: list[dict[str, Any]] = []
        async with AsyncClient(preview.rpc_url, timeout=20) as client:
            for item in preview.transfers:
                wallet = wallet_map.get(item["sender_id"])
                if not wallet or wallet.pubkey != item["sender_pubkey"]:
                    raise ValueError("Состав кошельков изменился. Подготовь перевод заново.")
                try:
                    signature = await _submit_transfer(
                        client,
                        Keypair.from_base58_string(wallet.privkey),
                        Pubkey.from_string(item["recipient"]),
                        int(item["lamports"]),
                    )
                except Exception as error:
                    error_message = str(error)
                    failed_items.append(item)
                    results.append(
                        {
                            **item,
                            "status": "failed",
                            "error": error_message,
                        }
                    )
                    logger.exception("Desktop transaction failed inside batch")
                    STATE.activity.appendleft(
                        {
                            "id": secrets.token_hex(8),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "title": f"{wallet.name} → {item['recipient_label']}",
                            "message": f"Не отправлено · {item['amount']:.9f} SOL",
                            "tone": "error",
                            "status": "failed",
                            "error": error_message,
                            "source": "desktop",
                        }
                    )
                    continue
                result = {**item, "signature": signature, "status": "submitted"}
                results.append(result)
                activity_entry = {
                    "id": signature,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "title": f"{wallet.name} → {item['recipient_label']}",
                    "message": f"Отправлено в сеть · {item['amount']:.9f} SOL",
                    "tone": "info",
                    "status": "submitted",
                    "source": "desktop",
                    "signature": signature,
                }
                STATE.activity.appendleft(activity_entry)
                STATE.pending_transactions[signature] = {
                    "entry": activity_entry,
                    "rpc_url": preview.rpc_url,
                    "amount": item["amount"],
                }
                logger.success(
                    f"Desktop transaction submitted: {signature} "
                    f"({wallet.name} -> {item['recipient']}, {item['amount']:.9f} SOL)"
                )
        STATE.balance_cache.clear()
        submitted = sum(item["status"] == "submitted" for item in results)
        response_payload: dict[str, Any] = {
            "ok": not failed_items,
            "operation_id": operation_id,
            "submitted": submitted,
            "failed": len(failed_items),
            "planned": len(preview.transfers),
            "results": results,
        }
        if failed_items:
            retry_preview = Preview(
                created_at=time.time(),
                rpc_url=preview.rpc_url,
                wallet_file=preview.wallet_file,
                mode=preview.mode,
                transfers=failed_items,
                network=preview.network,
            )
            retry_preview_id = secrets.token_urlsafe(24)
            STATE.previews[retry_preview_id] = retry_preview
            response_payload["retry_preview"] = _public_preview(
                retry_preview_id, retry_preview
            )
            response_payload["error"] = (
                f"Не отправлено транзакций: {len(failed_items)} из "
                f"{len(preview.transfers)}."
            )
        return web.json_response(response_payload)
    except ValueError as error:
        return _json_error(str(error))
    except Exception as error:
        logger.exception("Desktop transaction failed")
        STATE.activity.appendleft(
            {
                "id": secrets.token_hex(8),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "title": "Перевод не выполнен",
                "message": str(error),
                "tone": "error",
                "source": "desktop",
            }
        )
        return _json_error(f"Транзакция отклонена: {error}", 502)


@web.middleware
async def security_middleware(
    request: web.Request, handler: Any
) -> web.StreamResponse:
    origin = request.headers.get("Origin")
    if origin and origin not in ALLOWED_ORIGINS:
        return _json_error("Origin is not allowed.", 403)
    if request.method == "OPTIONS":
        response = web.Response(status=204)
    else:
        if request.path.startswith("/api/"):
            expected_token = os.getenv("SOL_WALLET_DESKTOP_TOKEN", "").strip()
            if expected_token and not secrets.compare_digest(
                request.headers.get("X-Sol-Wallet-Token", ""), expected_token
            ):
                return _json_error("Desktop session token is invalid.", 403)
            if (
                request.path != "/api/health"
                and request.headers.get("X-Sol-Wallet-Client") != "desktop"
            ):
                return _json_error("Desktop client header is required.", 403)
        response = await handler(request)
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = (
            "Content-Type, X-Sol-Wallet-Client, X-Sol-Wallet-Token"
        )
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def create_app() -> web.Application:
    app = web.Application(
        middlewares=[security_middleware], client_max_size=MAX_UPLOAD_BYTES
    )
    app.add_routes(
        [
            web.get("/api/health", health_handler),
            web.get("/api/state", state_handler),
            web.get("/api/activity", activity_handler),
            web.post("/api/rpc/test", rpc_test_handler),
            web.post("/api/rpc", rpc_save_handler),
            web.post("/api/wallet-file/select", wallet_file_select_handler),
            web.post("/api/wallet-file/create", wallet_file_create_handler),
            web.post("/api/wallet-file/import", wallet_file_import_handler),
            web.post("/api/wallet/create", wallet_create_handler),
            web.post("/api/wallet/update", wallet_update_handler),
            web.post("/api/wallet/delete", wallet_delete_handler),
            web.post("/api/transaction/preview", transaction_preview_handler),
            web.post("/api/transaction/send", transaction_send_handler),
        ]
    )
    return app


def main() -> None:
    host = os.getenv("SOL_WALLET_BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("SOL_WALLET_BACKEND_PORT", "8765"))
    web.run_app(create_app(), host=host, port=port, print=None)


if __name__ == "__main__":
    main()
