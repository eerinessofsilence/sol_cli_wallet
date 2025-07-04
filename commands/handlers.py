from core.show import show_single_wallet_balance, show_all_wallet_balances
from core.send import send_to_single_wallet, send_to_multiple_wallets, \
                      send_from_multiple_wallets
                      
from rich.console import Console

console = Console()

async def handle_mode(mode, wallet_from, wallet_to, sol_amount, client):
    """Handle the selected mode and execute the corresponding function."""
    
    
    # SHOW SOL wallet balances
    if mode == "show_single_wallet_balance":
        await show_single_wallet_balance(client, wallet_from)

    elif mode == "show_all_wallet_balances":
        await show_all_wallet_balances(client)


    # SEND SOL to/from wallets
    elif mode == "send_to_single_wallet":
        await send_to_single_wallet(client, wallet_from, wallet_to, sol_amount)
            
    elif mode == "send_to_multiple_wallets":
        await send_to_multiple_wallets(client, wallet_from, wallet_to, sol_amount)
            
    elif mode == "send_from_multiple_wallets":
        await send_from_multiple_wallets(client, wallet_from, wallet_to, sol_amount)

    elif mode == "settings":
        console.print("[yellow][!] Settings are not implemented yet.[/yellow]")

    elif mode == "exit":
        console.print("[•] Exiting the program.")

    else:
        console.print(f"[yellow][!] Unknown mode: {mode}[/yellow]")
