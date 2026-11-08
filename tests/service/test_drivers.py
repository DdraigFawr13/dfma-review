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
    undersized; findings: 4 sharp corners, 2 deep holes (7.2 and 9.6), 1 odd hole, and a pocket_depth finding that
    feeds no driver. Ties on score sort by key (A to Z)."""
    r = _run("report_sample")
    assert _table(r) == [("distinct_tools", 4, 4.0), ("small_corners", 4, 4.0), ("deep_holes", 2, 2.0),
                         ("extra_setups", 1, 1.0), ("odd_holes", 1, 1.0), ("small_tools", 1, 1.0)]
    first = r["cost_drivers"][0]
    assert first == {"driver": "distinct_tools", "label": "Distinct tools", "count": 4, "weight": 1.0,
                     "score": 4.0, "weight_source": "estimate"}
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
    assert _table(_run("slender_shaft", "turn", "steel1018")) == [("distinct_tools", 3, 3.0), ("off_axis", 1, 1.0)]
    assert _table(_run("angled_hole")) == [("multi_axis", 1, 1.0)]


def test_bore_depth_counts_as_a_deep_hole():
    """A deep bore (bore_depth, D-026) is a deep hole for cost; other rules feed no driver."""
    findings = [{"rule": "bore_depth"}, {"rule": "hole_depth"}, {"rule": "turn_slender"}, {"rule": "pocket_depth"}]
    got = drivers.cost_drivers(findings, [{}], [])
    assert [(d["driver"], d["count"]) for d in got] == [("deep_holes", 2)]


def test_weight_scales_the_score_and_the_order(monkeypatch):
    """Score is count x weight, read from drivers.toml: a weight of 3 on odd_holes lifts a count of 1 to the top."""
    config = {k: dict(v) for k, v in settings.drivers_config().items()}
    config["odd_holes"]["weight"] = 3.0
    monkeypatch.setattr(settings, "drivers_config", lambda: config)
    got = drivers.cost_drivers([{"rule": "hole_size"}, {"rule": "hole_size"}], [{}], [])
    assert got == [{"driver": "odd_holes", "label": "Non-standard holes", "count": 2, "weight": 3.0, "score": 6.0,
                    "weight_source": "estimate"}]


def test_config_lists_the_nine_drivers_each_labelled():
    """Spec: the nine driver names in drivers.toml, every starting weight 1.0 and labelled `estimate` (REP-01)."""
    config = settings.drivers_config()
    assert list(config) == ["extra_setups", "distinct_tools", "small_tools", "deep_holes", "odd_holes", "thin_walls",
                            "small_corners", "off_axis", "multi_axis"]
    assert all(d["weight"] == 1.0 and d["source"] == "estimate" and d["label"] for d in config.values())
