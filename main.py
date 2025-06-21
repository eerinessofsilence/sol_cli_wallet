import asyncio
from cli.menu import main_menu
from core.show import show_wallet_balance, show_all_wallets_balance
from core.send import send_from_wallet, send_to_single_wallet

async def main():
    mode, account = await main_menu()
    
    if mode == "show_wallet_balance":
        await show_wallet_balance(account)
        
    elif mode == "show_all_wallets_balance":
        await show_all_wallets_balance()
        
    elif mode == "send_from_wallet":
        await send_from_wallet(account)
        
    elif mode == "send_to_single_wallet":
        await send_to_single_wallet(account)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[!] Program interrupted by user.")