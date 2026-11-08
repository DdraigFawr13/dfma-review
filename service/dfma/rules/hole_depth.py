"""hole_depth: depth / diameter over 6.0 is medium, over 10.0 is high (limits per material)."""

from __future__ import annotations

from ..units import MM_PER_IN, past_limit

ID = "hole_depth"
PROCESSES = ('mill', 'turn')  # spec Flow: which process runs this rule
SUGGESTION = {
    "medium": "Needs peck drilling. Make it shallower or larger if the design allows.",
    "high": "Needs a long drill and peck drilling. Make it shallower or larger if the design allows.",
}


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits.get(ID)
    if table is None:
        return []
    out = []
    for f in features:
        if f["kind"] != "hole":
            continue
        ratio = f["dims_mm"]["depth"] / f["dims_mm"]["diameter"]
        eps = 1e-9  # "over 6.0": a ratio that is 6.0 to rounding is not over it
        if ratio > table["high"] + eps:
            severity, limit = "high", table["high"]
        elif ratio > table["medium"] + eps:
            severity, limit = "medium", table["medium"]
        else:
            continue
        out.append({"rule": ID, "severity": severity,
                    "title": f"Hole depth {past_limit(ratio, limit, 1)}× diameter (limit {limit:.1f}×)",
                    "measured": round(ratio, 4), "limit": limit, "unit": "ratio",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": table["source"],
                    "suggestion": SUGGESTION[severity] + _longest(f["dims_mm"])})
    return out


def _longest(dims: dict) -> str:
    """D-022: the depth is where the hole is round all the way; a sloped exit's longest side is shown too."""
    if "max_depth" not in dims:
        return ""
    return (f" Depth measured where the hole is round all the way ({dims['depth'] / MM_PER_IN:.3f} in); "
            f"its longest side is {dims['max_depth'] / MM_PER_IN:.3f} in.")


def passes(features: list[dict], part: dict, limits: dict) -> list[dict]:
    """The holes this rule passed, with the math (D-023 proposed: the "Passed" list)."""
    table = limits.get(ID)
    if table is None:
        return []
    out = []
    for f in features:
        if f["kind"] != "hole":
            continue
        d, depth = f["dims_mm"]["diameter"], f["dims_mm"]["depth"]
        ratio = depth / d
        if ratio > table["medium"] + 1e-9:
            continue
        out.append({"rule": ID, "feature": f["id"], "faces": f["faces"], "threshold_source": table["source"],
                    "title": f"Depth {ratio:.1f}× diameter, at most {table['medium']:.1f}×",
                    "math": f"{depth / MM_PER_IN:.4f} in deep ÷ {d / MM_PER_IN:.4f} in diameter = {ratio:.2f}× "
                            f"≤ {table['medium']:.1f}×"})
    return out
