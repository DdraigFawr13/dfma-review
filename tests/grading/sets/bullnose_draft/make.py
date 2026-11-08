"""Build the bull-nose and draft pocket set: labelled STEP parts for tests/grading/grade.py.

    python tests/grading/sets/bullnose_draft/make.py      (writes the .step files next to this file)

Morgan, 2026-11-07: "start on the bull-nose floor and drafted wall pockets next. Create sample parts as
needed and add them to the library and testing standard for all comparisons". MFCAD++ has no
filleted pocket floors and no drafted walls, so these parts are made here with OpenCascade.

Each face carries its class in its STEP entity name, as MFCAD++ does (ADVANCED_FACE('14', ...)), so
`grade.py mfcadpp <this folder>` scores any engine on it. A face takes the class of the cutting tool
whose boundary it lies on; every other face is stock (24). Classes are MFCAD++'s:
  1 through hole, 12 blind hole (a round recess, as D-010 and MFCAD++), 3 rectangular passage, 8 rectangular through step, 14 rectangular pocket,
  16 circular end pocket, 17 rectangular blind slot (not scored), 24 stock (not scored).
A pocket's floor fillets and drafted walls are pocket faces: a bull-nose or ball end mill cuts them
with the pocket, and a pocket finding (depth, corner radius, tool) needs them. Sizes in mm.
Set list and what each part tests: MANIFEST.md, written by this script.
"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path

from OCC.Core.BRep import BRep_Tool
from OCC.Core.BRepAdaptor import BRepAdaptor_Surface
from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCC.Core.BRepClass import BRepClass_FaceClassifier
from OCC.Core.BRepClass3d import BRepClass3d_SolidClassifier
from OCC.Core.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCC.Core.BRepOffsetAPI import BRepOffsetAPI_DraftAngle
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCC.Core.BRepTools import breptools
from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pln, gp_Pnt
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Reader, STEPControl_Writer
from OCC.Core.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_IN, TopAbs_ON, TopAbs_SOLID
from OCC.Core.TopExp import TopExp_Explorer, topexp
from OCC.Core.TopTools import TopTools_IndexedMapOfShape
from OCC.Core.TopoDS import topods

HERE = Path(__file__).resolve().parent
BLOCK = (100.0, 60.0, 30.0)  # x, y, z; the top face is z = 30
TOP = BLOCK[2]


def block():
    return BRepPrimAPI_MakeBox(*BLOCK).Shape()


def _edges(shape):
    out, exp = [], TopExp_Explorer(shape, TopAbs_EDGE)
    while exp.More():
        out.append(topods.Edge(exp.Current()))
        exp.Next()
    return out


def _ends(edge):
    f, l = topexp.FirstVertex(edge), topexp.LastVertex(edge)
    a, b = BRep_Tool.Pnt(f), BRep_Tool.Pnt(l)
    return (a.X(), a.Y(), a.Z()), (b.X(), b.Y(), b.Z())


def fillet(shape, r, pick):
    """Round the edges `pick(a, b)` chooses (a, b: the edge's end points) with radius r."""
    mk = BRepFilletAPI_MakeFillet(shape)
    seen = 0
    for e in _edges(shape):
        a, b = _ends(e)
        if pick(a, b):
            mk.Add(r, e)
            seen += 1
    assert seen, "no edge picked"
    mk.Build()
    assert mk.IsDone()
    return mk.Shape()


def vertical(a, b):
    return abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) < 1e-6


def at_z(z):
    return lambda a, b: abs(a[2] - z) < 1e-6 and abs(b[2] - z) < 1e-6


