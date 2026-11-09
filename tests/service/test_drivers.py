"""S7: cost drivers (spec "Cost drivers"): count x weight, shown above 0 only, ranked by score then key."""

from __future__ import annotations

from helpers import PARTS

from dfma import drivers, settings
from dfma.analyze import analyze


def _run(name: str, process: str = "mill", material: str = "al6061") -> dict:
    return analyze(PARTS / f"{name}.step", f"{name}.step", process, material)


def _table(result: dict) -> list[tuple[str, int, float]]:
    return [(d["driver"], d["count"], d["score"]) for d in result["cost_drivers"]]


def test_report_sample_drivers():
    """Counted by hand from the part: 2 setups (1 extra); tools em-0.250 (the 0.260 in hole, no drill matches),
    dr-0.2500, em-0.750 (roughs the pocket) and em-0.031 (finishes its sharp corners, undersized): 4 tools, 1
    undersized; findings: 4 sharp corners, 2 deep holes (7.2 and 9.6), 1 odd hole and 1 deep pocket (D-030). Ties
    on score sort by key (A to Z)."""
    r = _run("report_sample")
    assert _table(r) == [("distinct_tools", 4, 4.0), ("small_corners", 4, 4.0), ("deep_holes", 2, 2.0),
                         ("deep_pockets", 1, 1.0), ("extra_setups", 1, 1.0), ("odd_holes", 1, 1.0), ("small_tools", 1, 1.0)]
    first = r["cost_drivers"][0]
    assert first == {"driver": "distinct_tools", "label": "Distinct tools", "count": 4, "weight": 1.0,
                     "score": 4.0, "weight_source": "estimate", "findings": []}
    assert len(r["setups"]) == 2 and len(r["tools"]) == 4


def test_only_drivers_above_zero():
    """A clean part with one drill has one driver; the others (count 0) are left out."""
    assert _table(_run("box_through_hole")) == [("distinct_tools", 1, 1.0)]


def test_turned_part_roughing_and_finishing_count_as_separate_tools():
    """D-029: turn-rough and turn-finish are two tools, and a lathe has one setup, so no extra setup."""
    r = _run("shaft_with_groove_and_bore", "turn", "steel1018")
    assert [t["id"] for t in r["tools"]] == ["turn-rough", "turn-finish", "bore-rough", "bore-finish", "groove-0.125"]
    assert _table(r) == [("distinct_tools", 5, 5.0)]


def test_off_axis_and_multi_axis():
    """turn_offaxis feeds off_axis; access (a feature needing 4/5-axis) feeds multi_axis."""
    assert _table(_run("slender_shaft", "turn", "steel1018")) == [("distinct_tools", 3, 3.0), ("off_axis", 1, 1.0),
                                                                   ("slender_parts", 1, 1.0)]
    assert _table(_run("angled_hole")) == [("multi_axis", 1, 1.0)]


def test_rules_to_drivers():
    """A deep bore (bore_depth, D-026) is a deep hole for cost; deep pockets, undercuts and slender turned parts have
    their own drivers (D-030); the two process warnings feed none."""
    findings = [{"id": f"F{n}", **f} for n, f in enumerate([
        {"rule": "bore_depth"}, {"rule": "hole_depth"}, {"rule": "turn_slender"}, {"rule": "pocket_depth"},
        {"rule": "undercut"}, {"rule": "looks_turned"}, {"rule": "turn_axis"}], 1)]
    got = drivers.cost_drivers(findings, [{}], [])
    assert [(d["driver"], d["count"]) for d in got] == [("deep_holes", 2), ("deep_pockets", 1), ("slender_parts", 1),
                                                        ("undercuts", 1)]


def test_small_tools_undersized_or_under_an_eighth():
    """Spec: undersized or sub-1/8 in tools. pocket_small_radius's 1/32 in end mill fits its 0.020 in corners (not
    undersized) but is under 1/8 in, so it counts; a 1/8 in tool and a tool with no diameter do not."""
    r = _run("pocket_small_radius")
    assert [(t["id"], t["undersized"]) for t in r["tools"]] == [("em-0.750", False), ("em-0.031", False)]
    assert ("small_tools", 1, 1.0) in _table(r)
    tools = [{"diameter_in": 0.125, "undersized": False}, {"diameter_in": None, "undersized": False},
             {"diameter_in": 0.5, "undersized": True}, {"diameter_in": 0.0625, "undersized": False}]
    got = {d["driver"]: d["count"] for d in drivers.cost_drivers([], [{}], tools)}
    assert got["small_tools"] == 2


def test_weight_scales_the_score_and_the_order(monkeypatch):
    """Score is count x weight, read from drivers.toml: a weight of 3 on odd_holes lifts a count of 1 to the top."""
    config = {k: dict(v) for k, v in settings.drivers_config().items()}
    config["odd_holes"]["weight"] = 3.0
    monkeypatch.setattr(settings, "drivers_config", lambda: config)
    got = drivers.cost_drivers([{"id": "F1", "rule": "hole_size"}, {"id": "F2", "rule": "hole_size"}], [{}], [])
    assert got == [{"driver": "odd_holes", "label": "Non-standard holes", "count": 2, "weight": 3.0, "score": 6.0,
                    "weight_source": "estimate", "findings": ["F1", "F2"]}]


def test_config_lists_the_drivers_each_labelled():
    """Spec: the nine driver names in drivers.toml, plus D-030's three; every starting weight 1.0 and labelled
    `estimate` (REP-01)."""
    config = settings.drivers_config()
    assert list(config) == ["extra_setups", "distinct_tools", "small_tools", "deep_holes", "odd_holes", "thin_walls",
                            "small_corners", "off_axis", "multi_axis", "deep_pockets", "undercuts", "slender_parts"]
    assert all(d["weight"] == 1.0 and d["source"] == "estimate" and d["label"] for d in config.values())
