"""Feature recognition on analytic faces (spec Design "Features"). S2: holes; S3: pockets and corners; S4: walls.

A hole is a set of concave cylindrical faces that share edges, with the same axis (0.5 deg)
and radius (0.001 mm), spanning the full 360 deg. Stepped segments join through a shoulder
(a plane perpendicular to the axis, or a cone) into one chain; every segment takes the
chain's open ends. A flat or conical bottom belongs to its segment.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from OCC.Core.BRep import BRep_Tool
from OCC.Core.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
from OCC.Core.BRepGProp import BRepGProp_Face
from OCC.Core.BRepTools import breptools
from OCC.Core.GeomAbs import GeomAbs_Cone, GeomAbs_Cylinder, GeomAbs_Plane, GeomAbs_Torus
from OCC.Core.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_VERTEX
from OCC.Core.TopExp import TopExp_Explorer, topexp
from OCC.Core.TopTools import TopTools_IndexedDataMapOfShapeListOfShape, TopTools_IndexedMapOfShape
from OCC.Core.TopoDS import topods
from OCC.Core.gp import gp_Pnt, gp_Vec

from .frame import ANGLE_TOL, Vec, cross, dot, unit

RADIUS_TOL = 0.001  # mm
LINE_TOL = 0.01  # mm, distance between two axis lines that count as one
DIRS = {"+X": ("x", 1), "-X": ("x", -1), "+Y": ("y", 1), "-Y": ("y", -1), "+Z": ("z", 1), "-Z": ("z", -1)}


@dataclass
class Cyl:
    id: int
    origin: Vec
    axis: Vec
    radius: float
    bins: set[int]  # whole degrees around the axis the face covers, in a frame shared by coaxial faces
    lo: float  # extent along axis (dot with axis), from points sampled on its edges
    hi: float
    slope: float = 0.0  # a tapered hole's cone: radius change per mm along the axis; radius is then at height 0

    def radius_at(self, t: float) -> float:
        return self.radius + self.slope * t


@dataclass
class Segment:
    faces: list[int]  # cylinder faces
    origin: Vec
    axis: Vec
    radius: float
    lo: float
    hi: float
    bottom: list[int] = field(default_factory=list)  # flat bottom or cone point
    shoulders: list[int] = field(default_factory=list)
    open_ends: list[str] = field(default_factory=list)  # "lo" / "hi"
    point_mm: float | None = None
    links: set[int] = field(default_factory=set)  # indices of linked segments
    groove: bool = False  # wider than the segments on both sides: an internal groove, not a hole (S6)
    ring: bool = False  # ends on a flat ring round a raised core on its axis: an O-ring groove (D-018 round 2)
    taper_deg: float = 0.0  # a tapered hole: the cone's half-angle (D-018 tapered-holes round)
    small_radius: float | None = None  # a tapered hole: the radius at its narrow end
    gap_joined: bool = False  # joined across an open gap (_open_between)
    cut: bool = False  # round only part of the way (HALF_TURN_DEG): no full-round depth for it
    countersinks: list = field(default_factory=list)  # (end, cone face ids, diameter, included deg) per open end (D-022)
    full_lo: float | None = None  # where the hole is round all the way, when an end leaves through a slope (D-022)
    full_hi: float | None = None


def _sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _pt(p: gp_Pnt) -> Vec:
    return (p.X(), p.Y(), p.Z())


def _vertices(shape) -> list[Vec]:
    out, exp = [], TopExp_Explorer(shape, TopAbs_VERTEX)
    while exp.More():
        out.append(_pt(BRep_Tool.Pnt(topods.Vertex(exp.Current()))))
        exp.Next()
    return out


def _points(shape, per_edge: int = 9) -> list[Vec]:
    """Points sampled along every edge of a shape (vertices alone miss saddle-shaped edges)."""
    out, exp = [], TopExp_Explorer(shape, TopAbs_EDGE)
    while exp.More():
        edge = topods.Edge(exp.Current())
        if not BRep_Tool.Degenerated(edge):
            curve = BRepAdaptor_Curve(edge)
            a, b = curve.FirstParameter(), curve.LastParameter()
            out.extend(_pt(curve.Value(a + (b - a) * i / (per_edge - 1))) for i in range(per_edge))
        exp.Next()
    return out or _vertices(shape)


def _canon(axis: Vec) -> Vec:
    """One sign for an axis line, so coaxial faces share a direction and a height scale."""
    return axis if (round(axis[2], 9), round(axis[1], 9), round(axis[0], 9)) > (0, 0, 0) else tuple(-c for c in axis)


def _ref_frame(axis: Vec) -> tuple[Vec, Vec]:
    """Two unit vectors perpendicular to the axis, the same for either axis sign."""
    a = _canon(axis)
    seed = (1.0, 0.0, 0.0) if abs(a[0]) < 0.9 else (0.0, 1.0, 0.0)
    x = unit(cross(a, seed))
    return x, cross(a, x)


def _angle_bins(face, surface, origin: Vec, axis: Vec) -> set[int]:
    """Whole degrees around the axis covered by the face's u range (sampled every 0.5 deg)."""
    umin, umax, vmin, vmax = breptools.UVBounds(face)
    x, y = _ref_frame(axis)
    steps = max(2, int(math.degrees(umax - umin) * 2) + 1)
    angles = []
    for i in range(steps + 1):
        p = _pt(surface.Value(umin + (umax - umin) * i / steps, (vmin + vmax) / 2))
        r = _sub(p, origin)
        angles.append(math.degrees(math.atan2(dot(r, y), dot(r, x))) % 360)
    return {int(a) % 360 for a in angles}


def _outward_normal(face) -> tuple[Vec, Vec]:
    """A point at the middle of the face's UV box and the outward normal there."""
    umin, umax, vmin, vmax = breptools.UVBounds(face)
    point, vec = gp_Pnt(), gp_Vec()
    BRepGProp_Face(face).Normal((umin + umax) / 2, (vmin + vmax) / 2, point, vec)
    return _pt(point), unit((vec.X(), vec.Y(), vec.Z()))


TAPER_MAX_DEG = 15.0  # a cone this steep or less is a tapered hole's wall (taper pins 0.6, pipe threads 1.8,
# drafts a few deg); countersinks (41-60), entry chamfers (45) and drill points (59) are steeper


def _cylinder(face_id: int, face, tapers: bool = False) -> Cyl | None:
    """A concave cylinder face as a hole piece; with `tapers`, a concave cone of half-angle up to
    TAPER_MAX_DEG too (a tapered hole), its radius given at height 0 on the shared axis scale."""
    surface = BRepAdaptor_Surface(face, True)
    kind = surface.GetType()
    if kind == GeomAbs_Cylinder:
        geo = surface.Cylinder()
    elif kind == GeomAbs_Cone and tapers and abs(math.degrees(surface.Cone().SemiAngle())) <= TAPER_MAX_DEG:
        geo = surface.Cone()
    else:
        return None
    ax = geo.Axis()
    origin, axis = _pt(ax.Location()), _canon(unit(_pt(ax.Direction())))
    point, normal = _outward_normal(face)
    rel = _sub(point, origin)
    radial = _sub(rel, tuple(dot(rel, axis) * a for a in axis))
    if dot(normal, radial) >= 0:  # convex: the outward normal points away from the axis
        return None
    along = [dot(v, axis) for v in _points(face)]  # heights on the shared scale (see _canon)
    bins = _angle_bins(face, surface, origin, axis)
    if kind == GeomAbs_Cylinder:
        return Cyl(face_id, origin, axis, geo.Radius(), bins, min(along), max(along))
    # gp_Cone: radius RefRadius at Location, growing by tan(SemiAngle) along its own direction
    d = unit(_pt(ax.Direction()))
    slope = math.tan(geo.SemiAngle()) * (1 if dot(d, axis) > 0 else -1)
    return Cyl(face_id, origin, axis, geo.RefRadius() - slope * dot(origin, axis), bins, min(along), max(along), slope)


def _same_line(a: Cyl | Segment, b: Cyl | Segment) -> bool:
    if abs(dot(a.axis, b.axis)) < math.cos(ANGLE_TOL):
        return False
    off = cross(_sub(b.origin, a.origin), a.axis)
    return math.sqrt(dot(off, off)) <= LINE_TOL


class Topology:
    def __init__(self, solid, faces):
        self.solid = solid
        self.faces = faces
        self.face_index = TopTools_IndexedMapOfShape()
        topexp.MapShapes(solid, TopAbs_FACE, self.face_index)
        self.edge_faces = TopTools_IndexedDataMapOfShapeListOfShape()
        topexp.MapShapesAndAncestors(solid, TopAbs_EDGE, TopAbs_FACE, self.edge_faces)

    def line_hits(self, p: Vec, d: Vec, t0: float, t1: float) -> bool:
        """Whether any face crosses the line p + t d strictly between t0 and t1."""
        if not hasattr(self, "_lines"):
            from OCC.Core.IntCurvesFace import IntCurvesFace_ShapeIntersector
            self._lines = IntCurvesFace_ShapeIntersector()
            self._lines.Load(self.solid, 1e-7)
        from OCC.Core.gp import gp_Dir, gp_Lin
        self._lines.Perform(gp_Lin(gp_Pnt(*p), gp_Dir(*d)), t0 + 1e-6, t1 - 1e-6)
        return self._lines.IsDone() and self._lines.NbPnt() > 0

    def fid(self, face) -> int:
        return self.face_index.FindIndex(face) - 1

    def neighbours(self, face_id: int) -> dict[int, list]:
        """Neighbouring face ids, each with the shared edges."""
        out: dict[int, list] = {}
        exp = TopExp_Explorer(self.faces[face_id], TopAbs_EDGE)
        while exp.More():
            edge = exp.Current()
            idx = self.edge_faces.FindIndex(edge)
            if idx:
                for other in self.edge_faces.FindFromIndex(idx):
                    oid = self.fid(other)
                    if oid != face_id:
                        out.setdefault(oid, []).append(edge)
            exp.Next()
        return out


HALF_TURN_DEG = 189  # D-018 round 2: a hole cut by another feature still covers this much (1.05 pi, as Quiddity)


