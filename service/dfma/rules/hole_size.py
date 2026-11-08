"""hole_size: a diameter that matches no drill within 0.0005 in is medium (spec Rules, D-010). A tapered
hole (D-018 tapered-holes round) is reamed to its taper, so no drill size applies to it."""

from __future__ import annotations

from ..tools import drill_range_mm, match_tolerance_mm, nearest_drill
from ..units import MM_PER_IN, fmt_in

ID = "hole_size"
PROCESSES = ('mill', 'turn')  # spec Flow: which process runs this rule


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    units = part["units_in_file"]
    tol = match_tolerance_mm()
    _, top = drill_range_mm(units)
    out = []
    for f in features:
        if f["kind"] != "hole":
            continue
        d = f["dims_mm"]["diameter"]
        if f["dims_mm"].get("taper_deg"):  # a tapered hole is reamed to its taper, not drilled to a size
            continue
        if d > top + tol:  # above the drill range: milled with an end mill instead (D-010)
            continue
        drill = nearest_drill(d, units)
        if abs(d - drill.diameter_mm) <= tol:
            continue
        drill_in = drill.diameter_mm / MM_PER_IN
        if drill.metric:
            nearest = f"Nearest drill {drill.label} ({drill_in:.3f} in)."
        else:
            nearest = f"Nearest drill {fmt_in(drill_in, with_fraction=True)}.".replace(" in (", " in (", 1)
        out.append({"rule": ID, "severity": "medium",
                    "title": f"Hole {fmt_in(d / MM_PER_IN, with_fraction=True)} not a standard drill size",
                    "measured": round(d / MM_PER_IN, 6), "limit": round(drill_in, 6), "unit": "in",
                    "faces": f["faces"], "feature": f["id"],
                    "threshold_source": "drill list in config/tools.toml",
                    "suggestion": f"{nearest} Use it if the fit allows."})
    return out


def passes(features: list[dict], part: dict, limits: dict) -> list[dict]:
    """The holes this rule passed or did not judge, and why (D-023 proposed)."""
    units = part["units_in_file"]
    tol = match_tolerance_mm()
    _, top = drill_range_mm(units)
    out = []
    for f in features:
        if f["kind"] != "hole":
            continue
        d = f["dims_mm"]["diameter"]
        row = {"rule": ID, "feature": f["id"], "faces": f["faces"], "threshold_source": "drill list in config/tools.toml"}
        if f["dims_mm"].get("taper_deg"):
            out.append({**row, "title": "Tapered: reamed, so no drill size applies",
                        "math": f"taper {f['dims_mm']['taper_deg']:.2f}° a side"})
            continue
        if d > top + tol:
            out.append({**row, "title": "Above the drill range: cut with an end mill",
                        "math": f"{d / MM_PER_IN:.3f} in > largest drill {top / MM_PER_IN:.3f} in"})
            continue
        drill = nearest_drill(d, units)
        gap = abs(d - drill.diameter_mm)
        if gap > tol:
            continue
        name = drill.label if drill.metric else fmt_in(drill.diameter_mm / MM_PER_IN, with_fraction=True)
        out.append({**row, "title": f"Standard drill: {name}",
                    "math": f"|{d / MM_PER_IN:.4f} − {drill.diameter_mm / MM_PER_IN:.4f}| = {gap / MM_PER_IN:.4f} in "
                            f"≤ {tol / MM_PER_IN:.4f} in"})
    return out
