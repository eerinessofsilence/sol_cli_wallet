import logging
import sys

class ColoredFormatter(logging.Formatter):
    COLORS = {
        logging.DEBUG: "\033[37m",    # Белый
        logging.INFO: "\033[32m",     # Голубой
        logging.WARNING: "\033[33m",  # Жёлтый
        logging.ERROR: "\033[31m",    # Красный
        logging.CRITICAL: "\033[41m", # Красный фон
    }
    RESET = "\033[0m"

    def format(self, record):
        color = self.COLORS.get(record.levelno, self.RESET)
        message = super().format(record)
        return f"{color}{message}{self.RESET}"

logger = logging.getLogger("sol_cli_wallet")
logger.setLevel(logging.INFO)

fmt = "%(asctime)s %(levelname)s ▶ %(message)s"
formatter = logging.Formatter(fmt, datefmt="%H:%M:%S")

colored_formatter = ColoredFormatter(fmt, datefmt="%H:%M:%S")

file_handler = logging.FileHandler("transactions.log")
file_handler.setFormatter(formatter)

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(colored_formatter)

logger.addHandler(file_handler)
logger.addHandler(console_handler)
