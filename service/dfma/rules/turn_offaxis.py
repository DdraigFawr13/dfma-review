"""turn_offaxis: a hole or pocket whose axis is not coaxial with the turning axis (within 0.5 deg, offset
0.001 in or less) is medium: "needs a milling operation or live tooling". It sets the machine to "lathe
with live tooling" (turning.py). The angle and offset come from features (`off_axis_deg`, `off_axis_mm`,
set by analyze for turned parts). A void sealed inside the part (no open end) is not judged."""

from __future__ import annotations

from ..features import COAX_DEG, COAX_OFFSET_MM
from ..units import MM_PER_IN

ID = "turn_offaxis"
PROCESSES = ("turn",)
KINDS = ("hole", "pocket")


def off_axis(f: dict) -> bool:
    return f["off_axis_deg"] > COAX_DEG or f["off_axis_mm"] > COAX_OFFSET_MM


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    out = []
    for f in features:
        if f["kind"] not in KINDS or "off_axis_deg" not in f or not f["open_vectors"] or not off_axis(f):
            continue
        what = "Hole" if f["kind"] == "hole" else "Pocket"
        angle, off = f["off_axis_deg"], f["off_axis_mm"] / MM_PER_IN
        tilted = angle > COAX_DEG
        out.append({"rule": ID, "severity": "medium",
                    "title": f"{what} not on the turning axis: needs a milling operation or live tooling",
                    "measured": round(angle if tilted else off, 4), "limit": COAX_DEG if tilted else 0.001,
                    "unit": "deg" if tilted else "in",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": "spec",
                    "suggestion": (f"{angle:.1f}° to the turning axis" if tilted else f"{off:.4f} in off the turning axis")
                                  + ". Cut it with live tooling "
                                  "on the lathe or in a second setup on a mill, or move it onto the axis if the "
                                  "design allows."})
    return out


def passes(features: list[dict], part: dict, limits: dict) -> list[dict]:
    out = []
    for f in features:
        if f["kind"] not in (*KINDS, "bore") or "off_axis_deg" not in f or off_axis(f):
            continue
        out.append({"rule": ID, "feature": f["id"], "faces": f["faces"], "threshold_source": "spec",
                    "title": "On the turning axis: cut on the lathe",
                    "math": f"{f['off_axis_deg']:.2f}° ≤ {COAX_DEG}° and "
                            f"{f['off_axis_mm'] / MM_PER_IN:.4f} in ≤ 0.001 in off the axis"})
    return out
