import asyncio

from typing import List
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey

from data import config
from utils.logger import logger

LAMPORTS_PER_SOL = 1_000_000_000

async def get_balance_safe(client: AsyncClient, pubkey: Pubkey) -> float:
    resp = await client.get_balance(pubkey)
    value = resp.value
    if value is None:
        logger.warning(f"No balance returned for {str(pubkey)}")
        return 0.0
    return value / LAMPORTS_PER_SOL

async def show_single_wallet_balance(client: AsyncClient, wallet: dict):
    pubkey_str = wallet.get("pubkey")
    if not pubkey_str:
        logger.error("Wallet has no pubkey.")
        return
    pubkey = Pubkey.from_string(pubkey_str)
    balance = await get_balance_safe(client, pubkey)
    logger.info(f"[{wallet.get('name')}] {pubkey_str}: {balance:.6f} SOL")

async def show_all_wallet_balances(client: AsyncClient):
    wallets: List[dict] = config.WALLETS
    pubkeys = [
        Pubkey.from_string(wallet["pubkey"]) for wallet in wallets if wallet.get("pubkey")
    ]
    tasks = [get_balance_safe(client, pubkey) for pubkey in pubkeys]
    balances = await asyncio.gather(*tasks)
    total = sum(balances)
    logger.info(f"Total balance of all wallets: {total:.6f} SOL")