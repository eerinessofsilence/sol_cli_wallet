import os
import subprocess
import platform

script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py")

def run_on_macos():
    applescript = f'''
    tell application "Terminal"
        do script "python3 '{script_path}'"
        activate
    end tell
    '''
    subprocess.run(["osascript", "-e", applescript])

def run_on_linux():
    terminals = ["gnome-terminal", "konsole", "xterm", "alacritty", "kitty", "wezterm"]
    for term in terminals:
        if shutil.which(term):
            cmd = f"python3 '{script_path}'; exec bash"
            subprocess.Popen([term, "-e", "bash", "-c", cmd])
            return
    print("Supported terminal not found.")

def run_on_windows():
    subprocess.Popen(["cmd.exe", "/k", f"python \"{script_path}\""])

os_name = platform.system()
if os_name == "Darwin":
    run_on_macos()
elif os_name == "Linux":
    import shutil
    run_on_linux()
elif os_name == "Windows":
    run_on_windows()
else:
    print(f"{os_name} operating system is not supported.")