def _segments(topo: Topology, cyls: dict[int, Cyl], no_gap: set[int] = frozenset()) -> list[Segment]:
    """Group concave cylinders that share edges, axis and radius, then join groups on one axis
    line with one radius whose heights overlap (the pieces of a hole another feature cuts through,
    D-018 round 2), or that leave an open gap between them (_open_between); groups holding a face in
    `no_gap` are not joined across a gap. Keep groups that go all the way round, or at least
    HALF_TURN_DEG where no part of them does; a fillet (90 deg) or a slot end (180 deg) stays out."""
    seen: set[int] = set()
    groups: list[list[int]] = []
    for fid in sorted(cyls):
        if fid in seen:
            continue
        group, todo = [], [fid]
        seen.add(fid)
        while todo:
            cur = todo.pop()
            group.append(cur)
            for nb in topo.neighbours(cur):
                c = cyls.get(nb)
                if c and nb not in seen and abs(c.radius - cyls[fid].radius) <= RADIUS_TOL and _same_line(c, cyls[fid]) \
                        and abs(c.slope - cyls[fid].slope) <= 1e-6:
                    seen.add(nb)
                    todo.append(nb)
        groups.append(sorted(group))
    merged: list[list[int]] = []
    gap_joined: set[int] = set()
    for group in groups:
        lo, hi = min(cyls[g].lo for g in group), max(cyls[g].hi for g in group)
        for other in merged:
            a, b = cyls[other[0]], cyls[group[0]]
            olo, ohi = min(cyls[g].lo for g in other), max(cyls[g].hi for g in other)
            if abs(a.radius - b.radius) <= RADIUS_TOL and _same_line(a, b) and abs(a.slope - b.slope) <= 1e-6:
                if min(hi, ohi) - max(lo, olo) > 0.01:
                    pass
                elif not no_gap.intersection(group + other) and _open_between(topo, cyls, group, other):
                    gap_joined.update(group + other)
                else:
                    continue
                other.extend(group)
                other.sort()
                break
        else:
            merged.append(group)
    out: list[Segment] = []
    for group in merged:
        members = [cyls[g] for g in group]
        whole = _full_turn(members)
        span = whole or _full_turn(members, HALF_TURN_DEG)
        if span is None:
            continue
        base = members[0]
        if base.slope:  # a tapered hole: its size is the wide end, and it keeps the narrow end
            ends = sorted((base.radius_at(span[0]), base.radius_at(span[1])))
            out.append(Segment(group, base.origin, base.axis, ends[1], *span,
                               taper_deg=math.degrees(math.atan(abs(base.slope))), small_radius=ends[0]))
        else:
            out.append(Segment(group, base.origin, base.axis, base.radius, *span))
        out[-1].gap_joined = bool(gap_joined.intersection(group))
        out[-1].cut = whole is None
    return out


GAP_LINE_RADIUS = 0.9  # of the bore's radius: where the lines that probe a gap run (inside any narrower hole's wall)
GAP_MAX_DIAMETERS = 3.0  # assumption: one drill crosses a gap up to 3 diameters long (a cross hole, a groove, a
# clevis slot); bores farther apart (two walls of a housing, NIST ctc_02) are each made from their own side


def _open_between(topo: Topology, cyls: dict[int, Cyl], a: list[int], b: list[int]) -> bool:
    """Two groups of one bore (one axis line, one radius) that leave a gap along it, with nothing
    solid inside the bore across the gap: one hole crossed by another as wide or wider, a bore with a
    groove, or a pin hole through both arms of a clevis (stress test, HANDOFF 3a). The gap runs between
    the heights where each group is round all the way. Five lines along the axis cross it, on the axis
    and at GAP_LINE_RADIUS of the radius every 90 deg; a face crossing any of them (a hole's bottom, a
    wall with a narrower hole or none) closes the gap."""
    spans = []
    for g in (a, b):
        members = [cyls[k] for k in g]
        span = _full_turn(members) or _full_turn(members, HALF_TURN_DEG)
        if span is None:
            return False
        spans.append(span)
    (_, ahi), (blo, _) = sorted(spans)
    if blo < ahi - 0.01:  # they overlap: not a gap (the caller joins overlapping groups)
        return False
    c = cyls[a[0]]
    if blo - ahi > GAP_MAX_DIAMETERS * 2 * c.radius_at(ahi):
        return False
    x, y = _ref_frame(c.axis)
    base = _sub(c.origin, tuple(dot(c.origin, c.axis) * v for v in c.axis))  # the axis point at height 0
    # Groups whose faces only touch (two holes of one size crossing: each piece's edge reaches the
    # other hole's axis) are probed across a short length round the height where they meet.
    # The lines start and end 0.01 inside each group's round part, so a shoulder at the gap's end counts.
    t0, t1 = (ahi - 0.01, blo + 0.01) if blo - ahi > 0.02 else ((ahi + blo) / 2 - 0.01, (ahi + blo) / 2 + 0.01)
    r = GAP_LINE_RADIUS * min(c.radius_at(t0), c.radius_at(t1))
    for ox, oy in ((0, 0), (r, 0), (0, r), (-r, 0), (0, -r)):
        p = tuple(base[k] + ox * x[k] + oy * y[k] for k in range(3))
        if topo.line_hits(p, c.axis, t0, t1):
            return False
    return True


def _full_turn(members: list[Cyl], min_deg: int = 359) -> tuple[float, float] | None:
    """The height range where the group goes all the way round (360 deg within 1 deg), or None.
    With a smaller `min_deg`: the range where it covers at least that much (a cut hole).

    Faces of one hole can be split lengthwise (halves) or across (stacked bands), and a hole that
    exits onto a sloped or curved face has halves of different lengths: the hole is the part that
    is round all the way, and its depth is measured there. Two half-faces that never overlap in
    height are not a hole.
    """
    cuts = sorted({round(v, 4) for m in members for v in (m.lo, m.hi)})
    full = [(a, b) for a, b in zip(cuts, cuts[1:]) if b - a > 0.01 and len(set().union(
        *(m.bins for m in members if m.lo <= a + 0.01 and m.hi >= b - 0.01))) >= min_deg]
    if not full:
        return None
    return min(a for a, _ in full), max(b for _, b in full)


def _edge_end(seg: Segment, edges) -> str | None:
    """"hi" or "lo" when the shared edges lie at an end of the segment; None for an edge partway
    along it (a cross hole breaking through the wall), which is not an end."""
    along = [dot(v, seg.axis) for e in edges for v in _points(e)]
    # An edge reaching an end of the round part is at that end (a sloped exit runs across it);
    # an edge wholly partway along is a cross hole breaking through the wall.
    if max(along) >= seg.hi - 0.01:
        return "hi"
    if min(along) <= seg.lo + 0.01:
        return "lo"
    return None


def _is_shoulder(face, seg: Segment) -> bool:
    """A plane perpendicular to the axis, or a cone on the same axis."""
    surface = BRepAdaptor_Surface(face, True)
    kind = surface.GetType()
    if kind == GeomAbs_Plane:
        _, n = _outward_normal(face)
        return abs(dot(n, seg.axis)) >= math.cos(ANGLE_TOL)
    if kind == GeomAbs_Cone:
        ax = surface.Cone().Axis()
        o, d = _pt(ax.Location()), unit(_pt(ax.Direction()))
        off = cross(_sub(o, seg.origin), seg.axis)
        return abs(dot(d, seg.axis)) >= math.cos(ANGLE_TOL) and math.sqrt(dot(off, off)) <= LINE_TOL
    return False


def _classify_ends(topo: Topology, segs: list[Segment]) -> None:
    owner = {f: i for i, s in enumerate(segs) for f in s.faces}
    for i, seg in enumerate(segs):
        ends: dict[str, str] = {}
        around = {nb: edges for fid in seg.faces for nb, edges in topo.neighbours(fid).items() if nb not in seg.faces}
        for nb, edges in around.items():
            # Each end the face meets, by edge: a radial hole through a round shaft opens onto the
            # same round face at both ends (stress test, HANDOFF 3a).
            by_end: dict[str, list] = {}
            for e in edges:
                if (end := _edge_end(seg, [e])) is not None:
                    by_end.setdefault(end, []).append(e)
            for end in by_end:
                nb_nbs = set(topo.neighbours(nb))
                bridge = _bridge(topo, segs, owner, i, nb)
                if bridge:  # joins two segments of one stepped hole
                    linked, shoulders = bridge
                    seg.links.update(linked)
                    if seg.radius > max(segs[j].radius for j in linked):
                        seg.shoulders.extend(k for k in shoulders if k not in seg.shoulders)
                    ends.setdefault(end, "link")
                    continue
                # A flat ring at the end, with a second loop of edges inside it where a core rises on
                # the same axis (directly or through a chamfer): an O-ring groove, not a hole (D-018 round 2).
                if _is_shoulder(topo.faces[nb], seg) and any(
                        _core(topo.faces[k], seg) or (_is_shoulder(topo.faces[k], seg) and BRepAdaptor_Surface(
                            topo.faces[k], True).GetType() == GeomAbs_Cone and any(
                            _core(topo.faces[j], seg) for j in topo.neighbours(k)))
                        for k in nb_nbs if k not in seg.faces):
                    seg.ring = True
                # A bottom closes the hole: its faces touch only this segment and each other
                # (a flat or cone point, or a filleted, ball or split bottom), and lie within its radius.
                # A flat bottom that another feature cuts into still closes the hole.
                flat = BRepAdaptor_Surface(topo.faces[nb], True).GetType() == GeomAbs_Plane and _is_shoulder(topo.faces[nb], seg)
                closed = _closed_bottom(topo, seg, nb, end) if not (nb_nbs <= set(seg.faces) | set(around) or flat) else [nb]
                if closed and _within(topo.faces[nb], seg):
                    for k in closed:
                        if k not in seg.bottom:
                            seg.bottom.append(k)
                    if BRepAdaptor_Surface(topo.faces[nb], True).GetType() == GeomAbs_Cone:
                        seg.point_mm = _cone_length(topo.faces[nb], seg)
                    if ends.get(end) != "link":
                        ends[end] = "bottom"
                    continue
                # Anything else is an open end, with the hole's own axis also on a pocket floor (D-022).
                ends.setdefault(end, "open")
                if (csk := _countersink(topo, seg, nb)) and not any(c[0] == end for c in seg.countersinks):
                    seg.countersinks.append((end, *csk))
            for end, es in (by_end.items() if not seg.cut else ()):  # where it is round all the way (D-022)
                for e in es:
                    along = [dot(v, seg.axis) for v in _points(e)]
                    if end == "hi" and min(along) > seg.lo + 0.01:
                        seg.full_hi = min(seg.full_hi if seg.full_hi is not None else seg.hi, min(along))
                    elif end == "lo" and max(along) < seg.hi - 0.01:
                        seg.full_lo = max(seg.full_lo if seg.full_lo is not None else seg.lo, max(along))
        seg.open_ends = [e for e in ("hi", "lo") if ends.get(e) == "open"]
        seg.countersinks = [c for c in seg.countersinks if c[0] in seg.open_ends]
        seg.groove = ends.get("hi") == "link" and ends.get("lo") == "link" and all(
            segs[j].radius < seg.radius for j in seg.links)
    # A link found from one side only (a shoulder partway along a bore joined across a gap, so it is
    # at no end of it) still joins the chain.
    for i, seg in enumerate(segs):
        for j in seg.links:
            segs[j].links.add(i)


