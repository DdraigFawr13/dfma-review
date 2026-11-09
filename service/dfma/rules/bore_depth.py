"""bore_depth (D-026): a bore's depth / its diameter, the boring bar's reach. Over 4.0 is medium (past a steel
bar's 4x: needs a carbide bar), over 6.0 is high (past a carbide bar's 6x: needs a damped bar). Sandvik
Coromant, turning application guide: steel 4x, carbide 6x, steel dampened 10x, carbide-reinforced dampened
14x bar diameter. Bores only; holes keep hole_depth."""

from __future__ import annotations

from ..units import MM_PER_IN, past_limit

ID = "bore_depth"
PROCESSES = ("turn",)
SUGGESTION = {
    "medium": "Past a steel boring bar's reach (4× its diameter): needs a carbide bar. Make it shallower or "
              "wider if the design allows.",
    "high": "Past a carbide boring bar's reach (6× its diameter): needs a damped bar. Make it shallower or "
            "wider if the design allows.",
}


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits.get(ID)
    out = []
    for f in features:
        if f["kind"] != "bore" or table is None:
            continue
        ratio = f["dims_mm"]["depth"] / f["dims_mm"]["diameter"]
        if ratio > table["high"] + 1e-9:
            severity, limit = "high", table["high"]
        elif ratio > table["medium"] + 1e-9:
            severity, limit = "medium", table["medium"]
        else:
            continue
        out.append({"rule": ID, "severity": severity,
                    "title": f"Bore depth {past_limit(ratio, limit, 1)}× diameter (limit {limit:.1f}×)",
                    "measured": round(ratio, 4), "limit": limit, "unit": "ratio",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": table["source"],
                    "suggestion": SUGGESTION[severity]})
    return out


def passes(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits.get(ID)
    out = []
    for f in features:
        if f["kind"] != "bore" or table is None:
            continue
        d, depth = f["dims_mm"]["diameter"], f["dims_mm"]["depth"]
        ratio = depth / d
        if ratio > table["medium"] + 1e-9:
            continue
        out.append({"rule": ID, "feature": f["id"], "faces": f["faces"], "threshold_source": table["source"],
                    "title": f"Bore depth {ratio:.1f}× diameter, at most {table['medium']:.1f}×: a steel boring bar reaches",
                    "math": f"{depth / MM_PER_IN:.3f} in deep ÷ {d / MM_PER_IN:.3f} in diameter = {ratio:.2f}× "
                            f"≤ {table['medium']:.1f}×"})
    return out
