"""D-020 (HANDOFF 3a, stress-test gap "drafted thin walls are missed"): a wall's faces may be up to 15
deg from parallel, and its thickness is the thinnest place. Before, a 0.4 mm wall beside a pocket with
even 0.01 deg of draft gave no wall and no finding (the overlap of two faces was worked out only when
they were exactly parallel). Faces that meet at a knife edge are no wall."""

from __future__ import annotations

import math
import sys

import pytest

from helpers import ROOT

sys.path.insert(0, str(ROOT / "tests" / "grading" / "sets" / "bullnose_draft"))
from make import block, cut, tool_box  # noqa: E402

from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_Transform  # noqa: E402
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox  # noqa: E402
from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Writer  # noqa: E402
from OCC.Core.gp import gp_Ax1, gp_Dir, gp_Pnt, gp_Trsf  # noqa: E402


def _analyse(tmp_path, name, shape):
    from dfma.analyze import analyze
    path = tmp_path / f"{name}.step"
    w = STEPControl_Writer()
    w.Transfer(shape, STEPControl_AsIs)
    w.Write(str(path))
    return analyze(path, path.name)


def _walls(r):
    return sorted(f["dims_mm"]["thickness"] for f in r["features"] if f["kind"] == "wall" and not f.get("hole"))


@pytest.mark.parametrize("deg", [0.01, 0.2, 1, 3, 10])
def test_a_drafted_thin_wall_beside_a_pocket_is_found(tmp_path, deg):
    # a 50 x 30 x 12 pocket whose -X wall is 0.4 mm from the block's side at the top; draft opens it upward
    r = _analyse(tmp_path, f"draft_{deg}", cut(block(), tool_box(0.4, 15, 18, 50, 30, deg=deg)))
    assert _walls(r)[0] == pytest.approx(0.4, abs=1e-3)
    assert [f["title"] for f in r["findings"] if f["rule"] == "thin_wall"] == ["Wall 0.016 in thick (limit 0.030 in)"]


def test_faces_that_meet_at_a_knife_edge_are_no_wall(tmp_path):
    # the block's top cut by a plane 10 deg from its -Y side: they meet at a 10 deg knife edge along X
    big = BRepPrimAPI_MakeBox(gp_Pnt(-50, 0, -100), 200, 200, 300).Shape()
    t = gp_Trsf()
    t.SetRotation(gp_Ax1(gp_Pnt(0, 0, 30), gp_Dir(1, 0, 0)), math.radians(10))
    r = _analyse(tmp_path, "knife", cut(block(), BRepBuilderAPI_Transform(big, t, True).Shape()))
    assert all(w > 1.0 for w in _walls(r)), _walls(r)
    assert [f for f in r["findings"] if f["rule"] == "thin_wall"] == []
