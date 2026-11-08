"""Set 3 with S5 (HANDOFF 3a; D-022): the labelled set in tests/grading/sets/hole_ends_walls (made by its
make.py) is scored with the grading scorer, and each part's hole depth, longest side, countersinks and
hole walls must match EXPECT.json, which make.py works out from the geometry.

On the code before this set: a countersink was not recorded on its hole (the hole did not know it was
countersunk); a hole leaving through a slope gave its longest side as its depth (sx_bottom_20: 26.456 for
23.544 mm round all the way); material at a hole was checked at 3 heights, so hw_top's 0.4 mm near the top
and hw_bottom's 0.5 mm near the bottom gave no wall, and hw_two_sides gave only its thinner side.
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

SET = ROOT / "tests" / "grading" / "sets" / "hole_ends_walls"
FILES = sorted(SET.glob("*.step"))
EXPECT = json.loads((SET / "EXPECT.json").read_text(encoding="utf-8"))


def _score(path):
    rec, counts, missed = grade.score_part(path.name, {"status": "ok", **child.run(str(path))},
                                           grade.file_labels(path.read_bytes()))
    assert rec["status"] == "ok"
    return counts, missed


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_set_part(path):
    counts, missed = _score(path)
    s = grade.scores(counts)
    for kind in ("hole", "pocket"):
        assert s["precision"][kind]["n"] == s["precision"][kind]["of"], f"a face that is not a {kind}'s was called one"
    assert missed == []


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_depths_countersinks_and_walls(path):
    from dfma.analyze import analyze
    want = EXPECT[path.stem]
    result = analyze(path, path.name)
    (hole,) = [f for f in result["features"] if f["kind"] == "hole"]
    (h,) = want["holes"]
    dims = hole["dims_mm"]
    assert dims["depth"] == pytest.approx(h["depth"], abs=1e-3)
    if "max_depth" in h:
        assert dims["max_depth"] == pytest.approx(h["max_depth"], abs=1e-3)
    else:
        assert "max_depth" not in dims
    if h["countersinks"]:
        assert len(hole["countersink_vectors"]) == len(h["countersinks"])
        assert dims["countersink_diameter"] == pytest.approx(max(d for d, _ in h["countersinks"]), abs=1e-3)
        assert dims["countersink_deg"] == pytest.approx(h["countersinks"][0][1], abs=0.1)
        assert set(hole["countersink_faces"]).isdisjoint(hole["faces"])  # D-018: the cone stays out
    else:
        assert "countersink_deg" not in dims and "countersink_vectors" not in hole
    walls = sorted(f["dims_mm"]["thickness"] for f in result["features"] if f["kind"] == "wall" and "hole" in f)
    assert walls == pytest.approx(want["walls"], abs=1e-3)


def test_set_totals():
    total = Counter()
    for path in FILES:
        total += _score(path)[0]
    s = grade.scores(total)
    assert len(FILES) == len(EXPECT) == 16
    holes = sum(s["recall"][c]["of"] for c in grade.HOLE_CLASSES)
    assert sum(s["recall"][c]["n"] for c in grade.HOLE_CLASSES) == holes == 20  # MANIFEST: classes 1 and 12


def test_sloped_exit_names_the_longest_side():
    """D-022: a deep-hole finding on a sloped exit says the longest side too."""
    from dfma.rules import hole_depth
    f = {"kind": "hole", "id": "hole-1", "faces": [1], "dims_mm": {"diameter": 2.0, "depth": 14.0, "max_depth": 16.0}}
    (out,) = hole_depth.check([f], {}, {"hole_depth": {"medium": 6.0, "high": 10.0, "source": "estimate"}})
    assert out["measured"] == 7.0 and "its longest side is 0.630 in" in out["suggestion"]
