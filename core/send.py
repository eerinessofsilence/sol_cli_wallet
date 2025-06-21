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

async def lamport_to_sol(lamports: int) -> float:
    """Convert lamports to SOL."""
    return lamports / 1_000_000_000

async def send_transaction(
    client: AsyncClient,
    sender: Keypair,
    receiver: Pubkey,
    lamports: int = 1_000_000 # 0.001 SOL, default value
) -> str:
    bh_resp = await client.get_latest_blockhash()
    recent_blockhash: Hash = bh_resp.value.blockhash
    SYSTEM_PROGRAM_ID = Pubkey.from_string("11111111111111111111111111111111")

    instruction = Instruction(
        program_id=SYSTEM_PROGRAM_ID,
        accounts=[
            AccountMeta(pubkey=sender.pubkey(), is_signer=True, is_writable=True),
            AccountMeta(pubkey=receiver, is_signer=False, is_writable=True),
        ],
        data=(2).to_bytes(4, "little") + lamports.to_bytes(8, "little")
    )

    message = Message([instruction], sender.pubkey())
    tx = Transaction([sender], message, recent_blockhash)

    resp = await client.send_raw_transaction(bytes(tx), opts=TxOpts(skip_preflight=True))
    print("[✓] Signature:", resp.value)
    return resp.value

async def send_from_wallet(wallet_from, wallet_to):
    account = wallet_to["wallet_to"]
    amount = wallet_to["amount"]
    receiver = Pubkey.from_string(account["pubkey"])
    RPC_URL = os.getenv("RPC_URL", "https://api.mainnet-beta.solana.com")
    
    async with AsyncClient(RPC_URL) as client:
        await send_transaction(
            client=client,
            sender=Keypair.from_base58_string(wallet_from["privkey"]),
            receiver=receiver,
        )
        await asyncio.sleep(3) 
        balance = await client.get_balance(receiver)
        print("[•] Receiver balance:", await lamport_to_sol(balance.value), "SOL")
            
async def send_to_single_wallet():
    RPC_URL = os.getenv("RPC_URL", "https://api.mainnet-beta.solana.com")
    wallets = config.WALLETS
    pubkeys = [wallet["pubkey"] for wallet in wallets if wallet["pubkey"]]

    async with AsyncClient(RPC_URL) as client:
        tasks = [send_transaction(client, pubkey) for pubkey in pubkeys]
        transactions = await asyncio.gather(*tasks)

        for wallet, transaction in zip(wallets, transactions):
            pubkey = wallet["pubkey"]
            logger.info(f"{pubkey}: {transaction} lamports")
