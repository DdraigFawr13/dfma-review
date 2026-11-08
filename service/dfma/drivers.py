"""Cost drivers (spec "Cost drivers", S7): what makes a part cost more to make, each with a count, a weight
and a score (count x weight), ranked high to low. No time or dollars (D-003). The drivers, their labels and
weights, and which rules feed which driver are in config/drivers.toml; every starting weight is an estimate."""

from __future__ import annotations

from . import settings


def cost_drivers(findings: list[dict], setups: list[dict], tools: list[dict]) -> list[dict]:
    """The drivers with a count above 0: driver key, label, count, weight, score and where the weight
    came from; sorted by score (high first), then by key (A to Z)."""
    out = []
    for key, d in settings.drivers_config().items():
        how = d["count"]
        if how == "setups":
            count = max(len(setups) - 1, 0)
        elif how == "tools":
            count = len(tools)
        elif how == "small":  # spec: undersized or sub-1/8 in tools
            count = sum(1 for t in tools if t["undersized"]
                        or (t["diameter_in"] is not None and t["diameter_in"] < d["under_in"] - 1e-9))
        else:  # "findings"
            count = sum(1 for f in findings if f["rule"] in d["rules"])
        if count > 0:
            out.append({"driver": key, "label": d["label"], "count": count, "weight": float(d["weight"]),
                        "score": round(count * float(d["weight"]), 6), "weight_source": d["source"]})
    return sorted(out, key=lambda x: (-x["score"], x["driver"]))
