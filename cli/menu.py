from InquirerPy import inquirer
from rich.console import Console
from rich.text import Text
from rich.align import Align
from data import config

console = Console()

async def render_ascii():
    with open("cli/ascii.txt", "r", encoding="utf-8") as f:
        ascii_art = f.read()
    
    # Calculate width (by the longest line)
    max_width = max(len(line) for line in ascii_art.splitlines())
    styled_ascii_art = Text(ascii_art, style="#4E97DB")
    console.print(styled_ascii_art)


async def main_menu():
    try:
        await render_ascii()
    except FileNotFoundError:
        console.print("[red][!] ascii.txt not found.[/red]\n")
    choice = await inquirer.select(
        message="Main menu:",
        choices=[
            {"name": "Manage wallets", "value": "manage_wallets"},
            {"name": "Settings", "value": "settings"},
            {"name": "Exit", "value": "exit"},
        ],
        pointer="❯",
        instruction="(↑ up • ↓ down • enter submit)",
    ).execute_async()

    if choice == "manage_wallets":
        return await manage_menu()
    elif choice == "settings":
        console.print("[yellow][!] Settings are not implemented yet.[/yellow]")
        return (choice, None, None)
    elif choice == "exit":
        console.print("[yellow][!] Exiting the program.[/yellow]")
        return (choice, None, None)


async def manage_menu() -> tuple[str, dict]:
    choice = await inquirer.select(
        message="Select mode:",
        choices=[
            {"name": "Wallet balance", "value": "show_wallet_balance"},
            {"name": "All wallets balance", "value": "show_all_wallets_balance"},
            {"name": "Send from wallet", "value": "send_from_wallet"},
            {"name": "Merge to single wallet", "value": "send_to_single_wallet"},
            {"name": "Back", "value": "back"},
        ],
        pointer="❯",
        instruction="(↑ up • ↓ down • enter submit)",
    ).execute_async()

    if choice == "back":
        return await main_menu()
    elif choice == "show_all_wallets_balance":
        return (choice, None, None)
    else:
        return await wallet_menu(mode=choice)
        

async def wallet_menu(mode: str) -> tuple[str, dict, dict]:
    if mode == "show_wallet_balance":
        choice = await inquirer.select(
            message="Select action",
            choices=[
                {"name": "Choose wallet", "value": "choose_wallet"},
                {"name": "Back", "value": "back"},
            ],
            pointer="❯",
            instruction="(↑ up • ↓ down • enter submit)",
        ).execute_async()

        if choice == "back":
            return await manage_menu()
        elif choice == "choose_wallet":
            wallets = [
                {"name": f"[•] {wallet['name']}: {wallet['pubkey']}", "value": wallet}
                for wallet in config.WALLETS
            ]
            wallets.append({"name": "Back", "value": "back"})
            wallet_choice = await inquirer.select(
                message="Select wallet:",
                choices=wallets,
                pointer="❯",
                instruction="(↑ up • ↓ down • enter submit)",
            ).execute_async()

            if wallet_choice == "back":
                return await manage_menu()
                
            return mode, wallet_choice, None
        
    elif mode == "send_from_wallet":
        wallets = [
            {"name": f"[•] {wallet['name']}: {wallet['pubkey']}", "value": wallet}
            for wallet in config.WALLETS
        ]
        wallets.append({"name": "Back", "value": "back"})
        wallet_from = await inquirer.select(
            message="Select wallet to send from:",
            choices=wallets,
            pointer="❯",
            instruction="(↑ up • ↓ down • enter submit)",
        ).execute_async()

        if wallet_from == "back":
            return await manage_menu()
        
        wallets = [w for w in wallets if not (isinstance(wallet_from, dict) and isinstance(w["value"], dict) and w["value"].get("pubkey") == wallet_from.get("pubkey"))]
        wallet_to = await inquirer.select(
            message="Select wallet to send to:",
            choices=wallets,
            pointer="❯",
            instruction="(↑ up • ↓ down • enter submit)",
        ).execute_async()

        if wallet_to == "back":
            return await manage_menu()
        
        amount = await inquirer.text(
            message="Enter amount of SOL to send:",
            validate=lambda x: x.replace('.', '', 1).isdigit() and float(x) > 0,
            invalid_message="Please enter a valid positive number.",
        ).execute_async()

        return mode, wallet_from, {"wallet_to": wallet_to, "amount": amount}
        
    return (None, None, None)
