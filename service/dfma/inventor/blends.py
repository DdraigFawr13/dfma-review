"""Fillets and chamfers of an .ipt and their mapping onto the STEP's faces (spec I2+I3 Design "Blends (measured)",
"Mapping (blends)"). Measured on the 16 NIST files with docs/research/inventor-i2-probe/s14.py, s15.py, s17.py.

- A blend feature is the last id of a face's blend tag; ids before it are the pattern or mirror features that
  copied the face, as on hole tags (measured at build, 2026-11-09: CTC 04's (3233, 3193) faces all have Fillet
  3193's 5 mm radius; with the last id the blend counts equal the `Fillet<n>` / `Chamfer<n>` names on every plain
  file that has them: CTC 01 4 + 2, CTC 02 12, CTC 04 7 + 1, CTC 05 2 + 1, FTC 06, 08, 10 and 11. The spec's
  "corner patch, kept with the first id" gave CTC 04 9 blends for 8 names).
- Fillet: all its faces are cylinders, tori or spheres of one radius within 0.001 mm, or splines (they carry
  none). Chamfer: every face a plane or a cone of half-angle 10 to 80 deg (CTC 04's chamfer has 12 of each).
  Else not mapped (`blend shape not understood`): a blend of spline faces only (CTC 02, 4), a 2 deg cone (CTC 02).
- Chamfer distances: plane chamfer from its two neighbour planes with the longest shared edges; cone chamfer
  [radial, axial]. A chamfer's size comes from its first face, in record order, that gives one (all faces agree on NIST).
Everything is mm.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .. import settings
from . import sab, topo
from .surfaces import Surf, surface
from .tags import Tag
from .threads import _apply

Vec = tuple[float, float, float]
RADIUS_TOL_MM = 0.001  # one fillet radius (spec)
CHAMFER_CONE_DEG = (10.0, 80.0)  # a cone chamfer's half-angle (spec); outside it the blend is not understood
PARALLEL = 1 - 1e-6  # |cos| of two axes or normals that count as parallel (as the probe, s15.py)
FILLET_KINDS = ("cyl", "torus", "sphere")
BOX_MARGIN_MM = 1.0  # a face's vertex centre may sit this far outside its STEP face's box (NIST pairs differ by
# up to 0.06 mm; the box only tells faces in different places apart)


@dataclass
class Blend:
    feature_id: int
    kind: str | None = None  # "fillet" | "chamfer"; None when not understood
    radius_mm: float | None = None
    distances_mm: list[float] | None = None
    angle_deg: float | None = None
    faces: list[int] = field(default_factory=list)  # face record indices, copies included
    copied_by: list[int] = field(default_factory=list)  # copier feature ids in tag order
    surfs: dict = field(default_factory=dict)  # face -> Surf
    points: dict = field(default_factory=dict)  # face -> its vertex points ([] when they can't be read)
    reason: str | None = None


def _dot(a, b) -> float:
    return sum(a[k] * b[k] for k in range(3))


def _sub(a, b) -> Vec:
    return tuple(a[k] - b[k] for k in range(3))


def _cross(a, b) -> Vec:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _off(p: Vec, origin: Vec, axis: Vec) -> float:
    d = _sub(p, origin)
    t = _dot(d, axis)
    return math.sqrt(max(0.0, _dot(d, d) - t * t))


def _fillet_radius(s: Surf) -> float | None:
    return s.minor if s.kind == "torus" else (s.radius if s.kind in ("cyl", "sphere") else None)


def _length(pts: list[Vec]) -> float:
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(0, len(pts) - 1, 2))


def _plane_chamfer(recs, face: int) -> tuple[list[float], float] | None:
    """[d1, d2] and the angle between the two neighbour planes; None when they aren't two planes at an angle."""
    try:
        nbs = topo.neighbours(recs, face)
    except topo.TopologyError:
        return None
    planes = [(n, pts, surface(recs, n)) for n, pts in nbs.items()]
    planes = sorted(((n, pts, s) for n, pts, s in planes if s.kind == "plane" and pts),
                    key=lambda x: -_length(x[1]))[:2]
    if len(planes) < 2:
        return None
    (_, pa, a), (_, pb, b) = planes
    if _dot(_cross(a.axis, b.axis), _cross(a.axis, b.axis)) < 1e-12:
        return None  # parallel neighbours (sheet-metal edges on CTC 03, FTC 09)
    ang = math.degrees(math.acos(max(-1.0, min(1.0, abs(_dot(a.axis, b.axis))))))
    sin = math.sin(math.radians(ang))
    da = max(abs(_dot(_sub(p, b.origin), b.axis)) for p in pa) / sin
    db = max(abs(_dot(_sub(p, a.origin), a.axis)) for p in pb) / sin
    return [da, db], ang  # acos |cos| of the two planes: 90 on a square edge (every NIST chamfer)


