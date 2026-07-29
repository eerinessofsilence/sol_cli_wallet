from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


def resolve_npm() -> str:
    candidates = ["npm.cmd", "npm.exe", "npm"] if os.name == "nt" else ["npm"]
    for candidate in candidates:
        executable = shutil.which(candidate)
        if executable:
            return executable
    raise FileNotFoundError("npm")


def main() -> None:
    root = Path(__file__).resolve().parent
    desktop_ui = root / "desktop-ui"
    if not (desktop_ui / "node_modules").exists():
        print("Desktop dependencies are missing. Run: cd desktop-ui && npm install")
        raise SystemExit(1)

    print("Starting NODAL desktop…", flush=True)
    subprocess.run(
        [resolve_npm(), "run", "dev"],
        cwd=desktop_ui,
        env={**os.environ},
        check=True,
    )


if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError:
        print("npm was not found. Install Node.js and reopen the terminal.", file=sys.stderr)
        raise SystemExit(1)
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from error
