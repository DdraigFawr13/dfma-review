"""Build the tapered-hole set: labelled STEP parts for tests/grading/grade.py.

    python tests/grading/sets/tapered_holes/make.py      (writes the .step files next to this file)

Morgan, 2026-11-07: "go ahead with the tapered holes" (after the bull-nose and draft set showed a 1 deg
tapered round recess that only Analysis Situs reads). MFCAD++ has no tapered holes, so these parts are
made here with OpenCascade, labelled as in ../bullnose_draft/make.py (each face's class in its STEP
name): 1 through hole, 12 blind hole, 0 chamfer (a countersink or entry chamfer, as MFCAD++ labels
chamfers), 24 stock. A tapered hole's cone wall, and a drill point's cone, are hole faces; a
countersink or chamfer cone is not. Sizes in mm; the block is 100 x 60 x 30, top at z = 30.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "bullnose_draft"))

from make import TOP, block, cut, fuse, through_hole, tool_cyl, write  # noqa: E402

from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeCone, BRepPrimAPI_MakeCylinder  # noqa: E402
from OCC.Core.TopAbs import TopAbs_SOLID  # noqa: E402
from OCC.Core.TopExp import TopExp_Explorer  # noqa: E402
from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt  # noqa: E402

UP = gp_Dir(0, 0, 1)


def cone(x, y, z0, r0, r1, h):
    """A cone from radius r0 at z0 to r1 at z0 + h."""
    return BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(x, y, z0), UP), r0, r1, h).Shape()


def parts():
    P = []

    def one(name, what, tools):
        part = block()
        for t, _ in tools:
            part = cut(part, t)
        P.append((name, what, part, tools))

    # Tapered holes: the draft is about the top face, so the radius at the top is the one given.
    for deg in (1, 3, 5, 10):
        one(f"tp_blind_{deg}deg", f"round recess d20 at the top, 15 deep, {deg} deg taper",
            [(tool_cyl(50, 30, 15, 10, deg=deg), 12)])
    one("tp_blind_3deg_r1", "round recess d20, 15 deep, 3 deg taper, 1 mm fillet round its floor",
        [(tool_cyl(50, 30, 15, 10, deg=3, floor=1), 12)])
    one("tp_small_3deg", "blind hole d6 at the top, 12 deep, 3 deg taper", [(tool_cyl(50, 30, 18, 3, deg=3), 12)])
    pin = math.degrees(math.atan(1 / 100))  # a 1:50 taper on diameter is 1:100 on radius, 0.573 deg
    one("tp_pin_through", "taper-pin hole d8 at the top, 1:50 taper, through the part",
        [(tool_cyl(50, 30, -5, 4, deg=pin), 1)])
    npt = math.degrees(math.atan(1 / 32))  # pipe thread taper 1:16 on diameter, 1.79 deg
    one("tp_pipe", "pipe-thread taper hole d21.3 at the top, 1:16 taper, 18 deep",
        [(tool_cyl(50, 30, 12, 10.65, deg=npt), 12)])
    # Steeper cones that are not tapered holes, on straight holes
    one("ng_csink", "d6 through hole with a 90 deg countersink d12 (the countersink is not a hole)",
        [(cone(50, 30, TOP - 3, 3, 9, 6), 0), (through_hole(50, 30, 3), 1)])
    one("ng_chamfer", "d10 through hole with a 1 mm x 45 deg entry chamfer (the chamfer is not a hole)",
        [(cone(50, 30, TOP - 1, 5, 7, 2), 0), (through_hole(50, 30, 5), 1)])
    drill = [(BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(50, 30, 20), UP), 4, 15).Shape(), 12),
             (cone(50, 30, 20 - 4 / math.tan(math.radians(59)), 0, 4, 4 / math.tan(math.radians(59))), 12)]
    one("ng_drill_point", "d8 blind hole, 10 deep, with a 118 deg drill point (the point is part of the hole)", drill)
    boss = fuse(block(), cone(50, 30, TOP, 10, 10 - 10 * math.tan(math.radians(3)), 10))
    P.append(("ng_boss_3deg", "round boss d20 with 3 deg draft on the top face (not a hole)", boss, []))
    return P


def main() -> int:
    lines = ["# Tapered-hole set", "",
             "Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name. "
             "Score: `python tests/grading/grade.py mfcadpp tests/grading/sets/tapered_holes`.", "",
             "Part · what it tests · faces by class"]
    for name, what, part, tools in parts():
        exp, n = TopExp_Explorer(part, TopAbs_SOLID), 0
        while exp.More():
            n += 1
            exp.Next()
        assert n == 1, f"{name}: {n} solids"
        labels = write(HERE / f"{name}.step", part, tools)
        counts = ", ".join(f"{c}: {labels.count(c)}" for c in sorted(set(labels)))
        lines.append(f"- `{name}` · {what} · {counts}")
        print(name, counts)
    (HERE / "MANIFEST.md").write_text("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
