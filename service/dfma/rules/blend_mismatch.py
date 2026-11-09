"""blend_mismatch: a fillet whose radius disagrees with the STEP face at its place (spec I2+I3 Design "Mapping
(blends)", D-039 Open question 3). One medium finding per `disagrees` blend; runs only when an .ipt was read
(analyze NEEDS_IPT), last in RULES. Chamfers never disagree: their sizes are not compared (S3 build default)."""

from __future__ import annotations

from .. import settings
from ..units import mm_to_in
from .thread_mismatch import CAUSE, SOURCE

ID = "blend_mismatch"
PROCESSES = ("mill", "turn")
SUGGESTION = "Export the STEP again from this .ipt, or check this fillet in Inventor."


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    out = []
    for b in part.get("inventor_blends") or []:
        if b["state"] != "disagrees":
            continue
        gaps = "; ".join(g["text"] for g in b["gaps"])
        worst = max(g["mm"] for g in b["gaps"])
        out.append({"rule": ID, "severity": "medium",
                    "title": f"Fillet {b['id']}: {gaps}. Possible cause: {CAUSE}",
                    "measured": round(mm_to_in(worst), 6), "limit": round(mm_to_in(settings.PAIR_TOL_MM), 6),
                    "unit": "in", "faces": list(b["step_faces"]), "feature": b["id"],
                    "threshold_source": SOURCE, "suggestion": SUGGESTION, "blend": b["id"]})
    return out
