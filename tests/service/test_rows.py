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


# --- S2: the Features step's rows (spec J3, Design "Rows") ---

def covers_every_finding_once(result: dict) -> None:
    """Rows cover each finding exactly once, each row has a short title, and Fix rows come first."""
    ids = [i for r in result["rows"] for i in r["findings"]]
    assert sorted(ids) == sorted(f["id"] for f in result["findings"])
    assert len(ids) == len(set(ids))
    sev = [r["severity"] for r in result["rows"]]
    assert sev == sorted(sev, key=lambda s: s != "high")
    for r in result["rows"]:
        assert r["short"] and r["sentence"] and r["check"].endswith("check"), r
        assert r["id"] == f"row:{r['findings'][0]}"


def test_rows_report_sample():
    """Frame r3-features: 8 findings as 4 rows, Fix first, with the frame's sentences; Passed groups the 9 walls."""
    r = _run("report_sample")
    got = [(x["short"], x["count"], x["range"], x["sentence"], x["check"], x["limit"]) for x in r["rows"]]
    assert got == [
        ("Sharp corner", 4, "F4–F7", "Inside corners have no radius. Needs 0.031 in (1/32) or more, or EDM (spark erosion).",
         "Corner radius check", "limit is an estimate"),
        ("Deep hole", 2, "F1 F2", "9.6× and 7.2× the diameter deep. Over 6.0× needs peck drilling (drilling in short steps to clear chips).",
         "Hole depth check", "limit is an estimate"),
        ("Drill size", 1, "F3", "0.260 in isn't a standard drill. Nearest is 0.266 in (17/64).",
         "Hole size check", "drill list, within 0.0005 in"),
        ("Deep pocket", 1, "F8", "Depth is 8.0× the end mill that fits. Over 3.0× needs a long tool. "
         "Cut in 8 passes of 0.031 in (1/32).", "Pocket depth check", "limit is an estimate"),
    ]
    assert r["rows"][0]["id"] == "row:F4" and r["rows"][0]["features"] == ["corner-1", "corner-2", "corner-3", "corner-4"]
    covers_every_finding_once(r)
    walls = next(x for x in r["passed_rows"] if x["kind"] == "wall")
    assert (walls["short"], walls["count"], walls["check"], walls["severity"]) == ("Walls", 9, "Thin wall check", "ok")
    assert walls["id"] == "row:pass-wall-thin_wall" and walls["findings"] == []
    flagged = {f["feature"] for f in r["findings"]}
    assert not flagged & {f for x in r["passed_rows"] for f in x["features"]}


def _finding(n: int, rule: str, severity: str, measured: float, limit: float, unit: str, title: str = "") -> dict:
    return {"id": f"F{n}", "rule": rule, "severity": severity, "measured": measured, "limit": limit, "unit": unit,
            "title": title or f"{rule} {measured}", "feature": f"{rule}-{n}", "threshold_source": "estimate"}


CASES = [  # rule, severity, unit, limit, measured values for 4 findings (high to low not required)
    ("corner_radius", "high", "in", 0.03125, [0.0, 0.0, 0.0, 0.0]),
    ("corner_radius", "medium", "in", 0.03125, [0.02, 0.015, 0.01, 0.005]),
    ("corner_radius", "medium", "ratio", 4.0, [5.4, 6.0, 7.0, 8.0]),
    ("hole_depth", "medium", "ratio", 6.0, [7.2, 9.6, 6.4, 8.0]),
    ("hole_depth", "high", "ratio", 10.0, [12.0, 11.0, 15.0, 10.5]),
    ("hole_size", "medium", "in", 0.265625, [0.26, 0.262, 0.263, 0.264]),
    ("pocket_depth", "medium", "ratio", 3.0, [8.0, 4.0, 5.0, 6.0]),
    ("thin_wall", "medium", "in", 0.03, [0.02, 0.01, 0.015, 0.025]),
    ("undercut", "medium", "in", 0.0, [0.1, 0.2, 0.3, 0.4]),
    ("access", "high", "deg", 0.5, [22.0, 30.0, 45.0, 10.0]),
    ("looks_turned", "medium", "ratio", 0.9, [0.95, 0.95, 0.95, 0.95]),
    ("turn_axis", "high", "", 0.0, [1, 1, 1, 1]),
    ("turn_slender", "medium", "ratio", 4.0, [5.0, 6.0, 7.0, 8.0]),
    ("turn_offaxis", "high", "in", 0.0, [0.1, 0.2, 0.3, 0.4]),
    ("bore_depth", "medium", "ratio", 4.0, [5.0, 6.0, 7.0, 8.0]),
    ("thread_mismatch", "medium", "in", 0.000394, [0.004, 0.002, 0.001, 0.003]),
    ("hole_mismatch", "medium", "in", 0.000394, [0.004, 0.002, 0.001, 0.003]),
    ("blend_mismatch", "medium", "in", 0.000394, [0.004, 0.002, 0.001, 0.003]),
]


