"""Set 2 after the stress test (Morgan, 2026-11-07: "go with your recommendation"): the labelled set in
tests/grading/sets/undercuts (made by its make.py) is scored with the grading scorer, and each part's
pocket count and depth must match MANIFEST.md. D-021 adds the undercut finding (test_undercut_finding).

On the code before this set: a pocket under a lip or with a groove round its floor gave 6 pockets, one
on every face of the cavity (a lip's underside, each side wall), and the real one read 9 or 3 mm deep
instead of 12; a closed T-slot gave phantom pockets on its head's ceiling and sides.
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

SET = ROOT / "tests" / "grading" / "sets" / "undercuts"
FILES = sorted(SET.glob("*.step"))
EXPECTED = {m.group(1): (int(m.group(2)), None if m.group(3) == "-" else float(m.group(3)))
            for m in re.finditer(r"^- `(\w+)` · .* · (\d+) · ([\d.]+|-)$", (SET / "MANIFEST.md").read_text(), re.M)}


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
    assert s["claimed_on_excluded"] == {}, "a slot face (not scored) was called a pocket or hole"
    assert missed == []


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_pockets_and_depth(path):
    from dfma.analyze import analyze
    count, depth = EXPECTED[path.stem]
    found = [f for f in analyze(path, path.name)["features"] if f["kind"] == "pocket"]
    assert len(found) == count
    if count:
        assert found[0]["dims_mm"]["depth"] == pytest.approx(depth, abs=1e-3)


def test_set_totals():
    total = Counter()
    for path in FILES:
        total += _score(path)[0]
    s = grade.scores(total)
    assert len(FILES) == len(EXPECTED) == 10
    assert sum(s["recall"][c]["n"] for c in grade.POCKET_CLASSES) == sum(s["recall"][c]["of"] for c in grade.POCKET_CLASSES) == 37


UNDERCUT_MM = {"pk_lip": 2.0, "pk_groove": 2.0, "ts_closed": 4.0}  # as built by make.py: lip 2, groove 2, T-slot (18 - 10) / 2


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_undercut_finding(path):
    """D-021 (Morgan: "Go with your recommendations"): a pocket with an undercut gets one medium finding,
    measured as how far the undercut reaches under its lip; no other part of the set gets one."""
    from dfma.analyze import analyze
    result = analyze(path, path.name, "mill", "al6061")
    found = [f for f in result["findings"] if f["rule"] == "undercut"]
    if path.stem not in UNDERCUT_MM:
        assert found == []
        return
    (f,) = found
    assert f["severity"] == "medium" and f["unit"] == "in" and f["limit"] == 0.0
    assert f["measured"] == pytest.approx(UNDERCUT_MM[path.stem] / 25.4, abs=1e-5)
    assert "T-slot or lollipop cutter" in f["title"]
    (pocket,) = [p for p in result["features"] if p["kind"] == "pocket"]
    assert f["feature"] == pocket["id"] and f["faces"] == pocket["faces"]


def test_undercut_rule_is_mill_only():
    from dfma.analyze import analyze
    path = SET / "pk_lip.step"
    result = analyze(path, path.name, "turn", "al6061")
    assert "undercut" not in result["rules_run"]
    assert not [f for f in result["findings"] if f["rule"] == "undercut"]


def test_undercut_thresholds_per_material():
    from dfma import settings
    for m in settings.MATERIALS:
        assert settings.thresholds(m)["undercut"] == {"max_in": 0.0, "source": "D-021"}