COUNTERSINK_MAX_DEG = 60.0  # half-angle: 82, 90, 100 and 120 deg countersinks, and 45 deg entry chamfers


def _countersink(topo: Topology, seg: Segment, nb: int) -> tuple[list[int], float, float] | None:
    """A cone on the hole's axis at an open end, steeper than a taper and widening out of the part: a
    countersink or an entry chamfer (D-022). Returns (its cone faces, its wide diameter, included angle)."""
    surface = BRepAdaptor_Surface(topo.faces[nb], True)
    if surface.GetType() != GeomAbs_Cone or not _is_shoulder(topo.faces[nb], seg):
        return None
    half = abs(math.degrees(surface.Cone().SemiAngle()))
    if not TAPER_MAX_DEG < half <= COUNTERSINK_MAX_DEG + math.degrees(ANGLE_TOL):  # 120 deg: 60 to rounding
        return None
    cones = [nb] + [k for k in topo.neighbours(nb) if k not in seg.faces and BRepAdaptor_Surface(
        topo.faces[k], True).GetType() == GeomAbs_Cone and _is_shoulder(topo.faces[k], seg)]  # a split cone
    def radius(p: Vec) -> float:
        off = cross(_sub(p, seg.origin), seg.axis)
        return math.sqrt(dot(off, off))
    wide = max(radius(p) for k in cones for p in _points(topo.faces[k]))
    if wide <= seg.radius + 0.01:
        return None
    return sorted(cones), 2 * wide, round(2 * half, 1)


BRIDGE_MAX_FACES = 4  # a shoulder with an edge break: a floor ring, a chamfer or fillet at the bore, a corner fillet


def _round_about(face, seg: Segment) -> bool:
    """A shoulder face (a plane square to the axis, or a cone on it), or a torus on the axis (a fillet)."""
    if _is_shoulder(face, seg):
        return True
    surface = BRepAdaptor_Surface(face, True)
    if surface.GetType() != GeomAbs_Torus:
        return False
    ax = surface.Torus().Axis()
    o, d = _pt(ax.Location()), unit(_pt(ax.Direction()))
    off = cross(_sub(o, seg.origin), seg.axis)
    return abs(dot(d, seg.axis)) >= math.cos(ANGLE_TOL) and math.sqrt(dot(off, off)) <= LINE_TOL


def _bridge(topo: Topology, segs: list[Segment], owner: dict[int, int], i: int, nb: int) -> tuple[list[int], list[int]] | None:
    """Segments on segment i's axis line that face nb joins it to, through up to BRIDGE_MAX_FACES faces
    round the axis (a counterbore floor, with a chamfer or fillet where the bore meets it, or a fillet
    in the counterbore's corner; stress test, HANDOFF 3a), and the faces that are the shoulder: all of
    them, except a chamfer or fillet at the narrower bore (an edge break, labelled a chamfer or round as
    the tapered-hole round keeps chamfers out). None when nb joins no other segment."""
    seg = segs[i]
    if not _round_about(topo.faces[nb], seg):
        return None
    group, todo, linked = [nb], [nb], set()
    while todo:
        cur = todo.pop()
        for k in topo.neighbours(cur):
            if k in owner:
                if owner[k] != i and _same_line(segs[owner[k]], seg):
                    linked.add(owner[k])
            elif k not in group and _round_about(topo.faces[k], seg):
                if len(group) >= BRIDGE_MAX_FACES:
                    return None
                group.append(k)
                todo.append(k)
    if not linked:
        return None
    wide = max([seg, *(segs[j] for j in linked)], key=lambda s: s.radius)
    if not all(_within(topo.faces[k], wide) for k in group):
        return None
    if len(group) == 1:
        return sorted(linked), group
    narrow = {f for j in [i, *linked] if segs[j] is not wide for f in segs[j].faces}
    edge_break = [k for k in group if BRepAdaptor_Surface(topo.faces[k], True).GetType() != GeomAbs_Plane
                  and narrow & set(topo.neighbours(k))]
    return sorted(linked), [k for k in group if k not in edge_break]


BOTTOM_MAX_FACES = 12  # a filleted, ball or split bottom has a few faces; more is another feature


def _closed_bottom(topo: Topology, seg: Segment, nb: int, end: str) -> list[int] | None:
    """The faces that close the hole past `nb`, or None: every face joined to `nb` away from the
    bore lies within the bore's radius, so they shut the end together (a flat floor rounded into
    the bore by a fillet: a bull-nose or ball end mill's round recess, or a filleted blind hole;
    D-018 bull-nose round). A face reaching further out (a pocket floor the hole opens into) or a
    face of another hole means the end is open. Every face lies past the bore's end: a face that
    comes back up inside the bore (the core of a ring groove) means it is no bottom, and so does a
    face no tool tip leaves (only planes, cones, tori and spheres count; MFCAD++ 13975 has a B-spline
    there that it labels a chamfer)."""
    from OCC.Core.GeomAbs import GeomAbs_Sphere, GeomAbs_Torus
    tip = (GeomAbs_Plane, GeomAbs_Cone, GeomAbs_Torus, GeomAbs_Sphere)  # what a drill or end-mill tip leaves

    def past_end(face) -> bool:
        if BRepAdaptor_Surface(face, True).GetType() not in tip:
            return False
        along = [dot(v, seg.axis) for v in _points(face)]
        return max(along) <= seg.lo + 0.01 if end == "lo" else min(along) >= seg.hi - 0.01
    if not past_end(topo.faces[nb]):
        return None
    group, todo = {nb}, [nb]
    while todo:
        cur = todo.pop()
        for k in topo.neighbours(cur):
            if k in seg.faces or k in group:
                continue
            if len(group) >= BOTTOM_MAX_FACES or not _within(topo.faces[k], seg) or not past_end(topo.faces[k]):
                return None
            group.add(k)
            todo.append(k)
    return sorted(group)


def _within(face, seg: Segment) -> bool:
    """Every point on the face's edges lies within the segment's radius of its axis: the face can
    close the hole. A pocket wall that meets a hole cut into it reaches further out."""
    for p in _points(face):
        off = cross(_sub(p, seg.origin), seg.axis)
        if math.sqrt(dot(off, off)) > seg.radius + 0.01:
            return False
    return True


def _core(face, seg: Segment) -> bool:
    """A convex cylinder on the segment's axis, narrower than it: the raised core of a ring groove."""
    surface = BRepAdaptor_Surface(face, True)
    if surface.GetType() != GeomAbs_Cylinder or surface.Cylinder().Radius() >= seg.radius - RADIUS_TOL:
        return False
    ax = surface.Cylinder().Axis()
    o, d = _pt(ax.Location()), unit(_pt(ax.Direction()))
    off = cross(_sub(o, seg.origin), seg.axis)
    if abs(dot(d, seg.axis)) < math.cos(ANGLE_TOL) or math.sqrt(dot(off, off)) > LINE_TOL:
        return False
    point, normal = _outward_normal(face)
    rel = _sub(point, o)
    return dot(normal, _sub(rel, tuple(dot(rel, d) * c for c in d))) > 0


def _cone_length(face, seg: Segment) -> float:
    along = [dot(v, seg.axis) for v in _points(face)]
    return max(along) - min(along)


def _chains(segs: list[Segment]) -> list[list[int]]:
    seen, out = set(), []
    for i in range(len(segs)):
        if i in seen:
            continue
        chain, todo = [], [i]
        seen.add(i)
        while todo:
            cur = todo.pop()
            chain.append(cur)
            for j in segs[cur].links:
                if j not in seen:
                    seen.add(j)
                    todo.append(j)
        out.append(sorted(chain))
    return out


def _frame_dir(v: Vec, frame: dict[str, Vec]) -> str | None:
    for name, (key, sign) in DIRS.items():
        if dot(v, tuple(sign * a for a in frame[key])) >= math.cos(ANGLE_TOL):
            return name
    return None


def holes(solid, faces, frame: dict[str, Vec]) -> list[dict]:
    topo = Topology(solid, faces)
    cyls = {i: c for i, f in enumerate(faces) if (c := _cylinder(i, f, tapers=True))}
    segs = _segments(topo, cyls)
    _classify_ends(topo, segs)
    # Two counterbores that face each other across an open cavity (NIST ctc_02) join into one bore
    # wider than both its ends, which reads as a groove and would drop out: keep them apart.
    if undo := {f for s in segs if s.gap_joined and s.groove for f in s.faces}:
        segs = _segments(topo, cyls, undo)
        _classify_ends(topo, segs)
    features = []
    for n_chain, chain in enumerate(_chains(segs), 1):
        vectors: list[Vec] = []
        for i in chain:
            s = segs[i]
            for end in s.open_ends:
                v = s.axis if end == "hi" else tuple(-a for a in s.axis)
                if not any(dot(v, w) > 0.9999 for w in vectors):
                    vectors.append(v)
        for i in chain:
            s = segs[i]
            if s.groove or s.ring:
                continue
            lo = s.full_lo if s.full_lo is not None else s.lo
            hi = s.full_hi if s.full_hi is not None else s.hi
            if hi - lo <= 0.01:  # slopes at both ends that cross: no full-round part, so the longest side
                lo, hi = s.lo, s.hi
            dims = {"diameter": 2 * s.radius, "depth": hi - lo}
            if (s.hi - s.lo) - (hi - lo) > 0.01:  # an end leaves through a slope: the longest side (D-022)
                dims["max_depth"] = s.hi - s.lo
            if s.point_mm is not None:
                dims["point_mm"] = s.point_mm
            if s.taper_deg:
                dims["taper_deg"] = s.taper_deg
                dims["small_diameter"] = 2 * s.small_radius
            dirs = [d for v in vectors if (d := _frame_dir(v, frame))]
            csk = {}
            if s.countersinks:  # D-022: the cone stays out of `faces`; the hole records it
                dims["countersink_diameter"] = max(c[2] for c in s.countersinks)
                dims["countersink_deg"] = s.countersinks[0][3]
                csk = {"countersink_faces": sorted({f for c in s.countersinks for f in c[1]}),
                       "countersink_vectors": [list(s.axis if c[0] == "hi" else tuple(-a for a in s.axis))
                                               for c in s.countersinks],
                       "countersink_degs": [c[3] for c in s.countersinks]}  # per end, as the vectors
            features.append({
                "kind": "hole",
                "faces": sorted(s.faces + s.bottom + s.shoulders),
                "axis": list(vectors[0] if vectors else s.axis),
                "open_dirs": list(dict.fromkeys(dirs)),
                "open_vectors": [list(v) for v in vectors],
                "dims_mm": dims,
                "chain": n_chain,  # the same for every segment of one stepped hole (renumbered below)
                **csk,
            })
    features.sort(key=lambda f: min(f["faces"]))
    renumber: dict[int, int] = {}
    for n, f in enumerate(features, 1):
        f["id"] = f"hole-{n}"
        f["chain"] = renumber.setdefault(f["chain"], len(renumber) + 1)
    return [{"id": f["id"], **{k: v for k, v in f.items() if k != "id"}} for f in features]


