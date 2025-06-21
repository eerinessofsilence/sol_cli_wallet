from InquirerPy import inquirer
from rich.console import Console
from data import config

console = Console()

async def render_ascii():
    with open("cli/ascii.txt", "r", encoding="utf-8") as f:
        ascii_art = f.read()

    # Calculate width (by the longest line)
    max_width = max(len(line) for line in ascii_art.splitlines())

    # Text to center
    footer = "-BY EERINESSOFSILENCE-"
    colored_footer = f"[green]{footer}[/green]"

    # Manual centering
    spaces = (max_width - len(footer)) // 2
    centered_footer = " " * spaces + colored_footer

    # Print
    console.print(f"[bold green]{ascii_art}[/bold green]")
    console.print(centered_footer)

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
        instruction="(↑ up • ↓ down • ENTER select)",
    ).execute_async()

    if choice == "manage_wallets":
        return await manage_menu()
    elif choice == "settings":
        print("\n[!] Settings are not implemented yet.")
        return (choice, None)
    elif choice == "exit":
        print("\n[!] Exiting the program.")
        return (choice, None)


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
        instruction="(↑ up • ↓ down • ENTER select)",
    ).execute_async()

    if choice == "back":
        await main_menu()
    elif choice == "show_all_wallets_balance":
        return (choice, None)
    else:
        return await wallet_menu(mode=choice)
        

async def wallet_menu(mode: str) -> tuple[str, dict]:
    choice = await inquirer.select(
        message="Select action",
        choices=[
            {"name": "Choose wallet", "value": "choose_wallet"},
            {"name": "Back", "value": "back"},
        ],
        pointer="❯",
        instruction="(↑ up • ↓ down • ENTER select)",
    ).execute_async()

    if choice == "back":
        await manage_menu()
    elif choice == "choose_wallet":
        wallets = [
            {"name": f"[•] {wallet['name']}: {wallet['public_key']}", "value": wallet}
            for wallet in config.WALLETS
        ]
        wallets.append({"name": "Back", "value": "back"})
        wallet_choice = await inquirer.select(
            message="Select wallet:",
            choices=wallets,
            pointer="❯",
            instruction="(↑ up • ↓ down • ENTER select)",
        ).execute_async()

        if wallet_choice == "back":
            await manage_menu()
            
        return mode, wallet_choice
    
    return (None, None)
