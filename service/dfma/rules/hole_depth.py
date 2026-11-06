"""hole_depth: depth / diameter over 6.0 is medium, over 10.0 is high (limits per material)."""

from __future__ import annotations

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
                    "title": f"Hole depth {ratio:.1f}× diameter (limit {limit:.1f}×)",
                    "measured": round(ratio, 4), "limit": limit, "unit": "ratio",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": table["source"],
                    "suggestion": SUGGESTION[severity]})
    return out
