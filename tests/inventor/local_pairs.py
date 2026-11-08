"""Run the app path on Morgan's work pairs (I1 spec "Test files"; the files never enter git, D-006, D-032).

    python tests/inventor/local_pairs.py

Each folder in tests/inventor/.local/ holds one .ipt and one .stp or .step. Prints, per pair, the counts and
`pair check: pass` or `pair check: FAIL - <reason>`, and compares with local_pairs.toml when it has the pair.
"""

from __future__ import annotations

import hashlib
import sys
import tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "service"))

from dfma.errors import ReadError  # noqa: E402
from dfma.inventor import check_pair, check_part_type, read_ipt  # noqa: E402
from dfma.read import read_step  # noqa: E402


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> int:
    expected = {p["name"]: p for p in tomllib.loads((HERE / "local_pairs.toml").read_text("utf-8")).get("pair", [])}
    folders = sorted(d for d in (HERE / ".local").glob("*") if d.is_dir()) if (HERE / ".local").is_dir() else []
    if not folders:
        print("no pairs in tests/inventor/.local/ (one folder per pair: an .ipt and its .stp or .step)")
        return 1
    bad = 0
    for d in folders:
        ipts = list(d.glob("*.ipt")) + list(d.glob("*.IPT"))
        steps = [p for p in d.iterdir() if p.suffix.lower() in (".stp", ".step")]
        if len(ipts) != 1 or len(steps) != 1:
            print(f"{d.name}: needs exactly one .ipt and one STEP")
            bad += 1
            continue
        ipt, step = read_ipt(ipts[0]), read_step(steps[0])
        print(f"{d.name}: saved with {ipt.saved_with}, ACIS {ipt.acis_version}")
        try:
            check_part_type(ipt, step)
            checks = check_pair(ipt, step)
            print(f"  faces {checks['faces']}, corners {checks['corners']}, worst gap {checks['worst_corner_gap_mm']} mm")
            print("  pair check: pass")
        except ReadError as e:
            print(f"  pair check: FAIL - {e}")
            bad += 1
            continue
        want = expected.get(d.name)
        if want:
            got = {"ipt_sha256": sha(ipts[0]), "step_sha256": sha(steps[0]),
                   "faces": checks["faces"][0], "corners": checks["corners"][0]}
            for k, v in got.items():
                if want.get(k) != v:
                    print(f"  {k}: expected {want.get(k)}, got {v}")
                    bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
