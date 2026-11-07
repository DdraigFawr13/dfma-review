"""D-018 round 4: a file whose solid has a gap is still read (and says so), and a circular-end pocket
with chamfers round its floor is still a pocket.

Each part is built here with OpenCascade, written to a STEP file and analysed end to end.
Sizes in inches, modelled in mm.
"""

from __future__ import annotations

import re

import pytest

from OCC.Core.BRepFilletAPI import BRepFilletAPI_MakeChamfer
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Writer
from OCC.Core.TopAbs import TopAbs_EDGE
from OCC.Core.TopExp import TopExp_Explorer
from OCC.Core.TopoDS import topods
from OCC.Core.BRepAdaptor import BRepAdaptor_Curve

from test_cut_pockets import BLOCK, IN, box, cut, pockets_of


def write(shape, path):
    writer = STEPControl_Writer()
    writer.Transfer(shape, STEPControl_AsIs)
    assert writer.Write(str(path)) == IFSelect_RetDone
    return path


def test_solid_with_a_gap_is_read_and_the_gap_is_listed(tmp_path):
    from dfma.analyze import analyze
    path = write(BRepPrimAPI_MakeBox(2 * IN, 1 * IN, 0.5 * IN).Shape(), tmp_path / "box.step")
    text = path.read_text()
    shell = re.search(r"CLOSED_SHELL\('',\((#\d+),", text)
    assert shell  # drop the first face from the closed shell: its 4 edges now belong to one face only
    path.write_text(text.replace(shell.group(0), "CLOSED_SHELL('',(", 1))
    result = analyze(path, "box.step")
    assert result["part"]["face_count"] == 5
    assert any("4 of its edges belong to one face only" in a for a in result["assumptions"])


def test_whole_solid_lists_no_gap(tmp_path):
    from dfma.analyze import analyze
    path = write(BRepPrimAPI_MakeBox(2 * IN, 1 * IN, 0.5 * IN).Shape(), tmp_path / "box.step")
    assert not any("gap" in a for a in analyze(path, "box.step")["assumptions"])


def chamfer_floor(shape, z_in, size_in):
    """Chamfer every edge that lies wholly at height z_in (the pocket floor's outline)."""
    op, exp, n = BRepFilletAPI_MakeChamfer(shape), TopExp_Explorer(shape, TopAbs_EDGE), 0
    while exp.More():
        edge = topods.Edge(exp.Current())
        exp.Next()
        c = BRepAdaptor_Curve(edge)
        zs = [c.Value(c.FirstParameter() + (c.LastParameter() - c.FirstParameter()) * k / 4).Z() for k in range(5)]
        if all(abs(z - z_in * IN) < 1e-6 for z in zs):
            op.Add(size_in * IN, edge)
            n += 1
    assert n
    op.Build()
    assert op.IsDone()
    return op.Shape()


def stadium(x0, x1, y, r, z, h):
    """A slot-shaped prism (inches): straight sides from x0 to x1 at y +/- r, round ends, z to z + h."""
    from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakeWire
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakePrism
    from OCC.Core.GC import GC_MakeArcOfCircle, GC_MakeSegment
    from OCC.Core.gp import gp_Pnt, gp_Vec
    P = lambda a, b: gp_Pnt(a * IN, b * IN, z * IN)
    wire = BRepBuilderAPI_MakeWire()
    for curve in (GC_MakeSegment(P(x0, y - r), P(x1, y - r)), GC_MakeArcOfCircle(P(x1, y - r), P(x1 + r, y), P(x1, y + r)),
                  GC_MakeSegment(P(x1, y + r), P(x0, y + r)), GC_MakeArcOfCircle(P(x0, y + r), P(x0 - r, y), P(x0, y - r))):
        wire.Add(BRepBuilderAPI_MakeEdge(curve.Value()).Edge())
    face = BRepBuilderAPI_MakeFace(wire.Wire()).Face()
    return BRepPrimAPI_MakePrism(face, gp_Vec(0, 0, h * IN)).Shape()


def test_circular_end_pocket_with_chamfers_round_its_floor_is_a_pocket(tmp_path):
    # A 2 x 0.5 in pocket with round ends, 0.5 in deep, inside the block; every floor edge chamfered.
    part = chamfer_floor(cut(box(*BLOCK), stadium(1.0, 2.0, 1.0, 0.25, 0.5, 1)), 0.5, 0.03)
    found = pockets_of(part, tmp_path)
    assert len(found) == 1
    assert found[0]["dims_mm"]["depth"] == pytest.approx(0.5 * IN, abs=0.01)