# --- S3: pockets and inside corners (spec Features "Pocket", "Inside corner"; S3 "Settled at build") ---

def _normal_at(face, p: Vec) -> Vec:
    """The outward normal of a face at the point of its surface nearest p."""
    from OCC.Core.GeomAPI import GeomAPI_ProjectPointOnSurf
    proj = GeomAPI_ProjectPointOnSurf(gp_Pnt(*p), BRep_Tool.Surface(face))
    u, v = proj.LowerDistanceParameters()
    point, vec = gp_Pnt(), gp_Vec()
    BRepGProp_Face(face).Normal(u, v, point, vec)
    return unit((vec.X(), vec.Y(), vec.Z()))


def _edge_mid(edge) -> tuple[Vec, Vec]:
    curve = BRepAdaptor_Curve(edge)
    t = (curve.FirstParameter() + curve.LastParameter()) / 2
    p, d = gp_Pnt(), gp_Vec()
    curve.D1(t, p, d)
    return _pt(p), unit((d.X(), d.Y(), d.Z()))


INTO_STEPS = (0.05, 0.01, 0.002)  # mm; D-018 round 3: a sliver of floor left between two cuts is under 0.05 wide


def _into(face, p: Vec, n: Vec, e: Vec) -> Vec | None:
    """The direction from a point on a face's edge into the face (perpendicular to the edge)."""
    from OCC.Core.BRepClass import BRepClass_FaceClassifier
    from OCC.Core.TopAbs import TopAbs_IN
    d = unit(cross(n, e))
    for step in INTO_STEPS:
        for s in (1, -1):
            q = tuple(p[i] + s * step * d[i] for i in range(3))
            if BRepClass_FaceClassifier(face, gp_Pnt(*q), 1e-6).State() == TopAbs_IN:
                return tuple(s * c for c in d)
    return None


def _concave(topo: Topology, a: int, b: int, edge) -> bool:
    """The edge between faces a and b is concave: the material angle there is under 180 deg.

    Moving from the edge into face a goes along face b's outward normal (into the air on b's side).
    """
    p, e = _edge_mid(edge)
    fa, fb = topo.faces[a], topo.faces[b]
    t = _into(fa, p, _normal_at(fa, p), e)
    return t is not None and dot(_normal_at(fb, p), t) > math.sin(ANGLE_TOL)


def _plane_normal(face) -> Vec | None:
    if BRepAdaptor_Surface(face, True).GetType() != GeomAbs_Plane:
        return None
    return _outward_normal(face)[1]


DRAFT_MAX_DEG = 15.0  # D-018 bull-nose/draft round: a pocket wall may lean outward (open upward) this far


def _wall_kind(face, n: Vec) -> str | None:
    """"plane", "cylinder" or "cone" for a pocket wall round the floor normal n: a cylinder on an
    axis along n (0.5 deg), or a plane or a cone on such an axis whose face leans outward by up to
    DRAFT_MAX_DEG (a drafted wall; a cone is a drafted round corner or round wall). A face leaning
    the other way (an undercut) or further is not a wall."""
    surface = BRepAdaptor_Surface(face, True)
    kind = surface.GetType()
    if kind == GeomAbs_Cylinder:
        d = surface.Cylinder().Axis().Direction()
        return "cylinder" if abs(dot((d.X(), d.Y(), d.Z()), n)) >= math.cos(ANGLE_TOL) else None
    if kind == GeomAbs_Cone:
        d = surface.Cone().Axis().Direction()
        if abs(dot((d.X(), d.Y(), d.Z()), n)) < math.cos(ANGLE_TOL):
            return None
    elif kind != GeomAbs_Plane:
        return None
    lean = dot(_outward_normal(face)[1], n)
    if -math.sin(ANGLE_TOL) <= lean <= math.sin(math.radians(DRAFT_MAX_DEG)):
        return "plane" if kind == GeomAbs_Plane else "cone"
    return None


def _wire_edges(wire) -> list:
    out, exp = [], TopExp_Explorer(wire, TopAbs_EDGE)
    while exp.More():
        out.append(exp.Current())
        exp.Next()
    return out


def _edge_neighbour(topo: Topology, face_id: int, edge) -> int | None:
    idx = topo.edge_faces.FindIndex(edge)
    if not idx:
        return None
    for other in topo.edge_faces.FindFromIndex(idx):
        oid = topo.fid(other)
        if oid != face_id:
            return oid
    return None


BREAK_STEP = 0.01  # mm: how far past a floor edge, and below the floor, the enclosure probe starts


def _sealed_faces(solid, faces) -> set[int]:
    """Ids of the faces on a shell other than the solid's outer one: a void sealed inside the part.
    Set 2's reach test leaves these alone: MFCAD++ labels such a void a pocket (parts 11836, 12204 and
    12552 of the first 500: 22 faces), where an earlier feature's walls closed it in. Whether to report
    it as a void that can't be machined is open (HANDOFF)."""
    from OCC.Core.BRepClass3d import brepclass3d
    from OCC.Core.TopAbs import TopAbs_SHELL
    outer = brepclass3d.OuterShell(topods.Solid(solid))
    out, exp = set(), TopExp_Explorer(solid, TopAbs_SHELL)
    while exp.More():
        shell = exp.Current()
        exp.Next()
        if shell.IsSame(outer):
            continue
        fexp = TopExp_Explorer(shell, TopAbs_FACE)
        while fexp.More():
            out.update(i for i, f in enumerate(faces) if f.IsSame(fexp.Current()))
            fexp.Next()
    return out


class _Enclosure:
    """Is the gap past a floor edge inside the part? Loaded once per analysis, only when needed."""

    def __init__(self, solid, faces=()):
        self.solid = solid
        self.rays = None
        self.classifier = None
        self.sealed = _sealed_faces(solid, faces)

    def inside(self, floor, n: Vec, edge) -> bool:
        """A floor edge with no wall (D-018 round 1): another feature (a passage, a through hole, a
        groove, a step) cuts the pocket there. Start just past the edge and just below the floor, in
        the air of that feature, and cast rays in the floor's plane: outward, 45 deg either side, and
        both ways along the edge. Every one must meet the part again, so the gap is closed all round
        (a passage, a hole). A slot or step that opens to the outside, or a through slot that runs
        out of the part, lets a ray escape."""
        from OCC.Core.BRepClass3d import BRepClass3d_SolidClassifier
        from OCC.Core.TopAbs import TopAbs_OUT
        p, e = _edge_mid(edge)
        into = _into(floor, p, n, e)
        if into is None:
            return False
        out = tuple(-c for c in into)
        start = tuple(p[i] + BREAK_STEP * out[i] - BREAK_STEP * n[i] for i in range(3))
        if self.classifier is None:  # built once: building it costs about 27 ms on a NIST part
            self.classifier = BRepClass3d_SolidClassifier(self.solid)
        self.classifier.Perform(gp_Pnt(*start), 1e-6)
        if self.classifier.State() != TopAbs_OUT:
            return False  # material past the edge: a slope or chamfer, not a cut
        if self.rays is None:
            self.rays = _Rays(self.solid)
        c, s = math.cos(math.pi / 4), math.sin(math.pi / 4)
        dirs = [out, e, tuple(-x for x in e),
                tuple(c * out[i] + s * e[i] for i in range(3)), tuple(c * out[i] - s * e[i] for i in range(3))]
        return all(self.rays.first_hit(start, unit(d))[0] is not None for d in dirs)


def _smooth(topo: Topology, a: int, b: int, edge) -> bool:
    """Faces a and b meet tangentially at the middle of the edge (normals within 0.5 deg)."""
    p, _ = _edge_mid(edge)
    return dot(_normal_at(topo.faces[a], p), _normal_at(topo.faces[b], p)) >= math.cos(ANGLE_TOL)


def _is_blend(face, n: Vec) -> bool:
    """A face that can round a floor into its walls: a cylinder lying along the floor (axis square to
    n), a torus or surface of revolution on an axis along n (round a corner), or a sphere (a ball
    end's corner)."""
    from OCC.Core.GeomAbs import GeomAbs_Sphere, GeomAbs_SurfaceOfRevolution, GeomAbs_Torus
    s = BRepAdaptor_Surface(face, True)
    kind = s.GetType()
    if kind == GeomAbs_Cylinder:
        d = s.Cylinder().Axis().Direction()
        return abs(dot((d.X(), d.Y(), d.Z()), n)) <= math.sin(ANGLE_TOL)
    if kind in (GeomAbs_Torus, GeomAbs_SurfaceOfRevolution):  # CAD writes a near-ball corner as the latter
        d = (s.Torus().Axis() if kind == GeomAbs_Torus else s.AxeOfRevolution()).Direction()
        return abs(dot((d.X(), d.Y(), d.Z()), n)) >= math.cos(ANGLE_TOL)
    return kind == GeomAbs_Sphere


def _blend_walls(topo: Topology, floor: int, nb: int, n: Vec, edge) -> tuple[set[int], list[int]] | None:
    """The fillet faces between a floor and its walls (a bull-nose or ball end mill, or a fillet added
    in CAD; D-018 bull-nose round), and the walls past them. `nb` meets the floor tangentially along
    `edge`; the blend is every blend face joined to it by smooth edges, and its walls are the wall
    faces it meets. None when `nb` is no such fillet or leads to no wall. A blend face whose concave
    side faces away from the floor (a rounded top edge) is not one: its edge to the floor is convex."""
    if not _is_blend(topo.faces[nb], n) or not _smooth(topo, floor, nb, edge):
        return None
    blend, todo, walls, tangent = {nb}, [nb], [], False
    while todo:
        cur = todo.pop()
        for k, edges in topo.neighbours(cur).items():
            if k == floor or k in blend:
                continue
            smooth = any(_smooth(topo, cur, k, e) for e in edges)
            if _wall_kind(topo.faces[k], n):
                if k not in walls:
                    walls.append(k)
                tangent = tangent or smooth
            elif _is_blend(topo.faces[k], n):  # tangent, or two floor fillets meeting in a sharp corner
                blend.add(k)
                todo.append(k)
            else:
                return None  # past the fillet lies no wall: the round bottom of a U-slot seen from its side, not a floor fillet
    p, _ = _edge_mid(edge)
    # The fillet must curve up from the floor (a point on it, off the edge, lies above the floor)
    # and run into a wall tangentially, as a cutter's corner leaves it.
    if not tangent or max(dot(q, n) for q in _points(topo.faces[nb])) <= dot(p, n) + 1e-6:
        return None
    return blend, walls


