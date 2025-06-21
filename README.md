# 🪙 Solana CLI Wallet (Python)

Консольный кошелёк для работы с Solana без использования сторонних GUI-кошельков.

---

## 📦 Возможности

- Импорт приватных ключей (base58 / JSON-массив).
- Просмотр баланса SOL, SPL-токенов, NFT.
- Отправка SOL, токенов, NFT.
- Массовая (batch) отправка.
- Расшифровка токенов по метаданным (Metaplex).
- Безопасность: ключи только в ОЗУ, опциональное шифрование.
- Работа через RPC без Phantom/MetaMask.
- Конфигурация сети через `.env`.

---

## 🔧 Установка

### 🐧 Linux / 🍎 MacOS

```bash
git clone https://github.com/eerinessofsilence/solana-cli-wallet
cd solana-cli-wallet
python3 -m venv venv
pip install -r requirements.txt
python3 main.py
```
