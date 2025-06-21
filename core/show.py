import os
import asyncio
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey
from data import config
from utils.logger import logger

async def get_balance(client, pubkey_str: str) -> int:
    pubkey = Pubkey.from_string(pubkey_str)
    resp = await client.get_balance(pubkey)
    return resp.value / 1_000_000_000

async def show_wallet_balance(wallet: dict):
    RPC_URL = os.getenv("RPC_URL", "https://api.mainnet-beta.solana.com")
    pubkey_str = wallet["pubkey"]

    async with AsyncClient(RPC_URL) as client:
        balance = await get_balance(client, pubkey_str)
        logger.info(f"{pubkey_str}: {balance} SOL")
        
async def show_all_wallets_balance():
    RPC_URL = os.getenv("RPC_URL", "https://api.mainnet-beta.solana.com")
    pubkeys_str = [wallet["pubkey"] for wallet in config.WALLETS if wallet["pubkey"]]
    async with AsyncClient(RPC_URL) as client:
        tasks = [get_balance(client, pubkey_str) for pubkey_str in pubkeys_str]
        balances = await asyncio.gather(*tasks)
        logger.info(f"Total balance of all wallets: {sum(balances)} SOL")
