"""S6 turning (spec J5, Features "Turned profile", "Groove", "Bore", Rules "turn_slender" and "turn_offaxis",
Design "Turning")."""

from __future__ import annotations

import pytest

from helpers import PARTS, expected
from test_expected import check_plan

from dfma import turning
from dfma.analyze import analyze

IN = 25.4


def _run(name: str, process: str = "turn", material: str = "al6061") -> dict:
    return analyze(PARTS / f"{name}.step", f"{name}.step", process, material)


def _one(r: dict, rule: str) -> dict:
    (f,) = [f for f in r["findings"] if f["rule"] == rule]
    return f


def test_slender_shaft():
    """J5: 0.500 x 4.500 in in 1018 for turning: the axis and "lathe", the length finding (high) and the cross hole."""
    r = _run("slender_shaft", material="steel1018")
    assert r["turn_axis"] is not None and abs(abs(r["turn_axis"][2]) - 1) < 1e-9  # along the shaft (file Z)
    assert r["machine"] == "lathe with live tooling"
    slender = _one(r, "turn_slender")
    assert (slender["severity"], slender["title"]) == ("high", "Length 9.0× diameter (limit 8.0×)")
    off = _one(r, "turn_offaxis")
    assert off["severity"] == "medium"
    assert off["title"] == "Hole not on the turning axis: needs a milling operation or live tooling"
    assert [f["rule"] for f in r["findings"]] == ["turn_slender", "turn_offaxis"]
    (profile,) = [f for f in r["features"] if f["kind"] == "profile"]
    assert profile["dims_mm"]["diameter"] == pytest.approx(0.5 * IN, abs=0.01)
    assert profile["dims_mm"]["length"] == pytest.approx(4.5 * IN, abs=0.01)
    check_plan(PARTS / "slender_shaft.step", expected("slender_shaft"), r)


def test_slender_shaft_for_milling_has_no_turning_rules():
    """Morgan's comparison: the same part for milling plans the cross hole on a 3-axis mill, with no lathe checks."""
    r = _run("slender_shaft", "mill", "steel1018")
    assert r["machine"] == "3-axis mill" and r["turn_axis"] is None
    assert not {"turn_axis", "turn_slender", "turn_offaxis", "bore_depth"} & set(r["rules_run"])
    # D-028: but it warns that the part looks turned
    (f,) = r["findings"]
    assert (f["rule"], f["severity"], f["title"], f["unit"], f["limit"], f["feature"]) == (
        "looks_turned", "high", "This part looks turned; review it for Turning", "%", 40.0, None)
    assert f["measured"] > 90
    assert not [f for f in r["features"] if f["kind"] in ("profile", "bore", "groove")]


def test_block_for_milling_does_not_look_turned():
    """D-028 runs on Milling only, and a block's round faces are well under 40%."""
    r = _run("box_through_hole", "mill")
    assert "looks_turned" in r["rules_run"] and not [f for f in r["findings"] if f["rule"] == "looks_turned"]


def test_stock_size():
    """Morgan, 2026-11-08: the plan shows the stock, the part's own size with no allowance."""
    assert _run("slender_shaft", material="steel1018")["stock"] == {"shape": "bar", "diameter_in": 0.5,
                                                                    "length_in": 4.5}
    block = _run("two_sided_block", "mill")["stock"]
    assert block["shape"] == "block" and sorted(block["size_in"]) == [1.5, 2.0, 3.0]


def test_stout_shaft_is_medium():
    f = _one(_run("stout_shaft"), "turn_slender")
    assert (f["severity"], f["measured"], f["limit"], f["unit"]) == ("medium", 5.0, 4.0, "ratio")
    assert f["title"] == "Length 5.0× diameter (limit 4.0×)"


def test_slender_limits_come_from_thresholds():
    """D-025: medium over 3.0x for the steels, over 4.0x for aluminium and plastic; high over 8.0x for all."""
    from dfma import settings
    for m in ("steel1018", "ss304"):
        assert settings.thresholds(m)["turn_slender"] == {"medium": 3.0, "high": 8.0, "source": "D-025"}
    for m in ("al6061", "plastic"):
        assert settings.thresholds(m)["turn_slender"] == {"medium": 4.0, "high": 8.0, "source": "estimate"}


@pytest.mark.parametrize("material, flagged", [("steel1018", True), ("ss304", True), ("al6061", False),
                                               ("plastic", False)])
def test_slender_limit_by_material(material, flagged):
    """D-025: a 3.5x shaft is medium in the steels and clean in aluminium and plastic."""
    from dfma import settings
    from dfma.rules import turn_slender
    f = {"kind": "profile", "id": "profile-1", "faces": [0], "dims_mm": {"diameter": 10.0, "length": 35.0}}
    got = turn_slender.check([f], {}, settings.thresholds(material))
    assert [(g["severity"], g["limit"]) for g in got] == ([("medium", 3.0)] if flagged else [])


