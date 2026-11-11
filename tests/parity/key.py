"""The answer key for the browser engine (port spec, Parity): the Python app's response for each file of a set.

    python tests/parity/key.py --set quick|full [--out DIR]     (default DIR: tests/parity/.cache/key)
    python tests/parity/key.py --settings                       (writes tests/parity/.cache/settings.json)
    python tests/parity/key.py --freeze                         (S8a: copies the quick and full keys to tests/parity/key/)

Each file runs `dfma.analyze.analyze` (Aluminum 6061; the process tests/parts/expected.toml gives a part, else
Milling) in its own process (the tests/grading/child.py pattern: some files crash pythonocc) and is written to
`<DIR>/<path relative to the repo, "/" as "__">.json`: the response, {"error": <message>} or {"crash": <exit code>}.
`<DIR>/index-<set>.json` lists the set: [{"path", "process", "key"}], which web/src/engine/parity.test.ts reads.
From port S7 the quick set also holds each of the 16 NIST .ipt files beside its NIST STEP (`ipt`), twice: through the
app (every NIST pair is refused, J2) and lined up by the test harness (`harness`: tests/inventor/nist_pair.py, no
pair check; the key then carries the harness's transform as "__harness", so the port needs no `register`), and the
hostile .ipt files of tests/service/test_inventor_safety.py, written to tests/parity/.cache/hostile/.
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


KEY_FORMAT = "1"  # bump when the child's JSON or the file layout changes: this script is no longer hashed (S8a)
HARNESS = ("register.py", "nist_pair.py")  # the modules a harness key's transform comes from


def code_hash() -> bytes:
    """Path and bytes of every file the key depends on (the app: service/, config/, the part table), the key format
    and the pythonocc version. This script is not hashed: an edit to it, or to the harness (tests/inventor), does not
    rebuild the app's keys (S8a)."""
    h = hashlib.sha256()
    files = [p for d in ("service", "config") for p in (ROOT / d).rglob("*") if p.is_file() and "__pycache__" not in p.parts]
    files += [EXPECTED]
    for p in sorted(files, key=rel):
        h.update(rel(p).encode() + b"\0" + p.read_bytes() + b"\0")
    import OCC
    h.update(OCC.VERSION.encode() + b"\0" + KEY_FORMAT.encode())
    return h.digest()


def file_hash(path: Path, code: bytes) -> str:
    h = hashlib.sha256(rel(path).encode() + b"\0" + path.read_bytes() + b"\0")
    h.update(code)
    return h.hexdigest()


def child(path: str, process: str, ipt: str | None = None, harness: bool = False) -> None:
    """Analyse one file (with its .ipt) and print MARK, then its JSON (runs in its own process)."""
    from dfma.analyze import analyze
    from dfma.errors import ReadError
    try:
        if harness:
            sys.path.insert(0, str(ROOT / "tests" / "inventor"))
            from nist_pair import analyze_registered, transform
            result = analyze_registered(path, ipt, process)
            rows, shift = transform(str(path), str(ipt))
            result["__harness"] = {"transform": [[list(r) for r in rows], list(shift)]}
        else:
            result = analyze(path, Path(path).name, process, "al6061", ipt_path=ipt,
                             ipt_name=Path(ipt).name if ipt else None)
    except ReadError as exc:
        result = {"error": str(exc)}
    sys.stdout.write(MARK + json.dumps(result) + "\n")


INV = ROOT / "tests" / "inventor" / "files"
HOSTILE = CACHE / "hostile"


def nist_step(ipt: Path) -> Path:
    """The NIST STEP of an .ipt: INV_nist_<ctc|ftc>_NN_..._2021 -> nist_<ctc|ftc>_NN_..._ap242, _2024 -> nist_stc_NN
    (NIST STC 06-10, SOURCE.md); the last in name order, so FTC 08 takes e2, not e1-tg (as hole_counts.toml)."""
    from nist_files import ap242_files
    kind, nn, year = ipt.stem.split("_")[2], ipt.stem.split("_")[3], ipt.stem.split("_")[-1]
    prefix = f"nist_{'stc' if year == '2024' else kind}_{nn}_asme1_ap242"
    return sorted(p for p in ap242_files() if p.name.startswith(prefix))[-1]


