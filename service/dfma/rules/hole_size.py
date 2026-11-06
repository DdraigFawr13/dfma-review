"""hole_size: a diameter that matches no drill within 0.0005 in is medium (spec Rules, D-010)."""

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
