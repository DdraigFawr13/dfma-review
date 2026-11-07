"""D-018 round 5, from the adversarial review of 2026-11-07: an O-ring groove that a passage cuts is
not a pocket, and pockets with many sides or chamfered corners keep their walls (an octagon stopped
the analysis with an error).

Each part is built here with OpenCascade, written to a STEP file and analysed end to end.
Sizes in inches, modelled in mm.
"""

from __future__ import annotations

import math

import pytest

from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakePolygon
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakePrism
from OCC.Core.gp import gp_Pnt, gp_Vec

from test_cut_pockets import BLOCK, IN, box, cut, cyl, pockets_of


def prism(points, z0, h):
    """A straight prism over a closed outline (x, y in inches) from z0 up h inches."""
    poly = BRepBuilderAPI_MakePolygon()
    for x, y in points:
        poly.Add(gp_Pnt(x * IN, y * IN, z0 * IN))
    poly.Close()
    face = BRepBuilderAPI_MakeFace(poly.Wire()).Face()
    return BRepPrimAPI_MakePrism(face, gp_Vec(0, 0, h * IN)).Shape()


def test_o_ring_groove_cut_by_a_passage_is_not_a_pocket(tmp_path):
    """A passage through the ring joins the floor's two loops into one outline, so the convex core
    became a pocket wall (MFCAD++ 10020 faces 29, 50, 51; 64 faces on the first 500 parts)."""
    ring = cut(cyl(1.5, 1.0, 0.8, 0.5, 1), cyl(1.5, 1.0, 0.8, 0.3, 1))
    passage = box(1.7, 0.925, -0.5, 0.4, 0.15, 2)  # cuts the outer wall and the core
    found = pockets_of(cut(box(*BLOCK), ring, passage), tmp_path)
    assert found == []


@pytest.mark.parametrize("sides", [8, 12])
def test_many_sided_pocket_keeps_its_walls(tmp_path, sides):
    r = 0.5
    pts = [(1.5 + r * math.cos(2 * math.pi * k / sides), 1.0 + r * math.sin(2 * math.pi * k / sides)) for k in range(sides)]
    found = pockets_of(cut(box(*BLOCK), prism(pts, 0.5, 1)), tmp_path)
    assert len(found) == 1
    assert len(found[0]["faces"]) == sides + 1
    assert found[0]["dims_mm"]["depth"] == pytest.approx(0.5 * IN, abs=1e-3)


def test_four_chamfered_corners_drop_the_chamfers_only(tmp_path):
    c = 0.2
    pts = [(0.5 + c, 0.5), (2.5 - c, 0.5), (2.5, 0.5 + c), (2.5, 1.5 - c), (2.5 - c, 1.5), (0.5 + c, 1.5), (0.5, 1.5 - c), (0.5, 0.5 + c)]
    found = pockets_of(cut(box(*BLOCK), prism(pts, 0.5, 1)), tmp_path)
    assert len(found) == 1
    assert len(found[0]["faces"]) == 1 + 4  # floor and the 4 long walls; the chamfers are not walls
    assert found[0]["dims_mm"]["narrowest_width"] == pytest.approx(1.0 * IN, abs=1e-3)


def test_two_adjacent_chamfered_corners_keep_the_wall_between(tmp_path):
    """The 2 in wall between two chamfered corners turned the same angle to both and was dropped,
    which doubled the narrowest width to 50.8 mm."""
    c = 0.2
    pts = [(0.5, 0.5), (2.5, 0.5), (2.5, 1.5 - c), (2.5 - c, 1.5), (0.5 + c, 1.5), (0.5, 1.5 - c)]
    found = pockets_of(cut(box(*BLOCK), prism(pts, 0.5, 1)), tmp_path)
    assert len(found) == 1
    assert found[0]["dims_mm"]["narrowest_width"] == pytest.approx(1.0 * IN, abs=1e-3)


def test_chamfer_longer_than_a_neighbour_wall_is_still_a_chamfer(tmp_path):
    """Guard: a first try (a chamfer is shorter than both neighbours) kept 4 MFCAD++ corner chamfers
    as walls (10131, 12161, 14320, 15226: e.g. a 2.72 mm chamfer beside a 1.96 mm wall)."""
    c = 0.2
    pts = [(0.5, 0.5), (2.5, 0.5), (2.5, 0.8 - c), (2.5 - c, 0.8), (0.5, 0.8)]  # 2 x 0.3 in, 0.1 in left of the end wall
    found = pockets_of(cut(box(*BLOCK), prism(pts, 0.5, 1)), tmp_path)
    assert len(found) == 1
    assert len(found[0]["faces"]) == 1 + 4


def test_slot_worn_to_a_knife_edge_is_not_a_pocket(tmp_path):
    """D-018 round 6: a round step cut beside a blind slot leaves its end wall 0 thick at the top
    (MFCAD++ 1149, 12029), so the slot is open there. The same slot with real material is a pocket."""
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeCylinder
    from OCC.Core.gp import gp_Ax2, gp_Dir
    slot = box(1.0, 0.8, 0.5, 1.0, 0.4, 1)  # x 1..2, 0.5 in deep from the top (z = 1)
    r = 0.4  # round step along Y, tangent to the slot's end wall x = 1 at the top
    step = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt((1.0 - r) * IN, -0.5 * IN, 1.0 * IN), gp_Dir(0, 1, 0)), r * IN, 3 * IN).Shape()
    assert pockets_of(cut(box(*BLOCK), slot, step), tmp_path) == []
    away = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt((0.9 - r) * IN, -0.5 * IN, 1.0 * IN), gp_Dir(0, 1, 0)), r * IN, 3 * IN).Shape()
    assert len(pockets_of(cut(box(*BLOCK), slot, away), tmp_path)) == 1
