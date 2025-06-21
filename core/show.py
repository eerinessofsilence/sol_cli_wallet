import os
import asyncio
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey
from data import config
from utils.logger import logger

async def get_balance(client, public_key_str: str) -> int:
    public_key = Pubkey.from_string(public_key_str)
    resp = await client.get_balance(public_key)
    return resp.value / 1_000_000_000

async def show_wallet_balance(account: dict):
    RPC_URL = os.getenv("RPC_URL", "https://api.mainnet-beta.solana.com")
    public_key_str = account["public_key"]

    async with AsyncClient(RPC_URL) as client:
        balance = await get_balance(client, public_key_str)
        logger.info(f"{public_key_str}: {balance} SOL")
        
async def show_all_wallets_balance():
    RPC_URL = os.getenv("RPC_URL", "https://api.mainnet-beta.solana.com")
    public_keys_str = [wallet["public_key"] for wallet in config.WALLETS if wallet["public_key"]]
    async with AsyncClient(RPC_URL) as client:
        tasks = [get_balance(client, public_key_str) for public_key_str in public_keys_str]
        balances = await asyncio.gather(*tasks)
        logger.info(f"Total balance of all wallets: {sum(balances)} SOL")
