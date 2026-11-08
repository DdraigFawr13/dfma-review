"""turn_slender: the turned profile's length / its smallest outside diameter (D-026; the spec's largest
diameter let a thin neck behind a big head read as stocky) over the medium limit is medium (3.0 for the
steels, 4.0 for aluminium and plastic, D-025), over 8.0 is high. The suggestion names the support the
ratio needs (D-026, CADEM thumb rules; Swiss-type over 10x, Wevolver)."""

from __future__ import annotations

import math

from ..units import MM_PER_IN, past_limit

ID = "turn_slender"
PROCESSES = ("turn",)
SAME_MM = 0.001  # a profile whose smallest and largest diameters differ less than this has one diameter


def support(ratio: float) -> str:
    """The support a turned part of this length / diameter needs (CADEM: chuck only under 3x, tailstock 3-6x,
    steady rest 6-12x, one holding point per 3x; Wevolver: Swiss-type practically required over 10x)."""
    if ratio <= 3.0:
        return "A chuck alone holds it."
    if ratio <= 6.0:
        return "Support the free end with a tailstock centre; the part then needs a centre hole."
    if ratio <= 12.0:
        return "Needs a tailstock and a steady rest, or a Swiss-type lathe."
    return (f"Needs a tailstock and {math.ceil(ratio / 3) - 2} steady rests ({math.ceil(ratio / 3)} holding points), "
            "or a Swiss-type lathe.")


def _ratio(f: dict) -> tuple[float, float, bool]:
    """(ratio, the diameter it divides by, whether the profile has more than one diameter)."""
    d = f["dims_mm"]
    smallest = d.get("min_diameter", d["diameter"])
    return d["length"] / smallest, smallest, d["diameter"] - smallest > SAME_MM


def _what(stepped: bool, d_mm: float) -> str:
    return f"its smallest diameter, {d_mm / MM_PER_IN:.3f} in" if stepped else "diameter"


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits.get(ID)
    out = []
    for f in features:
        if f["kind"] != "profile" or table is None:
            continue
        ratio, d, stepped = _ratio(f)
        if ratio > table["high"] + 1e-9:
            severity, limit = "high", table["high"]
        elif ratio > table["medium"] + 1e-9:
            severity, limit = "medium", table["medium"]
        else:
            continue
        what = "diameter" if not stepped else f"its smallest diameter ({d / MM_PER_IN:.3f} in)"
        out.append({"rule": ID, "severity": severity,
                    "title": f"Length {past_limit(ratio, limit, 1)}× {what} (limit {limit:.1f}×)",
                    "measured": round(ratio, 4), "limit": limit, "unit": "ratio",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": table["source"],
                    "suggestion": support(ratio) + " Make it shorter or thicker if the design allows."})
    return out


def passes(features: list[dict], part: dict, limits: dict) -> list[dict]:
    table = limits.get(ID)
    out = []
    for f in features:
        if f["kind"] != "profile" or table is None:
            continue
        ratio, d, stepped = _ratio(f)
        if ratio > table["medium"] + 1e-9:
            continue
        length = f["dims_mm"]["length"]
        out.append({"rule": ID, "feature": f["id"], "faces": f["faces"], "threshold_source": table["source"],
                    "title": f"Length {ratio:.1f}× {_what(stepped, d)}, at most {table['medium']:.1f}×",
                    "math": f"{length / MM_PER_IN:.4f} in long ÷ {d / MM_PER_IN:.4f} in "
                            f"{'smallest ' if stepped else ''}diameter = {ratio:.2f}× ≤ {table['medium']:.1f}×"})
    return out
