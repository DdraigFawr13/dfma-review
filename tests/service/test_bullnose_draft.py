"""D-018 bull-nose and draft round: the labelled set in tests/grading/sets/bullnose_draft (made by its
make.py) is scored with the grading scorer. Every pocket surface is found and nothing else is called
a pocket: bull-nose and ball floors, drafted walls, islands, and the look-alike slots, steps and
passages that are not pockets. On the code before this round 14 of 259 pocket surfaces were found.
"""

from __future__ import annotations

import sys
from collections import Counter

import pytest

from helpers import ROOT

sys.path.insert(0, str(ROOT / "tests" / "grading"))
import child  # noqa: E402
import grade  # noqa: E402

SET = ROOT / "tests" / "grading" / "sets" / "bullnose_draft"
FILES = sorted(SET.glob("*.step"))
KNOWN_MISSES: set[str] = set()  # dr_round_1deg (a 1 deg tapered recess) is read since the tapered-holes round


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
    assert s["precision"]["hole"]["n"] == s["precision"]["hole"]["of"], "a face that is not a hole's was called one"
    if path.name not in KNOWN_MISSES:
        assert missed == []


def test_set_totals():
    total = Counter()
    for path in FILES:
        total += _score(path)[0]
    s = grade.scores(total)
    pockets = sum(s["recall"][c]["n"] for c in grade.POCKET_CLASSES)
    of = sum(s["recall"][c]["of"] for c in grade.POCKET_CLASSES)
    assert len(FILES) == 31 and (pockets, of) == (259, 259)
