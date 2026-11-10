"""The answer key for the browser engine (port spec, Parity): the Python app's response for each file of a set.

    python tests/parity/key.py --set quick|full [--out DIR]     (default DIR: tests/parity/.cache/key)
    python tests/parity/key.py --settings                       (writes tests/parity/.cache/settings.json)

Each file runs `dfma.analyze.analyze` (Aluminum 6061; the process tests/parts/expected.toml gives a part, else
Milling) in its own process (the tests/grading/child.py pattern: some files crash pythonocc) and is written to
`<DIR>/<path relative to the repo, "/" as "__">.json`: the response, {"error": <message>} or {"crash": <exit code>}.
`<DIR>/index-<set>.json` lists the set: [{"path", "process", "key"}], which web/src/engine/parity.test.ts reads.
A key is reused while its SHA-256 (the part file, every file under service/ and config/, this script,
expected.toml and the pythonocc version) is unchanged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tomllib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "service"), str(ROOT / "tests")]
CACHE = ROOT / "tests" / "parity" / ".cache"
MARK = "@@parity-key@@"
EXPECTED = ROOT / "tests" / "parts" / "expected.toml"
MACHINE = {"REPO_ROOT", "WEB_DIR", "DIST_DIR", "CONFIG_DIR", "HOST", "DEFAULT_PORT"}  # machine-specific, not compared
CHILD_TIMEOUT_S = 900


def rel(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def key_name(path: Path) -> str:
    return rel(path).replace("/", "__") + ".json"


def quick_set() -> list[Path]:
    from nist_files import ap242_files
    ap242_files()  # unpacks the zip into tests/nist/.cache once
    nist = sorted(p for p in (ROOT / "tests" / "nist" / ".cache" / "NIST-PMI-STEP-Files").rglob("*")
                  if p.is_file() and p.suffix.lower() in (".step", ".stp"))
    return sorted((ROOT / "tests" / "parts").glob("*.step")) + nist  # all 33 STEP files of the zip


def full_set() -> list[Path]:
    extra = [p for d in ("tests/edmr/models", "tests/grading/sets") for p in sorted((ROOT / d).rglob("*"))
             if p.is_file() and p.suffix.lower() in (".step", ".stp")]
    return quick_set() + extra


def process_of(path: Path, processes: dict[str, str]) -> str:
    if path.parent == ROOT / "tests" / "parts":
        return processes.get(path.stem, "mill")
    return "mill"


def code_hash() -> bytes:
    """Path and bytes of every file the key depends on, then the pythonocc version."""
    h = hashlib.sha256()
    files = [p for d in ("service", "config") for p in (ROOT / d).rglob("*") if p.is_file() and "__pycache__" not in p.parts]
    files += [Path(__file__).resolve(), EXPECTED]
    for p in sorted(files, key=rel):
        h.update(rel(p).encode() + b"\0" + p.read_bytes() + b"\0")
    import OCC
    h.update(OCC.VERSION.encode())
    return h.digest()


def file_hash(path: Path, code: bytes) -> str:
    h = hashlib.sha256(rel(path).encode() + b"\0" + path.read_bytes() + b"\0")
    h.update(code)
    return h.hexdigest()


def child(path: str, process: str) -> None:
    """Analyse one file and print MARK, then its JSON (runs in its own process)."""
    from dfma.analyze import analyze
    from dfma.errors import ReadError
    try:
        result = analyze(path, Path(path).name, process, "al6061")
    except ReadError as exc:
        result = {"error": str(exc)}
    sys.stdout.write(MARK + json.dumps(result) + "\n")


def run_one(path: Path, process: str, out: Path, digest: str) -> None:
    """Write the key for one file. A response or refusal is cached by its hash; a crash is never cached, so a crash
    caused by this machine (a kill, a timeout under load) is tried again on the next run."""
    cached = CACHE / "by-hash" / (digest + ".json")
    if cached.exists():
        body = cached.read_text(encoding="utf-8")
    else:
        try:
            done = subprocess.run([sys.executable, __file__, "--child", str(path), process], cwd=ROOT,
                                  capture_output=True, text=True, timeout=CHILD_TIMEOUT_S)
            line = next((ln for ln in done.stdout.splitlines() if ln.startswith(MARK)), None)
            body = line[len(MARK):] if line else json.dumps({"crash": done.returncode})
        except subprocess.TimeoutExpired:
            body = json.dumps({"crash": -9})  # killed at CHILD_TIMEOUT_S, as SIGKILL reports it
        if not body.startswith('{"crash"'):
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_text(body, encoding="utf-8")
    (out / key_name(path)).write_text(body, encoding="utf-8")


def write_set(name: str, out: Path) -> int:
    files = quick_set() if name == "quick" else full_set()
    processes: dict[str, str] = {}
    for part in tomllib.loads(EXPECTED.read_text(encoding="utf-8"))["part"]:
        processes.setdefault(part["name"], part.get("process", "mill"))  # a name listed twice: the first entry wins
    code = code_hash()
    out.mkdir(parents=True, exist_ok=True)
    jobs = [(p, process_of(p, processes)) for p in files]
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as pool:
        list(pool.map(lambda j: run_one(j[0], j[1], out, file_hash(j[0], code)), jobs))
    index = [{"path": rel(p), "process": proc, "key": key_name(p)} for p, proc in jobs]
    (out / f"index-{name}.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
    bad = [i["path"] for i in index if "crash" in json.loads((out / i["key"]).read_text(encoding="utf-8"))]
    print(f"key: {len(index)} files in {rel(out) if out.is_relative_to(ROOT) else out}; Python crashed on {len(bad)}: {', '.join(bad) or 'none'}")
    return 0


def write_settings() -> int:
    from dfma import settings
    values = {k: (list(v) if isinstance(v, tuple) else v) for k, v in vars(settings).items()
              if k.isupper() and k not in MACHINE}
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "settings.json").write_text(json.dumps(values, indent=1, default=str), encoding="utf-8")
    print(f"settings: {len(values)} names in {rel(CACHE / 'settings.json')}")
    return 0


def main() -> int:
    if len(sys.argv) == 4 and sys.argv[1] == "--child":
        child(sys.argv[2], sys.argv[3])
        return 0
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--set", choices=("quick", "full"))
    ap.add_argument("--out", type=Path, default=CACHE / "key")
    ap.add_argument("--settings", action="store_true")
    args = ap.parse_args()
    if args.settings:
        return write_settings()
    if not args.set:
        ap.error("give --set quick|full or --settings")
    return write_set(args.set, args.out.resolve())


if __name__ == "__main__":
    sys.exit(main())