def _cone_chamfer(recs, face: int, s: Surf) -> list[float] | None:
    try:
        pts = topo.face_points(recs, face)
    except topo.TopologyError:
        return None
    if not pts:
        return None
    h = [_dot(_sub(p, s.origin), s.axis) for p in pts]
    r = [_off(p, s.origin, s.axis) for p in pts]
    return [max(r) - min(r), max(h) - min(h)]


def _size(recs, b: Blend) -> None:
    surfs = [b.surfs[f] for f in b.faces]
    kinds = {s.kind for s in surfs} - {"other"}  # spline faces carry no size
    if kinds and kinds <= set(FILLET_KINDS):
        radii = [_fillet_radius(s) for s in surfs if s.kind in FILLET_KINDS]
        if max(radii) - min(radii) <= RADIUS_TOL_MM:
            b.kind, b.radius_mm = "fillet", radii[0]
            return
    elif kinds and kinds <= {"plane", "cone"} and all(
            CHAMFER_CONE_DEG[0] <= s.half_angle_deg <= CHAMFER_CONE_DEG[1] for s in surfs if s.kind == "cone"):
        b.kind = "chamfer"
        for f in b.faces:
            s = b.surfs[f]
            if s.kind == "plane" and (got := _plane_chamfer(recs, f)) is not None:
                b.distances_mm, b.angle_deg = got
                return
            if s.kind == "cone" and (got := _cone_chamfer(recs, f, s)) is not None:
                b.distances_mm = got
                return
        b.reason = settings.MSG_CHAMFER_NEIGHBOURS
        return
    b.reason = settings.MSG_BLEND_SHAPE


def read_blends(recs: list[sab.Record], tags: dict[int, list[Tag]]) -> list[Blend]:
    """Every blend feature with a tagged face, in order of feature id."""
    by_id: dict[int, Blend] = {}
    for face in sorted(tags):
        t = next((t for t in tags[face] if t.kind == "blend"), None)
        if t is None:
            continue
        b = by_id.setdefault(t.ids[-1], Blend(t.ids[-1]))
        b.faces.append(face)
        b.surfs[face] = surface(recs, face)
        try:
            pts = topo.face_points(recs, face)
        except topo.TopologyError:
            pts = []
        b.points[face] = pts
        b.copied_by.extend(c for c in t.ids[:-1] if c not in b.copied_by)
    out = []
    for fid in sorted(by_id):
        _size(recs, by_id[fid])
        out.append(by_id[fid])
    return out


# --- Mapping (spec "Mapping (blends)"; mm, raw STEP coordinates) ---

def step_surfaces(faces) -> list[Surf]:
    """The surface under each STEP face, in the same terms as an .ipt face (Surf); `other` for the rest."""
    from OCC.Core.BRepAdaptor import BRepAdaptor_Surface
    from OCC.Core.GeomAbs import GeomAbs_Cone, GeomAbs_Cylinder, GeomAbs_Plane, GeomAbs_Sphere, GeomAbs_Torus

    def p(x):
        return (x.X(), x.Y(), x.Z())

    out = []
    for f in faces:
        a = BRepAdaptor_Surface(f)
        t = a.GetType()
        if t == GeomAbs_Plane:
            g = a.Plane()
            out.append(Surf("plane", p(g.Location()), p(g.Axis().Direction())))
        elif t == GeomAbs_Cylinder:
            g = a.Cylinder()
            out.append(Surf("cyl", p(g.Location()), p(g.Axis().Direction()), g.Radius()))
        elif t == GeomAbs_Cone:
            g = a.Cone()
            out.append(Surf("cone", p(g.Location()), p(g.Axis().Direction()), g.RefRadius(),
                            half_angle_deg=math.degrees(abs(g.SemiAngle()))))
        elif t == GeomAbs_Torus:
            g = a.Torus()
            out.append(Surf("torus", p(g.Location()), p(g.Axis().Direction()), g.MajorRadius(), g.MinorRadius()))
        elif t == GeomAbs_Sphere:
            g = a.Sphere()
            out.append(Surf("sphere", p(g.Location()), None, g.Radius()))
        else:
            out.append(Surf("other"))
    return out


def step_boxes(faces) -> list[tuple[Vec, Vec]]:
    """Each STEP face's bounding box (lo, hi corners, mm)."""
    from OCC.Core.Bnd import Bnd_Box
    from OCC.Core.BRepBndLib import brepbndlib
    out = []
    for f in faces:
        box = Bnd_Box()
        brepbndlib.Add(f, box)
        x0, y0, z0, x1, y1, z1 = box.Get()
        out.append(((x0, y0, z0), (x1, y1, z1)))
    return out


def _inside(p: Vec, box: tuple[Vec, Vec], tol: float) -> bool:
    return all(box[0][k] - tol <= p[k] <= box[1][k] + tol for k in range(3))


def _moved(s: Surf, transform) -> Surf:
    o = _apply(transform, s.origin) if s.origin is not None else None
    a = _apply(transform, s.axis, vector=True) if s.axis is not None else None
    return Surf(s.kind, o, a, s.radius, s.minor, s.half_angle_deg, s.reversed)


