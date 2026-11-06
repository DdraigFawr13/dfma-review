"""python -m dfma start [--no-build] [--port 8000]  (spec Start)."""

from __future__ import annotations

import argparse
import shutil
import socket
import subprocess
import sys

from . import settings


def build_web() -> None:
    npm = shutil.which("npm")  # npm.cmd on Windows
    if npm is None:
        sys.exit("npm was not found. Build the environment with: conda env create -f environment.yml")
    for args in (["ci"], ["run", "build"]):
        print(f"web: npm {' '.join(args)}", flush=True)
        subprocess.run([npm, *args], cwd=settings.WEB_DIR, check=True)


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((settings.HOST, port))
        except OSError:
            return False
    return True


def start(no_build: bool, port: int) -> None:
    if not (settings.DIST_DIR / "index.html").exists():
        if no_build:
            sys.exit("web/dist is missing. Run without --no-build, or: npm --prefix web run build")
        build_web()
    if not port_free(port):
        sys.exit(f"Port {port} is already in use. Close the other app or pick one with --port.")

    import uvicorn

    from .app import create_app

    url = f"http://localhost:{port}"
    print(f"DFMA Review is running at {url}  (Ctrl+C to stop)", flush=True)
    uvicorn.run(create_app(), host=settings.HOST, port=port, log_level="warning")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m dfma")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("start", help="build the web page if needed and serve the app")
    p.add_argument("--no-build", action="store_true", help="don't build web/dist when it is missing")
    p.add_argument("--port", type=int, default=settings.DEFAULT_PORT)
    args = parser.parse_args(argv)
    if args.command == "start":
        start(args.no_build, args.port)


if __name__ == "__main__":
    main()