def _pocket_walls(topo: Topology, floor: int, n: Vec, edges, enclosure: _Enclosure,
                  blends: set[int] | None = None, cuts: list | None = None) -> list[int] | None:
    """The walls of a pocket on this floor, or None. Each outer edge of the floor meets a concave
    wall perpendicular to it, or (D-018 round 1) is cut by another feature inside the part; a cut
    pocket needs at least two walls left. A chamfer between floor and wall (D-018 round 3) leads to
    its wall and is not one. A fillet between floor and wall leads to its wall too; its faces are
    added to `blends` (D-018 bull-nose round). Edges cut by another feature are added to `cuts`."""
    blends = set() if blends is None else blends
    walls: list[int] = []
    cut = False
    for item in edges:  # an edge of the floor, or (floor piece, edge) for a floor in several pieces
        piece, edge = item if isinstance(item, tuple) else (floor, item)
        nb = _edge_neighbour(topo, piece, edge)
        if nb is not None and _wall_kind(topo.faces[nb], n) and _concave(topo, piece, nb, edge):
            if nb not in walls:
                walls.append(nb)
        elif nb is not None and (beyond := _floor_chamfer_walls(topo, piece, nb, n, edge)):
            walls.extend(w for w in beyond if w not in walls)
        elif nb is not None and (fill := _blend_walls(topo, piece, nb, n, edge)):
            blends.update(fill[0])
            walls.extend(w for w in fill[1] if w not in walls)
        elif nb is not None and enclosure.inside(topo.faces[piece], n, edge):
            cut = True
            if cuts is not None:
                cuts.append(edge)
        else:
            return None
    if cut and len(walls) < 2:
        return None
    if any(_knife_edge(topo, floor, w, walls) for w in walls):
        return None
    return walls


REACH_STEP = 1e-3  # mm: a reach ray starts this far off the floor


def _reachable(topo: Topology, pieces: list[int], n: Vec, rays: "_Rays") -> bool:
    """A cutter can reach the floor along its axis (set 2, undercuts; stress test: a blind T-slot gave
    5 phantom pockets facing every way): a ray from some point inside a floor piece, along the outward
    normal, leaves the part. A lip's underside, or the side of a T-slot's head, faces material."""
    for k in pieces:
        for p in _inner_points(topo.faces[k], grid=5):
            start = tuple(p[i] + REACH_STEP * n[i] for i in range(3))
            if rays.first_hit(start, n)[0] is None:
                return True
    return False


OVER_TOL = 0.01  # mm


def _over_floor(topo: Topology, pieces: list[int], n: Vec):
    """A test: does a face lie over the floor: wholly above its plane, and within the floor pieces' box
    in that plane (OVER_TOL)? An undercut's ceiling and the walls above it do; a big step floor that
    meets a small ceiling at the pocket's mouth does not (MFCAD++ 14308), nor the underside of a plate
    reached down a wall that runs below the floor (EDMR daratech: "ceilings" at z = 0 and 2 under a
    floor at z = 8)."""
    a, b = _ref_frame(n)
    pts = [p for k in pieces for p in _points(topo.faces[k])]
    us, vs = [dot(p, a) for p in pts], [dot(p, b) for p in pts]
    lo_u, hi_u, lo_v, hi_v = min(us) - OVER_TOL, max(us) + OVER_TOL, min(vs) - OVER_TOL, max(vs) + OVER_TOL
    floor_h = max(dot(p, n) for p in pts)
    return lambda face: all(lo_u <= dot(p, a) <= hi_u and lo_v <= dot(p, b) <= hi_v and dot(p, n) > floor_h + OVER_TOL
                            for p in _points(face))


def _undercut(topo: Topology, walls: list[int], n: Vec, skip: set[int], over) -> tuple[list[int], list[int]]:
    """The undercut of a pocket (set 2): ceilings (planes facing the floor, n reversed) that a wall
    runs into at a concave edge, and the walls that rise from a ceiling's other side at a convex edge
    (the opening above a lip, or the pocket above a groove round its floor), and, when there is a
    ceiling, any wall joined to a wall smoothly (one wall in two faces). Each must lie over the floor
    (`over`, from _over_floor). Returns (ceilings, walls added); both empty for a pocket with no undercut."""
    ceilings: list[int] = []
    added: list[int] = []
    todo = list(walls)
    while todo:
        w = todo.pop()
        for k, edges in topo.neighbours(w).items():
            if k in skip or k in ceilings or k in walls or k in added:
                continue
            m = _plane_normal(topo.faces[k])
            if m is not None and dot(m, n) <= -math.cos(ANGLE_TOL) and over(topo.faces[k]) \
                    and any(_concave(topo, w, k, e) for e in edges):
                ceilings.append(k)
                for j, es in topo.neighbours(k).items():
                    if j in skip or j in walls or j in added or j in ceilings:
                        continue
                    if _wall_kind(topo.faces[j], n) and over(topo.faces[j]) and not any(_concave(topo, k, j, e) for e in es):
                        added.append(j)
                        todo.append(j)
    if ceilings:  # the same wall in two faces, one each side of the ceiling's height (a closed T-slot's end)
        todo = walls + added
        while todo:
            w = todo.pop()
            for k, edges in topo.neighbours(w).items():
                if k not in skip and k not in walls and k not in added and k not in ceilings \
                        and _wall_kind(topo.faces[k], n) and over(topo.faces[k]) and any(_smooth(topo, w, k, e) for e in edges):
                    added.append(k)
                    todo.append(k)
    return ceilings, added


def _overhang(topo: Topology, ceilings: list[int], walls: list[int], upper: list[int]) -> float:
    """How far an undercut reaches under its lip (D-021), in mm: for each edge where a ceiling meets
    a wall below it, the distance from the edge's middle to the nearest edge where the ceiling meets
    a wall above it; the largest. 2 for a 2 mm lip, 4 for each side of a T-slot 10 wide with an 18 wide head."""
    from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
    from OCC.Core.BRepExtrema import BRepExtrema_DistShapeShape
    best = 0.0
    for c in ceilings:
        nbs = topo.neighbours(c)
        below = [e for w in walls if w not in upper for e in nbs.get(w, [])]
        above = [e for w in upper for e in nbs.get(w, [])]
        for e in below:
            p, _ = _edge_mid(e)
            v = BRepBuilderAPI_MakeVertex(gp_Pnt(*p)).Vertex()
            d = min((BRepExtrema_DistShapeShape(v, a).Value() for a in above), default=0.0)
            best = max(best, d)
    return best


KNIFE_DEG = 1.0  # deg: material angle under this at a wall's edge is no material (D-018 round 6)


def _knife_edge(topo: Topology, floor: int, w: int, walls: list[int]) -> bool:
    """The wall's material runs out to nothing: at a convex edge to a face outside the pocket the two
    outward normals are opposite (within KNIFE_DEG), so the material between them is 0 thick there.
    A slot whose open end another cut has worn down to such an edge is open, not walled (MFCAD++
    1149, 12029); no part can be made with a 0-thick edge."""
    for k, edges in topo.neighbours(w).items():
        if k == floor or k in walls:
            continue
        for e in edges:
            p, _ = _edge_mid(e)
            if dot(_normal_at(topo.faces[w], p), _normal_at(topo.faces[k], p)) < -math.cos(math.radians(KNIFE_DEG)) \
                    and not _concave(topo, w, k, e):
                return True
    return False


def _floor_chamfer_walls(topo: Topology, floor: int, nb: int, n: Vec, edge) -> list[int]:
    """The walls past a chamfer between floor and wall (D-018 round 3): `nb` is a sloped plane,
    concave to the floor, that meets walls perpendicular to the floor at concave edges. Empty when
    `nb` is not such a chamfer. A chamfer is a strip: its edge to the wall runs parallel to its edge
    to the floor (a corner chamfer between two walls meets them across, and is no floor). At a round
    wall the chamfer is a cone on the wall's axis (perpendicular to the floor)."""
    face = topo.faces[nb]
    surface = BRepAdaptor_Surface(face, True)
    if surface.GetType() == GeomAbs_Cone:
        ax = surface.Cone().Axis()
        o, d = _pt(ax.Location()), unit(_pt(ax.Direction()))
        if abs(dot(d, n)) < math.cos(ANGLE_TOL) or not _concave(topo, floor, nb, edge):
            return []
        out = []
        for k, edges in topo.neighbours(nb).items():
            s = BRepAdaptor_Surface(topo.faces[k], True)
            if k == floor or s.GetType() != GeomAbs_Cylinder or not _wall_kind(topo.faces[k], n):
                continue
            off = cross(_sub(_pt(s.Cylinder().Axis().Location()), o), d)
            if math.sqrt(dot(off, off)) <= LINE_TOL and any(_concave(topo, nb, k, e) for e in edges):
                out.append(k)
        return out
    m = _plane_normal(face)
    if m is None or _wall_kind(face, n) or abs(dot(m, n)) >= math.cos(ANGLE_TOL) or not _concave(topo, floor, nb, edge):
        return []
    along = _edge_mid(edge)[1]
    return [k for k, edges in topo.neighbours(nb).items() if k != floor and _wall_kind(topo.faces[k], n)
            and any(_concave(topo, nb, k, e) and abs(dot(_edge_mid(e)[1], along)) >= math.cos(ANGLE_TOL) for e in edges)]


CHAMFER_MAX_TURN_DEG = 60 - math.degrees(ANGLE_TOL)  # a regular hexagon pocket turns 60 deg at each wall


def _span(face, n: Vec) -> float:
    """How long a wall runs across the floor: the widest spread of its points square to n."""
    pts = [tuple(p[i] - dot(p, n) * n[i] for i in range(3)) for p in _points(face)]
    return max((math.dist(a, b) for i, a in enumerate(pts) for b in pts[i + 1:]), default=0.0)


