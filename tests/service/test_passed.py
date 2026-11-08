"""D-023 (proposed): every feature a rule judges is either in a finding or in `passed`, never both, with the
math; the Passed list uses the same numbers and limits as the findings."""

from __future__ import annotations

import pytest

from helpers import PARTS, expected_parts

from dfma.analyze import analyze

JUDGES = {"hole_depth": ("hole",), "hole_size": ("hole",), "corner_radius": ("corner",), "pocket_depth": ("pocket",),
          "undercut": ("pocket",), "thin_wall": ("wall",), "access": ("hole", "pocket")}


@pytest.mark.parametrize("entry", expected_parts(), ids=lambda e: f'{e["name"]}-{e.get("material", "al6061")}')
def test_every_judged_feature_is_flagged_or_passed(entry):
    path = PARTS / f'{entry["name"]}.step'
    r = analyze(path, path.name, entry.get("process", "mill"), entry.get("material", "al6061"))
    for rule in r["rules_run"]:
        flagged = {f["feature"] for f in r["findings"] if f["rule"] == rule}
        passed = [p["feature"] for p in r["passed"] if p["rule"] == rule]
        assert len(passed) == len(set(passed)), f"{rule}: a feature passed twice"
        assert flagged.isdisjoint(passed), f"{rule}: flagged and passed"
        judged = {f["id"] for f in r["features"] if f["kind"] in JUDGES[rule]
                  and not (rule == "access" and not f["open_vectors"])}
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
