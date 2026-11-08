"""pocket_depth: pocket depth / the diameter of the end mill that fits is over 3.0: medium (spec Rules)."""

from __future__ import annotations

from ..units import MM_PER_IN, fraction, past_limit

ID = "pocket_depth"
PROCESSES = ('mill',)  # spec Flow: which process runs this rule
EPS = 1e-9


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits.get(ID)
    if table is None:
        return []
    out = []
    for f in features:
        if f["kind"] != "pocket":
            continue
        dims = f["dims_mm"]
        ratio = dims["depth"] / dims["end_mill_mm"]
        if ratio <= table["medium"] + EPS:
            continue
        d_in = dims["end_mill_mm"] / MM_PER_IN
        tool = fraction(d_in) or f"{d_in:.3f}"
        suggestion = (f"Needs a long {tool} in end mill. Make the pocket shallower, or its corners and gaps larger, "
                      "if the design allows.")
        if dims["undersized"]:
            suggestion += " Smallest tool used: no end mill in the list fits the corners."
        out.append({"rule": ID, "severity": "medium",
                    "title": f"Pocket depth {past_limit(ratio, table['medium'], 1)}× the end mill that fits (limit {table['medium']:.1f}×)",
                    "measured": round(ratio, 4), "limit": table["medium"], "unit": "ratio",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": table["source"],
                    "suggestion": suggestion})
    return out


def passes(features: list[dict], part: dict, limits: dict) -> list[dict]:
    """The pockets this rule passed, with the math (D-023 proposed)."""
    table = limits.get(ID)
    if table is None:
        return []
    out = []
    for f in features:
        if f["kind"] != "pocket":
            continue
        dims = f["dims_mm"]
        ratio = dims["depth"] / dims["end_mill_mm"]
        if ratio > table["medium"] + EPS:
            continue
        d_in = dims["end_mill_mm"] / MM_PER_IN
        tool = fraction(d_in) or f"{d_in:.3f}"
        out.append({"rule": ID, "feature": f["id"], "faces": f["faces"], "threshold_source": table["source"],
                    "title": f"Depth {ratio:.1f}× the {tool} in end mill that fits, at most {table['medium']:.1f}×",
                    "math": f"{_fits(dims)}; {dims['depth'] / MM_PER_IN:.4f} in deep ÷ {d_in:.4f} in = {ratio:.2f}× "
                            f"≤ {table['medium']:.1f}×"})
    return out


def _fits(dims: dict) -> str:
    """Why this end mill: the largest whose radius fits the smallest corner and whose diameter fits the gap."""
    d_in = dims["end_mill_mm"] / MM_PER_IN
    parts = [f"radius {d_in / 2:.3f} in ≤ corner {dims['min_corner_radius'] / MM_PER_IN:.3f} in"]
    if "narrowest_width" in dims:
        parts.append(f"{d_in:.3f} in ≤ narrowest gap {dims['narrowest_width'] / MM_PER_IN:.3f} in")
    return "end mill " + ", ".join(parts)
