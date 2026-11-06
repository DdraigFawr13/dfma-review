"""pocket_depth: pocket depth / the diameter of the end mill that fits is over 3.0: medium (spec Rules)."""

from __future__ import annotations

from ..units import MM_PER_IN, fraction

ID = "pocket_depth"
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
                    "title": f"Pocket depth {ratio:.1f}× the end mill that fits (limit {table['medium']:.1f}×)",
                    "measured": round(ratio, 4), "limit": table["medium"], "unit": "ratio",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": table["source"],
                    "suggestion": suggestion})
    return out
