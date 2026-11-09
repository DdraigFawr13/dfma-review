"""Hole features of an .ipt and their mapping onto the STEP's holes (spec I2+I3 Design "Hole features (measured)",
"Mapping (holes)"). Measured on the 16 NIST files with docs/research/inventor-i2-probe/s10.py, s11b.py, s29.py.

- A Hole feature is a feature id that is the last id of some face's hole tag; ids before it are its copiers.
- Its holes: its cylinder and cone faces grouped by axis line (axis to 4 decimals, the foot of the axis on
  the plane through the origin to 0.01 mm). Holes of one feature on one line stay one hole.
- Type: a cone of half-angle 59.0 +- 0.5 deg at the deep end is a drill point; any other cone makes a
  countersink; two or more cylinder diameters make a counterbore. Diameter = the smallest cylinder.
Everything is mm.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .. import settings
from . import sab, topo
from .surfaces import surface
from .tags import Tag

Vec = tuple[float, float, float]
DRILL_HALF_DEG, DRILL_TOL_DEG = 59.0, 0.5  # 118 deg drill point (the key's DrillPointAngle)
END_TOL_MM = 0.01  # a plane at a span end, two equal diameters
PARALLEL = 0.9999


@dataclass
class IptHole:
    start: Vec  # on the axis at the open end
    axis: Vec  # unit, from the open end into the material
    copied_by: list[int]  # copier feature ids in tag order; [] for a drawn hole
    faces: list[int]  # face record indices
    diameter_mm: float | None = None
    length_mm: float | None = None  # the whole span along the axis
    drill_length_mm: float | None = None  # the span of the smallest cylinder (compared with the STEP hole)
    drill_lo_mm: float | None = None  # where that cylinder starts, measured from `start` along `axis`
    through: bool = False
    type: str = "simple"
    point_deg: float | None = None
    cbore_diameter_mm: float | None = None
    cbore_depth_mm: float | None = None
    csink_diameter_mm: float | None = None
    csink_deg: float | None = None
    reason: str | None = None  # settings.MSG_FEATURE_BAD: the hole's faces could not be read


@dataclass
class HoleFeature:
    feature_id: int
    holes: list[IptHole] = field(default_factory=list)
    type: str = "simple"
    diameter_mm: float | None = None
    depth_mm: float | None = None
    length_mm: float | None = None
    through: bool = False
    point_deg: float | None = None
    cbore_diameter_mm: float | None = None
    cbore_depth_mm: float | None = None
    csink_diameter_mm: float | None = None
    csink_deg: float | None = None
    name: str | None = None  # S2
    reason: str | None = None


def _dot(a, b) -> float:
    return sum(a[k] * b[k] for k in range(3))


def _canon(a: Vec) -> Vec:
    for x in a:
        if abs(x) > 1e-9:
            return a if x > 0 else tuple(-y for y in a)
    return a


def _off(p: Vec, origin: Vec, axis: Vec) -> float:
    d = [p[k] - origin[k] for k in range(3)]
    t = _dot(d, axis)
    return math.sqrt(max(0.0, _dot(d, d) - t * t))


def _hole(recs, fl: list[tuple[int, object]], planes: list[tuple[int, object]], axis: Vec, foot: Vec,
          copied: list[int]) -> IptHole:
    """One hole from its cylinder and cone faces (fl) and its feature's plane faces."""
    faces = [f for f, _ in fl]
    try:
        pts = {f: topo.face_points(recs, f) for f, _ in fl}
    except topo.TopologyError:
        return IptHole(foot, axis, copied, faces, reason=settings.MSG_FEATURE_BAD)
    hs = [_dot(p, axis) for ps in pts.values() for p in ps]
    cyls = [(f, s) for f, s in fl if s.kind == "cyl"]
    if not hs or not cyls or any(not ps for ps in pts.values()):  # a face with no points can't be placed
        return IptHole(foot, axis, copied, faces, reason=settings.MSG_FEATURE_BAD)
    lo, hi = min(hs), max(hs)
    diams = sorted({round(2 * s.radius, 4) for _, s in cyls})
    groups: list[list[float]] = []
    for d in diams:  # equal within END_TOL_MM
        if groups and d - groups[-1][-1] <= END_TOL_MM:
            groups[-1].append(d)
        else:
            groups.append([d])
    small, large = groups[0][0], groups[-1][-1]

    def span(fs) -> tuple[float, float]:
        v = [_dot(p, axis) for f in fs for p in pts[f]]
        return min(v), max(v)

    small_faces = [f for f, s in cyls if 2 * s.radius <= small + END_TOL_MM]
    large_faces = [f for f, s in cyls if 2 * s.radius >= large - END_TOL_MM] if len(groups) > 1 else []
    drills, sinks = [], []
    for f, s in fl:
        if s.kind == "cone":
            (drills if abs(s.half_angle_deg - DRILL_HALF_DEG) <= DRILL_TOL_DEG else sinks).append((f, s))

    def near(h: float) -> str | None:
        if abs(h - lo) <= END_TOL_MM:
            return "lo"
        if abs(h - hi) <= END_TOL_MM:
            return "hi"
        return None

    # The deep end: the end with the drill-point cone, else a plane face of this feature across the axis there
    deep = None
    for f, _ in drills:
        a, b = span([f])
        deep = "hi" if abs(b - hi) < abs(a - lo) else "lo"
    if deep is None:
        for f, s in planes:
            if abs(abs(_dot(s.axis, axis)) - 1) > 1e-4:
                continue
            try:
                ps = topo.face_points(recs, f)
            except topo.TopologyError:
                continue
            # A bottom closes the hole: a disc whose points all lie on the hole's rim (an annulus, with a
            # smaller hole of another feature beyond it, does not close it, and the STEP agrees)
            if not ps or any(abs(_off(p, foot, axis) - small / 2) > END_TOL_MM for p in ps):
                continue
            if (e := near(_dot(ps[0], axis))) is not None:
                deep = e
                break
    # A drill point closes the hole only when it reaches its tip: CTC 04 Hole12 and Hole13's points are cut off
    # by a cavity 0.5 mm short of it, and the STEP reads them as through (2 of 76 drill points; build default, S1)
    tipped = any(min(_off(p, foot, axis) for p in pts[f]) <= END_TOL_MM for f, _ in drills if pts[f])
    through = deep is None or (bool(drills) and not tipped)
    if deep is None:  # through: the open end is where the counterbore or countersink sits
        wide = [f for f, _ in sinks] or large_faces
        if wide:
            a, b = span(wide)
            deep = "lo" if abs(b - hi) < abs(a - lo) else "hi"
        else:
            deep = "hi"
    sign = 1.0 if deep == "hi" else -1.0
    into = tuple(sign * x for x in axis)
    open_h = lo if deep == "hi" else hi
    feet = []
    for _, sf in fl:  # the line's foot from the faces themselves, not the rounded grouping key
        t0 = _dot(sf.origin, axis)
        feet.append(tuple(sf.origin[k] - t0 * axis[k] for k in range(3)))
    exact = tuple(sum(p[k] for p in feet) / len(feet) for k in range(3))
    start = tuple(exact[k] + open_h * axis[k] for k in range(3))
    a, b = span(small_faces)
    h = IptHole(start, into, copied, faces, diameter_mm=small, length_mm=hi - lo, drill_length_mm=b - a,
                drill_lo_mm=(a - lo) if deep == "hi" else (hi - b), through=through)
    if drills:
        h.point_deg = round(2 * drills[0][1].half_angle_deg, 4)
    if sinks:
        h.type = "countersink"
        h.csink_deg = round(2 * sinks[0][1].half_angle_deg, 4)
        h.csink_diameter_mm = 2 * max(_off(p, foot, axis) for f, _ in sinks for p in pts[f])
    elif large_faces:
        h.type = "counterbore"
    if large_faces:
        a, b = span(large_faces)
        h.cbore_diameter_mm, h.cbore_depth_mm = large, b - a
    return h


