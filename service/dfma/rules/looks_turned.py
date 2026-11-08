"""looks_turned (D-028, mill only): the mirror of turn_axis. Reviewed for milling, but round faces on one axis
are 40% or more of the part's surface: "This part looks turned; review it for Turning", high. The mill plan
does not plan outside profiles, grooves or bores (assumptions), so a turned part reviewed for milling would
otherwise show a short plan with no warning (Morgan, 2026-11-08)."""

from __future__ import annotations

from ..features import TURN_SHARE_MIN_PCT

ID = "looks_turned"
PROCESSES = ("mill",)


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    turn = part.get("turn")
    if turn is None or turn["share_pct"] + 1e-9 < TURN_SHARE_MIN_PCT:
        return []
    share = turn["share_pct"]
    return [{"rule": ID, "severity": "high",
             "title": "This part looks turned; review it for Turning",
             "measured": round(share, 4), "limit": TURN_SHARE_MIN_PCT, "unit": "%",
             "faces": turn["faces"], "feature": None, "threshold_source": "assumption",
             "suggestion": f"Round faces on one axis are {share:.1f}% of this part's surface ({TURN_SHARE_MIN_PCT:.0f}% "
                           "or more reads as a lathe part). The milling plan leaves out its outside, grooves and "
                           "bores; pick Turning to plan them."}]
