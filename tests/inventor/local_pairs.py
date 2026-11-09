"""Run the app path on Morgan's work pairs (I1 spec "Test files"; the files never enter git, D-006, D-032).

    python tests/inventor/local_pairs.py

Each folder in tests/inventor/.local/ holds one .ipt and one .stp or .step. Prints, per pair, the counts and
`pair check: pass` or `pair check: FAIL - <reason>`, then (S2) the thread counts per state, (I2 S1) the Hole features and their holes per state, and compares with local_pairs.toml when it has the pair.
"""

from __future__ import annotations

import hashlib
import sys
import tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "service"))

from dfma.analyze import analyze  # noqa: E402
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
            # S2: the app path itself (analyze with the .ipt, no transform), for the thread counts
            result = analyze(steps[0], steps[0].name, ipt_path=ipts[0], ipt_name=ipts[0].name)
            n = {s: sum(t["state"] == s for t in result["inventor"]["threads"])
                 for s in ("matched", "disagrees", "not_mapped")}
            print(f"  threads: {n['matched']} matched, {n['disagrees']} disagree, {n['not_mapped']} not mapped")
            for t in result["inventor"]["threads"]:
                print(f"    {t['id']} {t['designation']} {t['class']} {t['state']} {t['hole'] or t['reason']}")
            # I2 S1: Hole features and their holes per state; D-032's 95% is read per hole
            feats = result["inventor"]["hole_features"]
            rows = [h for f in feats for h in f["holes"]]
            h = {s: sum(r["state"] == s for r in rows) for s in ("matched", "disagrees", "not_mapped")}
            share = f"{100 * h['matched'] / len(rows):.1f}%" if rows else "n/a"
            print(f"  hole features: {len(feats)}, holes: {h['matched']} matched, {h['disagrees']} disagree, "
                  f"{h['not_mapped']} not mapped ({share} matched; D-032 asks 95%)")
            for f in feats:
                print(f"    {f['id']} {f['type']} {f['diameter_mm']} mm {f['state']}: "
                      + ", ".join(f"{r['id']} {r['state']} {r['hole'] or r['reason']}" for r in f["holes"]))
        except ReadError as e:
            print(f"  pair check: FAIL - {e}")
            bad += 1
            continue
        want = expected.get(d.name)
        if want:
            got = {"ipt_sha256": sha(ipts[0]), "step_sha256": sha(steps[0]),
                   "faces": checks["faces"][0], "corners": checks["corners"][0],
                   "threads_matched": n["matched"], "threads_disagrees": n["disagrees"],
                   "threads_not_mapped": n["not_mapped"], "hole_features": len(feats),
                   "holes_matched": h["matched"], "holes_disagrees": h["disagrees"], "holes_not_mapped": h["not_mapped"]}
            for k, v in got.items():
                if want.get(k) != v:
                    print(f"  {k}: expected {want.get(k)}, got {v}")
                    bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