def draft(shape, deg, faces_pick=None):
    """Tilt the side faces (normal square to Z) inward toward the bottom by `deg`, about the top."""
    mk = BRepOffsetAPI_DraftAngle(shape)
    exp, n = TopExp_Explorer(shape, TopAbs_FACE), 0
    while exp.More():
        face = topods.Face(exp.Current())
        exp.Next()
        s = BRepAdaptor_Surface(face, True)
        umin, umax, vmin, vmax = breptools.UVBounds(face)
        p = s.Value((umin + umax) / 2, (vmin + vmax) / 2)
        from OCC.Core.BRepGProp import BRepGProp_Face
        from OCC.Core.gp import gp_Vec
        pt, nv = gp_Pnt(), gp_Vec()
        BRepGProp_Face(face).Normal((umin + umax) / 2, (vmin + vmax) / 2, pt, nv)
        if abs(nv.Z()) > 1e-6 * nv.Magnitude():
            continue
        if faces_pick and not faces_pick((p.X(), p.Y(), p.Z()), (nv.X(), nv.Y(), nv.Z())):
            continue
        mk.Add(face, gp_Dir(0, 0, 1), -math.radians(deg), gp_Pln(gp_Pnt(0, 0, TOP), gp_Dir(0, 0, 1)))
        assert mk.AddDone(), "draft refused a face"
        n += 1
    assert n
    mk.Build()
    assert mk.IsDone()
    return mk.Shape()


def tool_box(x, y, z0, l, w, corner=0.0, floor=0.0, deg=0.0, up=TOP + 5):
    """A pocket tool from z0 up past the top: corner radius on its vertical edges, then draft, then
    a fillet round its bottom edges (the pocket's floor fillet)."""
    t = BRepPrimAPI_MakeBox(gp_Pnt(x, y, z0), l, w, up - z0).Shape()
    if corner:
        t = fillet(t, corner, vertical)
    if deg:
        t = draft(t, deg)
    if floor:
        t = fillet(t, floor, at_z(z0))
    return t


def tool_cyl(x, y, z0, r, floor=0.0, deg=0.0, up=TOP + 5):
    t = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, z0), gp_Dir(0, 0, 1)), r, up - z0).Shape()
    if deg:
        t = draft(t, deg)
    if floor:
        t = fillet(t, floor, lambda a, b: abs(a[2] - z0) < 1e-6 and abs(b[2] - z0) < 1e-6)
    return t


def obround(x, y, z0, l, w, floor=0.0, deg=0.0, up=TOP + 5):
    """A closed slot-shaped tool: a box with fully rounded ends (radius w / 2)."""
    return tool_box(x, y, z0, l, w, corner=w / 2 - 1e-3, floor=floor, deg=deg, up=up)


def cut(shape, tool):
    op = BRepAlgoAPI_Cut(shape, tool)
    op.Build()
    assert op.IsDone()
    return op.Shape()


def fuse(shape, tool):
    op = BRepAlgoAPI_Fuse(shape, tool)
    op.Build()
    assert op.IsDone()
    return op.Shape()


def through_hole(x, y, r):
    return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, -5), gp_Dir(0, 0, 1)), r, TOP + 10).Shape()


def _inner_point(face):
    s = BRepAdaptor_Surface(face, True)
    umin, umax, vmin, vmax = breptools.UVBounds(face)
    best = None
    for n in (10, 100):  # a 100 grid only when the 10 grid misses the face (a thin ring, undercuts set)
        for i in range(1, n):
            for j in range(1, n):
                u, v = umin + (umax - umin) * i / n, vmin + (vmax - vmin) * j / n
                p = s.Value(u, v)
                if BRepClass_FaceClassifier(face, p, 1e-7).State() == TopAbs_IN:
                    d = (i - n / 2) ** 2 + (j - n / 2) ** 2
                    if best is None or d < best[0]:
                        best = (d, p)
        if best:
            break
    assert best, "no point inside a face"
    return best[1]


def tool_index(faces, tools):
    """For each face, the index of the first tool (shape, class) whose boundary it lies on, else None.
    A tool's shape may instead be a test `pick(face, point)` (a fillet made on the part, not by a tool)."""
    out = []
    for face in faces:
        p = _inner_point(face)
        hit = None
        for k, (shape, _) in enumerate(tools):
            if (shape(face, p) if callable(shape) else BRepClass3d_SolidClassifier(shape, p, 1e-5).State() == TopAbs_ON):
                hit = k
                break
        out.append(hit)
    return out


