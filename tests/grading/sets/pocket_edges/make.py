"""Build the pocket-edges set: labelled STEP parts for tests/grading/grade.py.

    python tests/grading/sets/pocket_edges/make.py      (writes the .step files, MANIFEST.md)

Morgan, 2026-11-07: "go with your recommendation" (https://claude.ai/artifact/56Q3xAiYVEHJxPK5WGSJJm, set 1).
Stress test (https://claude.ai/artifact/4oufpheC26VYYwT2zBiiHs): a chamfer or fillet round a pocket's top
edge makes its depth read short; the narrowest gap ignores round bosses, so the end mill can be too big;
a floor split into two flat pieces loses the pocket. MFCAD++ has no edge breaks and no round bosses.
Labels as in ../bullnose_draft/make.py: 14 rectangular pocket, 16 circular end pocket, 0 chamfer (an edge
break on the top edge, as MFCAD++ labels chamfers), 23 round (a top-edge fillet), 24 stock. A boss inside
a pocket is part of it (14), as the tool cuts round it. Depth and narrowest gap are dimensions, not labels:
MANIFEST.md gives each part's expected values, and tests/service/test_pocket_edges.py checks ours.
Block 100 x 60 x 30 mm, top at z = 30.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "bullnose_draft"))

from make import TOP, block, cut, fillet, fuse, tool_box, write  # noqa: E402

from OCC.Core.BRepAdaptor import BRepAdaptor_Surface  # noqa: E402
from OCC.Core.BRepFilletAPI import BRepFilletAPI_MakeChamfer  # noqa: E402
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder  # noqa: E402
from OCC.Core.GeomAbs import GeomAbs_Cone, GeomAbs_Cylinder, GeomAbs_Plane, GeomAbs_Torus  # noqa: E402
from OCC.Core.TopAbs import TopAbs_EDGE, TopAbs_SOLID  # noqa: E402
from OCC.Core.TopExp import TopExp_Explorer, topexp  # noqa: E402
from OCC.Core.TopTools import TopTools_IndexedDataMapOfShapeListOfShape  # noqa: E402
from OCC.Core.TopoDS import topods  # noqa: E402
from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt  # noqa: E402

DEPTH = 12.0  # every pocket: floor at z = 18


def _top_pocket_edges(part, x0, x1, y0, y1):
    """Edges at the top face (z = TOP) that lie inside the pocket's outline: the pocket's rim."""
    out, exp = [], TopExp_Explorer(part, TopAbs_EDGE)
    from OCC.Core.BRepAdaptor import BRepAdaptor_Curve
    while exp.More():
        e = topods.Edge(exp.Current())
        exp.Next()
        c = BRepAdaptor_Curve(e)
        pts = [c.Value(c.FirstParameter() + (c.LastParameter() - c.FirstParameter()) * k / 4) for k in range(5)]
        if all(abs(p.Z() - TOP) < 1e-6 and x0 - 1e-6 <= p.X() <= x1 + 1e-6 and y0 - 1e-6 <= p.Y() <= y1 + 1e-6
               for p in pts):
            out.append(e)
    return out


def chamfer_rim(part, d, box):
    mk = BRepFilletAPI_MakeChamfer(part)
    edge_faces = TopTools_IndexedDataMapOfShapeListOfShape()
    topexp.MapShapesAndAncestors(part, TopAbs_EDGE, 4, edge_faces)  # 4 = TopAbs_FACE
    edges = _top_pocket_edges(part, *box)
    assert edges
    for e in edges:
        mk.Add(d, e)
    mk.Build()
    assert mk.IsDone()
    return mk.Shape()


def fillet_rim(part, r, box):
    from OCC.Core.BRepFilletAPI import BRepFilletAPI_MakeFillet
    mk = BRepFilletAPI_MakeFillet(part)
    edges = _top_pocket_edges(part, *box)
    assert edges
    for e in edges:
        mk.Add(r, e)
    mk.Build()
    assert mk.IsDone()
    return mk.Shape()


def tilted_plane(face, _p) -> bool:
    """A chamfer face: a plane neither square to Z nor along it, or a cone on a Z axis (a chamfer
    round a rounded corner)."""
    s = BRepAdaptor_Surface(face, True)
    if s.GetType() == GeomAbs_Cone:
        return abs(abs(s.Cone().Axis().Direction().Z()) - 1) < 1e-9
    if s.GetType() != GeomAbs_Plane:
        return False
    n = s.Plane().Axis().Direction()
    return 0.2 < abs(n.Z()) < 0.98


def round_face(face, _p) -> bool:
    """A fillet face made on the part: a torus, or a cylinder lying flat (axis square to Z)."""
    s = BRepAdaptor_Surface(face, True)
    if s.GetType() == GeomAbs_Torus:
        return True
    return s.GetType() == GeomAbs_Cylinder and abs(s.Cylinder().Axis().Direction().Z()) < 1e-6


def parts():
    """(name, what it tests, part, [(tool, class)], expected dims {"depth", "narrowest"} in mm)."""
    P = []
    box = (25, 75, 15, 45)  # the 50 x 30 pocket's outline

    def pocket(corner=0.0):
        return tool_box(25, 15, TOP - DEPTH, 50, 30, corner=corner)

    t = pocket(6)
    P.append(("c01_plain", "50 x 30 x 12 pocket, corner R6 (control)", cut(block(), t), [(t, 14)],
              {"depth": DEPTH, "narrowest": 30.0}))
    for d in (0.5, 1.0, 2.0):
        t = pocket(6)
        part = chamfer_rim(cut(block(), t), d, box)
        P.append((f"ch_top_{str(d).replace('.', 'p')}", f"the same with a {d} x 45 deg chamfer round its top edge "
                  f"(depth still {DEPTH:g})", part, [(tilted_plane, 0), (t, 14)], {"depth": DEPTH, "narrowest": 30.0}))
    for r in (1.0, 2.0):
        t = pocket(6)
        part = fillet_rim(cut(block(), t), r, box)
        P.append((f"fl_top_r{r:g}", f"the same with an r{r:g} fillet round its top edge (depth still {DEPTH:g})",
                  part, [(round_face, 23), (t, 14)], {"depth": DEPTH, "narrowest": 30.0}))
    t = pocket(0)
    part = chamfer_rim(cut(block(), t), 1.0, box)
    P.append(("ch_top_sharp", "50 x 30 x 12 pocket, sharp corners, 1 x 45 deg top chamfer", part,
              [(tilted_plane, 0), (t, 14)], {"depth": DEPTH, "narrowest": 30.0}))

    # Round bosses inside the pocket: the gap to the nearest wall is the narrowest place
    for gap in (1.27, 4.0):
        boss = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(25 + gap + 4, 30, TOP - DEPTH - 1), gp_Dir(0, 0, 1)), 4, DEPTH + 10).Shape()
        t = cut(pocket(6), boss)
        P.append((f"boss_gap_{str(gap).replace('.', 'p')}", f"50 x 30 x 12 pocket, corner R6, a d8 round boss {gap:g} mm "
                  "from its -X wall", cut(block(), t), [(t, 14)], {"depth": DEPTH, "narrowest": gap}))
    b1 = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(45, 30, TOP - DEPTH - 1), gp_Dir(0, 0, 1)), 4, DEPTH + 10).Shape()
    b2 = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(55, 30, TOP - DEPTH - 1), gp_Dir(0, 0, 1)), 4, DEPTH + 10).Shape()
    t = cut(cut(pocket(6), b1), b2)
    P.append(("boss_pair", "50 x 30 x 12 pocket, two d8 bosses 2 mm apart", cut(block(), t), [(t, 14)],
              {"depth": DEPTH, "narrowest": 2.0}))

    # A floor in two flat pieces: a box tool fused with two round end tools (an obround) leaves seams
    core = BRepPrimAPI_MakeBox(gp_Pnt(35, 22, TOP - DEPTH), 30, 16, DEPTH + 5).Shape()
    ends = [BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, 30, TOP - DEPTH), gp_Dir(0, 0, 1)), 8, DEPTH + 5).Shape() for x in (35, 65)]
    t = fuse(fuse(core, ends[0]), ends[1])
    P.append(("split_obround", "closed slot-shaped pocket 46 x 16 x 12 built as a box and two round ends (floor in 5 pieces)",
              cut(block(), t), [(t, 16)], {"depth": DEPTH, "narrowest": 16.0}))
    return P


def _count_floor_pieces(part) -> int:
    """Faces of the part at z = TOP - DEPTH, square to Z (the pocket's floor pieces)."""
    from OCC.Core.TopAbs import TopAbs_FACE
    n, exp = 0, TopExp_Explorer(part, TopAbs_FACE)
    while exp.More():
        f = topods.Face(exp.Current())
        exp.Next()
        s = BRepAdaptor_Surface(f, True)
        if s.GetType() == GeomAbs_Plane and abs(abs(s.Plane().Axis().Direction().Z()) - 1) < 1e-9 \
                and abs(s.Plane().Location().Z() - (TOP - DEPTH)) < 1e-6:
            n += 1
    return n


def main() -> int:
    lines = ["# Pocket-edges set", "",
             "Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name. "
             "Score: `python tests/grading/grade.py mfcadpp tests/grading/sets/pocket_edges`. "
             "Expected depth and narrowest gap (mm) are checked by `tests/service/test_pocket_edges.py`.", "",
             "Part · what it tests · faces by class · depth · narrowest · floor pieces"]
    for name, what, part, tools, dims in parts():
        exp, n = TopExp_Explorer(part, TopAbs_SOLID), 0
        while exp.More():
            n += 1
            exp.Next()
        assert n == 1, f"{name}: {n} solids"
        labels = write(HERE / f"{name}.step", part, tools)
        counts = ", ".join(f"{c}: {labels.count(c)}" for c in sorted(set(labels)))
        lines.append(f"- `{name}` · {what} · {counts} · {dims['depth']:g} · {dims['narrowest']:g} · {_count_floor_pieces(part)}")
        print(name, counts, _count_floor_pieces(part))
    (HERE / "MANIFEST.md").write_text("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
