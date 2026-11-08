"""J3: every committed test part's features and findings match tests/parts/expected.toml exactly."""

from __future__ import annotations

from collections import Counter

import pytest

from helpers import PARTS, expected_parts, faces_near

from dfma.analyze import analyze

ENTRIES = expected_parts()
KINDS = ("hole", "pocket", "corner", "wall")


def test_enough_parts():
    assert len(ENTRIES) >= 21


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
        # Ratios match to 0.01, inches to 0.001 (J3). Among findings that fit, the one sharing the most
        # faces with the probe wins: a probe on a sharp corner's edge touches both of its walls, and
        # each wall also belongs to the next corner along it.
        fits = [f for f in unmatched if f["rule"] == w["rule"] and f["severity"] == w["severity"]
                and abs(f["measured"] - w["measured"]) <= (0.01 if f["unit"] == "ratio" else 0.001)
                and probe_faces & set(f["faces"])]
        match = max(fits, key=lambda f: len(probe_faces & set(f["faces"])), default=None)
        assert match, f"no finding matches {w}; got {got}"
        unmatched.remove(match)
    check_plan(path, entry, result)


def check_plan(path, entry: dict, result: dict) -> None:
    """S5 (J4): machine, setups (each holding the features its probes name, in order), tools and tool loads,
    for entries that list them."""
    if "machine" in entry:
        assert result["machine"] == entry["machine"]
    if "setups" in entry:
        assert [s["direction"] for s in result["setups"]] == [s["dir"] for s in entry["setups"]]
        planned = [f for f in result["features"] if f["kind"] in ("hole", "pocket")]
        for want, got in zip(entry["setups"], result["setups"]):
            named = set()
            for probe in want["probes"]:
                near = faces_near(path, probe)
                hit = [f["id"] for f in planned if near & set(f["faces"])]
                assert len(hit) == 1, f"probe {probe} names {hit}"
                named.add(hit[0])
            assert set(got["features"]) == named, (want["dir"], got["features"], named)
    if "tools" in entry:
        assert [t["id"] for t in result["tools"]] == entry["tools"]
    if "tool_changes" in entry:
        assert result["tool_changes"] == entry["tool_changes"] == len(result["operations"])
