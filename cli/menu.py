import os
import shutil
from dotenv import load_dotenv, set_key
from InquirerPy import inquirer
from rich.console import Console
from rich.text import Text
from data import config

console = Console()
### MISC ###


def validate_amount(x: str) -> bool:
    x = x.strip().replace(',', '.')
    if x.endswith('%'):
        try:
            val = float(x[:-1])
            return 0 < val <= 100
        except ValueError:
            return False
    else:
        try:
            val = float(x)
            return val > 0.000005
        except ValueError:
            return False

async def render_ascii():
    with open("cli/ascii.txt", "r", encoding="utf-8") as f:
        ascii_art = f.read()
    
    # Calculate width (by the longest line)
    max_width = max(len(line) for line in ascii_art.splitlines())
    styled_ascii_art = Text(ascii_art, style="#4E97DB")
    console.print(styled_ascii_art)


### MAIN MENUS ###


async def main_menu():
    try:
        await render_ascii()
    except FileNotFoundError:
        console.print("[red][!] ascii.txt not found.[/red]\n")
    choice = await inquirer.select(
        message="Main menu:",
        choices=[
            {"name": "Wallets operations", "value": "wallets_operations"},
            {"name": "Settings", "value": "settings"},
            {"name": "Exit", "value": "exit"},
        ],
        pointer="❯",
        long_instruction="(↑ up • ↓ down • enter submit)",
    ).execute_async()

    if choice == "wallets_operations":
        return await wallets_operations()
    elif choice == "settings":
        return await settings_menu()
    elif choice == "exit":
        return (choice, None, None, None)

async def wallets_operations() -> tuple[str, dict]:
    choice = await inquirer.select(
        message="Choose a wallet operation:",
        choices=[
            {"name": "Show SOL", "value": "show_sol_menu"},
            {"name": "Send SOL", "value": "send_sol_menu"},
            {"name": "Back", "value": "back"},
        ],
        pointer="❯",
        long_instruction="(↑ up • ↓ down • enter submit)",
    ).execute_async()

    if choice == "back":
        return await main_menu()
    elif choice == "show_sol_menu":
        return await show_sol_menu()
    elif choice == "send_sol_menu":
        return await send_sol_menu()

async def settings_menu():
    choice = await inquirer.select(
        message="What would you like to do?",
        choices=[
            {"name": "Manage wallets", "value": "manage_wallets_menu"},
            {"name": "Manage RPCs", "value": "manage_rpcs_menu"},
            {"name": "Back", "value": "back"},
        ],
        pointer="❯",
        long_instruction="(↑ up • ↓ down • enter submit)",
    ).execute_async()

    if choice == "back":
        return await main_menu()
    elif choice == "manage_wallets_menu":
        return await manage_wallets_menu()
    elif choice == "manage_rpcs_menu":
        return await manage_rpcs_menu()


### WALLETS MENUS ###


async def manage_wallets_menu():
    choice = await inquirer.select(
        message="How do you want to manage wallets?",
        choices=[
            {"name": "Add wallets file", "value": "add_wallets_file"},
            {"name": "Choose wallets file", "value": "choose_wallets_file"},
            {"name": "Back", "value": "back"},
        ],
        pointer="❯",
        long_instruction="(↑ up • ↓ down • enter submit)",
    ).execute_async()

    if choice == "back":
        return await settings_menu()
    elif choice == "add_wallets_file":
        return await add_wallets_file()
    elif choice == "choose_wallets_file":
        return await choose_wallets_file()
    
async def add_wallets_file():
    file_choice = await inquirer.filepath(
        message="Select file in '.csv' format:",
        default="path/to/your/file.csv",
        long_instruction="(type filepath • enter confirm)",
        invalid_message="This path is invalid or it contains data folder.",
        validate=lambda result: result.endswith(".csv") and os.path.exists(result) and "data" not in (result.split("/")),    
    ).execute_async()
    
    dest_path = os.path.join("data", os.path.basename(file_choice))
    
    if os.path.exists(os.path.abspath(dest_path)):
        overwrite_choice = await inquirer.confirm(
            message=f"File '{file_choice}' already exists. WARNING! This action will overwrite it. Continue?",
            default=True,
            long_instruction="(y - yes / n - no)",
        ).execute_async()
        if overwrite_choice:
            os.remove("data/wallets.csv")
            shutil.copy(file_choice, dest_path)
            load_dotenv()
            set_key(".env", "CSV_FILE", file_choice)
            console.print(f"[blue][•] File copied to {dest_path}[/blue]\n")
        else:
            return await manage_wallets_menu()
    else:
        shutil.copy(file_choice, dest_path)
        load_dotenv()
        set_key(".env", "CSV_FILE", file_choice)
        console.print(f"[blue][•] File copied to {dest_path}[/blue]\n")
        
    return await settings_menu()
        