def _corner_chamfers(topo: Topology, walls: list[int], n: Vec) -> set[int]:
    """Planar walls that cut a corner between two planar walls (D-018 round 3): the wall turns by the
    same angle (0.05 deg) to each of its two planar neighbour walls, under CHAMFER_MAX_TURN_DEG. A side
    of a regular hexagon turns 60 deg each way and stays a wall. Round 5: when a neighbour passes the
    same test (an octagon, or the side between two chamfered corners), only the shorter of the two
    is a chamfer, and equal sides are walls."""
    normals = {w: m for w in walls if (m := _plane_normal(topo.faces[w])) is not None}
    like = {}
    for w, m in normals.items():
        nbs = [k for k in topo.neighbours(w) if k in normals and k != w]
        turns = [math.degrees(math.acos(max(-1.0, min(1.0, dot(m, normals[k]))))) for k in nbs]
        if len(turns) == 2 and abs(turns[0] - turns[1]) <= 0.05 and turns[0] < CHAMFER_MAX_TURN_DEG:
            like[w] = nbs
    span = {w: _span(topo.faces[w], n) for w in like}
    return {w for w, nbs in like.items() if all(span[w] < span[k] - LINE_TOL for k in nbs if k in like)}


def _shared_edges(topo: Topology, a: int, b: int) -> list:
    return topo.neighbours(a).get(b, [])


def _distance(a, b) -> float:
    from OCC.Core.BRepExtrema import BRepExtrema_DistShapeShape
    dist = BRepExtrema_DistShapeShape(a, b)
    return dist.Value() if dist.IsDone() else math.inf


def _centre(face) -> Vec:
    from OCC.Core.BRepGProp import brepgprop
    from OCC.Core.GProp import GProp_GProps
    props = GProp_GProps()
    brepgprop.SurfaceProperties(face, props)
    return _pt(props.CentreOfMass())


def _floor_pieces(topo: Topology, fid: int, n: Vec, skip: set[int]) -> list[int] | None:
    """The flat faces joined to this one, edge to edge, in its plane (the same outward normal and
    height), itself included, or None when it stands alone."""
    h = dot(_outward_normal(topo.faces[fid])[0], n)
    group, todo = {fid}, [fid]
    while todo:
        cur = todo.pop()
        for k in topo.neighbours(cur):
            if k in group or k in skip:
                continue
            m = _plane_normal(topo.faces[k])
            if m is not None and dot(m, n) >= math.cos(ANGLE_TOL) and abs(dot(_outward_normal(topo.faces[k])[0], n) - h) <= 1e-4:
                group.add(k)
                todo.append(k)
    return sorted(group) if len(group) > 1 else None


RIM_BREAK_MAX_SHARE = 0.5  # an edge break on a pocket's rim is at most half the pocket's depth tall


def _rim_top(topo: Topology, walls: list[int], own: set[int], n: Vec, top: float, depth: float) -> float:
    """The height the pocket opens at: its walls' top, or above it the top of a chamfer or round on
    its rim (an edge break: a plane tilted 10 to 80 deg from the axis, or a cone, cylinder or torus,
    lying wholly above the walls' top and under half the depth tall; stress test, HANDOFF 3a: a 1 mm
    top chamfer made a 12 mm pocket read 11)."""
    from OCC.Core.GeomAbs import GeomAbs_Torus as Torus
    best = top
    for w in walls:
        for k in topo.neighbours(w):
            if k in own:
                continue
            face = topo.faces[k]
            kind = BRepAdaptor_Surface(face, True).GetType()
            if kind == GeomAbs_Plane:
                if not 0.17 < abs(dot(_outward_normal(face)[1], n)) < 0.98:  # 10 to 80 deg
                    continue
            elif kind not in (GeomAbs_Cone, GeomAbs_Cylinder, Torus):
                continue
            h = [dot(p, n) for p in _points(face)]
            if min(h) >= top - 0.01 and max(h) - min(h) <= RIM_BREAK_MAX_SHARE * depth:
                best = max(best, max(h))
    return best


def _narrowest(topo: Topology, walls: list[int], islands: list[int] = ()) -> float:
    """Smallest distance between two planar walls that face each other (opposed normals, 0.5 deg),
    and between a round island face (a boss) and any wall or island face it does not touch (stress
    test, HANDOFF 3a: a d8 boss 1.27 mm from a wall left the gap at the pocket's 30 mm width)."""
    planes = [(w, _outward_normal(topo.faces[w])[1], _centre(topo.faces[w])) for w in walls
              if BRepAdaptor_Surface(topo.faces[w], True).GetType() == GeomAbs_Plane]
    best = math.inf
    for i, (a, na, ca) in enumerate(planes):
        for b, nb, cb in planes[i + 1:]:
            if dot(na, nb) > -math.cos(ANGLE_TOL) or dot(na, _sub(cb, ca)) <= 0:
                continue
            best = min(best, _distance(topo.faces[a], topo.faces[b]))
    rounds = [w for w in islands if BRepAdaptor_Surface(topo.faces[w], True).GetType() != GeomAbs_Plane]
    boxes = {w: _box(topo.faces[w]) for w in (set(walls) | set(rounds))} if rounds else {}
    for a in rounds:
        near = set(topo.neighbours(a))
        # nearest boxes first, and a pair whose boxes are already farther apart than the best gap is skipped
        for gap, b in sorted((boxes[a].Distance(boxes[b]), b) for b in walls if b != a and b not in near):
            if gap >= best:
                break
            if (d := _distance(topo.faces[a], topo.faces[b])) > 1e-6:
                best = min(best, d)
    return best


def _corners(topo: Topology, walls: list[int], cyls: dict[int, Cyl]) -> list[tuple[list[int], float, list | None]]:
    """Inside corners between the outer walls: concave fillets (split faces merged) and sharp edges.
    Each is (faces, radius, edge): a sharp corner's edge is its two end points (mm), for the viewer."""
    out: list[tuple[list[int], float, list | None]] = []
    seen: set[int] = set()
    for w in sorted(walls):
        c = cyls.get(w)
        if not c or w in seen:
            continue
        group, todo = [], [w]
        seen.add(w)
        while todo:
            cur = todo.pop()
            group.append(cur)
            for nb in topo.neighbours(cur):
                o = cyls.get(nb)
                if nb in walls and o and nb not in seen and abs(o.radius - c.radius) <= RADIUS_TOL and _same_line(o, c):
                    seen.add(nb)
                    todo.append(nb)
        out.append((sorted(group), c.radius, None))
    # Sharp corners: any two walls (plane or cylinder) meeting at a concave, non-tangent edge. A fillet
    # meets its walls tangentially, and split faces of one fillet are one group, so neither counts.
    group_of = {f: i for i, (faces, _, _) in enumerate(out) for f in faces}
    ordered = sorted(walls)
    for i, a in enumerate(ordered):
        for b in ordered[i + 1:]:
            if a in group_of and group_of.get(b) == group_of[a]:
                continue
            edges = [e for e in _shared_edges(topo, a, b) if _concave(topo, a, b, e) or _concave(topo, b, a, e)]
            if edges:
                ends = sorted(_vertices(edges[0]))
                out.append(([a, b], 0.0, [list(ends[0]), list(ends[-1])]))
    return out


def _one_axis(faces, walls: list[int]) -> bool:
    """Every wall is a cylinder or cone, concave or convex, on one axis line: a groove round a core or a
    stepped bore, not a pocket (D-018 round 5: an O-ring's core is convex, so `Cyl` misses it)."""
    lines = []
    for w in walls:
        surface = BRepAdaptor_Surface(faces[w], True)
        if surface.GetType() == GeomAbs_Cylinder:
            ax = surface.Cylinder().Axis()
        elif surface.GetType() == GeomAbs_Cone:  # a tapered round recess: a hole, not a pocket
            ax = surface.Cone().Axis()
        else:
            return False
        lines.append((_pt(ax.Location()), unit(_pt(ax.Direction()))))
    o0, d0 = lines[0]
    for o, d in lines[1:]:
        off = cross(_sub(o, o0), d0)
        if abs(dot(d, d0)) < math.cos(ANGLE_TOL) or math.sqrt(dot(off, off)) > LINE_TOL:
            return False
    return True


def _floor_checks(topo: Topology, cyls: dict[int, Cyl], faces, walls: list[int], pieces: list[int], n: Vec,
                  enclosure: _Enclosure) -> tuple[list[int] | None, bool | None]:
    """(walls, reached) for a floor that has walls: walls None when they make no pocket (a flat-bottom
    hole or counterbore floor, a ring groove, only corner chamfers); reached False when no cutter can
    reach the floor along n (a ceiling over an undercut, or a side of one; set 2)."""
    if all(w in cyls for w in walls) and len({round(cyls[w].radius, 3) for w in walls}) == 1:
        return None, None  # a flat-bottom hole or counterbore floor, not a pocket
    if _one_axis(faces, walls):
        return None, None  # a ring groove: walls on one axis, the core's convex (round 5), not a pocket
    chamfers = _corner_chamfers(topo, walls, n)
    walls = [w for w in walls if w not in chamfers]
    if not walls:
        return None, None
    if all(k in enclosure.sealed for k in pieces):
        return walls, True  # a void sealed inside the part: no ray leaves it (see _Enclosure.sealed)
    if enclosure.rays is None:
        enclosure.rays = _Rays(topo.solid)
    return walls, _reachable(topo, pieces, n, enclosure.rays)


