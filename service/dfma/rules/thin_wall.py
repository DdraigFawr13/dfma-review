"""thin_wall: a wall thinner than the material's limit is high (spec Rules; S4 "Settled at build").

Limits: 0.030 in (al6061), 0.020 in (steel1018, ss304), 0.060 in (plastic), from config/thresholds.toml.
"""

from __future__ import annotations

from ..units import MM_PER_IN

ID = "thin_wall"
PROCESSES = ("mill", "turn")  # spec Flow: shared by both processes
EPS = 1e-9


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits.get(ID)
    if table is None:
        return []
    limit = table["min_in"]
    out = []
    for f in features:
        if f["kind"] != "wall":
            continue
        t_in = f["dims_mm"]["thickness"] / MM_PER_IN
        if t_in >= limit - EPS:  # "under 0.030 in": a wall that is 0.030 in to rounding is not under it
            continue
        shown = f"{t_in:.3f}"
        if shown == f"{limit:.3f}":  # 0.02996 in would read "0.030 in thick (limit 0.030 in)"
            shown = f"{t_in:.4f}"
        out.append({"rule": ID, "severity": "high",
                    "title": f"Wall {shown} in thick (limit {limit:.3f} in)",
                    "measured": round(t_in, 5), "limit": limit, "unit": "in",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": table["source"],
                    "suggestion": f"Make the wall {limit:.3f} in or thicker if the design allows."})
    return out


def passes(features: list[dict], part: dict, limits: dict) -> list[dict]:
    """The walls this rule passed, with the math (D-023 proposed)."""
    table = limits.get(ID)
    if table is None:
        return []
    limit = table["min_in"]
    out = []
    for f in features:
        if f["kind"] != "wall":
            continue
        t_in = f["dims_mm"]["thickness"] / MM_PER_IN
        if t_in < limit - EPS:
            continue
        out.append({"rule": ID, "feature": f["id"], "faces": f["faces"], "threshold_source": table["source"],
                    "title": f"{t_in:.3f} in thick, at least {limit:.3f} in",
                    "math": f"{t_in:.3f} in ≥ {limit:.3f} in"})
    return out