def fillet_radius(d: bytes) -> bytes:
    """CTC 04's first fillet with its radius 2% larger in the .ipt: every face of it (cylinder: the length of its 3rd
    vector; torus: its minor radius; sphere: its radius), so it stays one fillet and disagrees with the STEP
    (blend_mismatch; no NIST pair has a fillet that disagrees). The other bytes stay where they are."""
    import struct

    import hostile
    from dfma.inventor import blends, sab, tags
    k = d.find(sab.HEADER)
    best = None
    while k >= 0:  # the model with the most faces, as read_ipt picks it
        _, recs = sab.split(d, k)
        n = sum(1 for r in recs if r.name == "face")
        if best is None or n > best[2]:
            best = (k, recs, n)
        k = d.find(sab.HEADER, k + 1)
    start, recs, _ = best
    offsets = hostile.records(d, start)
    fillet = next((b for b in blends.read_blends(recs, tags.feature_tags(recs)) if b.kind == "fillet"), None)
    if fillet is None:  # a stream whose model has no fillet: unchanged
        return d
    out = bytearray(d)
    for face in fillet.faces:
        surf = next(q for p in recs[face].of("p") if (q := sab.ref(recs, p, suffix="surface")) is not None)
        name = recs[surf].name or ""
        vals = offsets[surf]["values"]
        if name.startswith("cone"):
            at = [o for t, o in vals if t in (0x13, 0x14)][2]
            v = struct.unpack_from("<3d", out, at + 1)
            struct.pack_into("<3d", out, at + 1, *(1.02 * x for x in v))
        else:  # torus: the 2nd float; sphere: the 1st
            at = [o for t, o in vals if t == 0x06][1 if name.startswith("torus") else 0]
            struct.pack_into("<d", out, at + 1, 1.02 * struct.unpack_from("<d", out, at + 1)[0])
    return bytes(out)


def hostile_files() -> list[tuple[Path, Path, bool]]:
    """(STEP, hostile .ipt, harness) for each case of test_inventor_safety.py, written once to HOSTILE."""
    import shutil

    sys.path[:0] = [str(ROOT / "tests" / "service"), str(ROOT / "tests" / "inventor")]
    import hostile
    from helpers import rewrite_ipt_models
    from test_inventor_safety import BOX, CTC04, _blend_face, _cut, _no_header, _owner_feature, _unknown_tag
    HOSTILE.mkdir(parents=True, exist_ok=True)
    out = []
    n, face, _ = _owner_feature()
    bface, _ = _blend_face(0)
    cases = [("no-model", INV / "INV_nist_ftc_11_asme1_2021.ipt", _no_header, False),
             ("unknown-tag", INV / "INV_nist_ftc_11_asme1_2021.ipt", _unknown_tag, False),
             ("cut-short", INV / "INV_nist_ftc_11_asme1_2021.ipt", _cut, False)]
    cases += [(f"hole-{k}", CTC04, (lambda k: lambda d: getattr(hostile, k)(d, n))(k), True)
              for k in ("no_end", "long_list", "owner_off")]
    cases += [(f"blend-{k}", CTC04, (lambda k: lambda d: getattr(hostile, k)(d, 0, kind="blend"))(k), True)
              for k in ("no_end", "long_list", "owner_off")]
    cases += [("cycle-hole", CTC04, lambda d: hostile.cycle(d, face), True),
              ("cycle-blend", CTC04, lambda d: hostile.cycle(d, bface), True),
              ("fillet-radius", CTC04, lambda d: fillet_radius(d) if d.find(b"\x0d\x09asmheader") >= 0 else d, True)]  # noqa: E501
    for name, base, change, harness in cases:
        p = HOSTILE / f"{name}.ipt"
        shutil.copyfile(base, p)
        rewrite_ipt_models(p, change)
        out.append((nist_step(base) if harness else BOX, p, harness))
    notes = HOSTILE / "not-an-ipt.ipt"
    notes.write_text("not a compound file")
    out.append((BOX, notes, False))
    return out


def ipt_jobs() -> list[tuple[Path, str, Path | None, bool]]:
    """(STEP, process, .ipt, harness) for the 16 NIST pairs (app and harness) and the hostile files."""
    jobs = []
    for ipt in sorted(INV.glob("*.ipt")):
        jobs += [(nist_step(ipt), "mill", ipt, False), (nist_step(ipt), "mill", ipt, True)]
    return jobs + [(step, "mill", ipt, harness) for step, ipt, harness in hostile_files()]


def job_key(path: Path, ipt: Path | None, harness: bool) -> str:
    if ipt is None:
        return key_name(path)
    return key_name(path)[:-5] + "+" + ipt.name + ("+harness" if harness else "") + ".json"


