"""J3: every committed test part's features and findings match tests/parts/expected.toml exactly."""

from __future__ import annotations

from collections import Counter

import pytest

from helpers import PARTS, expected_parts, faces_near

from dfma.analyze import analyze

ENTRIES = expected_parts()
KINDS = ("hole", "pocket", "corner", "wall")


def test_enough_parts():
    assert len(ENTRIES) >= 14


@pytest.mark.parametrize("entry", ENTRIES, ids=lambda e: f'{e["name"]}-{e.get("material", "al6061")}')
def test_part(entry):
    path = PARTS / f'{entry["name"]}.step'
    result = analyze(path, path.name, entry.get("process", "mill"), entry.get("material", "al6061"))
    assert result["part"]["face_count"] == entry["face_count"]
    kinds = Counter(f["kind"] for f in result["features"])
    assert {k: kinds.get(k, 0) for k in KINDS} == entry["features"]

    want = entry.get("finding", [])
    got = result["findings"]
    assert len(got) == len(want), [f["title"] for f in got]
    unmatched = list(got)
    for w in want:
        probe_faces = faces_near(path, w["probe_mm"])
        assert probe_faces, f'probe {w["probe_mm"]} is on no face of {path.name}'
        tol = 0.01 if w["rule"] in ("hole_depth",) else 0.001
        match = next((f for f in unmatched if f["rule"] == w["rule"] and f["severity"] == w["severity"]
                      and abs(f["measured"] - w["measured"]) <= tol and probe_faces & set(f["faces"])), None)
        assert match, f"no finding matches {w}; got {got}"
        unmatched.remove(match)
