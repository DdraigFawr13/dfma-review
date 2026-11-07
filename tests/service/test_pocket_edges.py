"""Set 1 after the stress test (Morgan, 2026-11-07: "go with your recommendation"): the labelled set in
tests/grading/sets/pocket_edges (made by its make.py) is scored with the grading scorer, and each
pocket's depth and narrowest gap must match MANIFEST.md (measured on the built parts).

On the code before this set: a chamfer or round on the pocket's rim made the depth read short by its
height (12 read 10 to 11.5), a round boss was left out of the narrowest gap (1.27 mm read 30), and a
floor in several flat pieces gave no pocket (pocket surfaces 90 of 100).
"""

from __future__ import annotations

import re
import sys
from collections import Counter

import pytest

from helpers import ROOT

sys.path.insert(0, str(ROOT / "tests" / "grading"))
import child  # noqa: E402
import grade  # noqa: E402

SET = ROOT / "tests" / "grading" / "sets" / "pocket_edges"
FILES = sorted(SET.glob("*.step"))
EXPECTED = {m.group(1): (float(m.group(2)), float(m.group(3)))
            for m in re.finditer(r"^- `(\w+)` · .* · ([\d.]+) · ([\d.]+) · \d+$", (SET / "MANIFEST.md").read_text(), re.M)}


def _score(path):
    rec, counts, missed = grade.score_part(path.name, {"status": "ok", **child.run(str(path))},
                                           grade.file_labels(path.read_bytes()))
    assert rec["status"] == "ok"
    return counts, missed


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_set_part(path):
    counts, missed = _score(path)
    s = grade.scores(counts)
    assert s["precision"]["pocket"]["n"] == s["precision"]["pocket"]["of"], "a face that is not a pocket's was called one"
    assert missed == []


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_depth_and_narrowest_gap(path):
    from dfma.analyze import analyze
    depth, narrowest = EXPECTED[path.stem]
    (pocket,) = [f for f in analyze(path, path.name)["features"] if f["kind"] == "pocket"]
    assert pocket["dims_mm"]["depth"] == pytest.approx(depth, abs=1e-3)
    assert pocket["dims_mm"]["narrowest_width"] == pytest.approx(narrowest, abs=1e-3)


def test_set_totals():
    total = Counter()
    for path in FILES:
        total += _score(path)[0]
    s = grade.scores(total)
    assert len(FILES) == len(EXPECTED) == 11
    assert sum(s["recall"][c]["n"] for c in grade.POCKET_CLASSES) == sum(s["recall"][c]["of"] for c in grade.POCKET_CLASSES) == 100