@pytest.mark.parametrize("n", [1, 2, 4])
@pytest.mark.parametrize("case", CASES, ids=lambda c: f"{c[0]}-{c[1]}-{c[2]}")
def test_every_case(case, n):
    """Each rule case on 1, 2 and 4 findings gives one row with a short title and a sentence that reads right."""
    rule, severity, unit, limit, values = case
    found = [_finding(k + 1, rule, severity, v, limit, unit, f"{rule} title {v}") for k, v in enumerate(values[:n])]
    [row] = rows.finding_rows(found)
    assert row["count"] == n and row["severity"] == severity and row["findings"] == [f["id"] for f in found]
    assert row["short"] == rows._lookup(rows.SHORTS, rule, severity)
    assert row["range"] == {1: "F1", 2: "F1 F2", 4: "F1–F4"}[n]
    assert row["features"] == [f["feature"] for f in found]
    s = row["sentence"]
    assert s.endswith(".") and "{" not in s, s
    has_own = rows._lookup(rows.SENTENCES, rule, severity) is not None
    distinct = len(set(values[:n]))
    if not has_own:
        worst = max(found, key=lambda f: f["measured"])["title"]
        assert s == (f"{worst}." if distinct == 1 else f"{worst}. Worst of {n}.")
    elif rule == "corner_radius":
        assert s.startswith("Inside corner" + ("s have" if n > 1 else " has"))
    elif distinct == 4:
        assert "from " in s and " to " in s
    elif distinct == 2:
        assert " and " in s


def test_join_and_values():
    assert rows.join_values(["a"]) == "a"
    assert rows.join_values(["a", "b"]) == "a and b"
    assert rows.join_values(["a", "b", "c"]) == "a, b and c"
    assert rows.join_values(["a", "b", "c", "d"]) == "from a to d"
    assert rows.value_text(0.03125, "in") == "0.031 in (1/32)"
    assert rows.value_text(6.03, "ratio", 6.0) == "6.03×"  # one decimal would read as the limit
    assert rows.value_text(9.6, "ratio", 6.0) == "9.6×"
    assert rows.value_text(22.0, "deg") == "22.0°"
    assert rows.id_range(["F1", "F3"]) == "F1 F3"
    assert rows.id_range(["F1", "F2", "F3"]) == "F1–F3"


