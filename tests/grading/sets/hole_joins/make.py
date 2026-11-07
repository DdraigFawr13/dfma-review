"""Build the hole-joins set: labelled STEP parts for tests/grading/grade.py, with hole instances.

    python tests/grading/sets/hole_joins/make.py      (writes the .step files, MANIFEST.md, INSTANCES.json)

HANDOFF item 3a, the stress-test gaps (https://claude.ai/artifact/4oufpheC26VYYwT2zBiiHs): a counterbore
with an edge break between the bore and its floor splits into two holes; two holes that cross become
four short holes; a radial hole through a round shaft is called blind. MFCAD++ has no counterbores,
no crossing holes and no round stock, so these parts are made here with OpenCascade, labelled as in
../bullnose_draft/make.py (each face's class in its STEP name): 1 through hole, 12 blind hole,
0 chamfer (an edge break, as MFCAD++ labels chamfers; it stays out of the hole, as in
../tapered_holes), 23 round (a fillet made on the part), 11 O-ring (a snap-ring groove inside a bore:
not scored), 6 rectangular through slot, 24 stock. A counterbore's bore, floor and corner fillet are
faces of its through or blind hole.

Face classes alone can't see a hole read as two, so INSTANCES.json lists each part's holes: for each,
the file positions (0-based, among ADVANCED_FACEs) of its hole-class faces. grade.py scores a hole
whole when one hole feature holds all its faces and none of another hole's. Sizes in mm.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "bullnose_draft"))

from make import BLOCK, TOP, block, cut, fillet, through_hole, write  # noqa: E402

from OCC.Core.BRepAdaptor import BRepAdaptor_Surface  # noqa: E402
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCone, BRepPrimAPI_MakeCylinder  # noqa: E402
from OCC.Core.GeomAbs import GeomAbs_Torus  # noqa: E402
from OCC.Core.TopAbs import TopAbs_SOLID  # noqa: E402
from OCC.Core.TopExp import TopExp_Explorer  # noqa: E402
from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt  # noqa: E402

UP, X = gp_Dir(0, 0, 1), gp_Dir(1, 0, 0)
CX, CY = 50.0, 30.0  # the hole axis on the block's top face
HOLE_R, CB_R, CB_DEPTH = 3.3, 5.5, 6.0  # an M6 clearance hole d6.6 with a d11 x 6 counterbore
FLOOR = TOP - CB_DEPTH


def cyl(x, y, z0, r, h, d=UP):
    return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, z0), d), r, h).Shape()


def cone(x, y, z0, r0, r1, h):
    return BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(x, y, z0), UP), r0, r1, h).Shape()


def torus(face, _p) -> bool:
    return BRepAdaptor_Surface(face, True).GetType() == GeomAbs_Torus


def ring_at(z, r):
    """Pick a circular edge at height z and radius r round the hole axis (its one vertex lies there)."""
    return lambda a, b: abs(a[2] - z) < 1e-6 and abs(math.hypot(a[0] - CX, a[1] - CY) - r) < 1e-4


def counterbore(blind_to=None, chamfer=0.0, edge_fillet=0.0, corner=0.0):
    """A d6.6 hole (through, or blind down to z = blind_to) under a d11 x 6 counterbore, with an optional
    chamfer or fillet where the hole meets the counterbore floor and a fillet in the counterbore's corner.
    Returns (part, tools, instances)."""
    cb = cyl(CX, CY, FLOOR, CB_R, CB_DEPTH + 5)
    if corner:
        cb = fillet(cb, corner, ring_at(FLOOR, CB_R))
    cls = 12 if blind_to is not None else 1
    hole = cyl(CX, CY, blind_to, HOLE_R, FLOOR - blind_to + 1) if blind_to is not None else through_hole(CX, CY, HOLE_R)
    tools = [(cb, cls), (hole, cls)]
    part = cut(cut(block(), cb), hole)
    if chamfer:
        c = cone(CX, CY, FLOOR - chamfer, HOLE_R, HOLE_R + chamfer, chamfer)
        part = cut(part, c)
        tools.insert(0, (c, 0))
    if edge_fillet:
        part = fillet(part, edge_fillet, ring_at(FLOOR, HOLE_R))
        tools.insert(0, (torus, 23))
    return part, tools, [[k for k, (_, c) in enumerate(tools) if c == cls]]


def parts():
    """(name, what it tests, part, [(tool, class)], [[tool index of each hole instance]])."""
    P = []

    def cb(name, what, **kw):
        P.append((name, what, *counterbore(**kw)))

    # Counterbores with an edge break between the bore and the counterbore floor
    cb("cb_plain", "d6.6 through hole, d11 x 6 counterbore (control)")
    cb("cb_chamfer", "the same with a 0.5 x 45 deg chamfer where the hole meets the counterbore floor", chamfer=0.5)
    cb("cb_chamfer_1", "the same with a 1 x 45 deg chamfer there", chamfer=1.0)
    cb("cb_fillet", "the same with an r0.5 fillet where the hole meets the counterbore floor", edge_fillet=0.5)
    cb("cb_corner", "the same with an r0.5 fillet in the counterbore's corner (bore to floor)", corner=0.5)
    cb("cb_both", "chamfer 0.5 at the hole and r0.5 in the counterbore's corner", chamfer=0.5, corner=0.5)
    cb("cb_blind_chamfer", "d6.6 blind hole to z = 5 under the counterbore, 0.5 chamfer between them",
       blind_to=5.0, chamfer=0.5)

    # Crossing holes
    def cross(name, what, r2, blind=False):
        a = cyl(CX, CY, 10.0, 4.0, TOP - 9) if blind else through_hole(CX, CY, 4.0)
        b = cyl(-5, CY, 15.0, r2, BLOCK[0] + 10, X)
        part = cut(cut(block(), a), b)
        P.append((name, what, part, [(a, 12 if blind else 1), (b, 1)], [[0], [1]]))

    cross("x_equal", "d8 hole down through the block, crossed at mid-depth by a d8 hole along X", 4.0)
    cross("x_small", "d8 hole down through the block, crossed by a d4 hole along X (control)", 2.0)
    cross("x_blind", "d8 blind hole 20 deep from the top, crossed 5 above its bottom by a d8 hole along X", 4.0, blind=True)
    bore, groove = through_hole(CX, CY, 5.0), cyl(CX, CY, 14.25, 6.0, 1.5)
    P.append(("x_snap_ring", "d10 bore through the block with a d12 x 1.5 snap-ring groove at mid-depth",
              cut(cut(block(), bore), groove), [(groove, 11), (bore, 1)], [[1]]))
    slot = BRepPrimAPI_MakeBox(gp_Pnt(40, -5, 10), 20, BLOCK[1] + 10, TOP).Shape()
    pin = cyl(-5, CY, 20.0, 4.0, BLOCK[0] + 10, X)
    P.append(("x_clevis", "clevis: a 20 wide slot leaves two arms; a d8 pin hole along X through both arms",
              cut(cut(block(), slot), pin), [(slot, 6), (pin, 1)], [[1]]))

    # Guards: pieces on one axis that are not one hole (NIST ctc_02, EDMR mohne)
    a, b = cyl(CX, CY, 18.0, 4.0, TOP - 17), cyl(CX, CY, -1.0, 4.0, 13.0)
    P.append(("ng_blind_opposite", "d8 blind holes 12 deep from the top and from the bottom, 6 of material between (2 holes)",
              cut(cut(block(), a), b), [(a, 12), (b, 12)], [[0], [1]]))
    top_cb, bot_cb, bore = cyl(CX, CY, FLOOR, CB_R, CB_DEPTH + 5), cyl(CX, CY, -5, CB_R, CB_DEPTH + 5), through_hole(CX, CY, HOLE_R)
    P.append(("ng_cb_both_ends", "d6.6 through hole with a d11 x 6 counterbore at both ends (1 hole: the counterbores are not joined)",
              cut(cut(cut(block(), top_cb), bot_cb), bore), [(top_cb, 1), (bot_cb, 1), (bore, 1)], [[0, 1, 2]]))
    wide = BRepPrimAPI_MakeBox(gp_Pnt(30, -5, 10), 40, BLOCK[1] + 10, TOP).Shape()
    pin_l, pin_r = cyl(-5, CY, 20.0, 5.0, 55, X), cyl(50, CY, 20.0, 5.0, 55, X)  # one per arm, to label each hole
    P.append(("ng_far_walls", "a 40 wide slot leaves two 30 thick arms; a d10 hole along X through both (gap 4 diameters: 2 holes)",
              cut(cut(cut(block(), wide), pin_l), pin_r), [(wide, 6), (pin_l, 1), (pin_r, 1)], [[1], [2]]))
    gap = BRepPrimAPI_MakeBox(gp_Pnt(40, -5, 10), 20, BLOCK[1] + 10, TOP).Shape()
    cb_l = cyl(40 - 5, CY, 20.0, 8.0, 6, X)  # d16 x 5 counterbores in the slot's walls, facing each other
    cb_r = cyl(60 - 1, CY, 20.0, 8.0, 6, X)
    bore_l, bore_r = cyl(-5, CY, 20.0, 4.0, 55, X), cyl(50, CY, 20.0, 4.0, 55, X)
    P.append(("ng_cb_facing", "clevis with a 20 wide slot; d8 hole along X through both arms with a d16 x 5 counterbore "
              "on each arm's inner face (2 holes: the counterbores face each other, as on NIST ctc_02)",
              cut(cut(cut(cut(cut(block(), gap), cb_l), cb_r), bore_l), bore_r),
              [(gap, 6), (cb_l, 1), (cb_r, 1), (bore_l, 1), (bore_r, 1)], [[1, 3], [2, 4]]))

    # Radial holes through round stock: a d30 shaft along X, 100 long
    def shaft():
        return cyl(0, 0, 0, 15.0, 100.0, X)
    radial = cyl(50, 0, -20, 3.0, 40)
    P.append(("r_through", "d6 radial hole through a d30 shaft (both ends open onto the round face)",
              cut(shaft(), radial), [(radial, 1)], [[0]]))
    blind = cyl(50, 0, 5, 3.0, 15)
    P.append(("r_blind", "d6 radial hole 10 deep into a d30 shaft (control: blind)", cut(shaft(), blind), [(blind, 12)], [[0]]))
    off = cyl(50, 8, -20, 3.0, 40)
    P.append(("r_offset", "d6 hole through a d30 shaft, 8 off its axis (both ends on the round face)",
              cut(shaft(), off), [(off, 1)], [[0]]))
    return P


def main() -> int:
    lines = ["# Hole-joins set", "",
             "Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name; "
             "hole instances in INSTANCES.json. Score: `python tests/grading/grade.py mfcadpp tests/grading/sets/hole_joins`.", "",
             "Part · what it tests · faces by class · holes"]
    instances = {}
    for name, what, part, tools, insts in parts():
        exp, n = TopExp_Explorer(part, TopAbs_SOLID), 0
        while exp.More():
            n += 1
            exp.Next()
        assert n == 1, f"{name}: {n} solids"
        by_pos: list = []
        labels = write(HERE / f"{name}.step", part, tools, by_pos)
        instances[name] = [[i for i, k in enumerate(by_pos) if k in inst and tools[k][1] in (1, 12)] for inst in insts]
        assert all(instances[name]), f"{name}: a hole with no faces"
        counts = ", ".join(f"{c}: {labels.count(c)}" for c in sorted(set(labels)))
        lines.append(f"- `{name}` · {what} · {counts} · {len(insts)}")
        print(name, counts, instances[name])
    (HERE / "MANIFEST.md").write_text("\n".join(lines) + "\n")
    (HERE / "INSTANCES.json").write_text(json.dumps(instances, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
