"""Build set 3 (hole ends and hole walls): labelled STEP parts for tests/grading/grade.py, plus EXPECT.json.

    python tests/grading/sets/hole_ends_walls/make.py      (writes the .step files, MANIFEST.md, EXPECT.json)

HANDOFF 3a and the next-sets page (set 3, with S5): countersinks were left out of their hole, so the hole
did not know it was countersunk; a hole leaving through a slope reported its longest side as its depth;
material at a hole was checked at 3 heights only, so thin material near its top was missed, and only the
thinnest side of a hole was reported. D-022 (Morgan, 2026-11-08) settles what the engine should give:
the countersink stays out of the hole's faces (labelled 0 chamfer, as MFCAD++ and ../tapered_holes) and
the hole records its diameter and angle; the depth is where the hole is round all the way, with the
longest side as max_depth.

Labels as in ../bullnose_draft/make.py: 1 through hole, 12 blind hole, 0 chamfer (countersink or entry
chamfer), 14 rectangular pocket, 24 stock. EXPECT.json gives, per part, each hole's depth and max_depth,
its countersinks (diameter, included angle), and the hole-wall thicknesses, worked out here from the
geometry, never from the engine. Sizes in mm; the block is 100 x 60 x 30, top at z = 30.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "bullnose_draft"))

from make import BLOCK, TOP, block, cut, through_hole, write  # noqa: E402

from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_Transform  # noqa: E402
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCone, BRepPrimAPI_MakeCylinder  # noqa: E402
from OCC.Core.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf  # noqa: E402

UP, DOWN = gp_Dir(0, 0, 1), gp_Dir(0, 0, -1)
CX, CY = 50.0, 30.0


def cyl(x, y, z0, r, h):
    return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, z0), UP), r, h).Shape()


def box(x, y, z, l, w, h):
    return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), l, w, h).Shape()


def countersink(r, big_r, deg, at_top=True):
    """A cone tool: radius r where it meets the hole, widening at deg/2 from the axis to big_r at the face,
    and 1 mm past it. Returns (tool, how deep it reaches into the part)."""
    t = math.tan(math.radians(deg / 2))
    h = (big_r - r) / t
    if at_top:
        return BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(CX, CY, TOP - h), UP), r, big_r + t, h + 1).Shape(), h
    return BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(CX, CY, h), DOWN), r, big_r + t, h + 1).Shape(), h


def slope_cut(z_at_centre, deg, bottom=True):
    """A half-space tool that leaves the block's bottom (or top) as a plane through z_at_centre at y = CY,
    tilted deg about X (rising with y)."""
    big = 400.0
    tool = box(-150, -150, z_at_centre - big if bottom else z_at_centre, 400, 400, big)
    t = gp_Trsf()
    t.SetRotation(gp_Ax1(gp_Pnt(CX, CY, z_at_centre), gp_Dir(1, 0, 0)), math.radians(deg))
    return BRepBuilderAPI_Transform(tool, t, True).Shape()


def parts():
    """(name, what, part, [(tool, class)], expect). expect: {"holes": [{depth, max_depth?, countersinks}],
    "walls": [hole-wall thicknesses]}."""
    P = []

    def hole(depth, max_depth=None, csk=()):
        h = {"depth": round(depth, 4), "countersinks": [[round(d, 4), a] for d, a in csk]}
        if max_depth is not None:
            h["max_depth"] = round(max_depth, 4)
        return h

    # Countersinks (D-022): the cone is a chamfer (0); the hole keeps its own faces and records the countersink.
    for name, r, big, deg, what in (("cs_90", 3.3, 6.5, 90, "d6.6 through hole, 90 deg countersink to d13"),
                                    ("cs_82", 3.3, 6.35, 82, "d6.6 through hole, 82 deg countersink to d12.7 (inch screws)"),
                                    ("cs_100", 2.75, 5.5, 100, "d5.5 through hole, 100 deg countersink to d11"),
                                    ("cs_120", 3.3, 6.5, 120, "d6.6 through hole, 120 deg countersink to d13")):
        cone, h = countersink(r, big, deg)
        hl = through_hole(CX, CY, r)
        P.append((name, what, cut(cut(block(), hl), cone), [(cone, 0), (hl, 1)],
                  {"holes": [hole(TOP - h, csk=[(2 * big, deg)])], "walls": []}))
    cone, h = countersink(2.5, 5.0, 90)
    hl = cyl(CX, CY, 15, 2.5, 20)
    P.append(("cs_blind", "d5 blind hole 15 deep (flat bottom), 90 deg countersink to d10", cut(cut(block(), hl), cone),
              [(cone, 0), (hl, 12)], {"holes": [hole(15 - h, csk=[(10.0, 90)])], "walls": []}))
    top, h = countersink(3.3, 6.5, 90)
    bot, _ = countersink(3.3, 6.5, 90, at_top=False)
    hl = through_hole(CX, CY, 3.3)
    P.append(("cs_both", "d6.6 through hole, 90 deg countersink to d13 at both ends", cut(cut(cut(block(), hl), top), bot),
              [(top, 0), (bot, 0), (hl, 1)], {"holes": [hole(TOP - 2 * h, csk=[(13.0, 90), (13.0, 90)])], "walls": []}))
    cone, h = countersink(5.0, 5.5, 90)
    hl = through_hole(CX, CY, 5.0)
    P.append(("ch_entry", "d10 through hole, 0.5 x 45 deg entry chamfer (a 90 deg countersink to d11)",
              cut(cut(block(), hl), cone), [(cone, 0), (hl, 1)], {"holes": [hole(TOP - h, csk=[(11.0, 90)])], "walls": []}))
    r, point = 4.0, 4.0 / math.tan(math.radians(59))
    tip = BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(CX, CY, 20), DOWN), r, 0.0, point).Shape()
    hl = cyl(CX, CY, 20, r, 15)
    P.append(("ng_drill_point", "d8 blind hole 10 deep with a 118 deg drill point (a point, not a countersink)",
              cut(cut(block(), hl), tip), [(hl, 12), (tip, 12)], {"holes": [hole(10.0)], "walls": []}))

    # Sloped exits (D-022): depth where the hole is round all the way; the longest side is max_depth.
    def sloped(name, what, r, z, deg, bottom, blind_to=None):
        part = cut(block(), slope_cut(z, deg, bottom))
        hl = cyl(CX, CY, blind_to, r, TOP + 5 - blind_to) if blind_to is not None else through_hole(CX, CY, r)
        dz = r * math.tan(math.radians(deg))
        if bottom:
            full, longest = TOP - (z + dz), TOP - (z - dz)
        else:
            full, longest = (z - dz) - blind_to, (z + dz) - blind_to
        P.append((name, what, cut(part, hl), [(hl, 1 if blind_to is None else 12)],
                  {"holes": [hole(full, longest)], "walls": []}))
    sloped("sx_bottom_20", "d8 through hole leaving a 20 deg sloped bottom (plane through z 5 at the hole)", 4.0, 5.0, 20, True)
    sloped("sx_bottom_45", "d6 through hole leaving a 45 deg sloped bottom (plane through z 10 at the hole)", 3.0, 10.0, 45, True)
    sloped("sx_top_30", "d6 blind hole from a 30 deg sloped top (plane through z 25 at the hole) to a flat bottom at z 5",
           3.0, 25.0, 30, False, blind_to=5.0)
    hl = through_hole(CX, CY, 4.0)
    P.append(("sx_control", "d8 through hole in the flat block (control)", cut(block(), hl), [(hl, 1)],
              {"holes": [hole(TOP)], "walls": []}))

    # Hole walls: rays about every 1 mm along the hole, and one wall per face near it (set 3).
    def walled(name, what, hole_tool, cls, pocket, walls, depth):
        P.append((name, what, cut(cut(block(), hole_tool), pocket), [(hole_tool, cls), (pocket, 14)],
                  {"holes": [hole(depth)], "walls": walls}))
    walled("hw_top", "d8 blind hole 25 deep; a 4 deep pocket from the top 0.4 from its side (near the top only)",
           cyl(CX, CY, 5, 4, 30), 12, box(54.4, 20, TOP - 4, 10, 20, 10), [0.4], 25.0)
    walled("hw_bottom", "d8 through hole; a 4 deep pocket from the bottom 0.5 from its side (near the bottom only)",
           through_hole(CX, CY, 4), 1, box(54.5, 20, -5, 10, 20, 9), [0.5], TOP)
    walled("hw_mid", "d8 through hole; a 25 deep pocket from the top 0.5 from its side (control: found at 3 heights too)",
           through_hole(CX, CY, 4), 1, box(54.5, 20, 5, 10, 20, 30), [0.5], TOP)
    hl = through_hole(CX, 4.4, 4.0)
    pk = box(40, 9.0, 10, 20, 15, 25)
    P.append(("hw_two_sides", "d8 through hole 0.4 from the -Y face, and a 20 deep pocket 0.6 from its other side",
              cut(cut(block(), hl), pk), [(hl, 1), (pk, 14)], {"holes": [hole(TOP)], "walls": [0.4, 0.6]}))
    return P


def main() -> int:
    from collections import Counter
    lines = ["# Hole ends and walls set (set 3)", "",
             "Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name; depths, "
             "countersinks and hole walls in EXPECT.json (from the geometry, D-022). Score: "
             "`python tests/grading/grade.py mfcadpp tests/grading/sets/hole_ends_walls`.", "",
             "Part · what it tests · faces by class"]
    expect = {}
    for name, what, part, tools, exp in parts():
        labels = write(HERE / f"{name}.step", part, tools)
        counts = ", ".join(f"{k}: {v}" for k, v in sorted(Counter(labels).items()))
        lines.append(f"- `{name}` · {what} · {counts}")
        expect[name] = exp
    (HERE / "MANIFEST.md").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    (HERE / "EXPECT.json").write_text(json.dumps(expect, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {len(expect)} parts to {HERE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
