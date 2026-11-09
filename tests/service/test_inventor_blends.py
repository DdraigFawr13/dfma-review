"""I3 S3 J5: fillets and chamfers read from the NIST .ipt files and mapped onto their STEP faces through the test
harness (tests/inventor/nist_pair.py; the app refuses every NIST pair), and the built filleted block."""

from __future__ import annotations

import functools
import tomllib

import pytest

from helpers import PARTS

from dfma.inventor import map_blends, read_ipt
from dfma.read import read_step
from inventor.nist_pair import transform
from nist_files import ap242_files

INV = PARTS.parent / "inventor" / "files"
COUNTS = tomllib.loads((PARTS.parent / "inventor" / "blend_counts.toml").read_text("utf-8"))


@functools.lru_cache(maxsize=None)
def ipt(name: str):
    return read_ipt(INV / name)


@functools.lru_cache(maxsize=None)
def mapped(name: str) -> tuple:
    step = next(p for p in ap242_files() if p.name == COUNTS["pair"][name]["step"])
    rows, shift = transform(str(step), str(INV / name))
    return tuple(map_blends(ipt(name).blends, read_step(step).faces, ([list(r) for r in rows], list(shift))))


@pytest.mark.parametrize("name", sorted(COUNTS["file"]))
def test_counts(name):
    """J5: fillet radii and chamfer distances per file, by feature id, as measured."""
    want = COUNTS["file"][name]
    bs = ipt(name).blends
    assert [b.feature_id for b in bs] == sorted(b.feature_id for b in bs)
    assert [round(b.radius_mm, 4) for b in bs if b.kind == "fillet" and b.radius_mm is not None] == want["fillets"]
    assert [[round(x, 4) for x in b.distances_mm] for b in bs
            if b.kind == "chamfer" and b.distances_mm] == want["chamfers"]
    assert sum(1 for b in bs if b.reason) == want["not_understood"]


def test_spec_sizes():
    """J5 as the spec states it: CTC 04's 7 fillets and 1 chamfer 5 x 5 mm; CTC 01 4 fillets and chamfers 50 x 50
    and 5 x 5; CTC 05 2 fillets and 1 chamfer 6.35 x 6.35 (a cone: no angle); FTC 10 2021 fillets 1, 2, 0.15, 0.2."""
    def sizes(name):
        bs = ipt(name).blends
        return (sorted(b.radius_mm for b in bs if b.kind == "fillet"),
                [[round(x, 4) for x in b.distances_mm] + [b.angle_deg and round(b.angle_deg, 4)]
                 for b in bs if b.kind == "chamfer"])
    f, c = sizes("INV_nist_ctc_04_asme1_2021.ipt")
    assert f == pytest.approx([2.5, 4, 5, 5, 5, 13, 25]) and c == [[5.0, 5.0, 90.0]]
    f, c = sizes("INV_nist_ctc_01_asme1_2021.ipt")
    assert len(f) == 4 and c == [[50.0, 50.0, 90.0], [5.0, 5.0, 90.0]]
    f, c = sizes("INV_nist_ctc_05_asme1_2021.ipt")
    assert len(f) == 2 and c == [[6.35, 6.35, None]]
    f, _ = sizes("INV_nist_ftc_10_asme1_2021.ipt")
    assert f == pytest.approx([0.15, 0.2, 1.0, 2.0])


def test_copies_join_their_fillet():
    """Measured at build: a blend tag's last id is the fillet, ids before it the mirror or pattern that copied the
    face (as on hole tags). CTC 04's (3233, 3193) faces all have 3193's 5 mm radius."""
    [b] = [b for b in ipt("INV_nist_ctc_04_asme1_2021.ipt").blends if b.feature_id == 3193]
    assert (b.kind, b.radius_mm, b.copied_by, len(b.faces)) == ("fillet", 5.0, [3233], 36)
    assert 3233 not in {b.feature_id for b in ipt("INV_nist_ctc_04_asme1_2021.ipt").blends}


def test_not_understood():
    """CTC 02: a 2 deg cone blend and four of spline faces only are not mapped, with their reason."""
    bad = [b for b in ipt("INV_nist_ctc_02_asme1_2021.ipt").blends if b.reason]
    assert [b.feature_id for b in bad] == [446, 2203, 2778, 6592, 8803]
    assert {b.reason for b in bad} == {"blend shape not understood"} and {b.kind for b in bad} == {None}


@pytest.mark.parametrize("name", sorted(COUNTS["pair"]))
def test_mapping(name):
    """J5: faces at a STEP face of their shape and place, and blends per state, on each NIST pair."""
    want = COUNTS["pair"][name]
    rows = mapped(name)
    fl = [r for r in rows if r["kind"] == "fillet"]
    ch = [r for r in rows if r["kind"] == "chamfer"]
    assert (sum(r["faces"] for r in fl), sum(r["faces_mapped"] for r in fl)) == (want["faces"], want["faces_mapped"])
    assert (sum(r["faces"] for r in ch), sum(r["faces_mapped"] for r in ch)) == (
        want["chamfer_faces"], want["chamfer_faces_mapped"])
    assert {s: sum(1 for r in rows if r["state"] == s) for s in ("matched", "disagrees", "not_mapped")} == {
        s: want[s] for s in ("matched", "disagrees", "not_mapped")}
    for r in rows:
        assert (r["reason"] is None) == (r["state"] != "not_mapped")
        assert (r["gaps"] != []) == (r["state"] == "disagrees")
        assert r["faces_mapped"] <= r["faces"]


def test_mapping_totals():
    """The spec's measure (J5): 499 of 744 fillet faces sit on a STEP face of their shape and place on the 11 pairs;
    none at its place with another radius (the spec's one on FTC 11 is a torus whose ring is 0.043 mm larger, so
    it sits elsewhere: not mapped, measured at build)."""
    assert len(COUNTS["pair"]) == 11
    rows = [r for name in COUNTS["pair"] for r in mapped(name) if r["kind"] == "fillet"]
    assert (sum(r["faces"] for r in rows), sum(r["faces_mapped"] for r in rows)) == (744, 499)
    assert not [r for r in rows if r["state"] == "disagrees"]


def test_one_face_one_place():
    """A coplanar STEP face elsewhere is not the chamfer's: CTC 04's chamfer covers 12 distinct STEP faces, one
    per mapped .ipt face (before the box check, one plane matched faces 446 and 471)."""
    [c] = [r for r in mapped("INV_nist_ctc_04_asme1_2021.ipt") if r["kind"] == "chamfer"]
    assert c["faces_mapped"] == 12 and len(c["step_faces"]) == 12


def test_built_block(tmp_path):
    """Spec Builder defaults: the built block's fillet r 3 and chamfer [2, 2] are matched; with r 3.5 the fillet
    disagrees by 0.5 mm."""
    from inventor.built import block_blends, filleted_block
    faces = read_step(filleted_block(tmp_path / "block.step")).faces
    fillet, chamfer = map_blends(block_blends(), faces)
    assert (fillet["state"], fillet["radius_mm"], fillet["faces_mapped"]) == ("matched", 3.0, 1)
    assert (chamfer["state"], chamfer["distances_mm"], chamfer["angle_deg"]) == ("matched", [2.0, 2.0], 90.0)
    off, _ = map_blends(block_blends(3.5), faces)
    assert off["state"] == "disagrees" and off["step_faces"] == fillet["step_faces"]
    [g] = off["gaps"]
    assert (g["what"], g["mm"], g["text"]) == ("radius", 0.5, "R0.138 in [3.50 mm] in the .ipt, R0.118 in [3.00 mm] "
                                                              "in the STEP")
