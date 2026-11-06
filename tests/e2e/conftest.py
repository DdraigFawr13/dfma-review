"""Start the app once for the e2e tests: python -m dfma start --no-build --port 8765."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import urllib.request

import pytest

from helpers import ROOT

PORT = 8765
URL = f"http://127.0.0.1:{PORT}"


def _port_open() -> bool:
    with socket.socket() as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


@pytest.fixture(scope="session")
def app_server():
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
