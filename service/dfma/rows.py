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