def _parallel(a: Vec, b: Vec) -> bool:
    return abs(_dot(a, b)) >= PARALLEL


def _place(s: Surf, c: Surf, tol: float) -> bool:
    """Does the STEP surface c sit where the .ipt surface s does (its type, its axis line, centre or plane)?"""
    if s.kind != c.kind:
        return False
    if s.kind == "cyl":
        return _parallel(s.axis, c.axis) and _off(c.origin, s.origin, s.axis) <= tol
    if s.kind == "torus":
        # the ring radius places the face: FTC 11's second torus has the STEP's 0.1 mm fillet radius but a ring
        # 0.043 mm larger, so it sits elsewhere and is not mapped (measured at build; the spec's one "other
        # radius" face)
        return _parallel(s.axis, c.axis) and math.dist(s.origin, c.origin) <= tol and abs(s.radius - c.radius) <= tol
    if s.kind == "sphere":
        return math.dist(s.origin, c.origin) <= tol
    if s.kind == "plane":
        return _parallel(s.axis, c.axis) and abs(_dot(_sub(c.origin, s.origin), s.axis)) <= tol
    if s.kind == "cone":
        if not (_parallel(s.axis, c.axis) and _off(c.origin, s.origin, s.axis) <= tol
                and abs(s.half_angle_deg - c.half_angle_deg) <= 0.01):
            return False
        # the same cone: the STEP cone's radius at the .ipt cone's origin equals the .ipt radius there
        t = _dot(_sub(s.origin, c.origin), c.axis)
        return abs(c.radius + t * math.tan(math.radians(c.half_angle_deg)) - s.radius) <= tol \
            or abs(c.radius - t * math.tan(math.radians(c.half_angle_deg)) - s.radius) <= tol
    return False


def _in_mm(mm: float) -> str:
    return f"{mm / 25.4:.3f} in [{mm:.2f} mm]"


def _r4(v):
    return None if v is None else (round(v, 4) if isinstance(v, float) else [round(x, 4) for x in v])


def map_blends(blends: list[Blend], faces, transform=None) -> list[dict]:
    """The response's `inventor.blends` (spec "Response"). `faces` is `part.faces` from `read_step`; `step_faces`
    are indices into it. `transform` = (rows, shift) is the test harness's (never the app path)."""
    tol = settings.PAIR_TOL_MM
    step = step_surfaces(faces) if blends else []
    boxes = step_boxes(faces) if blends else []
    out = []
    for n, b in enumerate(blends, 1):
        hits: list[int] = []
        worst = None  # (gap, .ipt radius, STEP radius) of the face whose radius is furthest off
        mapped = 0
        sized = 0
        for f in b.faces:
            s = b.surfs[f]
            if b.kind is None or s.kind == "other" or s.origin is None or not b.points[f]:
                continue
            if (b.kind == "fillet") != (s.kind in FILLET_KINDS):
                continue
            sized += 1
            s = _moved(s, transform)
            pts = [_apply(transform, p) for p in b.points[f]]
            centre = tuple(sum(p[k] for p in pts) / len(pts) for k in range(3))
            # the same surface, and the centre of the face's vertices inside the STEP face's box: a coplanar or
            # coaxial face elsewhere on the part is not this one (CTC 04's chamfer planes 446 and 471, measured)
            here = [k for k, c in enumerate(step) if _place(s, c, tol) and _inside(centre, boxes[k], BOX_MARGIN_MM)]
            if not here:
                continue
            mapped += 1
            hits.extend(k for k in here if k not in hits)  # disagreeing faces too: tapping the row shows them
            if b.kind == "fillet":
                r = _fillet_radius(s)
                d, k = min((abs(_fillet_radius(step[k]) - r), k) for k in here)
                if d > tol and (worst is None or d > worst[0]):
                    worst = (d, r, _fillet_radius(step[k]))
        gap = worst[0] if worst else 0.0
        gaps = []
        if b.reason is not None:
            state = "not_mapped"
        elif gap > 0:
            state = "disagrees"
            gaps.append({"what": "radius", "mm": round(gap, 4),
                         "text": f"R{_in_mm(worst[1])} in the .ipt, R{_in_mm(worst[2])} in the STEP"})
        elif hits:
            state = "matched"
        else:
            state = "not_mapped"
        reason = b.reason if b.reason is not None else (settings.MSG_NO_BLEND_FACE if state == "not_mapped" else None)
        out.append({"id": f"bl-{n}", "feature_id": b.feature_id, "kind": b.kind, "radius_mm": _r4(b.radius_mm),
                    "distances_mm": _r4(b.distances_mm), "angle_deg": _r4(b.angle_deg), "faces": sized,
                    "faces_mapped": mapped, "copied_by": list(b.copied_by), "state": state, "step_faces": sorted(hits), "gaps": gaps,
                    "reason": reason})
    return out
