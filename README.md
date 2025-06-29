# 🪙 Solana CLI Wallet (Python)

A command-line wallet for working with Solana without using third-party GUI wallets.

---

## 📦 Features

- Import private keys (base58 / JSON array).
- View SOL balance, SPL tokens, NFTs.
- Send SOL, tokens, NFTs.
- Batch (mass) sending.
- Security: keys only in RAM, optional encryption.
- Works via RPC without Phantom/MetaMask.
- Network configuration via `.env`.

---

## 🔧 Installation

### ⚙️ Requirements

- Python 3.11+

### 🐧 Linux / 🍎 MacOS

```bash
git clone https://github.com/eerinessofsilence/solana-cli-wallet
cd solana-cli-wallet
python3 -m venv venv
source venv/bin/activate
pip3 install -r requirements.txt
python3 main.py
```

### 🪟 Windows

```bash
git clone https://github.com/eerinessofsilence/solana-cli-wallet
cd solana-cli-wallet
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
