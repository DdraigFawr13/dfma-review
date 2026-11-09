"""D-023 (proposed): every feature a rule judges is either in a finding or in `passed`, never both, with the
math; the Passed list uses the same numbers and limits as the findings."""

from __future__ import annotations

import pytest

from helpers import PARTS, expected_parts

from dfma.analyze import analyze

JUDGES = {"hole_depth": ("hole",), "bore_depth": ("bore",), "hole_size": ("hole",), "corner_radius": ("corner",), "pocket_depth": ("pocket",),
          "undercut": ("pocket",), "thin_wall": ("wall",), "access": ("hole", "pocket"),
          # S6: turn_axis judges the part (no feature when it fires) and passes the profile it found
          "turn_axis": ("profile",), "looks_turned": (), "turn_slender": ("profile",), "turn_offaxis": ("hole", "pocket", "bore")}
OPEN_ONLY = ("access", "turn_offaxis")  # a void sealed inside the part is not judged


@pytest.mark.parametrize("entry", expected_parts(), ids=lambda e: f'{e["name"]}-{e.get("process", "mill")}-{e.get("material", "al6061")}')
def test_every_judged_feature_is_flagged_or_passed(entry):
    path = PARTS / f'{entry["name"]}.step'
    r = analyze(path, path.name, entry.get("process", "mill"), entry.get("material", "al6061"))
    for rule in r["rules_run"]:
        flagged = {f["feature"] for f in r["findings"] if f["rule"] == rule and f["feature"] is not None}
        passed = [p["feature"] for p in r["passed"] if p["rule"] == rule]
        assert len(passed) == len(set(passed)), f"{rule}: a feature passed twice"
        assert flagged.isdisjoint(passed), f"{rule}: flagged and passed"
        judged = {f["id"] for f in r["features"] if f["kind"] in JUDGES[rule]
                  and not (rule in OPEN_ONLY and not f["open_vectors"])}
        assert flagged | set(passed) == judged, rule
    for p in r["passed"]:
        assert p["title"] and p["math"] and p["threshold_source"]


def test_passed_math_uses_the_rule_numbers():
    r = analyze(PARTS / "clean_one_setup.step", "clean_one_setup.step")
    rows = {(p["feature"], p["rule"]): p for p in r["passed"]}
    assert rows[("hole-2", "hole_depth")]["math"] == "0.500 in deep ÷ 0.250 in diameter = 2.00× ≤ 6.0×"
    assert rows[("hole-1", "hole_size")]["math"] == "|0.2500 − 0.2500| = 0.0000 in ≤ 0.0005 in"
    assert rows[("pocket-1", "pocket_depth")]["math"] == (
        "end mill radius 0.125 in ≤ corner 0.125 in, 0.250 in ≤ narrowest gap 1.000 in; "
        "0.250 in deep ÷ 0.250 in = 1.00× ≤ 3.0×")
    assert rows[("hole-1", "access")]["title"] == "Opens along −Z and +Z: a 3-axis mill reaches it"


def test_angled_hole_is_not_passed_by_access():
    r = analyze(PARTS / "angled_hole.step", "angled_hole.step")
    assert not [p for p in r["passed"] if p["rule"] == "access"]


def test_undercut_within_its_limit_is_passed():
    """Fresh-check finding: with max_in over 0, an undercut under the limit is passed, not dropped."""
    from dfma.rules import undercut
    f = {"kind": "pocket", "id": "pocket-1", "faces": [1], "dims_mm": {"undercut_mm": 2.0}}
    table = {"undercut": {"max_in": 0.1, "source": "test"}}
    assert undercut.check([f], {}, table) == []
    (p,) = undercut.passes([f], {}, table)
    assert p["math"] == "0.079 in ≤ 0.100 in"
    assert undercut.passes([f], {}, {"undercut": {"max_in": 0.0, "source": "D-021"}}) == []
