"""turn_slender: the turned profile's length / its largest outside diameter over 4.0 is medium, over 8.0
is high (limits per material, config/thresholds.toml; spec Rules)."""

from __future__ import annotations

from ..units import MM_PER_IN, past_limit

ID = "turn_slender"
PROCESSES = ("turn",)
SUGGESTION = {
    "medium": "Support the free end with a tailstock centre (the part then needs a centre hole), "
              "or make it shorter or thicker if the design allows.",
    "high": "Needs a tailstock and a steady rest, or a Swiss-type lathe. Make it shorter or thicker if the "
            "design allows.",
}


def _ratio(f: dict) -> float:
    return f["dims_mm"]["length"] / f["dims_mm"]["diameter"]


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits.get(ID)
    out = []
    for f in features:
        if f["kind"] != "profile" or table is None:
            continue
        ratio = _ratio(f)
        if ratio > table["high"] + 1e-9:
            severity, limit = "high", table["high"]
        elif ratio > table["medium"] + 1e-9:
            severity, limit = "medium", table["medium"]
        else:
            continue
        out.append({"rule": ID, "severity": severity,
                    "title": f"Length {past_limit(ratio, limit, 1)}× diameter (limit {limit:.1f}×)",
                    "measured": round(ratio, 4), "limit": limit, "unit": "ratio",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": table["source"],
                    "suggestion": SUGGESTION[severity]})
    return out


def passes(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits.get(ID)
    out = []
    for f in features:
        if f["kind"] != "profile" or table is None:
            continue
        ratio = _ratio(f)
        if ratio > table["medium"] + 1e-9:
            continue
        d, length = f["dims_mm"]["diameter"], f["dims_mm"]["length"]
        out.append({"rule": ID, "feature": f["id"], "faces": f["faces"], "threshold_source": table["source"],
                    "title": f"Length {ratio:.1f}× diameter, at most {table['medium']:.1f}×",
                    "math": f"{length / MM_PER_IN:.4f} in long ÷ {d / MM_PER_IN:.4f} in diameter = {ratio:.2f}× "
                            f"≤ {table['medium']:.1f}×"})
    return out
