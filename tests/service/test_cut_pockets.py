"""D-018 round 1: a pocket stays a pocket when another feature cuts into its outline, and nothing
that opens to the outside, or runs out along a through slot, becomes one.

Each part is built here with OpenCascade, written to a STEP file and analysed end to end.
Sizes in inches, modelled in mm.
"""

from __future__ import annotations

import pytest

from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Writer

IN = 25.4


def box(x, y, z, l, w, h):
    return BRepPrimAPI_MakeBox(gp_Pnt(x * IN, y * IN, z * IN), l * IN, w * IN, h * IN).Shape()


def cyl(x, y, z, r, h):
    return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x * IN, y * IN, z * IN), gp_Dir(0, 0, 1)), r * IN, h * IN).Shape()


def cut(shape, *tools):
    for tool in tools:
        op = BRepAlgoAPI_Cut(shape, tool)
        op.Build()
        assert op.IsDone()
        shape = op.Shape()
    return shape


def pockets_of(shape, tmp_path) -> list[dict]:
    from dfma.analyze import analyze
    path = tmp_path / "part.step"
    writer = STEPControl_Writer()
    writer.Transfer(shape, STEPControl_AsIs)
    assert writer.Write(str(path)) == IFSelect_RetDone
    return [f for f in analyze(path, "part.step")["features"] if f["kind"] == "pocket"]


BLOCK = (0, 0, 0, 3, 2, 1)
POCKET = (0.5, 0.5, 0.5, 2, 1, 1)  # 2 x 1 in, 0.5 in deep, open to +Z


def test_plain_pocket_is_found(tmp_path):
    assert len(pockets_of(cut(box(*BLOCK), box(*POCKET)), tmp_path)) == 1


@pytest.mark.parametrize("passage", [
    box(2.3, 0.8, -0.5, 0.4, 0.4, 2),  # a square passage through the +X wall of the pocket
    cyl(1.5, 0.5, -0.5, 0.2, 2),  # a through hole on the -Y wall
])
def test_pocket_cut_by_a_through_feature_is_still_a_pocket(tmp_path, passage):
    found = pockets_of(cut(box(*BLOCK), box(*POCKET), passage), tmp_path)
    assert len(found) == 1
    assert found[0]["dims_mm"]["depth"] == pytest.approx(0.5 * IN, abs=0.01)


def test_blind_slot_open_to_the_outside_is_not_a_pocket(tmp_path):
    slot = box(-0.5, 0.75, 0.75, 2.0, 0.5, 1)  # from the -X face, 1.5 in long, 0.25 in deep
    assert pockets_of(cut(box(*BLOCK), slot), tmp_path) == []


def test_slot_ending_in_a_through_slot_is_not_a_pocket(tmp_path):
    through = box(2.0, -0.5, 0.5, 0.5, 3, 1)  # along Y, open at both ends and the top
    slot = box(0.5, 0.75, 0.75, 1.75, 0.5, 1)  # from inside the block into the through slot
    assert pockets_of(cut(box(*BLOCK), through, slot), tmp_path) == []


def test_groove_cut_by_a_passage_is_not_a_pocket(tmp_path):
    groove = cut(cyl(1.5, 1.0, 0.75, 0.6, 1), cyl(1.5, 1.0, 0.75, 0.4, 1))  # a ring 0.25 in deep
    passage = box(1.95, 0.85, -0.5, 0.3, 0.3, 2)  # through the ring's +X side
    assert pockets_of(cut(box(*BLOCK), groove, passage), tmp_path) == []
