import asyncio
from utils.logger import logger
from cli.menu import main_menu
from commands.handlers import handle_mode
from solana.rpc.async_api import AsyncClient
import os
from dotenv import load_dotenv

load_dotenv()
RPC_URL = os.getenv("RPC_URL", "https://api.mainnet-beta.solana.com")

async def main():
    result = await main_menu()
    if not result:
        print("No result from main_menu.")
        return

    mode, wallet_from, wallet_to, sol_amount = (list(result) + [None] * 4)[:4]
    async with AsyncClient(RPC_URL) as client:
        await handle_mode(mode, wallet_from, wallet_to, sol_amount, client)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.error("Program interrupted by user.")
