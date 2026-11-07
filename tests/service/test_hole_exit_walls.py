"""HANDOFF 3a, stress-test gap "an invented thin wall where a hole enters a sloped face": the material
between a hole and the face it opens onto thins to nothing at their shared edge by its shape, so a
ray that hits that face measures no wall. Before the fix a d6 hole into a 70 deg slope got a 0.075 mm
wall and a high thin_wall finding (also on EDMR socket, socket1/2-Part, weldment, mohne, nasty_cheese).
"""

from __future__ import annotations

import math

import pytest

from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Writer
from OCC.Core.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf


def _part(tmp_path, slope_deg: float, hole_y: float):
    """A 100 x 60 x 30 mm block whose top is cut by a plane through y = 0, z = 30, tilted slope_deg
    about X, and a d6 hole down through it at x = 50, y = hole_y."""
    def cut(a, b):
        op = BRepAlgoAPI_Cut(a, b)
        op.Build()
        return op.Shape()
    block = BRepPrimAPI_MakeBox(100, 60, 30).Shape()
    big = BRepPrimAPI_MakeBox(gp_Pnt(-50, 0, 30), 200, 200, 200).Shape()
    t = gp_Trsf()
    t.SetRotation(gp_Ax1(gp_Pnt(0, 0, 30), gp_Dir(1, 0, 0)), math.radians(slope_deg))
    part = cut(block, BRepBuilderAPI_Transform(big, t, True).Shape())
    part = cut(part, BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(50, hole_y, -5), gp_Dir(0, 0, 1)), 3, 60).Shape())
    path = tmp_path / f"slope_{slope_deg}_{hole_y}.step"
    w = STEPControl_Writer()
    w.Transfer(part, STEPControl_AsIs)
    w.Write(str(path))
    return path


def _hole_walls(path):
    from dfma.analyze import analyze
    r = analyze(path, path.name)
    return ([f["dims_mm"]["thickness"] for f in r["features"] if f["kind"] == "wall" and f.get("hole")],
            [f for f in r["findings"] if f["rule"] == "thin_wall"])


def test_hole_into_a_steep_slope_has_no_invented_wall(tmp_path):
    walls, findings = _hole_walls(_part(tmp_path, -70, 8))
    assert all(t > 1.0 for t in walls), walls  # only the real 5 mm to the y = 0 side
    assert findings == []


def test_a_hole_near_a_side_it_does_not_open_onto_keeps_its_wall(tmp_path):
    walls, findings = _hole_walls(_part(tmp_path, 0, 3.5))  # flat top; the hole is 0.5 mm from the y = 0 side
    assert walls == [pytest.approx(0.5, abs=1e-3)]
    assert len(findings) == 1