def pockets(solid, faces, frame: dict[str, Vec], hole_faces: set[int]) -> tuple[list[dict], list[dict]]:
    """Closed pockets and their inside corners. Returns (pockets, corners), unnumbered."""
    from OCC.Core.BRepTools import breptools as bt
    from .tools import pick_end_mill
    topo = Topology(solid, faces)
    cyls = {i: c for i, f in enumerate(faces) if (c := _cylinder(i, f))}
    found_p, found_c = [], []
    enclosure = _Enclosure(solid, faces)
    for fid, face in enumerate(faces):
        if fid in hole_faces:
            continue
        n = _plane_normal(face)
        if n is None:
            continue
        outer = bt.OuterWire(topods.Face(face))
        outer_edges = _wire_edges(outer)
        blends: set[int] = set()
        pieces = [fid]
        cuts: list = []
        walls = _pocket_walls(topo, fid, n, outer_edges, enclosure, blends, cuts)
        reached, alone = None, walls
        if walls:
            walls, reached = _floor_checks(topo, cyls, faces, walls, pieces, n, enclosure)
        if (not alone or reached is False) and (group := _floor_pieces(topo, fid, n, hole_faces)) and min(group) == fid:
            # A floor in several flat pieces (a pocket tool fused from a box and round ends): its
            # outline is the pieces' edges that no other piece shares (stress test, HANDOFF 3a).
            # A piece alone may have walls but lie under a ceiling (the ring under a floor groove, set 2).
            pieces = group
            outer_edges = [(k, e) for k in group for e in _wire_edges(bt.OuterWire(topods.Face(faces[k])))
                           if _edge_neighbour(topo, k, e) not in group]
            cuts = []
            walls = _pocket_walls(topo, fid, n, outer_edges, enclosure, blends, cuts)
            if walls:
                walls, reached = _floor_checks(topo, cyls, faces, walls, pieces, n, enclosure)
        if not walls or not reached:
            continue
        ceilings, upper = ([], []) if all(k in enclosure.sealed for k in pieces) else \
            _undercut(topo, walls, n, {*pieces, *hole_faces}, _over_floor(topo, pieces, n))
        walls = walls + upper
        islands: list[int] = []
        rim = [e[1] if isinstance(e, tuple) else e for e in outer_edges]
        for piece in pieces:
            exp = TopExp_Explorer(faces[piece], TopAbs_EDGE)
            while exp.More():
                edge = exp.Current()
                exp.Next()
                if any(edge.IsSame(o) for o in rim):
                    continue
                nb = _edge_neighbour(topo, piece, edge)
                if nb is None or nb in pieces:
                    continue
                if nb not in walls and nb not in islands and _wall_kind(faces[nb], n) and _concave(topo, piece, nb, edge):
                    islands.append(nb)
                elif nb not in blends and (fill := _blend_walls(topo, piece, nb, n, edge)):
                    blends.update(fill[0])  # an island rounded into the floor
                    islands.extend(w for w in fill[1] if w not in walls and w not in islands)
        floor_h = dot(_outward_normal(face)[0], n)
        top = max(dot(p, n) for w in walls for p in _points(faces[w]))
        depth = _rim_top(topo, walls, {*pieces, *walls, *islands, *blends, *ceilings}, n, top, top - floor_h) - floor_h
        corners = _corners(topo, walls, cyls)
        min_r = min((r for _, r, _ in corners), default=math.inf)
        width = _narrowest(topo, walls + islands, islands)
        tool, undersized = pick_end_mill(min_r, width)
        pocket_faces = sorted({*pieces, *walls, *islands, *blends, *ceilings})
        dirs = [d] if (d := _frame_dir(n, frame)) else []
        found_p.append({"kind": "pocket", "faces": pocket_faces, "axis": list(n), "open_dirs": dirs,
                        "open_vectors": [list(n)],
                        "dims_mm": {"depth": depth, "min_corner_radius": 0.0 if min_r == math.inf else min_r,
                                    "end_mill_mm": tool, "undersized": int(undersized)}})
        if width != math.inf:  # no two walls face each other: no width limit, and no key
            found_p[-1]["dims_mm"]["narrowest_width"] = width
        if ceilings and not cuts:  # an undercut (set 2, D-021): how far it reaches under the lip. Only with
            # walls all round: through a side opened by another feature, a cutter may reach in from the side
            # (EDMR daratech, unterlaf: ledges between ribs, open on 2 of 4 sides)
            found_p[-1]["dims_mm"]["undercut_mm"] = _overhang(topo, ceilings, walls, upper)
        for cfaces, r, edge in corners:
            ctool, _ = pick_end_mill(r, width)
            corner = {"kind": "corner", "faces": cfaces, "axis": list(n), "open_dirs": [], "open_vectors": [],
                      "dims_mm": {"radius": r, "depth": depth, "end_mill_mm": ctool}}
            if edge:
                corner["edge_mm"] = edge  # a sharp corner has no face of its own: the viewer draws this edge
            found_c.append(corner)
    return found_p, found_c


def number(features: list[dict], kind: str) -> list[dict]:
    features.sort(key=lambda f: (min(f["faces"]), sorted(f["faces"])))  # walls often share their lowest face
    out = []
    for n, f in enumerate(features, 1):
        out.append({"id": f"{kind}-{n}", **f})
    return out


# --- S4: walls (spec Features "Wall"; S4 "Settled at build") ---

MIN_OVERLAP_MM2 = 10.0  # assumption (spec Features "Wall")


def _box(shape):
    from OCC.Core.Bnd import Bnd_Box
    from OCC.Core.BRepBndLib import brepbndlib
    box = Bnd_Box()
    brepbndlib.Add(shape, box)
    box.Enlarge(0.01)
    return box


def _plane_info(face):
    p, n = _outward_normal(face)
    return p, n, _box(face)


def _area(shape) -> float:
    from OCC.Core.BRepGProp import brepgprop
    from OCC.Core.GProp import GProp_GProps
    props = GProp_GProps()
    brepgprop.SurfaceProperties(shape, props)
    return props.Mass()


def _inner_points(shape, grid: int = 9) -> list[Vec]:
    """Points inside a shape's faces: the centroids of their mesh triangles (largest first), then a
    grid x grid sample of each face's UV box kept where it lies inside the face. The centroid of a
    whole face can fall in a hole through it, and a ray from one point can be blocked where the
    material between two faces is only partial (a pocket in the middle of a block)."""
    from OCC.Core.BRepClass import BRepClass_FaceClassifier
    from OCC.Core.BRepMesh import BRepMesh_IncrementalMesh
    from OCC.Core.gp import gp_Pnt2d
    from OCC.Core.TopAbs import TopAbs_IN
    from OCC.Core.TopLoc import TopLoc_Location
    BRepMesh_IncrementalMesh(shape, 0.5, False, 0.5, True)
    centroids, samples = [], []
    exp = TopExp_Explorer(shape, TopAbs_FACE)
    while exp.More():
        face = topods.Face(exp.Current())
        exp.Next()
        tri = BRep_Tool.Triangulation(face, TopLoc_Location())
        if tri is not None:
            for i in range(1, tri.NbTriangles() + 1):
                a, b, c = (_pt(tri.Node(k)) for k in tri.Triangle(i).Get())
                area = 0.5 * math.sqrt(dot(x := cross(_sub(b, a), _sub(c, a)), x))
                centroids.append((-round(area, 6), tuple((a[j] + b[j] + c[j]) / 3 for j in range(3))))
        umin, umax, vmin, vmax = breptools.UVBounds(face)
        surface = BRepAdaptor_Surface(face, True)
        for i in range(grid):
            for j in range(grid):
                u = umin + (umax - umin) * (i + 0.5) / grid
                v = vmin + (vmax - vmin) * (j + 0.5) / grid
                if BRepClass_FaceClassifier(face, gp_Pnt2d(u, v), 1e-6).State() == TopAbs_IN:
                    samples.append(_pt(surface.Value(u, v)))
    return [p for _, p in sorted(centroids)[:24]] + samples  # at most 24 centroids, then the grid


class _Rays:
    """Rays cast through one solid; the intersector is loaded once per analysis."""

    def __init__(self, solid):
        from OCC.Core.IntCurvesFace import IntCurvesFace_ShapeIntersector
        self.inter = IntCurvesFace_ShapeIntersector()
        self.inter.Load(solid, 1e-6)

    def first_hit(self, start: Vec, direction: Vec):
        """The face a ray from `start` along `direction` meets first beyond 1e-4 mm, and the distance."""
        from OCC.Core.gp import gp_Dir, gp_Lin
        self.inter.Perform(gp_Lin(gp_Pnt(*start), gp_Dir(*direction)), 1e-4, 1e9)
        best, best_w = None, math.inf
        if self.inter.IsDone():
            for i in range(1, self.inter.NbPnt() + 1):
                w = self.inter.WParameter(i)
                if w < best_w:
                    best, best_w = self.inter.Face(i), w
        return best, best_w


WALL_DRAFT_MAX_DEG = 15.0  # D-020: a wall's faces may be this far from parallel (as pocket draft, D-018)
WALL_DRAFT_REACH_MM = 25.4  # drafted pairs farther apart than this are not compared (assumption: no finding
# reaches 1 in, and the overlap boolean on every far pair of a large part is slow)


def _touching(topo: Topology, faces, a: int, b: int) -> bool:
    """The two faces share an edge or a vertex."""
    if b in topo.neighbours(a):
        return True
    va = {tuple(round(c, 6) for c in v) for v in _vertices(faces[a])}
    return any(tuple(round(c, 6) for c in v) in va for v in _vertices(faces[b]))


def walls(solid, faces) -> list[dict]:
    """Pairs of planar faces with outward normals pointing away from each other, parallel or up to
    WALL_DRAFT_MAX_DEG from it (draft, D-020), and solid material between them. Unnumbered."""
    from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Common
    from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_Transform
    from OCC.Core.gp import gp_Ax1, gp_Dir, gp_Trsf
    topo = Topology(solid, faces)
    rays = _Rays(solid)
    planes = [(i, *_plane_info(f)) for i, f in enumerate(faces)
              if BRepAdaptor_Surface(f, True).GetType() == GeomAbs_Plane]
    out = []
    for k, (ia, pa, na, ba) in enumerate(planes):
        for ib, pb, nb, bb in planes[k + 1:]:
            if dot(na, nb) > -math.cos(math.radians(WALL_DRAFT_MAX_DEG)):
                continue
            drafted = dot(na, nb) > -1 + 1e-12  # not exactly parallel: a tilted face lands off b's plane
            face_a, n_a = faces[ia], na
            if drafted:  # D-020: up to WALL_DRAFT_MAX_DEG from parallel; turn a parallel to b first
                if _touching(topo, faces, ia, ib) or (dot(na, nb) > -math.cos(ANGLE_TOL)
                                                      and _box(faces[ia]).Distance(bb) > WALL_DRAFT_REACH_MM):
                    continue  # faces that meet (a knife edge) are no wall; far ones are thick
                axis = cross(na, tuple(-c for c in nb))
                turn = gp_Trsf()
                turn.SetRotation(gp_Ax1(gp_Pnt(*pa), gp_Dir(*unit(axis))), math.asin(min(1.0, math.sqrt(dot(axis, axis)))))
                face_a, n_a = BRepBuilderAPI_Transform(faces[ia], turn, True).Shape(), tuple(-c for c in nb)
            t = -dot(_sub(pb, pa), n_a)  # how far b lies behind a, into a's material side
            if t <= 1e-6:
                continue  # facing each other (a slot's sides) or in one plane
            move = gp_Trsf()
            move.SetTranslation(gp_Vec(*(c * -t for c in n_a)))
            a_on_b = BRepBuilderAPI_Transform(face_a, move, True).Shape()
            if _box(a_on_b).IsOut(bb):  # only pairs whose boxes overlap, a moved onto b's plane
                continue
            try:  # a failed boolean skips this pair, not the whole analysis
                common = BRepAlgoAPI_Common(a_on_b, faces[ib])
                common.Build()
                overlap = _area(common.Shape()) if common.IsDone() else 0.0
            except RuntimeError:
                continue
            if overlap < MIN_OVERLAP_MM2:
                continue
            # Solid material between them: a ray from a point inside the overlap on b, along -nb (into
            # the material), first meets face a, at distance t. Air between (two bosses) or another
            # face in the way (a slot or pocket) fails; one clear ray of the sampled points is enough.
            for p in _inner_points(common.Shape()):
                hit, w = rays.first_hit(p, tuple(-c for c in nb))
                if hit is not None and topo.fid(hit) == ia and (drafted or abs(w - t) <= 0.01):
                    break
            else:
                continue
            if drafted:  # its thickness is at its thinnest place (D-020)
                from OCC.Core.BRepExtrema import BRepExtrema_DistShapeShape
                dist = BRepExtrema_DistShapeShape(faces[ia], faces[ib])
                if not dist.IsDone() or dist.Value() <= 1e-6:
                    continue
                t = dist.Value()
            out.append({"kind": "wall", "faces": [ia, ib], "axis": [-c for c in na], "open_dirs": [],
                        "open_vectors": [], "dims_mm": {"thickness": t, "overlap_mm2": overlap}})
    return out


