"""access: a hole or pocket that opens along none of +-X +-Y +-Z of the part frame (within 0.5 deg) needs a 4/5-axis
mill or a fixture (spec Rules). A pocket is high. A hole is medium, and high when it also enters its flat face more than
0.5 deg off square (D-050, Morgan 2026-11-09); a hole with no flat face at an open end stays medium. Measured: the angle in degrees between its
nearest open vector and the nearest frame axis; limit 0.5. A hole keeps its own axis at every end, also
on a pocket floor (D-022). A feature with no open end (a void sealed inside the part) is not judged."""

from __future__ import annotations

import math

ID = "access"
PROCESSES = ("mill",)  # spec Flow: mill only
LIMIT_DEG = 0.5
SQUARE_DEG = 0.5  # D-050: how far off square a hole may enter its face; the same tolerance as the axes (assumption)
KINDS = ("hole", "pocket")


def _angle_to_axes(v, frame: dict) -> float:
    """Degrees between a vector and the nearest of +-X +-Y +-Z of the frame."""
    best = max(abs(sum(a * b for a, b in zip(v, frame[k]))) for k in ("x", "y", "z"))
    return math.degrees(math.acos(min(1.0, best)))


def check(features: list[dict], part: dict, limits: dict) -> list[dict]:
    frame = part["frame"]
    out = []
    for f in features:
        if f["kind"] not in KINDS or f["open_dirs"] or not f["open_vectors"]:
            continue
        angle = min(_angle_to_axes(v, frame) for v in f["open_vectors"])
        if angle <= LIMIT_DEG:  # open_dirs uses the same 0.5 deg; a rounding gap is not a finding
            continue
        entry = f.get("entry_deg")
        if f["kind"] == "hole" and entry is not None and entry > SQUARE_DEG:  # D-050: it enters its face at a slant
            out.append({"rule": ID, "severity": "high",
                        "title": f"Hole opens {angle:.1f}° off the part's axes and enters its face {entry:.1f}° off square: "
                                 "needs a 4/5-axis mill or a fixture, and the drill can walk",
                        "measured": round(entry, 3), "limit": SQUARE_DEG, "unit": "deg",
                        "faces": f["faces"], "feature": f["id"], "threshold_source": "assumption",
                        "suggestion": "Make it square to the face it starts from (a flat spot or boss there), "
                                      "or line it up with a face of the part."})
            continue
        what = "Hole" if f["kind"] == "hole" else "Pocket"
        out.append({"rule": ID, "severity": "medium" if f["kind"] == "hole" else "high",  # D-050
                    "title": f"{what} opens {angle:.1f}° off the part's axes: needs a 4/5-axis mill or a fixture",
                    "measured": round(angle, 3), "limit": LIMIT_DEG, "unit": "deg",
                    "faces": f["faces"], "feature": f["id"], "threshold_source": "spec",
                    "suggestion": "Line it up with a face of the part, or plan a 4/5-axis mill or an angled fixture."})
    return out


def passes(features: list[dict], part: dict, limits: dict) -> list[dict]:
    """The holes and pockets a 3-axis mill reaches (D-023 proposed)."""
    frame = part["frame"]
    out = []
    for f in features:
        if f["kind"] not in KINDS or not f["open_vectors"]:
            continue
        angle = min(_angle_to_axes(v, frame) for v in f["open_vectors"])
        if not f["open_dirs"]:  # check() flags it, or (within 0.5 deg to rounding) neither: never passed
            continue
        out.append({"rule": ID, "feature": f["id"], "faces": f["faces"], "threshold_source": "spec",
                    "title": f"Opens along {' and '.join(d.replace('-', '−') for d in f['open_dirs'])}: a 3-axis mill reaches it",
                    "math": f"{angle:.2f}° off the nearest axis ≤ {LIMIT_DEG}°"})
    return out
