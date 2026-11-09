"""Analyse a NIST pair lined up by the test harness (spec I1 "Test files"). NIST's STEP files come from other
CAD systems, so the app refuses every NIST pair (J2); here `register` finds the frame and the pair check is
skipped, so the thread mapping can be tested and shown (labelled as such in the demo).

    python tests/inventor/nist_pair.py <step> <ipt>     # prints the thread lines
"""

from __future__ import annotations

import functools
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "service"))
sys.path.insert(0, str(HERE))

from dfma.analyze import analyze  # noqa: E402
from dfma.inventor import read_ipt  # noqa: E402
from dfma.read import read_step  # noqa: E402

from register import register  # noqa: E402

DEMO_LABEL = "NIST pair lined up by the test harness; the app itself refuses this pair"


@functools.lru_cache(maxsize=None)
def transform(step: str, ipt: str):
    """(rows, shift) for the pair, from the STEP's holes and bores in a plain Turning-free analysis."""
    plain = analyze(step, Path(step).name, "mill")
    holes = [f for f in plain["features"] if f["kind"] == "hole"]
    rows, shift = register(read_ipt(ipt), ipt, read_step(step), holes)
    return tuple(map(tuple, rows)), tuple(shift)


def analyze_registered(step, ipt, process: str = "mill", material: str = "al6061") -> dict:
    """`analyze` with the .ipt lined up by `register` and no pair check (never the app path)."""
    rows, shift = transform(str(step), str(ipt))
    return analyze(step, Path(step).name, process, material, ipt_path=ipt, ipt_name=Path(ipt).name,
                   ipt_transform=([list(r) for r in rows], list(shift)), ipt_check=False)


if __name__ == "__main__":
    r = analyze_registered(sys.argv[1], sys.argv[2])
    print("transform", transform(sys.argv[1], sys.argv[2]))
    for t in r["inventor"]["threads"]:
        print(t["id"], t["designation"], t["class"], t["depth_mm"], t["tap_drill_mm"], t["state"], t["hole"],
              [g["text"] for g in t["gaps"]], t["reason"])
    for f in r["findings"]:
        if f["rule"] == "thread_mismatch":
            print(f["id"], f["title"])
