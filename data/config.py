import csv
import base58
import ast
from utils.logger import logger
from solders.keypair import Keypair
from pathlib import Path
from dotenv import load_dotenv
from os import getenv
from solders.keypair import Keypair

load_dotenv()

CSV_FILE = Path(__file__).parent / getenv("CSV_FILE")


def keypair_from_array(arr: list[int]) -> tuple[str, str]:
    """
    From a 64-byte array [seed(32) + pub(32)] returns (priv_base58, pub_base58).
    """
    seed = bytes(arr[:32])
    kp = Keypair.from_seed(seed)
    priv_base58 = base58.b58encode(bytes(arr)).decode()
    pub_base58 = str(kp.pubkey())
    return priv_base58, pub_base58

def fix_privkeys(path: str):
    """
    Reads a CSV with a column 'privkey', converts 64-byte arrays to base58,
    and immediately sets the pubkey, overwriting the same file.
    """
    rows = []
    try:
        with open(path, newline="", encoding="utf-8") as f_in:
            reader = csv.DictReader(f_in)
            if not reader.fieldnames:
                raise ValueError("CSV без заголовка. Нужен столбец 'privkey'.")
            fieldnames = list(reader.fieldnames)
            if "pubkey" not in fieldnames:
                fieldnames.append("pubkey")

            for row in reader:
                v = row.get("privkey")
                if v and v.lstrip().startswith("["):
                    try:
                        arr = ast.literal_eval(v)
                        if not (isinstance(arr, list) and all(isinstance(x, int) and 0 <= x <= 255 for x in arr)):
                            raise ValueError("privkey должен быть list[int 0..255]")

                        priv_base58, pub_base58 = keypair_from_array(arr)
                        row["privkey"] = priv_base58
                        row["pubkey"] = pub_base58

                    except Exception as e:
                        logger.error(f"Bad privkey in row: {v} ({e})")

                rows.append(row)

        with open(path, "w", newline="", encoding="utf-8") as f_out:
            writer = csv.DictWriter(f_out, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
    except FileNotFoundError:
        logger.error(f"File {path} not found.")

def load_csv(path: str) -> list[dict]:
    """Load CSV file and return list of dicts."""
    wallets = []
    try:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                wallets.append({k: v.strip() for k, v in row.items()})
    except FileNotFoundError:
        logger.error(f"File {path} not found.")
    except Exception as e:
        logger.error(f"Error reading {path}: {e}")
    return wallets

def load_wallets() -> list[dict]:
    """Return list of wallets."""
    wallets = []
    for i, wallet in enumerate(load_csv(CSV_FILE)):
        name = wallet.get("name").strip() if wallet.get("name") else str(i + 1)
        wallets.append(
            {"name": name, "pubkey": wallet.get("pubkey", "").strip(), "privkey": wallet.get("privkey", "").strip()}
        )
    return wallets

fix_privkeys(CSV_FILE)
WALLETS = load_wallets()

WALLET_NAMES = [w.get("name") for w in WALLETS]
PUBLIC_KEYS  = [w.get("pubkey") for w in WALLETS]
PRIVATE_KEYS = [w.get("privkey") for w in WALLETS]

RPCS: list[str] = ["https://api.mainnet-beta.solana.com"]