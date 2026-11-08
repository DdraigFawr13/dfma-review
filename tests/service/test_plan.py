"""S5: machine, setups, tools and tool changes (spec J4, Design "Plan"; D-022)."""

from __future__ import annotations

import pytest

from helpers import PARTS, expected
from test_expected import check_plan

from dfma import plan as P
from dfma.analyze import analyze


def _run(name: str, process: str = "mill") -> dict:
    return analyze(PARTS / f"{name}.step", f"{name}.step", process)


def test_two_sided_block():
    """J4: a pocket each side and a hole from the side: 3-axis mill, 3 setups, the tools per setup, 3 loads."""
    r = _run("two_sided_block")
    check_plan(PARTS / "two_sided_block.step", expected("two_sided_block"), r)
    assert r["machine"] == "3-axis mill"
    assert [(r["setups"][o["setup"]]["direction"], o["tool"]) for o in r["operations"]] == [
        ("+Z", "em-0.250"), ("-Z", "em-0.250"), ("-X", "dr-0.2500")]
    assert r["tool_changes"] == 3
    assert r["findings"] == []


@pytest.mark.parametrize("name, angle", [("angled_hole", 30.0), ("angled_hole_in_pocket", 20.0)])
def test_access_finding(name, angle):
    r = _run(name)
    (f,) = [f for f in r["findings"] if f["rule"] == "access"]
    assert (f["severity"], f["unit"], f["limit"]) == ("high", "deg", 0.5)
    assert f["measured"] == pytest.approx(angle, abs=0.01)
    assert "4/5-axis mill or a fixture" in f["title"]
    assert r["machine"] == "4/5-axis mill or fixture"
    planned = {fid for s in r["setups"] for fid in s["features"]}
    assert f["feature"] not in planned  # in no setup (spec Plan: setups cover what access didn't flag)


def test_hole_in_pocket_floor_keeps_its_axis():
    """D-022: the end on the pocket floor points along the hole, not along the pocket's opening."""
    r = _run("angled_hole_in_pocket")
    (hole,) = [f for f in r["features"] if f["kind"] == "hole"]
    assert hole["open_dirs"] == [] and len(hole["open_vectors"]) == 2


@pytest.mark.parametrize("name", ["clean_one_setup", "rotated_block", "through_hole_two_dirs"])
def test_clean_parts_one_setup(name):
    r = _run(name)
    assert r["findings"] == [] and len(r["setups"]) == 1 and r["machine"] == "3-axis mill"


def test_rotated_block_plans_as_the_unrotated_one():
    a, b = _run("clean_one_setup"), _run("rotated_block")
    for key in ("machine", "setups", "operations", "tools", "tool_changes"):
        assert a[key] == b[key], key


def test_countersink_is_a_tool_load_from_its_own_end():
    """D-022: the countersink at the top makes the hole's setup the top one, after the drill."""
    r = _run("countersunk_hole")
    (hole,) = [f for f in r["features"] if f["kind"] == "hole"]
    assert hole["dims_mm"]["countersink_deg"] == pytest.approx(82.0)
    assert hole["dims_mm"]["countersink_diameter"] == pytest.approx(12.7, abs=1e-3)
    assert set(hole["countersink_faces"]).isdisjoint(hole["faces"])  # D-018: the cone stays out of the hole
    assert [o["tool"] for o in r["operations"]] == ["dr-0.2500", "cs-82"]
    assert r["tools"][1] == {"id": "cs-82", "kind": "countersink", "diameter_in": None, "undersized": False}


def test_no_holes_or_pockets_gets_one_setup():
    r = _run("thin_rib")
    assert r["setups"] == [{"direction": "+Z", "features": []}]
    assert r["operations"] == [] and r["tools"] == [] and r["tool_changes"] == 0


def test_odd_hole_takes_an_end_mill():
    """No drill within 0.0005 in of 0.260 in: pick_end_mill(0.130, 0.260) gives the 1/4 in end mill."""
    r = _run("odd_hole")
    assert [t["id"] for t in r["tools"]] == ["em-0.250"]


def test_metric_drill_id():
    r = _run("metric_hole")  # a 6.5 mm hole in a mm file
    assert [t["id"] for t in r["tools"]] == ["dr-6.5mm"]


def test_turn_has_no_mill_plan():
    r = _run("box_through_hole", "turn")
    assert r["machine"] is None and r["setups"] == [] and r["tool_changes"] == 0


def test_operation_order_within_a_setup():
    """End mills largest to smallest, then drills smallest to largest, then countersinks."""
    tools = {"a": {"id": "a", "kind": "drill", "diameter_in": 0.5}, "b": {"id": "b", "kind": "end_mill", "diameter_in": 0.25},
             "c": {"id": "c", "kind": "countersink", "diameter_in": None}, "d": {"id": "d", "kind": "drill", "diameter_in": 0.25},
             "e": {"id": "e", "kind": "end_mill", "diameter_in": 0.5}}
    assert sorted(tools, key=lambda k: P._rank(tools[k])) == ["e", "b", "d", "a", "c"]


def test_cover_is_smallest_then_first_in_order():
    assert P._cover([]) == ["+Z"]
    assert P._cover([{"+X", "-X"}]) == ["+X"]
    assert P._cover([{"-Y"}, {"+Z", "-Y"}]) == ["-Y"]  # one direction beats two
    assert P._cover([{"+X"}, {"-Z"}]) == ["-Z", "+X"]  # setups listed in the order +Z -Z +X -X +Y -Y
    assert P._cover([{"+Y", "-X"}, {"+Y", "-Z"}, {"+X", "-Z"}]) == ["-Z", "-X"]  # ties: earlier positions first (not -Z +Y)
    assert P._cover([{d} for d in P.ORDER]) == list(P.ORDER)


def test_tool_load_assumption_listed():
    assert any("Tool loads count every tool loaded" in a for a in _run("box_through_hole")["assumptions"])


def test_each_operation_lists_the_faces_it_cuts():
    """Morgan, 2026-11-08: selecting a setup should show the countersink surface too. The countersink tool's
    operation holds its own cone (kept out of the hole's faces by D-018); the drill holds the bore."""
    r = _run("countersunk_hole")
    (hole,) = [f for f in r["features"] if f["kind"] == "hole"]
    ops = {o["tool"]: o for o in r["operations"]}
    assert ops["dr-0.2500"]["faces"] == sorted(hole["faces"])
    assert ops["cs-82"]["faces"] == sorted(hole["countersink_faces"])


def test_countersink_at_each_end_lights_only_its_cone():
    """cs_both: drilled from one side; the other setup only countersinks, and its operation holds only the
    cone at its own end, not the bore or the far cone."""
    from helpers import ROOT
    path = ROOT / "tests" / "grading" / "sets" / "hole_ends_walls" / "cs_both.step"
    r = analyze(path, path.name)
    (hole,) = [f for f in r["features"] if f["kind"] == "hole"]
    assert len(r["setups"]) == 2
    only_cs = [s for s, _ in enumerate(r["setups"]) if {o["tool"] for o in r["operations"] if o["setup"] == s} == {"cs-90"}]
    (k,) = only_cs
    (op,) = [o for o in r["operations"] if o["setup"] == k]
    assert op["faces"] in [sorted(e) for e in hole["countersink_end_faces"]]
    assert set(op["faces"]).isdisjoint(hole["faces"]) and len(hole["countersink_end_faces"]) == 2