def _copiers(faces: list[tuple[int, list[int]]], run) -> list[int]:
    mine = {f for f, _ in run}
    out: list[int] = []
    for f, copied in faces:
        if f in mine:
            out.extend(c for c in copied if c not in out)
    return out


def _runs(recs, fl: list, axis: Vec) -> list[list]:
    """One hole per line, unless the line holds two or more drill-point cones (a hole and its mirror facing
    the other way, CTC 05 Hole3): then one hole per run of faces whose spans touch (build default, S1)."""
    drills = [f for f, s in fl if s.kind == "cone" and abs(s.half_angle_deg - DRILL_HALF_DEG) <= DRILL_TOL_DEG]
    if len(drills) < 2:
        return [fl]
    try:
        spans = [(min(v), max(v), f, s) for f, s in fl
                 if (v := [_dot(p, axis) for p in topo.face_points(recs, f)])]
    except topo.TopologyError:
        return [fl]
    if len(spans) != len(fl):
        return [fl]
    spans.sort(key=lambda x: x[0])
    runs, hi = [], None
    for lo, h, f, s in spans:
        if hi is None or lo > hi + END_TOL_MM:
            runs.append([])
        runs[-1].append((f, s))
        hi = h if hi is None else max(hi, h)
    return runs


def read_hole_features(recs: list[sab.Record], tags: dict[int, list[Tag]]) -> list[HoleFeature]:
    """Every Hole feature with a tagged face, in order of feature id; holes in order of start point."""
    by_feature: dict[int, list[tuple[int, list[int]]]] = {}
    for face, ts in tags.items():
        t = next((t for t in ts if t.kind == "hole"), None)
        if t is not None:
            by_feature.setdefault(t.ids[-1], []).append((face, list(t.ids[:-1])))
    out = []
    for fid in sorted(by_feature):
        feat = HoleFeature(fid)
        lines: dict[tuple, list] = {}
        planes = []
        for face, _ in by_feature[fid]:
            s = surface(recs, face)
            if s.kind == "plane":
                planes.append((face, s))
                continue
            if s.kind not in ("cyl", "cone"):
                continue
            ax = _canon(s.axis)
            t = _dot(s.origin, ax)
            foot = tuple(round(s.origin[k] - t * ax[k], 2) for k in range(3))
            key = (tuple(round(x, 4) for x in ax), foot)
            lines.setdefault(key, []).append((face, s))
        for (ax, foot), fl in lines.items():
            for run in _runs(recs, fl, ax):
                feat.holes.append(_hole(recs, run, planes, ax, foot, _copiers(by_feature[fid], run)))
        if not feat.holes:
            continue
        feat.holes.sort(key=lambda h: tuple(round(c, 4) for c in h.start))
        good = [h for h in feat.holes if h.reason is None]
        if not good:
            feat.reason = settings.MSG_FEATURE_BAD
        else:
            h = good[0]
            feat.type, feat.diameter_mm, feat.length_mm, feat.through = h.type, h.diameter_mm, h.length_mm, h.through
            feat.depth_mm = None if h.through else h.length_mm
            feat.point_deg, feat.csink_deg, feat.csink_diameter_mm = h.point_deg, h.csink_deg, h.csink_diameter_mm
            feat.cbore_diameter_mm, feat.cbore_depth_mm = h.cbore_diameter_mm, h.cbore_depth_mm
        out.append(feat)
    return out


