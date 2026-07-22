# 🪙 Solana CLI Wallet (Python)

A command-line wallet for working with Solana without using third-party GUI wallets.

The project now has two independent entry points:

- **Desktop UI** — Electron + React interface for day-to-day work.
- **CLI** — the original interactive terminal menu remains available.

---

## 📦 Features

- Import private keys (base58 / JSON array).
- View SOL balance, SPL tokens, NFTs.
- Send SOL, tokens, NFTs.
- Batch (mass) sending.
- Security: keys only in RAM, optional encryption.
- Works via RPC without Phantom/MetaMask.
- Network configuration via `.env`.
- Desktop dashboard, wallet search, CSV import and RPC health checks.
- Transaction review with the exact amount and estimated fee before signing.
- Batch distribution, consolidation and balance equalization.
- Private keys stay inside the local Python process and are never returned to the UI.

---

## 🔧 Installation

### ⚙️ Requirements

- Python 3.11+

### 🐧 Linux / 🍎 MacOS

```bash
git clone https://github.com/eerinessofsilence/sol_cli_wallet
cd sol_cli_wallet
python3 -m venv venv
source venv/bin/activate
pip3 install -r requirements.txt
echo "name,pubkey,privkey" > data/wallets.csv
echo "RPC_URL=https://api.mainnet-beta.solana.com" > .env
echo "CSV_FILE=wallets.csv" >> .env
python3 main.py
```

### Desktop UI

Install the Python dependencies as above, then install the renderer dependencies once:

```bash
cd desktop-ui
npm install
cd ..
```

Start the desktop application:

```bash
python3 run_desktop.py
```

For a production renderer build:

```bash
cd desktop-ui
npm run build
```

The renderer uses Tailwind CSS utilities directly in React `className` attributes. To format
TypeScript, JSX, and Tailwind class order consistently:

```bash
cd desktop-ui
npm run format
```

The desktop backend binds only to `127.0.0.1`. It reads the same `.env` and CSV file as the CLI, so changing the active RPC or wallet file in the UI also changes it for the next CLI launch.

### 🪟 Windows

```bash
git clone https://github.com/eerinessofsilence/sol_cli_wallet
cd sol_cli_wallet
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
echo name,pubkey,privkey > data\wallets.csv
echo RPC_URL=https://api.mainnet-beta.solana.com > .env
echo CSV_FILE=wallets.csv >> .env
python main.py
```
