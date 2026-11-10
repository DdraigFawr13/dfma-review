"""Start the app once for the e2e tests: python -m dfma start --no-build --port 8765, or, with --engine browser, the
browser-engine test build (web/dist-pages-test) on a plain static server at port 8766 (port spec "Browser tests")."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

from helpers import ROOT

PORT = 8765
URL = f"http://127.0.0.1:{PORT}"
BROWSER_PORT = 8766
PAGES_TEST = ROOT / "web" / "dist-pages-test"
PENDING = Path(__file__).with_name("browser_pending.txt")


def _port_open(port: int = PORT) -> bool:
    with socket.socket() as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) == 0


def pending_ids() -> dict[str, str]:
    """browser_pending.txt: one pytest node id per line, then ` # S<n>` (the slice that removes it); blank lines and
    lines starting with # are ignored. These tests are deselected in the browser run until their slice."""
    out: dict[str, str] = {}
    for line in PENDING.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        node, _, slice_ = line.partition(" # ")
        if not slice_.startswith("S"):
            raise pytest.UsageError(f"browser_pending.txt: no ` # S<n>` slice on: {line}")
        out[node.strip()] = slice_.strip()
    return out


def pytest_collection_modifyitems(config, items):
    browser = config.getoption("--engine") == "browser"
    pending = pending_ids() if browser else {}
    keep, drop = [], []
    for item in items:
        only_browser = item.get_closest_marker("browser_only") is not None
        (drop if (only_browser and not browser) or item.nodeid in pending else keep).append(item)
    if drop:
        config.hook.pytest_deselected(items=drop)
        items[:] = keep


@pytest.fixture(scope="session")
def engine(pytestconfig) -> str:
    return pytestconfig.getoption("--engine")


@pytest.fixture(scope="session")
def app_server(engine):
    if engine == "browser":
        yield from _static_server()
        return
    if not (ROOT / "web" / "dist" / "index.html").exists():
        pytest.fail("web/dist is missing: run `npm --prefix web run build` first (scripts/check.py does)")
    if _port_open():
        pytest.fail(f"port {PORT} is already in use")
    proc = subprocess.Popen([sys.executable, "-m", "dfma", "start", "--no-build", "--port", str(PORT)], cwd=ROOT)
    try:
        deadline = time.monotonic() + 60
        while True:
            try:
                with urllib.request.urlopen(URL + "/", timeout=1) as r:
                    if r.status == 200:
                        break
            except OSError:
                pass
            if proc.poll() is not None:
                pytest.fail(f"the app exited with code {proc.returncode}")
            if time.monotonic() > deadline:
                pytest.fail("the app did not answer within 60 s")
            time.sleep(0.2)
        yield URL
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def _static_server():
    if not (PAGES_TEST / "index.html").exists():
        pytest.fail("web/dist-pages-test is missing: run `npm --prefix web run build:pages:test` first (scripts/check.py does)")
    if _port_open(BROWSER_PORT):
        pytest.fail(f"port {BROWSER_PORT} is already in use")
    proc = subprocess.Popen([sys.executable, "-m", "http.server", str(BROWSER_PORT), "--bind", "127.0.0.1",
                             "--directory", str(PAGES_TEST)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{BROWSER_PORT}"
    try:
        deadline = time.monotonic() + 30
        while not _port_open(BROWSER_PORT):
            if proc.poll() is not None or time.monotonic() > deadline:
                pytest.fail("the static server did not start")
            time.sleep(0.1)
        yield url
    finally:
        proc.terminate()
        proc.wait(timeout=10)


@pytest.fixture(scope="session")
def base_url(app_server):
    return app_server


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args):
    """Software WebGL so the canvas renders headless; DFMA_CHROMIUM points at a preinstalled browser."""
    args = {**browser_type_launch_args,
            "args": [*browser_type_launch_args.get("args", []), "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
    if os.environ.get("DFMA_CHROMIUM"):
        args["executable_path"] = os.environ["DFMA_CHROMIUM"]
    return args
