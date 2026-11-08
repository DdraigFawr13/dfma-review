"""Build the undercuts set: labelled STEP parts for tests/grading/grade.py.

    python tests/grading/sets/undercuts/make.py      (writes the .step files, MANIFEST.md)

Morgan, 2026-11-07: "go with your recommendation" (https://claude.ai/artifact/56Q3xAiYVEHJxPK5WGSJJm, set 2).
Stress test (https://claude.ai/artifact/4oufpheC26VYYwT2zBiiHs): a blind T-slot shows up as 5 phantom
pockets on axes -Z, +Y, -Y, +Z, because nothing checks that a floor can be reached from outside along
its normal. MFCAD++ has no T-slots, dovetails or undercuts, so these parts are made here with
OpenCascade, labelled as in ../bullnose_draft/make.py (each face's class in its STEP name):
  6 rectangular through slot, 17 rectangular blind slot, 18 vertical circular end blind slot (17 and 18
  are not scored: any pocket call on them shows under "claimed on excluded"), 14 rectangular pocket,
  24 stock.
A T-slot's or dovetail's faces are all slot faces: one T-slot or dovetail cutter makes them with the neck.
A pocket with an undercut (a lip over its body, or a groove round its floor) is one pocket: every face of
the cavity is a pocket face (14), as a boss inside a pocket is (../pocket_edges), and its depth runs from
the floor to the top face. MANIFEST.md gives each part's expected pocket count and depth;
tests/service/test_undercuts.py checks ours. Block 100 x 60 x 30 mm, top at z = 30. Sizes in mm.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "bullnose_draft"))

from make import TOP, block, cut, fuse, write  # noqa: E402

from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakePolygon  # noqa: E402
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakePrism  # noqa: E402
from OCC.Core.TopAbs import TopAbs_SOLID  # noqa: E402
from OCC.Core.TopExp import TopExp_Explorer  # noqa: E402
from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt, gp_Vec  # noqa: E402

# T-slot (as a 10 mm T-slot for an M8 bolt, simplified): neck 10 wide x 10 deep, head 18 wide x 6 tall
NECK_W, NECK_D, HEAD_W, HEAD_H = 10.0, 10.0, 18.0, 6.0
YC = 30.0  # slots run along X on the block's centre line


def box(x0, y0, z0, x1, y1, z1):
    return BRepPrimAPI_MakeBox(gp_Pnt(x0, y0, z0), x1 - x0, y1 - y0, z1 - z0).Shape()


def tslot(x0, x1, round_end=False):
    """The tools of a T-slot along X from x0 to x1 (past the block's ends where it runs out).
    With round_end, its +X end is round in plan, as a T-slot cutter and the end mill before it leave it."""
    z_head = TOP - NECK_D - HEAD_H
    neck = box(x0, YC - NECK_W / 2, TOP - NECK_D, x1, YC + NECK_W / 2, TOP + 5)
    head = box(x0, YC - HEAD_W / 2, z_head, x1, YC + HEAD_W / 2, TOP - NECK_D)
    if round_end:
        neck = fuse(neck, BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x1, YC, TOP - NECK_D), gp_Dir(0, 0, 1)), NECK_W / 2, NECK_D + 5).Shape())
        head = fuse(head, BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x1, YC, z_head), gp_Dir(0, 0, 1)), HEAD_W / 2, HEAD_H).Shape())
    return fuse(neck, head)


def dovetail(x0, x1, top_w=12.0, depth=8.0, deg=60.0):
    """A dovetail slot's tool along X: `top_w` wide at the top face, flanks at `deg` to the floor
    (60 deg, the common dovetail cutter), so the floor is wider than the opening."""
    half_bot = top_w / 2 + depth / math.tan(math.radians(deg))
    z0 = TOP - depth
    pts = [(YC - half_bot, z0), (YC + half_bot, z0), (YC + top_w / 2, TOP), (YC + top_w / 2, TOP + 5),
           (YC - top_w / 2, TOP + 5), (YC - top_w / 2, TOP)]
    poly = BRepBuilderAPI_MakePolygon()
    for y, z in pts:
        poly.Add(gp_Pnt(x0, y, z))
    poly.Close()
    face = BRepBuilderAPI_MakeFace(poly.Wire()).Face()
    return BRepPrimAPI_MakePrism(face, gp_Vec(x1 - x0, 0, 0)).Shape()


def parts():
    """(name, what it tests, part, [(tool, class)], expected {"pockets", "depth"})."""
    P = []
    t = tslot(-5, 105)
    P.append(("ts_through", "T-slot along X through the block: neck 10 x 10, head 18 x 6 (not a pocket)",
              cut(block(), t), [(t, 6)], {"pockets": 0}))
    t = tslot(-5, 70)
    P.append(("ts_blind", "the same T-slot, open at -X, square end at x = 70 (not a pocket)",
              cut(block(), t), [(t, 17)], {"pockets": 0}))
    t = tslot(-5, 70, round_end=True)
    P.append(("ts_blind_round", "the same T-slot with a round end, as the cutters leave it (not a pocket)",
              cut(block(), t), [(t, 18)], {"pockets": 0}))
    a = box(-5, 12 - NECK_W / 2, TOP - NECK_D, 105, 12 + NECK_W / 2, TOP + 5)
    a = fuse(a, box(-5, 12 - HEAD_W / 2, TOP - NECK_D - HEAD_H, 105, 12 + HEAD_W / 2, TOP - NECK_D))
    b = box(-5, 48 - NECK_W / 2, TOP - NECK_D, 105, 48 + NECK_W / 2, TOP + 5)
    b = fuse(b, box(-5, 48 - HEAD_W / 2, TOP - NECK_D - HEAD_H, 105, 48 + HEAD_W / 2, TOP - NECK_D))
    P.append(("ts_two", "two through T-slots 36 apart, as on a fixture plate (not pockets)",
              cut(cut(block(), a), b), [(a, 6), (b, 6)], {"pockets": 0}))
    t = dovetail(-5, 105)
    P.append(("dt_through", "60 deg dovetail along X through the block, 12 wide at the top, 8 deep (not a pocket)",
              cut(block(), t), [(t, 6)], {"pockets": 0}))
    t = dovetail(-5, 70)
    P.append(("dt_blind", "the same dovetail, open at -X, square end at x = 70 (not a pocket)",
              cut(block(), t), [(t, 17)], {"pockets": 0}))

    # Pockets with an undercut: one pocket each, depth 12 from the floor (z = 18) to the top face
    t = fuse(box(25, 15, 18, 75, 45, 27), box(27, 17, 26, 73, 43, TOP + 5))
    P.append(("pk_lip", "pocket 50 x 30 x 12 under a 2 mm lip: the top 3 mm open 46 x 26 (one pocket, depth 12)",
              cut(block(), t), [(t, 14)], {"pockets": 1, "depth": 12.0}))
    t = fuse(box(25, 15, 18, 75, 45, TOP + 5), box(23, 13, 18, 77, 47, 21))
    P.append(("pk_groove", "pocket 50 x 30 x 12 with a 2 mm deep, 3 mm tall undercut groove round its floor "
              "(one pocket, depth 12)", cut(block(), t), [(t, 14)], {"pockets": 1, "depth": 12.0}))
    t = tslot(20, 80)
    P.append(("ts_closed", "the T-slot closed at both ends, x 20 to 80 (a T-bolt pocket: one pocket with an undercut "
              "each side, depth 16)", cut(block(), t), [(t, 14)], {"pockets": 1, "depth": NECK_D + HEAD_H}))
    t = box(25, 15, 18, 75, 45, TOP + 5)
    P.append(("pk_control", "plain pocket 50 x 30 x 12, sharp corners (control)",
              cut(block(), t), [(t, 14)], {"pockets": 1, "depth": 12.0}))
    return P


def main() -> int:
    lines = ["# Undercuts set", "",
             "Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name. "
             "Score: `python tests/grading/grade.py mfcadpp tests/grading/sets/undercuts`. "
             "Expected pockets and depth (mm) are checked by `tests/service/test_undercuts.py`.", "",
             "Part · what it tests · faces by class · pockets · depth"]
    for name, what, part, tools, exp_dims in parts():
        exp, n = TopExp_Explorer(part, TopAbs_SOLID), 0
        while exp.More():
            n += 1
            exp.Next()
        assert n == 1, f"{name}: {n} solids"
        labels = write(HERE / f"{name}.step", part, tools)
        counts = ", ".join(f"{c}: {labels.count(c)}" for c in sorted(set(labels)))
        depth = f"{exp_dims['depth']:g}" if "depth" in exp_dims else "-"
        lines.append(f"- `{name}` · {what} · {counts} · {exp_dims['pockets']} · {depth}")
        print(name, counts)
    (HERE / "MANIFEST.md").write_text("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
