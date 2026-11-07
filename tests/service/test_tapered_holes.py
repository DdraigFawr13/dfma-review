"""D-018 tapered-holes round: the labelled set in tests/grading/sets/tapered_holes (made by its make.py)
is scored with the grading scorer. Tapered holes (cones up to TAPER_MAX_DEG) are holes with their
taper and narrow end; countersinks, entry chamfers and a drafted boss are not holes. On the code
before this round 4 of 20 hole surfaces were found.
"""

from __future__ import annotations

import sys
from collections import Counter

import pytest

from helpers import ROOT

sys.path.insert(0, str(ROOT / "tests" / "grading"))
import child  # noqa: E402
import grade  # noqa: E402

SET = ROOT / "tests" / "grading" / "sets" / "tapered_holes"
FILES = sorted(SET.glob("*.step"))


def _score(path):
    rec, counts, missed = grade.score_part(path.name, {"status": "ok", **child.run(str(path))},
                                           grade.file_labels(path.read_bytes()))
    assert rec["status"] == "ok"
    return counts, missed


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_set_part(path):
    counts, missed = _score(path)
    s = grade.scores(counts)
    assert s["precision"]["hole"]["n"] == s["precision"]["hole"]["of"], "a face that is not a hole's was called one"
    assert missed == []


def test_set_totals():
    total = Counter()
    for path in FILES:
        total += _score(path)[0]
    s = grade.scores(total)
    assert len(FILES) == 12
    assert sum(s["recall"][c]["n"] for c in grade.HOLE_CLASSES) == sum(s["recall"][c]["of"] for c in grade.HOLE_CLASSES) == 20


def test_tapered_hole_reports_its_taper_and_gets_no_drill_size_finding():
    from dfma.analyze import analyze
    r = analyze(SET / "tp_pipe.step", "tp_pipe.step")
    (hole,) = [f for f in r["features"] if f["kind"] == "hole"]
    assert hole["dims_mm"]["diameter"] == pytest.approx(21.3, abs=1e-3)
    assert hole["dims_mm"]["taper_deg"] == pytest.approx(1.79, abs=0.01)
    assert hole["dims_mm"]["small_diameter"] == pytest.approx(21.3 - 2 * 18 / 32, abs=1e-3)
    assert [f for f in r["findings"] if f["rule"] == "hole_size"] == []  # 21.3 is no drill, but a taper is reamed