def run_one(path: Path, process: str, out: Path, digest: str, ipt: Path | None = None, harness: bool = False) -> None:
    """Write the key for one file. A response or refusal is cached by its hash; a crash is never cached, so a crash
    caused by this machine (a kill, a timeout under load) is tried again on the next run."""
    cached = CACHE / "by-hash" / (digest + ".json")
    if cached.exists():
        body = cached.read_text(encoding="utf-8")
    else:
        try:
            extra = [str(ipt), "harness" if harness else "app"] if ipt is not None else []
            done = subprocess.run([sys.executable, __file__, "--child", str(path), process, *extra], cwd=ROOT,
                                  capture_output=True, text=True, timeout=CHILD_TIMEOUT_S)
            line = next((ln for ln in done.stdout.splitlines() if ln.startswith(MARK)), None)
            body = line[len(MARK):] if line else json.dumps({"crash": done.returncode})
        except subprocess.TimeoutExpired:
            body = json.dumps({"crash": -9})  # killed at CHILD_TIMEOUT_S, as SIGKILL reports it
        if not body.startswith('{"crash"'):
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_text(body, encoding="utf-8")
    (out / job_key(path, ipt, harness)).write_text(body, encoding="utf-8")


def write_set(name: str, out: Path) -> int:
    files = quick_set() if name == "quick" else full_set()
    processes: dict[str, str] = {}
    for part in tomllib.loads(EXPECTED.read_text(encoding="utf-8"))["part"]:
        processes.setdefault(part["name"], part.get("process", "mill"))  # a name listed twice: the first entry wins
    code = code_hash()
    out.mkdir(parents=True, exist_ok=True)
    jobs = [(p, process_of(p, processes), None, False) for p in files] + ipt_jobs()  # the .ipt pairs from S7

    def digest(j) -> str:
        if j[2] is None:
            return file_hash(j[0], code)
        h = hashlib.sha256(file_hash(j[0], code).encode() + rel(j[2]).encode() + b"\0" + j[2].read_bytes() + b"\0")
        h.update(b"harness" if j[3] else b"app")
        if j[3]:  # only a harness key depends on the harness modules (S8a: other tests/inventor edits keep the cache)
            for name in HARNESS:
                h.update(rel(ROOT / "tests" / "inventor" / name).encode() + b"\0" + (ROOT / "tests" / "inventor" / name).read_bytes())
        return h.hexdigest()

    with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as pool:
        list(pool.map(lambda j: run_one(j[0], j[1], out, digest(j), j[2], j[3]), jobs))
    index = [{"path": rel(p), "process": proc, "key": job_key(p, ipt, harness),
              **({"ipt": rel(ipt), "harness": harness} if ipt is not None else {})} for p, proc, ipt, harness in jobs]
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


FROZEN = ROOT / "tests" / "parity" / "key"


def write_freeze() -> int:
    """S8a: copy the quick and full keys the cache holds into tests/parity/key/ (committed): only the files the two
    indexes name, so a stale cache entry stays out. Run it after `--set quick` and `--set full`."""
    import shutil
    cache = CACHE / "key"
    indexes = [cache / f"index-{s}.json" for s in ("quick", "full")]
    if not all(i.exists() for i in indexes):
        sys.exit("freeze: run python tests/parity/key.py --set quick and --set full first")
    names = {n for i in indexes for e in json.loads(i.read_text(encoding="utf-8")) for n in [e["key"]]}
    import gzip
    FROZEN.mkdir(parents=True, exist_ok=True)
    for old in FROZEN.glob("*.json.gz"):
        if old.name[:-3] not in names:
            old.unlink()
    for n in sorted(names):  # gzipped (mtime 0, so the same key gives the same bytes): the frozen set is ~5x smaller
        (FROZEN / (n + ".gz")).write_bytes(gzip.compress((cache / n).read_bytes(), 9, mtime=0))
    for i in indexes:  # the index names the gzipped files
        index = [{**e, "key": e["key"] + ".gz"} for e in json.loads(i.read_text(encoding="utf-8"))]
        (FROZEN / i.name).write_text(json.dumps(index, indent=1), encoding="utf-8")
    size = sum(p.stat().st_size for p in FROZEN.rglob("*") if p.is_file())
    print(f"freeze: {len(names)} keys (gzipped) and 2 indexes in {rel(FROZEN)}: {size / 1e6:.2f} MB")
    return 0


def main() -> int:
    if len(sys.argv) in (4, 6) and sys.argv[1] == "--child":
        child(sys.argv[2], sys.argv[3], *((sys.argv[4], sys.argv[5] == "harness") if len(sys.argv) == 6 else ()))
        return 0
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--set", choices=("quick", "full"))
    ap.add_argument("--out", type=Path, default=CACHE / "key")
    ap.add_argument("--settings", action="store_true")
    ap.add_argument("--freeze", action="store_true", help="copy the cached quick and full keys into tests/parity/key/")
    args = ap.parse_args()
    if args.settings:
        return write_settings()
    if args.freeze:
        return write_freeze()
    if not args.set:
        ap.error("give --set quick|full or --settings")
    return write_set(args.set, args.out.resolve())


if __name__ == "__main__":
    sys.exit(main())
