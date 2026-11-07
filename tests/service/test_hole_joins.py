"""HANDOFF 3a, the stress-test gaps: the labelled set in tests/grading/sets/hole_joins (made by its make.py,
hole instances in INSTANCES.json) is scored with the grading scorer. Every hole is found whole (one
stepped hole, one chain), with the right type and no wrong call.

On the code before this set, 13 of 25 holes were whole and 48 of 61 hole surfaces had the right type:
counterbores with a chamfer or fillet between the bore and the counterbore floor, or a fillet in the
counterbore's corner, split into two holes (6 of 7); crossing holes, a bore with a snap-ring groove and a
clevis pin hole split into pieces; a radial hole through a round shaft was called blind.
"""

from __future__ import annotations

import json
import sys
from collections import Counter

import pytest

from helpers import ROOT

sys.path.insert(0, str(ROOT / "tests" / "grading"))
import child  # noqa: E402
import grade  # noqa: E402

SET = ROOT / "tests" / "grading" / "sets" / "hole_joins"
INSTANCES = json.loads((SET / "INSTANCES.json").read_text(encoding="utf-8"))
FILES = sorted(SET.glob("*.step"))


def _score(path):
    rec, counts, missed = grade.score_part(path.name, {"status": "ok", **child.run(str(path))},
                                           grade.file_labels(path.read_bytes()))
    assert rec["status"] == "ok"
    return counts, missed, grade.instance_score(rec["features"], INSTANCES[path.stem])


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_set_part(path):
    counts, missed, whole = _score(path)
    s = grade.scores(counts)
    assert s["precision"]["hole"]["n"] == s["precision"]["hole"]["of"], "a face that is not a hole's was called one"
    assert missed == []
    assert whole["whole"] == whole["of"], whole
    for cls in grade.HOLE_CLASSES:
        assert s["type_recall"][cls]["n"] == s["recall"][cls]["of"], f"class {cls} faces given the wrong type"


def test_set_totals():
    total, whole = Counter(), Counter()
    for path in FILES:
        counts, _, w = _score(path)
        total += counts
        whole.update(w)
    assert len(FILES) == 19
    assert whole["whole"] == whole["of"] == sum(len(INSTANCES[p.stem]) for p in FILES) == 25


def test_crossing_holes_are_two_whole_holes_and_a_bore_with_a_groove_is_one():
    from dfma.analyze import analyze
    r = analyze(SET / "x_equal.step", "x_equal.step")
    assert sorted(f["dims_mm"]["depth"] for f in r["features"] if f["kind"] == "hole") == pytest.approx([30.0, 100.0])
    r = analyze(SET / "x_snap_ring.step", "x_snap_ring.step")
    (bore,) = [f for f in r["features"] if f["kind"] == "hole"]
    assert bore["dims_mm"]["depth"] == pytest.approx(30.0) and len(bore["open_vectors"]) == 2


def test_bores_far_apart_or_blind_from_both_sides_stay_two_holes():
    from dfma.analyze import analyze
    for name, depths in (("ng_far_walls", [30.0, 30.0]), ("ng_blind_opposite", [12.0, 12.0])):
        r = analyze(SET / f"{name}.step", f"{name}.step")
        assert sorted(f["dims_mm"]["depth"] for f in r["features"] if f["kind"] == "hole") == pytest.approx(depths), name


def test_radial_hole_through_a_shaft_is_through():
    from dfma.analyze import analyze
    r = analyze(SET / "r_through.step", "r_through.step")
    (hole,) = [f for f in r["features"] if f["kind"] == "hole"]
    assert len(hole["open_vectors"]) == 2 and hole["dims_mm"]["depth"] == pytest.approx(30.0)


def test_counterbore_with_a_chamfer_at_the_bore_is_one_through_hole():
    from dfma.analyze import analyze
    r = analyze(SET / "cb_chamfer.step", "cb_chamfer.step")
    holes = [f for f in r["features"] if f["kind"] == "hole"]
    assert len(holes) == 2 and len({h["chain"] for h in holes}) == 1
    assert sorted(h["dims_mm"]["diameter"] for h in holes) == pytest.approx([6.6, 11.0])
    assert all(len(h["open_vectors"]) == 2 for h in holes)  # through, both segments
