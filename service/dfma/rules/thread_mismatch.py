"""thread_mismatch: a thread in the .ipt that disagrees with the STEP hole it sits on (spec I1 Design "Parts",
D-032). One medium finding per `disagrees` thread; runs only when an .ipt was read (analyze NEEDS_IPT)."""

from __future__ import annotations

from .. import settings
from ..units import mm_to_in

ID = "thread_mismatch"
PROCESSES = ("mill", "turn")
SOURCE = "D-032: the .ipt and STEP must agree"
SUGGESTION = "Export the STEP again from this .ipt, or check this thread in Inventor."
CAUSE = "the part or an old STEP export differs from the .ipt"


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    by_id = {f["id"]: f for f in features}
    out = []
    for t in part.get("inventor_threads") or []:
        if t["state"] != "disagrees" or t["hole"] not in by_id:
            continue
        gaps = "; ".join(g["text"] for g in t["gaps"])
        worst = max(g["mm"] for g in t["gaps"])
        out.append({"rule": ID, "severity": "medium",
                    "title": f"{t['designation']} thread on {t['hole']}: {gaps}. Possible cause: {CAUSE}",
                    "measured": round(mm_to_in(worst), 6), "limit": round(mm_to_in(settings.PAIR_TOL_MM), 6),
                    "unit": "in", "faces": by_id[t["hole"]]["faces"], "feature": t["hole"],
                    "threshold_source": SOURCE, "suggestion": SUGGESTION, "thread": t["id"]})
    return out