# --- S4 (D-016): thin material at holes ---

SIDE_STEP_DEG = 15  # rays around a hole's side every 15 deg, then every 1 deg within 15 deg of the nearest
SIDE_STEP_MM = 1.0  # at heights about 1 mm apart along its round part (set 3: 3 heights missed thin material
SIDE_HEIGHTS_MIN, SIDE_HEIGHTS_MAX = 3, 48  # near the top of a hole), at least 3 and at most 48
TIP_TILTS = (0, 10, 20, 30)  # deg off the axis, for rays from a drill point's tip (its surface is 31 deg off it)
TIP_TURNS = 12  # around the axis at each tilt
HOLE_WALL_MAX_MM = 0.25 * 25.4  # material at a hole is measured up to 0.250 in (assumption): over every limit


def _on_face(face, p: Vec) -> bool:
    """The point lies on the face itself or its boundary (a seam between split faces), not where a cross
    hole or an exit has cut the face away."""
    from OCC.Core.BRepClass import BRepClass_FaceClassifier
    from OCC.Core.TopAbs import TopAbs_OUT
    return BRepClass_FaceClassifier(topods.Face(face), gp_Pnt(*p), 1e-4).State() != TopAbs_OUT


class _NearRays:
    """First hits of rays from one hole, up to HOLE_WALL_MAX_MM, testing only the faces whose boxes lie
    within that distance of the hole's box: a face outside it is farther than any hit that counts.
    Faces that share an edge with the hole are not tested: the hole opens onto them, so the material
    between them thins to nothing at that edge by its shape (a hole entering a sloped face), not a wall
    (stress test, HANDOFF 3a: d6 into a 70 deg slope gave a 0.075 mm wall)."""

    def __init__(self, faces, boxes, topo: Topology, own: set[int]):
        from OCC.Core.Bnd import Bnd_Box
        self.faces, self.boxes, self.topo = faces, boxes, topo
        self.own = own | {n for f in own for n in topo.neighbours(f)}  # the hole and what it opens onto
        self.hole_box = Bnd_Box()
        for f in own:
            self.hole_box.Add(boxes[f])

    def nearest(self, starts: list[tuple[Vec, Vec]], keep=None) -> tuple[int, float, int] | None:
        """(face id, distance, index of the ray) of the nearest first hit, or None. `keep(n)` can turn
        down a ray by its index; it is asked only for the nearest hits, nearest first."""
        for w, fid, n in self.hits(starts):  # nearest first; ties go to the lower face id
            if keep is None or keep(n):
                return fid, w, n
        return None

    def hits(self, starts: list[tuple[Vec, Vec]]) -> list[tuple[float, int, int]]:
        """(distance, face id, index of the ray) of each ray's first hit within reach, nearest first."""
        from OCC.Core.BRep import BRep_Builder
        from OCC.Core.IntCurvesFace import IntCurvesFace_ShapeIntersector
        from OCC.Core.TopoDS import TopoDS_Compound
        from OCC.Core.gp import gp_Dir, gp_Lin
        radius = HOLE_WALL_MAX_MM
        if not hasattr(self, "inter"):  # one intersector per hole, over the faces near it
            near = [i for i, box in enumerate(self.boxes)
                    if i not in self.own and box.Distance(self.hole_box) <= radius]
            self.inter = None
            if near:
                comp, builder = TopoDS_Compound(), BRep_Builder()
                builder.MakeCompound(comp)
                for i in near:
                    builder.Add(comp, self.faces[i])
                self.inter = IntCurvesFace_ShapeIntersector()
                self.inter.Load(comp, 1e-6)
        inter = self.inter
        if inter is None:
            return []
        hits: list[tuple[float, int, int]] = []  # (distance, face id, ray) of each ray's first hit
        for n, (p, d) in enumerate(starts):
            inter.Perform(gp_Lin(gp_Pnt(*p), gp_Dir(*d)), 1e-3, radius)
            if not inter.IsDone() or inter.NbPnt() == 0:
                continue
            first = min((inter.WParameter(k), self.topo.fid(inter.Face(k))) for k in range(1, inter.NbPnt() + 1))
            hits.append((round(first[0], 9), first[1], n))
        return sorted(hits)


def hole_walls(solid, faces, hole_list: list[dict]) -> list[dict]:
    """Walls at holes (D-016), unnumbered: per hole, the thinnest material between its side and each face
    near it (rays square to the axis from its round part, about every 1 mm along it; set 3) and, for a drill point, under its tip (rays from the tip, up to
    30 deg off the axis, deeper into the part), when it is at most 0.250 in. The first face a ray from the hole meets bounds solid
    material, so a ray measures material only. Two holes that find each other give one wall."""
    from OCC.Core.GeomAbs import GeomAbs_Cone as Cone
    topo = Topology(solid, faces)
    boxes = [_box(f) for f in faces]
    out: dict[tuple, dict] = {}
    hole_of = {f: h["id"] for h in hole_list for f in h["faces"]}

    def add(own: int, found: tuple[int, float], hole_id: str, where: str) -> None:
        # Between two holes the key is the pair of holes, so split hole faces still give one wall.
        other = hole_of.get(found[0])
        key = ("holes", *sorted((hole_id, other))) if other else tuple(sorted((own, found[0])))
        if key not in out or found[1] < out[key]["dims_mm"]["thickness"]:
            out[key] = {"kind": "wall", "faces": sorted((own, found[0])), "axis": None, "open_dirs": [], "open_vectors": [],
                        "dims_mm": {"thickness": found[1]}, "hole": hole_id, "at": where}

    for h in hole_list:
        own = set(h["faces"])
        rays = _NearRays(faces, boxes, topo, own)
        cyls = [c for f in h["faces"] if (c := _cylinder(f, faces[f], tapers=True))]
        if cyls:
            x, y = _ref_frame(cyls[0].axis)
            lo, hi = min(c.lo for c in cyls), max(c.hi for c in cyls)
            def ray(c: Cyl, centre: Vec, deg: int) -> tuple[Vec, Vec, int, Vec, int]:
                ang = math.radians(deg)
                d = tuple(math.cos(ang) * x[i] + math.sin(ang) * y[i] for i in range(3))
                r = c.radius_at(dot(centre, c.axis))  # a tapered hole's radius changes along it
                return tuple(centre[i] + r * d[i] for i in range(3)), d, c.id, centre, deg

            starts = []
            heights = min(SIDE_HEIGHTS_MAX, max(SIDE_HEIGHTS_MIN, math.ceil((hi - lo) / SIDE_STEP_MM)))
            for c in cyls:
                for k in range(heights):
                    t = lo + (hi - lo) * (k + 0.5) / heights
                    if not c.lo - 1e-6 <= t <= c.hi + 1e-6:
                        continue
                    centre = tuple(c.origin[i] + (t - dot(c.origin, c.axis)) * c.axis[i] for i in range(3))
                    # a face covers only its own angles (split faces); bins are whole degrees
                    starts += [ray(c, centre, deg) for deg in range(0, 360, SIDE_STEP_DEG) if deg in c.bins]
            def on(rs):  # a ray counts only if it starts on its hole face, not in a gap cut through it
                return lambda n: _on_face(faces[rs[n][2]], rs[n][0])
            keep, seen = on(starts), set()
            # The nearest hit on each other face (or other hole): every thin side, not only the thinnest (set 3).
            for w, fid, n in rays.hits([(p, d) for p, d, *_ in starts]):
                other = hole_of.get(fid, fid)
                if other in seen or not keep(n):
                    continue
                seen.add(other)
                found, rs = (fid, w, n), starts
                _, _, cid, centre, deg = starts[n]
                c = next(c for c in cyls if c.id == cid)
                fine = [ray(c, centre, (deg + k) % 360) for k in range(-SIDE_STEP_DEG, SIDE_STEP_DEG + 1)
                        if (deg + k) % 360 in c.bins]
                on_fine = on(fine)
                close = next(((f2, w2, m) for w2, f2, m in rays.hits([(p, d) for p, d, *_ in fine])
                              if hole_of.get(f2, f2) == other and on_fine(m)), None)
                if close and close[1] < found[1]:
                    found, rs = close, fine
                add(rs[found[2]][2], found, h["id"], "side")  # the hole face the nearest ray left from
        tip = None
        for f in h["faces"]:
            surface = BRepAdaptor_Surface(faces[f], True)
            if surface.GetType() != Cone or "point_mm" not in h["dims_mm"]:
                continue
            apex = _pt(surface.Cone().Apex())
            deeper = tuple(-a for a in h["axis"])  # a hole's axis points out of the material at its open end
            x, y = _ref_frame(deeper)
            starts = []
            for tilt in TIP_TILTS:
                for k in range(TIP_TURNS if tilt else 1):
                    a, b = math.radians(tilt), 2 * math.pi * k / TIP_TURNS
                    starts.append((apex, tuple(math.cos(a) * deeper[i] + math.sin(a) * (
                        math.cos(b) * x[i] + math.sin(b) * y[i]) for i in range(3))))
            found = rays.nearest(starts)  # a point split into several faces is one tip: keep the nearest
            if found and (tip is None or found[1] < tip[1][1] - 1e-9):
                tip = (f, found)
        if tip:
            add(tip[0], tip[1], h["id"], "tip")
    return list(out.values())
