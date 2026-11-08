"""Thread records of an .ipt, and their mapping onto the STEP's holes (spec I1 Design "Thread records", "Mapping").

Layouts measured on the 16 thread records of the NIST files (CTC 04, FTC 10 2021 and 2024), 2026-11-08:
- Inventor 2021 names the record `NMx_Thread_Entity-NamingMatching-attrib`; Inventor 2024 writes an
  `ATTRIB_CUSTOM-attrib` whose first string is `INV_NMX_THREAD_TAG`.
- Its 4th pointer is the threaded `face`. Its first two vectors are two points whose distance is the thread
  depth; they are the same for every thread of one hole feature (a pattern), so they don't place the thread.
  Its second-last vector is the thread's start, on the threaded face's axis (0.0000 mm off on all 16), and its
  last vector the axis, pointing into the material: the thread runs from start to start + depth x axis.
- Its strings after the tag: nominal size, designation, standard, '', '', class, pitch, then seven limits.
  Reading of the seven (inference: the M12 and M3 numbers match ISO 6H limits): major min, major max, pitch min,
  pitch max, minor min, minor max, tap drill.
Lengths in the model are cm; everything here is mm.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .. import settings
from . import sab

THREAD_2021 = "NMx_Thread_Entity"
THREAD_2024_TAG = "INV_NMX_THREAD_TAG"
NOT_UNDERSTOOD = "thread record not understood"
PARALLEL = 0.9999  # |dot| of two axes taken as parallel (spec "Mapping")

Vec = tuple[float, float, float]


@dataclass
class Thread:
    id: str
    designation: str | None
    cls: str | None
    standard: str | None
    pitch_mm: float | None
    depth_mm: float | None
    tap_drill_mm: float | None
    minor_mm: list[float] | None  # [min, max]
    major_mm: list[float] | None
    start: Vec | None
    end: Vec | None
    axis: Vec | None
    face: str  # the threaded face: "hole" (a concave cylinder), "shaft", "cone" or "other"
    reason: str | None = None  # set when the record did not parse: the thread is then not_mapped


def _num(s: str) -> float | None:
    try:
        v = float(s)
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def _face_kind(recs: list[sab.Record], face: int) -> str:
    """hole / shaft / cone / other, from the face's surface record and its sense flag.

    A `cone-surface` whose sine of half-angle (its 2nd float) is 0 is a cylinder. A concave (hole) face is
    stored reversed: the face's first bool is True on all 16 NIST threads, which are all in holes.
    Assumption (no sample): a thread on a shaft has that bool False."""
    s = next((q for p in recs[face].of("p") if (q := sab.ref(recs, p, suffix="surface")) is not None), None)
    if s is None or not (recs[s].name or "").startswith("cone"):
        return "other"
    ds = recs[s].of("d")
    if len(ds) < 2 or not isinstance(ds[1], float):
        return "other"
    if abs(ds[1]) > 1e-9:
        return "cone"
    bs = recs[face].of("b")
    return "hole" if bs and bs[0] else "shaft"


def _is_thread(r: sab.Record) -> tuple[bool, list[str]]:
    name, s = r.name or "", r.of("s")
    if name.startswith(THREAD_2021):
        return True, s
    if "ATTRIB_CUSTOM" in name and s and s[0] == THREAD_2024_TAG:
        return True, s[1:]
    return False, s


def read_threads(recs: list[sab.Record]) -> list[Thread]:
    """Every thread record of the main model, in record order, as thread-1, thread-2, ..."""
    out = []
    for r in recs:
        ok, s = _is_thread(r)
        if not ok:
            continue
        tid = f"thread-{len(out) + 1}"
        ptrs = r.of("p")
        face = sab.ref(recs, ptrs[3], "face") if len(ptrs) > 3 else None
        kind = _face_kind(recs, face) if face is not None else "other"
        vs = [v for v in r.of("v") if isinstance(v, tuple) and len(v) == 3]
        nums = [_num(x) for x in s[7:14]] if len(s) >= 14 else []
        t = Thread(tid, s[1] if len(s) > 1 else None, s[5] if len(s) > 5 else None, s[2] if len(s) > 2 else None,
                   _num(s[6]) if len(s) > 6 else None, None, None, None, None, None, None, None, kind)
        if len(vs) < 4 or len(nums) != 7 or any(n is None for n in nums):
            t.reason = NOT_UNDERSTOOD
            out.append(t)
            continue
        maj0, maj1, p0, p1, min0, min1, tap = nums
        depth = 10.0 * math.dist(vs[0], vs[1])
        axis = vs[-1]
        n = math.sqrt(sum(a * a for a in axis))
        if not (maj0 <= maj1 and p0 <= p1 and min0 <= min1 and min1 < maj0) or n < 1e-9 or depth <= 0:
            t.reason = NOT_UNDERSTOOD
            out.append(t)
            continue
        axis = tuple(a / n for a in axis)
        start = tuple(10.0 * c for c in vs[-2])
        t.depth_mm, t.tap_drill_mm = round(depth, 4), tap
        t.minor_mm, t.major_mm = [min0, min1], [maj0, maj1]
        t.start, t.axis = start, axis
        t.end = tuple(start[k] + depth * axis[k] for k in range(3))
        out.append(t)
    return out


# --- Mapping (spec "Mapping"; mm, raw STEP coordinates) ---

def _apply(transform, p: Vec, vector: bool = False) -> Vec:
    if transform is None:
        return p
    rows, shift = transform
    q = tuple(sum(rows[r][c] * p[c] for c in range(3)) for r in range(3))
    return q if vector else tuple(q[k] + shift[k] for k in range(3))


def _dot(a, b) -> float:
    return sum(a[k] * b[k] for k in range(3))


def _off_line(p: Vec, origin: Vec, axis: Vec) -> float:
    d = [p[k] - origin[k] for k in range(3)]
    t = _dot(d, axis)
    return math.sqrt(max(0.0, _dot(d, d) - t * t))


def _through(hole: dict) -> bool:
    """Open at both ends: two opening vectors pointing opposite ways."""
    vs = hole.get("open_vectors") or []
    return any(_dot(a, b) < -PARALLEL for i, a in enumerate(vs) for b in vs[i + 1:])


def _hole_line(hole: dict, faces, start: Vec, end: Vec):
    """(Cyl, overlap mm) of the hole's cylinder face that overlaps the thread's span most, or None."""
    from ..features import _cylinder
    best = None
    for i in hole["faces"]:
        c = _cylinder(i, faces[i], tapers=True)
        if c is None:
            continue
        a, b = sorted((_dot(start, c.axis), _dot(end, c.axis)))
        overlap = max(0.0, min(b, c.hi) - max(a, c.lo))
        if best is None or overlap > best[1] + 1e-9:
            best = (c, overlap)
    return best


def _block(t: Thread, start, end, axis) -> dict:
    r = (lambda v: [round(x, 4) for x in v]) if start is not None else (lambda v: None)
    return {"id": t.id, "designation": t.designation, "class": t.cls, "standard": t.standard,
            "pitch_mm": t.pitch_mm, "depth_mm": t.depth_mm, "tap_drill_mm": t.tap_drill_mm,
            "minor_mm": t.minor_mm, "major_mm": t.major_mm,
            "start": r(start), "end": r(end), "axis": r(axis) if axis is not None else None,
            "state": "not_mapped", "hole": None, "gaps": [], "reason": None, "feature_name": None}


def map_threads(threads: list[Thread], holes: list[dict], faces, transform=None) -> list[dict]:
    """The response's thread list (spec "Response"). `holes` are hole and bore features (in id order); each
    hole a thread is mapped to (matched or disagreeing) gets a `thread` list of those ids; other holes get none. `transform` = (rows, shift) is
    applied to every .ipt point and vector first (test harness only)."""
    tol = settings.PAIR_TOL_MM
    out = []
    for t in threads:
        start = _apply(transform, t.start) if t.start is not None else None
        end = _apply(transform, t.end) if t.end is not None else None
        axis = _apply(transform, t.axis, vector=True) if t.axis is not None else None
        b = _block(t, start, end, axis)
        out.append(b)
        if t.reason is not None:
            b["reason"] = t.reason
            continue
        if t.face == "shaft":
            b["reason"] = "external thread: not on a hole"
            continue
        if t.face == "cone":
            b["reason"] = "tapered thread: not supported yet"
            continue
        if t.face != "hole":
            b["reason"] = "the threaded face is not a cylinder"
            continue
        best = None  # (overlap, -index, hole, line, gap)
        for n, h in enumerate(holes):
            hit = _hole_line(h, faces, start, end)
            if hit is None:
                continue
            c, overlap = hit
            if abs(_dot(c.axis, axis)) < PARALLEL:
                continue
            gap = max(_off_line(start, c.origin, c.axis), _off_line(end, c.origin, c.axis))
            if gap > c.radius_at(_dot(start, c.axis)) + 1e-9:
                continue
            key = (overlap, -n)
            if best is None or key > best[0]:
                best = (key, h, c, gap)
        if best is None:
            b["reason"] = "no hole on this thread's axis"
            continue
        _, h, c, gap = best
        gaps = []
        if gap > tol:
            gaps.append({"what": "axis", "mm": round(gap, 4), "text": f"{gap:.2f} mm off the hole's axis"})
        d = h["dims_mm"]["diameter"]
        if d > t.major_mm[0] + tol:
            x = d - t.major_mm[0]
            gaps.append({"what": "diameter", "mm": round(x, 4),
                         "text": f"hole Ø{d:.2f} is {x:.2f} mm over the thread's major diameter"})
        elif d < t.minor_mm[0] - tol:
            x = t.minor_mm[0] - d
            gaps.append({"what": "diameter", "mm": round(x, 4),
                         "text": f"hole Ø{d:.2f} is {x:.2f} mm under the thread's minor diameter"})
        depth = h["dims_mm"].get("max_depth", h["dims_mm"]["depth"])
        if not _through(h) and t.depth_mm > depth + tol:
            gaps.append({"what": "depth", "mm": round(t.depth_mm - depth, 4),
                         "text": f"thread {t.depth_mm:.2f} deep in a {depth:.2f} hole"})
        b["hole"] = h["id"]
        b["gaps"] = gaps
        b["state"] = "disagrees" if gaps else "matched"
        h.setdefault("thread", []).append(t.id)
    return out
