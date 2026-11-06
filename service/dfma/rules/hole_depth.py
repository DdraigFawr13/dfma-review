"""hole_depth: depth / diameter over 6.0 is medium, over 10.0 is high (limits per material)."""

from __future__ import annotations

ID = "hole_depth"
SUGGESTION = {
    "medium": "Needs peck drilling. Make it shallower or larger if the design allows.",
    "high": "Needs a long drill and peck drilling. Make it shallower or larger if the design allows.",
}


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits[ID]
    out = []
    for f in features:
        if f["kind"] != "hole":
            continue
        ratio = f["dims_mm"]["depth"] / f["dims_mm"]["diameter"]
        if ratio > table["high"]:
            severity, limit = "high", table["high"]
        elif ratio > table["medium"]:
            severity, limit = "medium", table["medium"]
        else:
            continue
        out.append({"rule": ID, "severity": severity,
                    "title": f"Hole depth {ratio:.1f}× diameter (limit {limit:.1f}×)",
                    "measured": round(ratio, 4), "limit": limit, "unit": "ratio",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": table["source"],
                    "suggestion": SUGGESTION[severity]})
    return out
