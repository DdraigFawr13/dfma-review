"""Plain words for the review screen (review-steps spec "Rows", D-045): the check each rule runs and where its
limit comes from, worded for a reader, with no decision ids or file names. S1 holds `check_name` and
`limit_text`; S2 adds the rows themselves."""

from __future__ import annotations

# The check each rule runs (spec "Short titles and check names", approved with the spec, D-045)
CHECKS = {
    "corner_radius": "Corner radius check",
    "hole_depth": "Hole depth check",
    "hole_size": "Hole size check",
    "pocket_depth": "Pocket depth check",
    "thin_wall": "Thin wall check",
    "undercut": "Undercut check",
    "access": "Access check",
    "looks_turned": "Process check",
    "turn_axis": "Turning axis check",
    "turn_slender": "Length to diameter check",
    "turn_offaxis": "Turning axis check",
    "bore_depth": "Bore depth check",
    "thread_mismatch": ".ipt check",
    "hole_mismatch": ".ipt check",
    "blend_mismatch": ".ipt check",  # after #27
}

# Where a limit comes from, in the reader's words (spec "Limit source")
LIMITS = {
    "estimate": "limit is an estimate",
    "assumption": "limit is an assumption",
    "spec": "limit from the spec",
    "drill list in config/tools.toml": "drill list, within 0.0005 in",
    "D-032: the .ipt and STEP must agree": "the .ipt and STEP must agree within 0.01 mm",
    "D-021": "limit Morgan approved",
    "D-025": "limit Morgan approved",
    "D-026 (Sandvik)": "limit from Sandvik's tables",
}


def check_name(rule: str) -> str:
    """"Hole depth check" for "hole_depth"; a rule missing from CHECKS is a build error, caught by test_rows."""
    return CHECKS[rule]


def limit_text(source: str) -> str:
    """"limit is an estimate" for "estimate". A source a shop manager writes into thresholds.toml that LIMITS lacks
    shows as given ("limit: shop table"); test_rows fails on any such source in the repo."""
    return LIMITS.get(source, f"limit: {source}")


def checks_run(rules_run: list[str]) -> list[str]:
    """The check names of the rules run, in run order, each once (two rules can share a check)."""
    return list(dict.fromkeys(check_name(r) for r in rules_run))


def cost_total(drivers: list[dict]) -> float | None:
    """The sum of the drivers' scores to one decimal, or None when there are no drivers (spec Builder defaults)."""
    return round(sum(d["score"] for d in drivers), 1) if drivers else None


# --- S2: the Features step's rows (spec Design "Rows") ---

from .units import fmt_in, past_limit  # noqa: E402

# Short titles by rule and case (spec "Short titles and check names"); a case is the severity, and for
# corner_radius medium also its unit ("in": a small radius; "ratio": a corner too deep for its radius).
SHORTS = {
    ("corner_radius", "high"): "Sharp corner",
    ("corner_radius", "medium"): "Small corner radius",
    "hole_depth": "Deep hole",
    "hole_size": "Drill size",
    "pocket_depth": "Deep pocket",
    "thin_wall": "Thin wall",
    "undercut": "Undercut",
    "access": "Angled feature",
    "looks_turned": "Looks turned",
    "turn_axis": "No turning axis",
    "turn_slender": "Slender part",
    "turn_offaxis": "Off the turning axis",
    "bore_depth": "Deep bore",
    "thread_mismatch": "Thread vs hole",
    "hole_mismatch": "Hole feature vs hole",
    "blend_mismatch": "Fillet vs face",
}

# Sentences for the four rule cases that have their own (spec "Sentences"): one finding, several findings.
# Every other case reads as its finding's title (D-045).
SENTENCES = {
    ("corner_radius", "high"): ("Inside corner has no radius. Needs {limit} or more, or EDM (spark erosion).",
                                "Inside corners have no radius. Needs {limit} or more, or EDM (spark erosion)."),
    "hole_depth": ("{measured} the diameter deep. Over {limit} needs peck drilling (drilling in short steps to clear chips).",
                   "{values} the diameter deep. Over {limit} needs peck drilling (drilling in short steps to clear chips)."),
    "hole_size": ("{measured} isn't a standard drill. Nearest is {limit}.",
                  "{values} aren't standard drills. Nearest is {limit}."),
    "pocket_depth": ("Depth is {measured} the end mill that fits. Over {limit} needs a long tool.",
                     "Depths are {values} the end mill that fits. Over {limit} needs a long tool."),
}


def _case(f: dict) -> tuple:
    """A finding's rule case: its severity, and for corner_radius medium also its unit."""
    if f["rule"] == "corner_radius" and f["severity"] == "medium":
        return (f["severity"], f.get("unit"))
    return (f["severity"],)


def _lookup(table: dict, rule: str, severity: str):
    return table.get((rule, severity), table.get(rule))


