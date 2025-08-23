import csv
from pathlib import Path
from dotenv import load_dotenv
from os import getenv

load_dotenv()

CSV_FILE = Path(__file__).parent / getenv("CSV_FILE")

def load_csv(path: str) -> list[dict]:
    """Load CSV file and return list of dicts."""
    wallets = []
    try:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                wallets.append({k: v.strip() for k, v in row.items()})
    except FileNotFoundError:
        print(f"File {path} not found.")
    except Exception as e:
        print(f"Error reading {path}: {e}")
    return wallets


def load_wallets() -> list[dict]:
    wallets = []
    for i, wallet in enumerate(load_csv(CSV_FILE)):
        name = wallet.get("name").strip() if wallet.get("name") else str(i + 1)
        wallets.append(
            {"name": name, "pubkey": wallet.get("pubkey", "").strip(), "privkey": wallet.get("privkey", "").strip()}
        )
    return wallets

WALLETS = load_wallets()

WALLET_NAMES = [w.get("name") for w in WALLETS]
PUBLIC_KEYS  = [w.get("pubkey") for w in WALLETS]
PRIVATE_KEYS = [w.get("privkey") for w in WALLETS]