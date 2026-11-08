"""turn_axis (spec Features "Turned profile"): uploaded for turning, but the axis carrying the most cylinder
and cone area holds under 40% of the part's face area (assumption): "No turning axis found; check the
process", high. Then only the shared rules run (analyze drops turn_slender and turn_offaxis)."""

from __future__ import annotations

from ..features import TURN_SHARE_MIN_PCT

ID = "turn_axis"
PROCESSES = ("turn",)


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    turn = part.get("turn")
    if turn is None or turn["share_pct"] + 1e-9 >= TURN_SHARE_MIN_PCT:
        return []
    share = turn["share_pct"]
    return [{"rule": ID, "severity": "high",
             "title": "No turning axis found; check the process",
             "measured": round(share, 4), "limit": TURN_SHARE_MIN_PCT, "unit": "%",
             "faces": turn["faces"] or list(range(part["face_count"])), "feature": None,
             "threshold_source": "assumption",
             "suggestion": f"Round faces on one axis are {share:.1f}% of this part's surface (a turned part needs "
                           f"{TURN_SHARE_MIN_PCT:.0f}% or more). Review it for milling instead."}]


def passes(features: list[dict], part: dict, limits: dict) -> list[dict]:
    out = []
    for f in features:
        if f["kind"] == "profile":
            share = f["dims_mm"]["share_pct"]
            out.append({"rule": ID, "feature": f["id"], "faces": f["faces"], "threshold_source": "assumption",
                        "title": "Round faces on one axis: a lathe part",
                        "math": f"{share:.1f}% of the surface is round on this axis ≥ {TURN_SHARE_MIN_PCT:.0f}%"})
    return out
