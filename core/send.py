import os
import asyncio
from data import config
from utils.logger import logger
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction
from solders.instruction import Instruction, AccountMeta
from solders.message import Message
from solders.hash import Hash
from solana.rpc.async_api import AsyncClient
from solana.rpc.types import TxOpts

async def send_transaction(
    client: AsyncClient,
    sender: Keypair,
    receiver: Pubkey,
    lamports: int = 1_000_000  # 1 SOL = 1_000_000_000 lamports
) -> str:
    # Получаем последний блокхеш
    bh_resp = await client.get_latest_blockhash()
    recent_blockhash = bh_resp.value.blockhash

    # Создаем инструкцию (transfer)
    SYSTEM_PROGRAM_ID = Pubkey.from_string("11111111111111111111111111111111")
    instruction = Instruction(
        program_id=SYSTEM_PROGRAM_ID,
        accounts=[
            AccountMeta(public_key=sender.public_key(), is_signer=True, is_writable=True),
            AccountMeta(public_key=receiver, is_signer=False, is_writable=True),
        ],
        data=bytes([2]) + lamports.to_bytes(8, "little")
    )

    # Создаем сообщение и транзакцию
    message = Message([instruction], sender.public_key(), recent_blockhash)
    tx = Transaction([sender], message, recent_blockhash)

    # Отправляем в сеть
    resp = await client.send_raw_transaction(bytes(tx), opts=TxOpts(skip_preflight=True))
    print("✅ Signature:", resp.value)

    await client.close()

        
async def send_from_wallet(account_from: dict, account_to: dict):
    RPC_URL = os.getenv("RPC_URL", "https://api.mainnet-beta.solana.com")

    async with AsyncClient(RPC_URL) as client:
        transaction = await send_transaction(client=client, 
                                             sender=Keypair.from_secret_key(account_from["private_key"]),
                                             receiver=Pubkey.from_string(account_to["public_key"]))
        logger.info(f"{transaction}")  
            
async def send_to_single_wallet():
    RPC_URL = os.getenv("RPC_URL", "https://api.mainnet-beta.solana.com")
    accounts = config.WALLETS
    public_keys = [account["public_key"] for account in accounts if account["public_key"]]

    async with AsyncClient(RPC_URL) as client:
        tasks = [send_transaction(client, public_key) for public_key in public_keys]
        transactions = await asyncio.gather(*tasks)

        for account, transaction in zip(accounts, transactions):
            public_key = account["public_key"]
            logger.info(f"{public_key}: {transaction} lamports")
