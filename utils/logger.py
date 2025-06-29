import logging
import sys
import os

class ColoredFormatter(logging.Formatter):
    def format(self, record):
        cyan = "\033[34m"
        red = "\033[31m"
        green = "\033[32m"
        gray = "\033[99m"
        reset = "\033[0m"

        # Цвета по частям
        record.asctime = f"{gray}{self.formatTime(record, datefmt='%H:%M:%S')}{reset}"
        # Для success сообщений используем зелёный
        if getattr(record, "success", False):
            record.message = f"{green}{record.getMessage()}{reset}"
            return f"[✓] {record.asctime} | {record.message}"
        elif getattr(record, "error", False):
            record.message = f"{red}{record.getMessage()}{reset}"
            return f"[!] {record.asctime} | {record.message}"
        else:
            record.message = f"{cyan}{record.getMessage()}{reset}"
            return f"[•] {record.asctime} | {record.message}"



formatter = ColoredFormatter()

logger = logging.getLogger("sol_cli_wallet")
logger.setLevel(logging.INFO)

os.makedirs("logs", exist_ok=True)
file_handler = logging.FileHandler("logs/transactions.log")
file_handler.setFormatter(logging.Formatter("[•] %(asctime)s | %(message)s", datefmt="%H:%M:%S"))

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)

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
