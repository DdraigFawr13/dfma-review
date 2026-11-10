"""Run every local check in order and stop at the first failure (spec Verification).

    python scripts/check.py

Run it inside the dfma environment. Cross-platform; Python only.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def tool(name: str) -> str:
    path = shutil.which(name)  # npm.cmd / node.exe on Windows
    if path is None:
        sys.exit(f"check: {name} not found. Activate the environment: conda activate dfma")
    return path


def main() -> int:
    node, npm, py = tool("node"), tool("npm"), sys.executable
    steps = [
        ("master drift check", [node, ".claude/master/sync.mjs", "--check"]),
        ("service tests", [py, "-m", "pytest", "tests/service", "-q"]),
        # Port spec Parity: settings.py's names for settings.test.ts, before the web check
        ("settings dump", [py, "tests/parity/key.py", "--settings"]),
        ("web check", [npm, "--prefix", "web", "run", "check"]),
        ("web build", [npm, "--prefix", "web", "run", "build"]),
        ("e2e tests", [py, "-m", "pytest", "-m", "e2e", "-q"]),
        # Port spec J2: the Python key, then the browser engine in Node against it (quick set)
        ("parity key", [py, "tests/parity/key.py", "--set", "quick"]),
        ("parity", [npm, "--prefix", "web", "run", "parity"]),
        # Port spec "Browser tests": the test build, then the e2e suite against it (browser_pending.txt deselected)
        ("browser build", [npm, "--prefix", "web", "run", "build:pages:test"]),
        ("browser e2e tests", [py, "-m", "pytest", "-m", "e2e", "-q", "--engine", "browser"]),
    ]
    if not (ROOT / "tests" / "parts" / ".cache" / "big_plate.step").is_file():  # J4's 49 MiB plate, made once
        steps.insert(len(steps) - 1, ("big plate", [py, "tests/parts/make_parts.py", "--big-plate"]))
    for name, cmd in steps:
        print(f"\n== {name}: {' '.join(Path(c).name if i == 0 else c for i, c in enumerate(cmd))}", flush=True)
        start = time.perf_counter()
        code = subprocess.run(cmd, cwd=ROOT).returncode
        if code != 0:
            print(f"\ncheck: FAIL at {name} (exit {code})", flush=True)
            return code
        print(f"-- {name}: ok in {time.perf_counter() - start:.1f} s", flush=True)
    print("\ncheck: all passed", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
