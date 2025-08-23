import subprocess
import sys
import os
import shutil

script = "main.py"
script_path = os.path.abspath(script)

if sys.platform == "win32":
    # Windows
    subprocess.run(["cmd", "/k", f"python \"{script_path}\""])
elif sys.platform == "darwin":
    # MacOS
    subprocess.run([
        "osascript", "-e",
        f'tell app "Terminal" to do script "python3 \\"{script_path}\\""'
    ])
else:
    # Linux
    terminals = ["gnome-terminal", "konsole", "xterm", "alacritty", "kitty", "foot", "wezterm"]
    try:
        for term in terminals:
            if shutil.which(term):
                subprocess.run([term, "-e", "python3", script_path])
                break
        else:
            print("Not found terminal, install one of these: " + ", ".join(terminals))
        subprocess.run(["x-terminal-emulator", "-e", f"python3 \"{script_path}\""])
    except FileNotFoundError:
        for term in ["gnome-terminal", "konsole", "xterm"]:
            try:
                subprocess.run([term, "-e", f"python3 \"{script_path}\""])
                break
            except FileNotFoundError:
                continue