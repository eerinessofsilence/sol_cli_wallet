# NODAL

**NODAL** is a local-first Solana operations desk with an Electron desktop app and an interactive Python CLI. It connects directly to Solana RPC endpoints, keeping private keys inside the local Python process rather than returning them to the UI.

## Highlights

- Import Base58 and JSON-array private keys
- View SOL, SPL token, and NFT balances
- Send SOL, tokens, and NFTs with an amount and fee review before signing
- Run batch distributions, wallet consolidation, and balance equalization
- Search wallets, import CSV files, and check RPC health from the desktop app
- Configure the active RPC endpoint and wallet file through `.env`

## Stack

- Python 3.11+
- Electron + React desktop interface
- Solana RPC

## Start the CLI

```bash
git clone https://github.com/eerinessofsilence/sol_cli_wallet
cd sol_cli_wallet
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 main.py
```

Create or select the wallet CSV referenced by `CSV_FILE` in `.env`. The expected header is:

```csv
name,pubkey,privkey
```

## Start the Desktop App

```bash
cd desktop-ui
npm install
cd ..
python3 run_desktop.py
```

Build the desktop renderer:

```bash
cd desktop-ui
npm run build
```

The desktop backend binds only to `127.0.0.1` and uses the same `.env` and wallet CSV file as the CLI.

## Security

- Never commit `.env` files or wallet CSV files containing private keys.
- Protect the computer running NODAL and use a trusted RPC endpoint.
- Always review transaction details before signing.
