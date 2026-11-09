"""Review-steps S1 (spec docs/specs/review-steps.md, D-045): check names, limit sources in plain words, the cost
total and each cost driver's findings."""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

import pytest

from helpers import PARTS, ROOT

from dfma import drivers, rows
from dfma.analyze import analyze
from dfma.rules import RULES

RULE_DIR = ROOT / "service" / "dfma" / "rules"


def _run(name: str, process: str = "mill", material: str = "al6061") -> dict:
    return analyze(PARTS / f"{name}.step", f"{name}.step", process, material)


def _sources() -> set[str]:
    """Every threshold_source the rules can give: literals and SOURCE constants in the rule modules, and every
    table's `source` in config/thresholds.toml."""
    found: set[str] = set()
    for path in RULE_DIR.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        found |= set(re.findall(r'"threshold_source":\s*"([^"]+)"', text))
        found |= set(re.findall(r'^SOURCE\s*=\s*"([^"]+)"', text, re.M))
    tables = tomllib.loads((ROOT / "config" / "thresholds.toml").read_text(encoding="utf-8"))

    def walk(node):
        if isinstance(node, dict):
            if isinstance(node.get("source"), str):
                found.add(node["source"])
            for v in node.values():
                walk(v)
    walk(tables)
    return found


def test_limit_text():
    """Every source the rules give has plain words, with no decision ids or file names; any other source fails."""
    sources = _sources()
    assert {"estimate", "assumption", "spec", "drill list in config/tools.toml", "D-032: the .ipt and STEP must agree",
            "D-021", "D-025", "D-026 (Sandvik)"} <= sources
    for s in sources:
        assert s in rows.LIMITS, s
        text = rows.limit_text(s)
        assert not re.search(r"D-\d|config/|\.toml", text), (s, text)
    assert rows.limit_text("estimate") == "limit is an estimate"
    assert rows.limit_text("drill list in config/tools.toml") == "drill list, within 0.0005 in"
    assert rows.limit_text("D-026 (Sandvik)") == "limit from Sandvik's tables"
    assert "D-999" not in rows.LIMITS
    assert rows.limit_text("shop table") == "limit: shop table"  # a source a manager added shows as given


def test_check_names():
    """Every rule in RULES has a check name ending in "check"; the spec's table for a few."""
    for rule in RULES:
        assert rows.check_name(rule.ID).endswith(" check"), rule.ID
    assert rows.check_name("corner_radius") == "Corner radius check"
    assert rows.check_name("looks_turned") == "Process check"
    assert rows.check_name("hole_mismatch") == ".ipt check"
    assert rows.checks_run(["turn_axis", "turn_slender", "turn_offaxis"]) == ["Turning axis check", "Length to diameter check"]
    with pytest.raises(KeyError):
        rows.check_name("no_such_rule")


def test_words_in_the_response():
    """Findings and passes carry their limit in words, findings their check; the response lists the checks run."""
    r = _run("report_sample")
    assert r["checks_run"] == ["Hole depth check", "Hole size check", "Corner radius check", "Pocket depth check",
                               "Undercut check", "Thin wall check", "Access check", "Process check"]
    for f in r["findings"]:
        assert f["limit_text"] == rows.limit_text(f["threshold_source"]) and f["check"] == rows.check_name(f["rule"])
    for p in r["passed"]:
        assert p["limit_text"] == rows.limit_text(p["threshold_source"])
    hole_size = next(f for f in r["findings"] if f["rule"] == "hole_size")
    assert hole_size["limit_text"] == "drill list, within 0.0005 in"


def test_cost_total():
    """report_sample: 4 + 4 + 2 + 1 + 1 + 1 + 1 = 14.0 (frame r3-cost); no drivers: None; rounded to 0.1."""
    assert _run("report_sample")["cost_total"] == 14.0
    assert rows.cost_total([]) is None
    assert rows.cost_total([{"score": 0.3333}, {"score": 1.0}]) == 1.3
    assert _run("box_through_hole")["cost_total"] == 1.0


def test_driver_findings():
    """A findings driver lists the F ids of the findings it counts; setups, tools and small tools list none."""
    r = _run("report_sample")
    got = {d["driver"]: d["findings"] for d in r["cost_drivers"]}
    assert got == {"distinct_tools": [], "small_corners": ["F4", "F5", "F6", "F7"], "deep_holes": ["F1", "F2"],
                   "deep_pockets": ["F8"], "extra_setups": [], "odd_holes": ["F3"], "small_tools": []}
    for d in r["cost_drivers"]:
        assert len(d["findings"]) in (0, d["count"])
    findings = [{"id": "F1", "rule": "hole_depth"}, {"id": "F2", "rule": "looks_turned"}, {"id": "F3", "rule": "bore_depth"}]
    [deep] = drivers.cost_drivers(findings, [{}], [])
    assert deep["findings"] == ["F1", "F3"]