def write(path: Path, part, tools, tool_by_pos: list | None = None):
    """Write the part, then name each ADVANCED_FACE with its class, in file order. With `tool_by_pos`,
    also fill it with each face's tool index (or None) in file order (for a set's hole instances)."""
    w = STEPControl_Writer()
    w.Transfer(part, STEPControl_AsIs)
    assert w.Write(str(path)) == IFSelect_RetDone
    r = STEPControl_Reader()
    r.ReadFile(str(path))
    r.TransferRoots()
    shape = r.OneShape()
    m = TopTools_IndexedMapOfShape()
    topexp.MapShapes(shape, TopAbs_FACE, m)
    faces = [topods.Face(m.FindKey(i)) for i in range(1, m.Size() + 1)]
    hits = tool_index(faces, tools)
    labels = [24 if k is None else tools[k][1] for k in hits]
    model, tr = r.StepModel(), r.WS().TransferReader()
    order = {}
    for i in range(1, model.NbEntities() + 1):
        if model.Value(i).DynamicType().Name() == "StepShape_AdvancedFace":
            order[i] = len(order)
    by_pos, tool_pos = [None] * len(order), [None] * len(order)
    for face, lab, k in zip(faces, labels, hits):
        ent = tr.EntityFromShapeResult(face, 1)
        by_pos[order[model.Number(ent)]] = lab
        tool_pos[order[model.Number(ent)]] = k
    if tool_by_pos is not None:
        tool_by_pos[:] = tool_pos
    assert None not in by_pos, "a face with no STEP entity"
    text = path.read_text()
    it = iter(by_pos)
    text = re.sub(r"ADVANCED_FACE\s*\(\s*'[^']*'", lambda _: f"ADVANCED_FACE('{next(it)}'", text)
    path.write_text(text)
    return labels


