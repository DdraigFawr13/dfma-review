"""Run every local check (spec Verification) and stop at the first failure.

    python scripts/check.py

Run it inside the dfma environment. Cross-platform; Python only.

Three stages:
1. Setup, one step at a time: the drift check, the settings dump and the web check and builds (about 20 s).
2. Three lanes at once, each step in its own process, its output held until it ends so the lanes don't mix:
   the service tests (pytest-xdist, cores - 2 workers); the e2e tests against the service; the parity key, then parity and the browser e2e tests.
   The lanes share no files or ports (8765 for the service, 8766 for the browser build).
3. The tests that assert a wall-clock limit (marker `timed`), alone, after the lanes, so other work can't slow them.
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOT_TIMED = "not timed"


def tool(name: str) -> str:
    path = shutil.which(name)  # npm.cmd / node.exe on Windows
    if path is None:
        sys.exit(f"check: {name} not found. Activate the environment: conda activate dfma")
    return path


def show(cmd: list[str]) -> str:
    return " ".join(Path(c).name if i == 0 else c for i, c in enumerate(cmd))


def run_step(name: str, cmd: list[str]) -> int:
    """A step in the foreground, its output streamed."""
    print(f"\n== {name}: {show(cmd)}", flush=True)
    start = time.perf_counter()
    code = subprocess.run(cmd, cwd=ROOT).returncode
    if code != 0:
        print(f"\ncheck: FAIL at {name} (exit {code})", flush=True)
    else:
        print(f"-- {name}: ok in {time.perf_counter() - start:.1f} s", flush=True)
    return code


class Lane(threading.Thread):
    """Steps run one after another in the background; each step's output is printed whole when it ends."""

    def __init__(self, name: str, steps: list[tuple[str, list[str]]], lock: threading.Lock, stop: threading.Event):
        super().__init__(name=name, daemon=True)
        self.steps, self.lock, self.stop = steps, lock, stop
        self.failed: str | None = None
        self.proc: subprocess.Popen | None = None

    def run(self) -> None:
        for name, cmd in self.steps:
            if self.stop.is_set():
                return
            start = time.perf_counter()
            with tempfile.TemporaryFile() as out:
                # its own process group, so a stop also ends the servers and browsers it started
                group = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
                self.proc = subprocess.Popen(cmd, cwd=ROOT, stdout=out, stderr=subprocess.STDOUT, **group)
                code = self.proc.wait()
                out.seek(0)
                text = out.read().decode("utf-8", "replace")
            if self.stop.is_set() and code != 0:
                return  # stopped because another lane failed; its output would only mislead
            with self.lock:
                print(f"\n== [{self.name}] {name}: {show(cmd)}\n{text.rstrip()}", flush=True)
                if code != 0:
                    print(f"\ncheck: FAIL at {name} (exit {code})", flush=True)
                else:
                    print(f"-- [{self.name}] {name}: ok in {time.perf_counter() - start:.1f} s", flush=True)
            if code != 0:
                self.failed = name
                self.stop.set()
                return

    def kill(self) -> None:
        if self.proc is None or self.proc.poll() is not None:
            return
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.proc.pid)], capture_output=True)
        else:
            try:
                os.killpg(self.proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass


def service_workers() -> int:
    """pytest-xdist workers for the service lane: the cores this process may use, less one per browser lane."""
    cores = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else (os.cpu_count() or 1)
    return max(1, cores - 2)


def environment_matches() -> bool:
    """Every conda package pinned in environment.yml is installed at its pinned version. A cached container can hold an
    environment built before a package was added (olefile, then pytest-xdist), which fails later with an import error."""
    meta = Path(sys.prefix) / "conda-meta"
    if not meta.is_dir():
        print("check: not a conda environment; activate it: conda activate dfma", flush=True)
        return False
    installed = {}
    for f in meta.glob("*.json"):
        name, version, _build = f.stem.rsplit("-", 2)
        installed[name] = version
    missing = []
    for line in (ROOT / "environment.yml").read_text(encoding="utf-8").splitlines():
        spec = line.split("#")[0].strip()
        if spec.startswith("- ") and "=" in spec:
            name, _, version = spec[2:].strip().partition("=")
            if installed.get(name) != version:
                missing.append(f"{name}={version} (installed: {installed.get(name, 'none')})")
    if missing:
        print("check: the environment differs from environment.yml: " + ", ".join(missing) + "\n"
              "  fix: micromamba install -y -n dfma -c conda-forge " + " ".join(m.split(" ")[0] for m in missing), flush=True)
    return not missing


def main() -> int:
    node, npm, py = tool("node"), tool("npm"), sys.executable
    # Lanes run pytest side by side: no shared .pytest_cache (-p no:cacheprovider).
    pytest = [py, "-m", "pytest", "-q", "-p", "no:cacheprovider"]
    setup = [
        ("master drift check", [node, ".claude/master/sync.mjs", "--check"]),
        # Port spec Parity: settings.py's names for settings.test.ts, before the web check
        ("settings dump", [py, "tests/parity/key.py", "--settings"]),
        ("web check", [npm, "--prefix", "web", "run", "check"]),
        ("web build", [npm, "--prefix", "web", "run", "build"]),
        # Port spec "Browser tests": the test build the browser e2e lane runs against
        ("browser build", [npm, "--prefix", "web", "run", "build:pages:test"]),
    ]
    if not (ROOT / "web" / "node_modules").is_dir():  # a fresh checkout (CI): install the web packages first
        setup.insert(2, ("web install", [npm, "--prefix", "web", "ci"]))
    lanes = {
        # pytest-xdist (D-065): same tests, same outcomes as a serial run, by name. Workers = cores - 2, so each browser
        # lane keeps a core: with every core (-n auto), CI starved the e2e lane's PDF build past Playwright's 30 s wait
        "service": [("service tests", [*pytest, "tests/service", "-m", NOT_TIMED, "-n", str(service_workers()),
                                       "--dist", "worksteal"])],
        "e2e": [("e2e tests", [*pytest, "-m", f"e2e and {NOT_TIMED}"])],
        "browser": [
            # Port spec J2: the Python key, then the browser engine in Node against it (quick set);
            # the browser e2e tests read the same key (test_worker_parity), so they come after it
            ("parity key", [py, "tests/parity/key.py", "--set", "quick"]),
            ("parity", [npm, "--prefix", "web", "run", "parity"]),
            # browser_pending.txt deselected; J4 (the 49.94 MiB plate) runs once per slice, alone (D-058; -m per_slice)
            ("browser e2e tests", [*pytest, "-m", f"e2e and not per_slice and {NOT_TIMED}", "--engine", "browser"]),
        ],
    }
    timed = [
        ("timed service tests", [*pytest, "tests/service", "-m", "timed"]),
        ("timed browser e2e tests", [*pytest, "-m", "e2e and not per_slice and timed", "--engine", "browser"]),
    ]

    total = time.perf_counter()
    if not environment_matches():
        return 1
    for name, cmd in setup:
        if code := run_step(name, cmd):
            return code

    print(f"\n== lanes at once: {', '.join(lanes)}", flush=True)
    start, lock, stop = time.perf_counter(), threading.Lock(), threading.Event()
    threads = [Lane(name, steps, lock, stop) for name, steps in lanes.items()]
    for t in threads:
        t.start()
    try:
        while any(t.is_alive() for t in threads):
            if stop.is_set():
                for t in threads:
                    t.kill()
            time.sleep(0.2)
    except KeyboardInterrupt:
        stop.set()
        for t in threads:
            t.kill()
        raise
    if any(t.failed for t in threads):
        return 1
    print(f"-- lanes: ok in {time.perf_counter() - start:.1f} s", flush=True)

    for name, cmd in timed:
        if code := run_step(name, cmd):
            return code
    print(f"\ncheck: all passed in {time.perf_counter() - total:.1f} s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
