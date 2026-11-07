"""D-018 round 2: a hole stays a hole when another feature cuts into its wall, a cut hole's
bottom stays its own, and an O-ring groove or a slot end is not a hole. Built here, analysed end
to end. Sizes in inches, modelled in mm."""

from __future__ import annotations

from test_cut_pockets import IN, box, cut, cyl  # noqa: F401  (shared part helpers)

from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Writer

BLOCK = (0, 0, 0, 3, 2, 1)


def holes_of(shape, tmp_path) -> list[dict]:
    from dfma.analyze import analyze
    path = tmp_path / "part.step"
    writer = STEPControl_Writer()
    writer.Transfer(shape, STEPControl_AsIs)
    assert writer.Write(str(path)) == IFSelect_RetDone
    r = analyze(path, "part.step")
    return [f for f in r["features"] if f["kind"] == "hole"], r["faces"]


def test_through_hole_cut_by_a_passage_is_still_a_hole(tmp_path):
    hole = cyl(1.5, 1.0, -0.5, 0.25, 2)
    passage = box(1.6, 0.5, -0.5, 0.6, 1.0, 2)  # takes about a third of the hole's wall
    found, _ = holes_of(cut(box(*BLOCK), hole, passage), tmp_path)
    assert len(found) == 1
    assert len(found[0]["open_vectors"]) == 2


def test_blind_hole_cut_by_a_pocket_keeps_only_its_own_faces(tmp_path):
    hole = cyl(1.5, 1.0, 0.25, 0.25, 2)  # 0.75 in deep from the top
    pocket = box(1.6, 0.4, 0.6, 1.0, 1.2, 1)  # a pocket 0.4 in deep cuts its upper wall
    found, faces = holes_of(cut(box(*BLOCK), hole, pocket), tmp_path)
    assert len(found) == 1
    assert {faces[i]["kind"] for i in found[0]["faces"]} == {"cylinder", "plane"}
    assert sum(faces[i]["kind"] == "plane" for i in found[0]["faces"]) == 1  # its bottom, no pocket wall


def test_o_ring_groove_is_not_a_hole(tmp_path):
    groove = cut(cyl(1.5, 1.0, 0.75, 0.6, 1), cyl(1.5, 1.0, 0.75, 0.4, 1))  # a ring 0.25 in deep
    found, _ = holes_of(cut(box(*BLOCK), groove), tmp_path)
    assert found == []


def test_slot_with_round_ends_is_not_a_hole(tmp_path):
    slot = [box(1.0, 0.75, 0.75, 1.0, 0.5, 1), cyl(1.0, 1.0, 0.75, 0.25, 1), cyl(2.0, 1.0, 0.75, 0.25, 1)]
    found, _ = holes_of(cut(box(*BLOCK), *slot), tmp_path)
    assert found == []
