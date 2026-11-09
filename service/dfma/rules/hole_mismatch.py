"""hole_mismatch: an .ipt hole that disagrees with the STEP hole it sits on (spec I2+I3 Design "Parts", D-032).
One medium finding per `disagrees` hole; runs only when an .ipt was read (analyze NEEDS_IPT), after
thread_mismatch, and skips a STEP hole that already has a thread_mismatch finding (one finding per hole)."""

from __future__ import annotations

from .. import settings
from ..units import mm_to_in
from .thread_mismatch import CAUSE, SOURCE

ID = "hole_mismatch"
PROCESSES = ("mill", "turn")
SUGGESTION = "Export the STEP again from this .ipt, or check this Hole feature in Inventor."


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    by_id = {f["id"]: f for f in features}
    threaded = {t["hole"] for t in part.get("inventor_threads") or [] if t["state"] == "disagrees"}
    out = []
    for hf in part.get("inventor_holes") or []:
        label = hf["name"] or f"Hole feature {hf['id']}"
        for h in hf["holes"]:
            if h["state"] != "disagrees" or h["hole"] not in by_id or h["hole"] in threaded:
                continue
            gaps = "; ".join(g["text"] for g in h["gaps"])
            worst = max(g["mm"] for g in h["gaps"])
            out.append({"rule": ID, "severity": "medium",
                        "title": f"{label} hole on {h['hole']}: {gaps}. Possible cause: {CAUSE}",
                        "measured": round(mm_to_in(worst), 6), "limit": round(mm_to_in(settings.PAIR_TOL_MM), 6),
                        "unit": "in", "faces": by_id[h["hole"]]["faces"], "feature": h["hole"],
                        "threshold_source": SOURCE, "suggestion": SUGGESTION, "hole_feature": hf["id"],
                        "ipt_hole": h["id"]})
    return out
