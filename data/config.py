import csv
from pathlib import Path

CSV_FILE = Path(__file__).parent / "wallets.csv"

def load_wallets(csv_path: Path):
    wallets = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            wallets.append({
                "name": row["name"].strip(),
                "pubkey": row["pubkey"].strip(),
                "privkey": row["privkey"].strip(),
            })
    return wallets

WALLETS: list[dict] = load_wallets(CSV_FILE)
PUBLIC_KEYS: list[str] = [wallet.get("pubkey") for wallet in WALLETS]
PRIVATE_KEYS: list[str] = [wallet.get("privkey") for wallet in WALLETS]
WALLET_NAMES: list[str] = [
    wallet.get("name").strip() if wallet.get("name") else f"{i + 1}"
    for i, wallet in enumerate(WALLETS)
]