def test_many_sentences_exact():
    """The `many` template with 2, 3 and 4 distinct values, high to low; ratios a hair past the limit get 2 decimals."""
    def row(vals, rule="hole_depth", limit=6.0, unit="ratio"):
        return rows.finding_rows([_finding(k + 1, rule, "medium", v, limit, unit) for k, v in enumerate(vals)])[0]["sentence"]
    assert row([7.2, 9.6]) == "9.6× and 7.2× the diameter deep. Over 6.0× needs peck drilling (drilling in short steps to clear chips)."
    assert row([7.2, 9.6, 6.03]) == "9.6×, 7.2× and 6.03× the diameter deep. Over 6.0× needs peck drilling (drilling in short steps to clear chips)."
    assert row([7.2, 9.6, 6.4, 8.0]) == "from 9.6× to 6.4× the diameter deep. Over 6.0× needs peck drilling (drilling in short steps to clear chips)."
    assert row([7.2, 7.2]) == "7.2× the diameter deep. Over 6.0× needs peck drilling (drilling in short steps to clear chips)."
    assert row([0.26, 0.262], "hole_size", 0.265625, "in") == ("0.262 in and 0.260 in aren't standard drills. "
                                                               "Nearest is 0.266 in (17/64).")
    assert row([8.0, 4.0], "pocket_depth", 3.0) == ("Depths are 8.0× and 4.0× the end mill that fits. "
                                                    "Over 3.0× needs a long tool.")
    one = rows.finding_rows([_finding(1, "corner_radius", "high", 0.0, 0.03125, "in")])[0]["sentence"]
    assert one == "Inside corner has no radius. Needs 0.031 in (1/32) or more, or EDM (spark erosion)."
    worst = rows.finding_rows([_finding(1, "undercut", "medium", 0.1, 0.0, "in", "Small undercut"),
                               _finding(2, "undercut", "medium", 0.4, 0.0, "in", "Big undercut")])[0]["sentence"]
    assert worst == "Big undercut. Worst of 2."


def test_rows_split_by_limit():
    """Drill size findings with different nearest drills are separate rows (limit is in the group key)."""
    found = [_finding(1, "hole_size", "medium", 0.26, 0.265625, "in"), _finding(2, "hole_size", "medium", 0.5, 0.5, "in")]
    assert [r["count"] for r in rows.finding_rows(found)] == [1, 1]


PARTS_READ = [p for p in sorted(PARTS.glob("*.step")) if p.stem not in ("no_solid", "not_step")]


@pytest.mark.parametrize("path", PARTS_READ, ids=lambda p: p.stem)
def test_parts(path):
    """Every part in tests/parts gives rows covering every finding once (the NIST files: test_nist.py)."""
    process = "turn" if any(k in path.stem for k in ("shaft", "as_turn")) else "mill"
    covers_every_finding_once(analyze(path, path.name, process, "al6061"))


def test_corner_pocket():
    """S3 (D-049): each inside corner names the pocket it sits in, so Machining shows it in that pocket's setup."""
    r = _run("report_sample")
    corners = [f for f in r["features"] if f["kind"] == "corner"]
    assert [c["pocket"] for c in corners] == ["pocket-1"] * 4
    pockets = {f["id"] for f in r["features"] if f["kind"] == "pocket"}
    for name in ("pocket_sharp", "pocket_island", "pocket_small_radius"):
        feats = _run(name)["features"]
        ids = {f["id"] for f in feats if f["kind"] == "pocket"}
        corners = [f for f in feats if f["kind"] == "corner"]
        assert corners and all(f["pocket"] in ids for f in corners), name
    assert pockets == {"pocket-1"}


def test_pocket_passes():
    """Morgan, 2026-11-09 (D-052): a deep pocket says how many passes at a safe depth it takes; the tool still reaches
    the full depth. report_sample's pocket: 0.250 in deep, 1/32 in end mill, 1× the tool per pass in aluminium."""
    r = _run("report_sample")
    [f] = [f for f in r["findings"] if f["rule"] == "pocket_depth"]
    assert (f["passes"], round(f["pass_in"], 4)) == (8, 0.0312)
    assert f["suggestion"].startswith("Cut it in 8 passes of 0.031 in (1/32) each (at most 1× the tool per pass, "
                                      "an estimate); the tool still reaches 0.250 in deep, so it is a long-reach "
                                      "1/32 in end mill.")
    stainless = analyze(PARTS / "report_sample.step", "report_sample.step", "mill", "ss304")
    [g] = [f for f in stainless["findings"] if f["rule"] == "pocket_depth"]
    assert g["passes"] == 16  # 0.5× the tool per pass in stainless
