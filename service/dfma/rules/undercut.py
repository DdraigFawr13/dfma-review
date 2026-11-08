"""undercut: a pocket with an undercut (a lip over it, or a groove round its floor) is medium: it needs a
T-slot or lollipop cutter (D-021). Measured: how far the undercut reaches under the lip (`undercut_mm`)."""

from __future__ import annotations

from ..units import MM_PER_IN

ID = "undercut"
PROCESSES = ("mill",)  # as the other pocket rules (spec Flow)
EPS = 1e-9


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits.get(ID)
    if table is None:
        return []
    limit = table["max_in"]
    out = []
    for f in features:
        if f["kind"] != "pocket" or "undercut_mm" not in f["dims_mm"]:
            continue
        reach_in = f["dims_mm"]["undercut_mm"] / MM_PER_IN
        if reach_in <= limit + EPS:
            continue
        out.append({"rule": ID, "severity": "medium",
                    "title": f"Undercut reaches {reach_in:.3f} in sideways: needs a T-slot or lollipop cutter",
                    "measured": round(reach_in, 5), "limit": limit, "unit": "in",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": table["source"],
                    "suggestion": "Cut it with a T-slot or lollipop cutter that reaches this far, or open the undercut "
                                  "to the top or split the part, if the design allows."})
    return out


def passes(features: list[dict], part: dict, limits: dict) -> list[dict]:
    """The pockets this rule passed (D-023 proposed): no undercut, or one within the limit, the same test as
    check() turned round."""
    table = limits.get(ID)
    if table is None:
        return []
    limit = table["max_in"]
    out = []
    for f in features:
        if f["kind"] != "pocket":
            continue
        row = {"rule": ID, "feature": f["id"], "faces": f["faces"], "threshold_source": table["source"]}
        if "undercut_mm" not in f["dims_mm"]:
            out.append({**row, "title": "No undercut: a cutter reaches the whole floor from its open side",
                        "math": "no ceiling faces its floor, so nothing reaches under a lip"})
            continue
        reach_in = f["dims_mm"]["undercut_mm"] / MM_PER_IN
        if reach_in <= limit + EPS:
            out.append({**row, "title": f"Undercut {reach_in:.3f} in, within {limit:.3f} in",
                        "math": f"{reach_in:.4f} in ≤ {limit:.3f} in"})
    return out
