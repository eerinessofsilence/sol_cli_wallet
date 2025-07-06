import asyncio

from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction
from solders.instruction import Instruction, AccountMeta
from solders.message import Message
from solders.hash import Hash
from solana.rpc.async_api import AsyncClient
from solana.rpc.types import TxOpts

from utils.logger import logger



### UTILS
def sol_to_lamports(sol: float | str) -> int:
    """Converts SOL to lamports."""
    
    return int(float(sol) * 1_000_000_000)

def lamports_to_sol(lamports: int) -> float:
    """Converts lamports to SOL."""
    
    return lamports / 1_000_000_000

async def calculate_lamports_to_send(
    client: AsyncClient,
    pubkey: Pubkey, 
    sol_amount: float | str
) -> int | None:
    """Checks user balance and calculates lamports."""
    
    balance = await client.get_balance(pubkey)
    if isinstance(sol_amount, str) and sol_amount.endswith('%'):
        percent = float(sol_amount[:-1])
        lamports = int(balance.value * (percent / 100))
    else:
        lamports = sol_to_lamports(sol_amount)

    if lamports >= balance.value:
        logger.error(
            f"Insufficient balance: required {lamports_to_sol(lamports)} SOL, "
            f"available {lamports_to_sol(balance.value):.6f} SOL."
        )
        return None
    return lamports

async def send_transaction(
    client: AsyncClient,
    sender: Keypair,
    receiver: Pubkey,
    lamports: int
) -> str:
    """Sends a transaction function on the Solana blockchain."""
        
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
    return resp.value



### MAIN
async def send_to_single_wallet(
    client: AsyncClient,
    wallet_from: dict, 
    wallet_to: dict,
    sol_amount: float | str,
    waiting_for_confirmation: bool = True
) -> None:
    """Sends SOL from one wallet to another."""
    
    sender = Keypair.from_base58_string(wallet_from["privkey"])
    receiver = Pubkey.from_string(wallet_to["pubkey"])
    lamports = await calculate_lamports_to_send(client, sender.pubkey(), sol_amount)

    if lamports:
        old_balance = await client.get_balance(receiver)
        try:
            if waiting_for_confirmation:
                logger.info(f"Sending {lamports_to_sol(lamports)} SOL to {receiver} from {sender.pubkey()}")
            signature = await send_transaction(
                client=client,
                sender=sender,
                receiver=receiver,
                lamports=lamports
            )
            if not signature:
                return
            
            logger.success(f"Signature: {signature}")
            logger.success("Transaction created successfully.")
            if waiting_for_confirmation:
                logger.info("Waiting for transaction confirmation...")
        except Exception as e:
            logger.error(f"Error occured while sending transaction: {e}")
            return
        
        if waiting_for_confirmation:
            for _ in range(30):
                new_balance = await client.get_balance(receiver)
                if new_balance.value != old_balance.value:
                    logger.success("Transaction confirmed.")
                    logger.info(f"Receiver balance: {lamports_to_sol(new_balance.value)} SOL")
                    break
                await asyncio.sleep(1)
            else:
                logger.warning("Transaction not confirmed after 30s.")

async def send_to_multiple_wallets(
    client: AsyncClient,
    wallet_from: dict,
    wallets_to: list[dict],
    sol_amount: float | str,
) -> None:  
    """Sends SOL from single wallet to multiple wallets."""       
    
    sender = Keypair.from_base58_string(wallet_from["privkey"])
    wallets_to = [w for w in wallets_to if w['pubkey'] != str(sender.pubkey())]
    
    lamports = await calculate_lamports_to_send(client, sender.pubkey(), sol_amount)

    if lamports:
        amount_of_wallets: int = len(wallets_to)
        sender_balance_lamports: int = await client.get_balance(sender.pubkey())
        total_lamports_amount: int = lamports * amount_of_wallets
        
        if sender_balance_lamports.value >= total_lamports_amount:
            logger.info(f"Sending {sol_amount} SOL to {amount_of_wallets} wallets.")
            logger.info(f"Total amount to send: {lamports_to_sol(total_lamports_amount)} SOL")

            tasks = [send_to_single_wallet(client, wallet_from, wallet_to, sol_amount, waiting_for_confirmation=False) for wallet_to in wallets_to]
            await asyncio.gather(*tasks)

        else:
            logger.error(
                f"Insufficient balance: required {lamports_to_sol(total_lamports_amount):.6f} SOL, "
                f"available {lamports_to_sol(sender_balance_lamports.value):.6f} SOL."
            )

async def send_from_multiple_wallets(
    client: AsyncClient,
    wallets_from: list[dict],
    wallet_to: dict,
    sol_amount: float | str
) -> None:
    """Sends SOL from multiple wallets to a single wallet."""
    
    receiver = Keypair.from_base58_string(wallet_to["privkey"])
    senders = [Keypair.from_base58_string(wallet_from["privkey"]) 
                for wallet_from in wallets_from 
                if wallet_from["pubkey"] != receiver.pubkey()]
    for sender in senders:
        lamports = await calculate_lamports_to_send(client, sender.pubkey(), sol_amount)
        if not lamports:
            return
    
    amount_of_wallets = len(wallets_from)
    total_lamports_amount = lamports * amount_of_wallets 
    logger.info(f"Sending {sol_amount} SOL to {amount_of_wallets} wallets.")
    logger.info(f"Total amount to send: {lamports_to_sol(total_lamports_amount)} SOL")

    tasks = [send_to_single_wallet(client, wallet_from, wallet_to, sol_amount, waiting_for_confirmation=False) for wallet_from in wallets_from]
    await asyncio.gather(*tasks)
    
async def split_balance_equally(
    client: AsyncClient,
    wallets_from: list[dict],
    wallets_to: list[dict],
    sol_amount: float | str
) -> None:
    """Splits SOL balance equaly for multiple wallets"""
    
    receivers = [Keypair.from_base58_string(wallet_to["privkey"]) for wallet_to in wallets_to]
    senders = [Keypair.from_base58_string(wallet_from["privkey"]) for wallet_from in wallets_from]
    
    total_balance = ...