def test_groove_and_bore():
    r = _run("shaft_with_groove_and_bore", material="steel1018")
    assert r["findings"] == [] and r["machine"] == "lathe"
    (bore,) = [f for f in r["features"] if f["kind"] == "bore"]
    assert bore["dims_mm"]["diameter"] == pytest.approx(0.75 * IN, abs=1e-3)
    assert bore["dims_mm"]["depth"] == pytest.approx(1.0 * IN, abs=1e-3)
    assert not [f for f in r["features"] if f["kind"] == "hole"]  # a bore or a hole, never both
    grooves = [f for f in r["features"] if f["kind"] == "groove"]
    assert [(g["outside"], round(g["dims_mm"]["width"] / IN, 4), round(g["dims_mm"]["depth"] / IN, 4)) for g in grooves] \
        == [(True, 0.125, 0.1), (False, 0.125, 0.0625)]
    assert [(o["tool"], o["features"]) for o in r["operations"]] == [
        ("turn-rough", ["profile-1"]), ("turn-finish", ["profile-1"]), ("bore-rough", ["bore-1"]),
        ("bore-finish", ["bore-1"]), ("groove-0.125", ["groove-1", "groove-2"])]  # D-029: rough, then finish
    # D-026: bore_depth judges the bore (1.33x, a steel bar reaches); hole_depth judges holes only
    assert [p["feature"] for p in r["passed"] if p["rule"] == "bore_depth"] == ["bore-1"]
    assert not [p for p in r["passed"] if p["rule"] == "hole_depth"]


def test_block_as_turn():
    """The 2 x 1 x 0.5 in block for turning: no turning axis, only the shared rules, nothing planned."""
    r = _run("block_as_turn")
    f = _one(r, "turn_axis")
    assert (f["severity"], f["title"], f["unit"], f["limit"]) == (
        "high", "No turning axis found; check the process", "%", 40.0)
    assert r["rules_run"] == ["hole_depth", "hole_size", "thin_wall", "turn_axis"]
    assert r["machine"] is None and r["turn_axis"] is None and r["setups"] == [] and r["tool_changes"] == 0


def test_clean_shaft():
    r = _run("clean_shaft")
    assert r["findings"] == [] and r["machine"] == "lathe"
    (hole,) = [f for f in r["features"] if f["kind"] == "hole"]
    assert hole["off_axis_deg"] <= 0.5 and hole["off_axis_mm"] <= 0.0254
    assert [o["tool"] for o in r["operations"]] == ["turn-rough", "turn-finish", "dr-0.1875"]
    passed = {(p["rule"], p["feature"]) for p in r["passed"]}
    assert {("turn_slender", "profile-1"), ("turn_offaxis", "hole-1"), ("turn_axis", "profile-1")} <= passed
    (profile,) = [f for f in r["features"] if f["kind"] == "profile"]
    assert profile["dims_mm"]["min_diameter"] == pytest.approx(0.75 * IN, abs=1e-3)  # D-026: the 0.750 in end
    (row,) = [p for p in r["passed"] if p["rule"] == "turn_slender"]
    assert row["title"] == "Length 4.0× its smallest diameter, 0.750 in, at most 4.0×"


def test_clean_shaft_in_steel_is_slender_by_its_smallest_diameter():
    """D-025 and D-026: 3.000 in long over the 0.750 in end is 4.0x, past the steels' 3.0x."""
    f = _one(_run("clean_shaft", material="steel1018"), "turn_slender")
    assert (f["severity"], f["limit"]) == ("medium", 3.0)
    assert f["title"] == "Length 4.0× its smallest diameter (0.750 in) (limit 3.0×)"
    assert f["suggestion"].startswith("Support the free end with a tailstock center")


@pytest.mark.parametrize("ratio, words", [(2.5, "A chuck alone"), (5.0, "tailstock center"),
                                          (9.0, "a tailstock and a steady rest"),
                                          (15.0, "a tailstock and 3 steady rests (5 holding points)")])
def test_support_named_by_ratio(ratio, words):
    """D-026, CADEM tiers: chuck under 3x, tailstock 3-6x, steady rest 6-12x, one holding point per 3x."""
    from dfma.rules.turn_slender import support
    assert words in support(ratio)


@pytest.mark.parametrize("depth_d, severity", [(4.0, None), (5.0, "medium"), (7.0, "high")])
def test_bore_depth(depth_d, severity):
    """D-026 (Sandvik): over 4x a carbide bar (medium), over 6x a damped bar (high)."""
    from dfma import settings
    from dfma.rules import bore_depth
    f = {"kind": "bore", "id": "bore-1", "faces": [2], "dims_mm": {"diameter": 20.0, "depth": 20.0 * depth_d}}
    got = bore_depth.check([f], {}, settings.thresholds("steel1018"))
    assert [g["severity"] for g in got] == ([severity] if severity else [])


def test_offset_hole_is_off_axis():
    """Coaxial means within 0.5 deg and 0.001 in (spec): a parallel hole 0.002 in off the axis is off-axis."""
    from dfma.rules import turn_offaxis
    f = {"kind": "hole", "id": "hole-1", "faces": [3], "open_vectors": [[0, 0, 1]],
         "off_axis_deg": 0.0, "off_axis_mm": 0.002 * IN}
    (got,) = turn_offaxis.check([f], {}, {})
    assert (got["unit"], got["limit"], got["measured"]) == ("in", 0.001, 0.002)
    assert turn_offaxis.check([{**f, "off_axis_mm": 0.001 * IN}], {}, {}) == []


def test_groove_tool_widths():
    assert turning.groove_tool(0.125 * IN)["id"] == "groove-0.125"
    assert turning.groove_tool(0.25 * IN)["undersized"] is False
    narrow = turning.groove_tool(0.06 * IN)
    assert (narrow["id"], narrow["undersized"]) == ("groove-0.125", True)
