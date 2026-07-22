import logging
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = ROOT / "logs"
LOG_FILE = LOG_DIR / "transactions.log"
REDACTED = "[REDACTED]"
SECRET_FIELD_PATTERN = re.compile(
    r"""(?ix)
    (
        ["']?
        (?:priv(?:ate)?_?key|secret_?key|seed)
        ["']?
        \s*[:=]\s*
    )
    (
        \[[^\]\r\n]*\]
        |
        ["'][^"'\r\n]*["']
        |
        [^\s,}\r\n]+
    )
    """
)


def redact_secrets(value: object) -> str:
    """Remove labeled private-key material from log output."""

    return SECRET_FIELD_PATTERN.sub(
        lambda match: f"{match.group(1)}'{REDACTED}'",
        str(value),
    )


class RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return redact_secrets(super().format(record))

class ColoredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        cyan = "\033[34m"
        red = "\033[31m"
        green = "\033[32m"
        gray = "\033[99m"
        reset = "\033[0m"

        record.asctime = f"{gray}{self.formatTime(record, datefmt='%H:%M:%S')}{reset}"
        message = redact_secrets(record.getMessage())
        if getattr(record, "success", False):
            return f"[✓] {record.asctime} | {green}{message}{reset}"
        if getattr(record, "error", False):
            return f"[!] {record.asctime} | {red}{message}{reset}"
        return f"[•] {record.asctime} | {cyan}{message}{reset}"


formatter = ColoredFormatter()

logger = logging.getLogger("sol_cli_wallet")
logger.setLevel(logging.INFO)
logger.propagate = False

LOG_DIR.mkdir(parents=True, exist_ok=True)
file_handler = logging.FileHandler(LOG_FILE)
file_handler.setFormatter(
    RedactingFormatter("[•] %(asctime)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
)
try:
    os.chmod(LOG_FILE, 0o600)
except OSError:
    pass

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)

if not logger.handlers:
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)


def success(self, msg, *args, **kwargs):
    extra = kwargs.get("extra", {})
    extra["success"] = True
    kwargs["extra"] = extra
    self.info(msg, *args, **kwargs)


logging.Logger.success = success


def error(self, msg, *args, **kwargs):
    extra = kwargs.get("extra", {})
    extra["error"] = True
    kwargs["extra"] = extra
    self.info(msg, *args, **kwargs)


logging.Logger.error = error