def parts():
    """(name, what it tests, part, [(tool, class)]). The block is 100 x 60 x 30 mm, top at z = 30."""
    P = []

    def pocket(name, what, tool, cls=14, extra=()):
        part = cut(block(), tool)
        tools = [(tool, cls)]
        for t, c in extra:
            part = cut(part, t)
            tools.append((t, c))
        P.append((name, what, part, tools))

    # Controls
    pocket("c01_plain", "50 x 30 x 12 pocket, sharp corners (control)", tool_box(25, 15, 18, 50, 30))
    pocket("c02_corner6", "50 x 30 x 12 pocket, corner R6 (control)", tool_box(25, 15, 18, 50, 30, corner=6))
    # Bull-nose floors
    for r in (1, 2, 3, 5.5):
        pocket(f"bn_r{str(r).replace('.', 'p')}", f"corner R6, floor fillet r{r} (bull-nose end mill)",
               tool_box(25, 15, 18, 50, 30, corner=6, floor=r))
    pocket("bn_ball6", "corner R6, floor fillet r6 (ball end mill: the corners become spheres)",
           tool_box(25, 15, 18, 50, 30, corner=6, floor=5.999))
    pocket("bn_sharp_r2", "sharp corners, floor fillet r2 (fillet added in CAD)", tool_box(25, 15, 18, 50, 30, floor=2))
    t = BRepPrimAPI_MakeBox(gp_Pnt(25, 15, 18), 50, 30, 17).Shape()
    t = fillet(t, 2, lambda a, b: at_z(18)(a, b) and abs(a[1] - 15) < 1e-6 and abs(b[1] - 15) < 1e-6)
    pocket("bn_one_edge", "sharp corners, one floor edge filleted r2", t)
    pocket("bn_round_d40", "round pocket d40 x 10, floor fillet r3", tool_cyl(50, 30, 20, 20, floor=3), cls=12)
    pocket("bn_obround", "closed slot-shaped pocket 60 x 16 x 8, ends R8, floor fillet r2",
           obround(20, 22, 22, 60, 16, floor=2), cls=16)
    pocket("bn_shallow", "pocket 2 mm deep, corner R6, floor fillet r1.5", tool_box(25, 15, 28, 50, 30, corner=6, floor=1.5))
    pocket("bn_hole", "corner R6, floor fillet r2, d8 through hole in the floor",
           tool_box(25, 15, 18, 50, 30, corner=6, floor=2), extra=[(through_hole(50, 30, 4), 1)])
    isl = BRepPrimAPI_MakeBox(gp_Pnt(44, 24, 17), 12, 12, 25).Shape()  # through the tool: the island top stays stock
    isl = fillet(isl, 3, vertical)
    tool = cut(tool_box(25, 15, 18, 50, 30, corner=6), isl)
    tool = fillet(tool, 2, at_z(18))
    pocket("bn_island", "corner R6, 12 x 12 island R3, floor fillets r2 round the walls and the island", tool)
    # Drafted walls
    for d in (1, 2, 3, 5, 10):
        pocket(f"dr_{d}deg", f"sharp corners, {d} deg draft on all walls", tool_box(25, 15, 18, 50, 30, deg=d))
    pocket("dr_3deg_corner6", "3 deg draft, corner R6 (the corners become cones)", tool_box(25, 15, 18, 50, 30, corner=6, deg=3))
    pocket("dr_3deg_corner6_r2", "3 deg draft, corner R6, floor fillet r2 (a cast or moulded pocket)",
           tool_box(25, 15, 18, 50, 30, corner=6, deg=3, floor=2))
    pocket("dr_round_1deg", "round pocket d40 x 10, 1 deg draft (a cone wall)", tool_cyl(50, 30, 20, 20, deg=1), cls=12)
    t = BRepPrimAPI_MakeBox(gp_Pnt(25, 15, 18), 50, 30, 17).Shape()
    t = draft(t, 3, lambda p, n: abs(n[0]) > 0.5)
    pocket("dr_two_walls", "3 deg draft on the two end walls only", t)
    pocket("dr_5deg_hole", "5 deg draft, d8 through hole in the floor", tool_box(25, 15, 18, 50, 30, deg=5),
           extra=[(through_hole(50, 30, 4), 1)])
    # Look-alikes that are not pockets
    P.append(("ng_slot_r2", "open-ended slot 16 wide, 8 deep, through the -X side, floor fillets r2 (not a pocket)",
              *(lambda t: (cut(block(), t), [(t, 17)]))(fillet(BRepPrimAPI_MakeBox(gp_Pnt(-5, 22, 22), 70, 16, 13).Shape(), 2, at_z(22)))))
    P.append(("ng_step_r2", "step along the +Y edge, 10 deep, floor fillet r2 (not a pocket)",
              *(lambda t: (cut(block(), t), [(t, 8)]))(fillet(BRepPrimAPI_MakeBox(gp_Pnt(-5, 45, 20), 110, 20, 15).Shape(), 2,
                                                              lambda a, b: at_z(20)(a, b) and abs(a[1] - 45) < 1e-6 and abs(b[1] - 45) < 1e-6))))
    P.append(("ng_slot_3deg", "open-ended slot through the -X side, 3 deg draft on its side walls (not a pocket)",
              *(lambda t: (cut(block(), t), [(t, 17)]))(draft(BRepPrimAPI_MakeBox(gp_Pnt(-5, 22, 22), 70, 16, 13).Shape(), 3,
                                                              lambda p, n: abs(n[1]) > 0.5))))
    P.append(("ng_step_3deg", "step along the +Y edge, 3 deg draft on its wall (not a pocket)",
              *(lambda t: (cut(block(), t), [(t, 8)]))(draft(BRepPrimAPI_MakeBox(gp_Pnt(-5, 45, 20), 110, 20, 15).Shape(), 3,
                                                              lambda p, n: n[1] < -0.5))))
    u = fuse(BRepPrimAPI_MakeBox(gp_Pnt(-5, 22, 22), 70, 16, 13).Shape(),
             BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(-5, 30, 22), gp_Dir(1, 0, 0)), 8, 70).Shape())
    P.append(("ng_uslot", "open-ended slot 16 wide with a full round bottom (r8), through the -X side (not a pocket; "
              "MFCAD++ 15720 has its like)", cut(block(), u), [(u, 17)]))
    pocket("bn_blind_hole_r1", "d8 x 10 blind hole with a 1 mm fillet round its flat bottom (a blind hole, not through)",
           tool_cyl(50, 30, 20, 4, floor=1), cls=12)
    t = draft(BRepPrimAPI_MakeBox(gp_Pnt(25, 15, -5), 50, 30, 40).Shape(), 3)
    P.append(("ng_passage_3deg", "50 x 30 passage through the part, 3 deg draft (no floor: not a pocket)",
              cut(block(), t), [(t, 3)]))
    return P


def main() -> int:
    lines = ["# Bull-nose and draft pocket set", "",
             "Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name. "
             "Score: `python tests/grading/grade.py mfcadpp tests/grading/sets/bullnose_draft`.", "",
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