def value_text(value: float, unit: str | None, other: float | None = None) -> str:
    """A measured value or limit in words: "0.031 in (1/32)", "9.6×" (two decimals when one would read the same as
    `other`, the limit), "22.0°", else the number and unit as given."""
    if unit == "in":
        return fmt_in(value, True)
    if unit == "ratio":
        return f"{past_limit(value, other, 1) if other is not None else f'{value:.1f}'}×"
    if unit == "deg":
        return f"{value:.1f}°"
    return f"{value:g} {unit}" if unit else f"{value:g}"


def join_values(values: list[str]) -> str:
    """"a and b", "a, b and c", "from a to z" (4 or more)."""
    if len(values) == 1:
        return values[0]
    if len(values) == 2:
        return f"{values[0]} and {values[1]}"
    if len(values) == 3:
        return f"{values[0]}, {values[1]} and {values[2]}"
    return f"from {values[0]} to {values[-1]}"


def id_range(ids: list[str]) -> str:
    """"F4–F7" for a run of three or more ids without a gap, else the ids with spaces (D-047; words.ts idRange)."""
    nums = [int(i.lstrip("F")) for i in ids]
    run = len(ids) >= 3 and all(n == nums[k - 1] + 1 for k, n in enumerate(nums) if k)
    return f"{ids[0]}–{ids[-1]}" if run else " ".join(ids)


def _passes(group: list[dict]) -> str:
    """" Cut in 8 passes of 0.031 in (1/32)." for deep pockets that all take the same passes (D-052), else ""."""
    found = {(f.get("passes"), round(f.get("pass_in") or 0, 4)) for f in group}
    if len(found) != 1 or group[0].get("passes") is None:
        return ""
    n, step = found.pop()
    return f" Cut in {n} {'pass' if n == 1 else 'passes'} of {fmt_in(step, True)}."


def _one(f: dict) -> str:
    templates = _lookup(SENTENCES, f["rule"], f["severity"])
    if templates is None:
        return f"{f['title']}."
    unit = f.get("unit")
    return templates[0].format(measured=value_text(f["measured"], unit, f["limit"]),
                               limit=value_text(f["limit"], unit)) + _passes([f])


def _sentence(group: list[dict]) -> str:
    """One finding: its sentence. Several: the `many` template with the distinct values high to low (the frame's
    "Inside corners have no radius" for 4); a case with no template: the shared title, else the worst finding's title
    and "Worst of n."."""
    first = group[0]
    templates = _lookup(SENTENCES, first["rule"], first["severity"])
    if len(group) == 1:
        return _one(first)
    if templates is None:
        titles = {f["title"] for f in group}
        if len(titles) == 1:
            return f"{titles.pop()}."
        worst = max(group, key=lambda f: f["measured"])
        return f"{worst['title']}. Worst of {len(group)}."
    unit = first.get("unit")
    ordered = sorted({f["measured"] for f in group}, reverse=True)
    values = list(dict.fromkeys(value_text(v, unit, first["limit"]) for v in ordered))
    return templates[1].format(values=join_values(values), limit=value_text(first["limit"], unit)) + _passes(group)


def finding_rows(findings: list[dict]) -> list[dict]:
    """Findings grouped into rows: the same rule, case, severity and limit form one row, in F-id order; rows in order
    of their first F id, Fix rows first."""
    groups: dict[tuple, list[dict]] = {}
    for f in sorted(findings, key=lambda f: int(f["id"][1:])):
        groups.setdefault((f["rule"], _case(f), f["severity"], f.get("limit")), []).append(f)
    out = []
    for (rule, _, severity, _), group in groups.items():
        ids = [f["id"] for f in group]
        out.append({
            "id": f"row:{ids[0]}",
            "rule": rule,
            "severity": severity,
            "short": _lookup(SHORTS, rule, severity),
            "count": len(group),
            "findings": ids,
            "range": id_range(ids),
            "sentence": _sentence(group),
            "check": check_name(rule),
            "limit": limit_text(group[0]["threshold_source"]),
            "features": list(dict.fromkeys(f["feature"] for f in group if f.get("feature"))),
        })
    out.sort(key=lambda r: (r["severity"] != "high", int(r["findings"][0][1:])))
    return out


def passed_rows(features: list[dict], findings: list[dict], passed: list[dict]) -> list[dict]:
    """Features with no finding that passed a check, grouped by kind and rule ("Walls ×9", Thin wall check)."""
    flagged = {f.get("feature") for f in findings}
    kinds = {x["id"]: x["kind"] for x in features}
    groups: dict[tuple, list[dict]] = {}
    for p in passed:
        if p["feature"] in flagged or p["feature"] not in kinds:
            continue
        groups.setdefault((kinds[p["feature"]], p["rule"]), []).append(p)
    out = []
    for (kind, rule), group in groups.items():
        feats = list(dict.fromkeys(p["feature"] for p in group))
        out.append({
            "id": f"row:pass-{kind}-{rule}",
            "rule": rule,
            "severity": "ok",
            "kind": kind,
            "short": f"{kind.capitalize()}s",
            "count": len(feats),
            "findings": [],
            "range": "",
            "sentence": group[0]["title"],
            "check": check_name(rule),
            "limit": limit_text(group[0]["threshold_source"]),
            "features": feats,
        })
    return out
