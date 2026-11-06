"""corner_radius: one finding per inside corner, at the worst severity that applies; the title
names every reason (spec Rules; S3 "Settled at build").

- radius 0: high, "needs EDM or a corner radius"
- radius under min_radius_in (1/32 in): medium
- radius over 0 and pocket depth / the end mill that fits over max_depth_ratio: medium
"""

from __future__ import annotations

from ..units import MM_PER_IN, fmt_in

ID = "corner_radius"
PROCESSES = ('mill',)  # spec Flow: which process runs this rule
EPS = 1e-9
SHARP_MM = 1e-6
SUGGEST_SHARP = "Add a corner radius of 0.031 in (1/32) or more; a larger radius lets a larger end mill cut the pocket."
SUGGEST_SMALL = "Make the corner radius 0.031 in (1/32) or more if the design allows."
SUGGEST_TOOL = "Make the corner radius or the gap larger, or the pocket shallower, if the design allows."


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits.get(ID)
    if table is None:
        return []
    min_in = table["min_radius_in"]
    min_text = fmt_in(min_in, with_fraction=True)
    out = []
    for f in features:
        if f["kind"] != "corner":
            continue
        dims = f["dims_mm"]
        r_in = dims["radius"] / MM_PER_IN
        base = {"rule": ID, "faces": f["faces"], "feature": f["id"], "threshold_source": table["source"]}
        if dims["radius"] <= SHARP_MM:
            out.append({**base, "severity": "high", "title": "Sharp inside corner: needs EDM or a corner radius",
                        "measured": 0.0, "limit": min_in, "unit": "in", "suggestion": SUGGEST_SHARP})
            continue
        reasons = []  # (title part, measured, limit, unit, suggestion), radius reason first
        if r_in < min_in - EPS:
            reasons.append((f"Corner radius {fmt_in(r_in)} under {min_text}", round(r_in, 6), min_in, "in", SUGGEST_SMALL))
        ratio = dims["depth"] / dims["end_mill_mm"]
        if ratio > table["max_depth_ratio"] + EPS:
            text = f"the end mill that fits cuts {ratio:.1f}× its diameter deep (limit {table['max_depth_ratio']:.1f}×)"
            reasons.append((text, round(ratio, 4), table["max_depth_ratio"], "ratio", SUGGEST_TOOL))
        if not reasons:
            continue
        title = "; ".join(r[0] for r in reasons)
        if reasons[0][3] == "ratio":
            title = f"Corner radius {fmt_in(r_in)}: {title}"
        lead = reasons[0]
        out.append({**base, "severity": "medium", "title": title, "measured": lead[1], "limit": lead[2],
                    "unit": lead[3], "suggestion": " ".join(r[4] for r in reasons)})
    return out