async def choose_wallets_file():
    choices = [choice for choice in os.listdir("data") if choice.endswith(".csv")]
    choice = await inquirer.select(
        message="Select wallets file:",
        choices=choices,
        long_instruction="(↑ up • ↓ down • enter submit)",  
    ).execute_async()
    
    load_dotenv()
    set_key(".env", "CSV_FILE", choice)
    
    return await settings_menu()


### RPCS MENUS ###


async def manage_rpcs_menu():
    choice = await inquirer.select(
        message="How do you want to manage RPCs?",
        choices=[
            {"name": "Add RPC", "value": "add_rpc"},
            {"name": "Remove RPC", "value": "remove_rpc"},
            {"name": "Choose RPC", "value": "choose_rpc"},
            {"name": "Back", "value": "back"},
        ],
        pointer="❯",
        long_instruction="(↑ up • ↓ down • enter submit)",
    ).execute_async()

    if choice == "back":
        return await settings_menu()
    elif choice == "add_rpc":
        return await add_rpc()
    elif choice == "remove_rpc":
        return await remove_rpc()
    elif choice == "choose_rpc":
        return await choose_rpc()
    
async def add_rpc():
    choice = await inquirer.text(
        message="Enter new RPC endpoint:",
        default="https://api.mainnet-beta.solana.com",
        long_instruction="(type url • enter confirm)",
        invalid_message="This RPC is invalid or already in list.",
        validate=lambda result: result.startswith(("http://", "https://", "ws://", "127.0.0.1")) and result not in config.RPCS
    ).execute_async()
    
    config.RPCS.append(choice)
    load_dotenv()
    set_key(".env", "RPC_URL", choice)
    
    return await settings_menu()

async def remove_rpc():
    rpc_choices = config.RPCS
    
    choice = await inquirer.select(
        message="Choose RPC that you want to remove:",
        choices=rpc_choices,
        long_instruction="(↑ up • ↓ down • enter submit)",
        invalid_message="This RPC is default or not in list.",
        validate=lambda result: result != "https://api.mainnet-beta.solana.com" and result in config.RPCS
    ).execute_async()
    
    config.RPCS.remove(choice)
    load_dotenv()
    
    return await settings_menu()

async def choose_rpc():
    rpc_choices = config.RPCS

    choice = await inquirer.select(
        message="Choose RPC endpoint:",
        choices=rpc_choices,
        default="https://api.mainnet-beta.solana.com",
        long_instruction="(↑ up • ↓ down • enter submit)",
    ).execute_async()
    
    load_dotenv()
    set_key(".env", "RPC_URL", choice)
    
    return await settings_menu()


### SHOW / SEND MENUS ###


async def show_sol_menu():
    choice = await inquirer.select(
        message="Select mode:",
        choices=[
            {"name": "Show all wallet balances", "value": "show_all_wallet_balances"},
            {"name": "Show single wallet balance", "value": "show_single_wallet_balance"},
            {"name": "Back", "value": "back"},
        ],
        pointer="❯",
        long_instruction="(↑ up • ↓ down • enter submit)",
    ).execute_async()

    if choice == "back":
        return await wallets_operations()
    elif choice == "show_single_wallet_balance":
        return await wallet_menu(mode=choice)
    elif choice == "show_all_wallet_balances":
        return choice, None, None, None
    
async def send_sol_menu():
    choice = await inquirer.select(
        message="Select mode:",
        choices=[
            {"name": "Send to single wallet", "value": "send_to_single_wallet"},
            {"name": "Send to multiple wallets", "value": "send_to_multiple_wallets"},
            {"name": "Send from multiple wallets", "value": "send_from_multiple_wallets"},
            {"name": "Split balance equally", "value": "split_balance_equally"},
            {"name": "Back", "value": "back"},
        ],
        pointer="❯",
        long_instruction="(↑ up • ↓ down • enter submit)",
    ).execute_async()

    if choice == "back":
        return await wallets_operations()
    else:
        return await wallet_menu(mode=choice)