# --- Mapping (spec "Mapping (holes)"; mm, raw STEP coordinates) ---

def _in_mm(mm: float) -> str:
    """'0.984 in [25.00 mm]': inches first, mm in brackets (D-005), as the Threads panel writes a gap."""
    return f"{mm / 25.4:.3f} in [{mm:.2f} mm]"


def _r4(v):
    return None if v is None else (round(v, 4) if isinstance(v, float) else [round(x, 4) for x in v])


def map_holes(features: list[HoleFeature], holes: list[dict], faces, transform=None) -> list[dict]:
    """The response's `inventor.hole_features` (spec "Response"). `holes` are the STEP hole and bore features
    (`map_threads`' list); each one an .ipt hole maps to (matched or disagreeing) gets `hole_feature`, the first
    such feature's id. `transform` = (rows, shift) is the test harness's (never the app path)."""
    from .threads import _apply, _hole_line, _off_line, _through
    tol = settings.PAIR_TOL_MM
    out = []
    for n, feat in enumerate(features, 1):
        fid = f"hf-{n}"
        rows = []
        for m, ih in enumerate(feat.holes, 1):
            start = _apply(transform, ih.start)
            axis = _apply(transform, ih.axis, vector=True)
            row = {"id": f"{fid}.{m}", "start": _r4(start), "axis": _r4(axis), "copied_by": list(ih.copied_by),
                   "state": "not_mapped", "hole": None, "gaps": [], "reason": None}
            rows.append(row)
            if ih.reason is not None:
                row["reason"] = ih.reason
                continue
            a = tuple(start[k] + ih.drill_lo_mm * axis[k] for k in range(3))  # the drill cylinder's span
            b = tuple(a[k] + ih.drill_length_mm * axis[k] for k in range(3))
            best = None
            for k, h in enumerate(holes):
                hit = _hole_line(h, faces, a, b)
                if hit is None:
                    continue
                c, overlap = hit
                if abs(sum(c.axis[q] * axis[q] for q in range(3))) < PARALLEL:
                    continue
                gap = max(_off_line(a, c.origin, c.axis), _off_line(b, c.origin, c.axis))
                if gap > c.radius_at(sum(a[q] * c.axis[q] for q in range(3))) + 1e-9:
                    continue
                key = (overlap, -k)
                if best is None or key > best[0]:
                    best = (key, h, gap)
            if best is None:
                row["reason"] = settings.MSG_NO_HOLE_ON_AXIS
                continue
            _, h, gap = best
            gaps = []
            if gap > tol:
                gaps.append({"what": "axis", "mm": round(gap, 4), "text": f"{_in_mm(gap)} off the hole's axis"})
            d = h["dims_mm"]["diameter"]
            if abs(d - ih.diameter_mm) > tol:
                gaps.append({"what": "diameter", "mm": round(abs(d - ih.diameter_mm), 4),
                             "text": f"Ø{_in_mm(ih.diameter_mm)} in the .ipt, Ø{_in_mm(d)} in the STEP"})
            step_through = not h["blind"] if "blind" in h else _through(h)  # every hole and bore carries `blind` (split_bores copies it); _through for older inputs
            depth = h["dims_mm"].get("max_depth", h["dims_mm"]["depth"])
            if ih.through != step_through:
                x = abs(ih.length_mm - depth)
                gaps.append({"what": "through", "mm": round(x, 4),
                             "text": "the .ipt hole is through, the STEP hole is blind" if ih.through
                             else "the .ipt hole is blind, the STEP hole is through"})
            elif not ih.through and abs(depth - ih.drill_length_mm) > tol:
                x = abs(depth - ih.drill_length_mm)
                gaps.append({"what": "depth", "mm": round(x, 4),
                             "text": f"the Ø{_in_mm(ih.diameter_mm)} section is {_in_mm(ih.drill_length_mm)} long in the "
                                     f".ipt, {_in_mm(depth)} in the STEP"})
            row["hole"], row["gaps"] = h["id"], gaps
            row["state"] = "disagrees" if gaps else "matched"
            h.setdefault("hole_feature", fid)
        st = [r["state"] for r in rows]
        state = "disagrees" if "disagrees" in st else ("not_mapped" if "not_mapped" in st else "matched")
        out.append({"id": fid, "feature_id": feat.feature_id, "name": feat.name, "type": feat.type,
                    "diameter_mm": _r4(feat.diameter_mm), "depth_mm": _r4(feat.depth_mm),
                    "length_mm": _r4(feat.length_mm), "through": feat.through, "point_deg": _r4(feat.point_deg),
                    "cbore_diameter_mm": _r4(feat.cbore_diameter_mm), "cbore_depth_mm": _r4(feat.cbore_depth_mm),
                    "csink_diameter_mm": _r4(feat.csink_diameter_mm), "csink_deg": _r4(feat.csink_deg),
                    "holes": rows, "state": state, "reason": feat.reason})
    return out
