"""D-018 round 3: pockets whose floor is cut by a very shallow or very thin cut, and chamfers at a
pocket's floor or corners (MFCAD++ labels chamfers as their own class, not as pocket faces).

Each part is built here with OpenCascade, written to a STEP file and analysed end to end.
Sizes in inches, modelled in mm.
"""

from __future__ import annotations

import pytest

from OCC.Core.BRepAdaptor import BRepAdaptor_Curve
from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakePolygon
from OCC.Core.BRepFilletAPI import BRepFilletAPI_MakeChamfer
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakePrism
from OCC.Core.TopAbs import TopAbs_EDGE
from OCC.Core.TopExp import TopExp_Explorer
from OCC.Core.TopoDS import topods
from OCC.Core.gp import gp_Pnt, gp_Vec

from test_cut_pockets import BLOCK, IN, POCKET, box, cut, pockets_of


def chamfer_edge(shape, mid_in, size_in):
    """Chamfer the one edge whose midpoint is at mid_in (inches) by size_in."""
    exp, found = TopExp_Explorer(shape, TopAbs_EDGE), None
    while exp.More():
        edge = topods.Edge(exp.Current())
        exp.Next()
        c = BRepAdaptor_Curve(edge)
        p = c.Value((c.FirstParameter() + c.LastParameter()) / 2)
        if all(abs(v - m * IN) < 1e-6 for v, m in zip((p.X(), p.Y(), p.Z()), mid_in)):
            found = edge
    assert found is not None
    op = BRepFilletAPI_MakeChamfer(shape)
    op.Add(size_in * IN, found)
    op.Build()
    assert op.IsDone()
    return op.Shape()


def test_pocket_cut_by_a_pocket_a_hair_deeper_is_still_a_pocket(tmp_path):
    # The second pocket reaches 0.03 mm below the first one's floor: less than the old 0.05 mm probe.
    deeper = box(2.2, 0.75, 0.5 - 0.03 / IN, 0.5, 0.5, 1)
    found = pockets_of(cut(box(*BLOCK), box(*POCKET), deeper), tmp_path)
    floors_at = sorted(round(f["dims_mm"]["depth"], 2) for f in found)
    assert floors_at == [round(0.5 * IN, 2), round(0.5 * IN + 0.03, 2)]


def test_pocket_with_a_floor_sliver_under_005_mm_is_still_a_pocket(tmp_path):
    # A square passage through the +X end leaves a strip of floor 0.03 mm wide beside the -Y wall.
    passage = box(2.2, 0.5 + 0.03 / IN, -0.5, 0.5, 0.4, 2)
    found = pockets_of(cut(box(*BLOCK), box(*POCKET), passage), tmp_path)
    assert len(found) == 1
    assert found[0]["dims_mm"]["depth"] == pytest.approx(0.5 * IN, abs=0.01)


def test_chamfer_between_floor_and_wall_is_kept_out_of_the_pocket(tmp_path):
    part = chamfer_edge(cut(box(*BLOCK), box(*POCKET)), (0.5, 1.0, 0.5), 0.05)  # floor to -X wall
    found = pockets_of(part, tmp_path)
    assert len(found) == 1
    assert len(found[0]["faces"]) == 5  # floor and 4 walls, not the chamfer


def test_chamfer_on_a_pocket_corner_is_kept_out_of_the_pocket(tmp_path):
    part = chamfer_edge(cut(box(*BLOCK), box(*POCKET)), (0.5, 0.5, 0.75), 0.05)  # the -X -Y corner
    found = pockets_of(part, tmp_path)
    assert len(found) == 1
    assert len(found[0]["faces"]) == 5


def test_hexagon_pocket_keeps_all_six_walls(tmp_path):
    import math
    poly = BRepBuilderAPI_MakePolygon()
    for k in range(6):
        a = math.radians(60 * k)
        poly.Add(gp_Pnt((1.5 + 0.5 * math.cos(a)) * IN, (1.0 + 0.5 * math.sin(a)) * IN, 0.5 * IN))
    poly.Close()
    prism = BRepPrimAPI_MakePrism(BRepBuilderAPI_MakeFace(poly.Wire()).Face(), gp_Vec(0, 0, IN)).Shape()
    found = pockets_of(cut(box(*BLOCK), prism), tmp_path)
    assert len(found) == 1
    assert len(found[0]["faces"]) == 7