async def wallet_menu(mode: str) -> tuple[str, dict, dict]:
    if mode == "show_single_wallet_balance":
        wallets = [
            {"name": f"[•] {wallet['name']}: {wallet['pubkey']}", "value": wallet}
            for wallet in config.WALLETS
        ]
        wallets.append({"name": "Back", "value": "back"})
        wallet_choice = await inquirer.select(
            message="Select wallet:",
            choices=wallets,
            pointer="❯",
            long_instruction="(↑ up • ↓ down • enter submit)",
        ).execute_async()

        if wallet_choice == "back":
            return await show_sol_menu()
            
        return mode, wallet_choice, None, None
        
    elif mode == "send_to_single_wallet":
        wallet_from_choices = [
            {"name": f"[•] {wallet['name']}: {wallet['pubkey']}", "value": wallet}
            for wallet in config.WALLETS
        ]
        wallet_from_choices.append({"name": "Back", "value": "back"})
        wallet_from = await inquirer.select(
            message="Select sender wallet:",
            choices=wallet_from_choices,
            pointer="❯",
            long_instruction="(↑ up • ↓ down • enter submit)",
        ).execute_async()

        if wallet_from == "back":
            return await send_sol_menu()
        
        wallets_to = [w for w in wallet_from_choices if not (isinstance(wallet_from, dict) and isinstance(w["value"], dict) and w["value"].get("pubkey") == wallet_from.get("pubkey"))]
        wallet_to = await inquirer.select(
            message="Select receiver wallet:",
            choices=wallets_to,
            pointer="❯",
            long_instruction="(↑ up • ↓ down • enter submit)",
        ).execute_async()

        if wallet_to == "back":
            return await send_sol_menu()
        
        amount_input = await inquirer.text(
            message="Enter amount of SOL to send:",
            validate=validate_amount,
            invalid_message="Enter a valid amount, percentage must be between 0 and 100, or a valid SOL amount greater than 0.000005.",
            long_instruction="(e.g. 0.1 or 50% for percentage of balance)",
        ).execute_async()
        sol_amount = amount_input if "%" in amount_input else float(amount_input)
    
        return mode, wallet_from, wallet_to, sol_amount
        
    elif mode == "send_to_multiple_wallets":
        choice = await inquirer.select(
            message="Select action",
            choices=[
                {"name": "All wallets", "value": "all_wallets"},
                {"name": "Multiple wallets", "value": "multiple_wallets"},
                {"name": "Back", "value": "back"},
            ],
            pointer="❯",
            long_instruction="(↑ up • ↓ down • enter submit)",
        ).execute_async()
        
        if choice == "all_wallets":       
            wallet_from_choices = [
                {"name": f"[•] {wallet['name']}: {wallet['pubkey']}", "value": wallet}
                for wallet in config.WALLETS
            ]
            wallet_from_choices.append({"name": "Back", "value": "back"})
            wallet_from = await inquirer.select(
                message="Select sender wallet:",
                choices=wallet_from_choices,
                pointer="❯",
                long_instruction="(↑ up • ↓ down • enter submit)",
            ).execute_async()

            if wallet_from == "back":
                return await send_sol_menu()

            wallets_to = config.WALLETS

            amount_input = await inquirer.text(
                message="Enter amount of SOL to send:",
                validate=validate_amount,
                invalid_message="Enter a valid amount: a number > 0.000005 or a percentage (0-100%) like 50%.",
                long_instruction="(e.g. 0.1 or 50% for percentage of balance)",
            ).execute_async()
            sol_amount = amount_input

            return mode, wallet_from, wallets_to, sol_amount
        
        elif choice == "multiple_wallets":
            wallet_from_choices = [
                {"name": f"[•] {wallet['name']}: {wallet['pubkey']}", "value": wallet}
                for wallet in config.WALLETS
            ]
            wallet_from_choices.append({"name": "Back", "value": "back"})
            wallet_from = await inquirer.select(
                message="Select sender wallet:",
                choices=wallet_from_choices,
                pointer="❯",
                long_instruction="(↑ up • ↓ down • enter submit)",
            ).execute_async()

            if wallet_from == "back":
                return await send_sol_menu()

            wallets_to_choices = [
                w for w in wallet_from_choices
                if w["value"] != "back" and w["value"].get("pubkey") != wallet_from.get("pubkey")
            ]
            wallets_to = await inquirer.checkbox(
                message="Choose destination wallets:",
                choices=wallets_to_choices,
                pointer="❯",
                long_instruction="(↑ up • ↓ down • space select • enter submit)",
            ).execute_async()
            
            if wallets_to == []:
                return await send_sol_menu()
            
            amount_input = await inquirer.text(
                message="Enter amount of SOL to send:",
                validate=validate_amount,
                invalid_message="Enter a valid amount: a number > 0.000005 or a percentage (0-100%) like 50%.",
                long_instruction="(e.g. 0.1 or 50% for percentage of balance)",
            ).execute_async()
            sol_amount = amount_input

            return mode, wallet_from, wallets_to, sol_amount
        
        else:
            return await send_sol_menu()
        
    elif mode == "send_from_multiple_wallets":
        choice = await inquirer.select(
            message="Select action",
            choices=[
                {"name": "All wallets", "value": "all_wallets"},
                {"name": "Multiple wallets", "value": "multiple_wallets"},
                {"name": "Back", "value": "back"},
            ],
            pointer="❯",
            long_instruction="(↑ up • ↓ down • enter submit)",
        ).execute_async()
        
        if choice == "all_wallets":       
            wallet_to_choices = [
                {"name": f"[•] {wallet['name']}: {wallet['pubkey']}", "value": wallet}
                for wallet in config.WALLETS
            ]
            wallet_to_choices.append({"name": "Back", "value": "back"})
            wallet_to = await inquirer.select(
                message="Select receiver wallet:",
                choices=wallet_to_choices,
                pointer="❯",
                long_instruction="(↑ up • ↓ down • enter submit)",
            ).execute_async()

            if wallet_to == "back":
                return await send_sol_menu()

            wallets_from = [
                w for w in config.WALLETS
                if w.get("pubkey") != wallet_to.get("pubkey")
            ]
            
            amount_input = await inquirer.text(
                message="Enter amount of SOL to send:",
                validate=validate_amount,
                invalid_message="Enter a valid amount: a number > 0.000005 or a percentage (0-100%) like 50%.",
                long_instruction="(e.g. 0.1 or 50% for percentage of balance)",
            ).execute_async()
            sol_amount = amount_input

            return mode, wallets_from, wallet_to, sol_amount
        
        elif choice == "multiple_wallets":
            wallet_from_choices = [
                {"name": f"[•] {wallet['name']}: {wallet['pubkey']}", "value": wallet}
                for wallet in config.WALLETS
            ]
            wallets_from = await inquirer.checkbox(
                message="Choose source wallets:",
                choices=wallet_from_choices,
                pointer="❯",
                long_instruction="(↑ up • ↓ down • enter submit)",
            ).execute_async()

            from_pubkeys = {w.get("pubkey") for w in wallets_from}

            wallets_to_choices = [
                w for w in wallet_from_choices
                if w["value"].get("pubkey") not in from_pubkeys
            ]
            
            wallet_to = await inquirer.select(
                message="Select receiver wallet:",
                choices=wallets_to_choices,
                pointer="❯",
                long_instruction="(↑ up • ↓ down • space select • enter submit)",
            ).execute_async()
            
            amount_input = await inquirer.text(
                message="Enter amount of SOL to send:",
                validate=validate_amount,
                invalid_message="Enter a valid amount: a number > 0.000005 or a percentage (0-100%) like 50%.",
                long_instruction="(e.g. 0.1 or 50% for percentage of balance)",
            ).execute_async()
            sol_amount = amount_input

            return mode, wallets_from, wallet_to, sol_amount
        
        else:
            return await send_sol_menu()
        
    elif mode == "split_balance_equally":
        choice = await inquirer.select(
            message="Select action",
            choices=[
                {"name": "All wallets", "value": "all_wallets"},
                {"name": "Multiple wallets", "value": "multiple_wallets"},
                {"name": "Back", "value": "back"},
            ],
            pointer="❯",
            long_instruction="(↑ up • ↓ down • enter submit)",
        ).execute_async()
        
        if choice == "all_wallets":       
            wallets = config.WALLETS
            
            return mode, wallets
        
        elif choice == "multiple_wallets":   
            wallets_choices = [
                {"name": f"[•] {wallet['name']}: {wallet['pubkey']}", "value": wallet}
                for wallet in config.WALLETS
            ]
            wallets = await inquirer.checkbox(
                message="Choose source wallets:",
                choices=wallets_choices,
                pointer="❯",
                long_instruction="(↑ up • ↓ down • enter submit)",
            ).execute_async()
            
            return mode, wallets
        
    return (None, None, None, None)
