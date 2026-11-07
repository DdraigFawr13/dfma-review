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
from OCC.Core.GeomAbs import GeomAbs_Cone, GeomAbs_Cylinder, GeomAbs_Plane
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


def _cylinder(face_id: int, face) -> Cyl | None:
    surface = BRepAdaptor_Surface(face, True)
    if surface.GetType() != GeomAbs_Cylinder:
        return None
    cyl = surface.Cylinder()
    ax = cyl.Axis()
    origin, axis = _pt(ax.Location()), _canon(unit(_pt(ax.Direction())))
    point, normal = _outward_normal(face)
    rel = _sub(point, origin)
    radial = _sub(rel, tuple(dot(rel, axis) * a for a in axis))
    if dot(normal, radial) >= 0:  # convex: the outward normal points away from the axis
        return None
    along = [dot(v, axis) for v in _points(face)]  # heights on the shared scale (see _canon)
    return Cyl(face_id, origin, axis, cyl.Radius(), _angle_bins(face, surface, origin, axis), min(along), max(along))


def _same_line(a: Cyl | Segment, b: Cyl | Segment) -> bool:
    if abs(dot(a.axis, b.axis)) < math.cos(ANGLE_TOL):
        return False
    off = cross(_sub(b.origin, a.origin), a.axis)
    return math.sqrt(dot(off, off)) <= LINE_TOL


class Topology:
    def __init__(self, solid, faces):
        self.faces = faces
        self.face_index = TopTools_IndexedMapOfShape()
        topexp.MapShapes(solid, TopAbs_FACE, self.face_index)
        self.edge_faces = TopTools_IndexedDataMapOfShapeListOfShape()
        topexp.MapShapesAndAncestors(solid, TopAbs_EDGE, TopAbs_FACE, self.edge_faces)

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


def _segments(topo: Topology, cyls: dict[int, Cyl]) -> list[Segment]:
    """Group concave cylinders that share edges, axis and radius, then join groups on one axis
    line with one radius whose heights overlap (the pieces of a hole another feature cuts through,
    D-018 round 2). Keep groups that go all the way round, or at least HALF_TURN_DEG where no part
    of them does; a fillet (90 deg) or a slot end (180 deg) stays out."""
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
                if c and nb not in seen and abs(c.radius - cyls[fid].radius) <= RADIUS_TOL and _same_line(c, cyls[fid]):
                    seen.add(nb)
                    todo.append(nb)
        groups.append(sorted(group))
    merged: list[list[int]] = []
    for group in groups:
        lo, hi = min(cyls[g].lo for g in group), max(cyls[g].hi for g in group)
        for other in merged:
            a, b = cyls[other[0]], cyls[group[0]]
            olo, ohi = min(cyls[g].lo for g in other), max(cyls[g].hi for g in other)
            if abs(a.radius - b.radius) <= RADIUS_TOL and _same_line(a, b) and min(hi, ohi) - max(lo, olo) > 0.01:
                other.extend(group)
                other.sort()
                break
        else:
            merged.append(group)
    out: list[Segment] = []
    for group in merged:
        members = [cyls[g] for g in group]
        span = _full_turn(members) or _full_turn(members, HALF_TURN_DEG)
        if span is None:
            continue
        base = members[0]
        out.append(Segment(group, base.origin, base.axis, base.radius, *span))
    return out


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
            end = _edge_end(seg, edges)
            if end is None:
                continue
            nb_nbs = set(topo.neighbours(nb))
            others = {owner[n] for n in nb_nbs if n in owner and owner[n] != i}
            linked = [j for j in others if _same_line(segs[j], seg)]
            if linked and _is_shoulder(topo.faces[nb], seg):  # joins two segments of one stepped hole
                seg.links.update(linked)
                if seg.radius > max(segs[j].radius for j in linked) and nb not in seg.shoulders:
                    seg.shoulders.append(nb)
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
            if (nb_nbs <= set(seg.faces) | set(around) or flat) and _within(topo.faces[nb], seg):
                if nb not in seg.bottom:
                    seg.bottom.append(nb)
                if BRepAdaptor_Surface(topo.faces[nb], True).GetType() == GeomAbs_Cone:
                    seg.point_mm = _cone_length(topo.faces[nb], seg)
                if ends.get(end) != "link":
                    ends[end] = "bottom"
                continue
            # Anything else is an open end. S3: an end on a pocket floor will take the pocket's
            # open direction (spec Features); until then it takes the hole's own axis.
            ends.setdefault(end, "open")
        seg.open_ends = [e for e in ("hi", "lo") if ends.get(e) == "open"]
        seg.groove = ends.get("hi") == "link" and ends.get("lo") == "link" and all(
            segs[j].radius < seg.radius for j in seg.links)


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
    cyls = {i: c for i, f in enumerate(faces) if (c := _cylinder(i, f))}
    segs = _segments(topo, cyls)
    _classify_ends(topo, segs)
    features = []
    for chain in _chains(segs):
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
            dims = {"diameter": 2 * s.radius, "depth": s.hi - s.lo}
            if s.point_mm is not None:
                dims["point_mm"] = s.point_mm
            dirs = [d for v in vectors if (d := _frame_dir(v, frame))]
            features.append({
                "kind": "hole",
                "faces": sorted(s.faces + s.bottom + s.shoulders),
                "axis": list(vectors[0] if vectors else s.axis),
                "open_dirs": list(dict.fromkeys(dirs)),
                "open_vectors": [list(v) for v in vectors],
                "dims_mm": dims,
            })
    features.sort(key=lambda f: min(f["faces"]))
    for n, f in enumerate(features, 1):
        f["id"] = f"hole-{n}"
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


def _wall_kind(face, n: Vec) -> str | None:
    """"plane" or "cylinder" for a face perpendicular to the floor normal n (0.5 deg), else None."""
    surface = BRepAdaptor_Surface(face, True)
    kind = surface.GetType()
    if kind == GeomAbs_Plane:
        return "plane" if abs(dot(_outward_normal(face)[1], n)) <= math.sin(ANGLE_TOL) else None
    if kind == GeomAbs_Cylinder:
        d = surface.Cylinder().Axis().Direction()
        return "cylinder" if abs(dot((d.X(), d.Y(), d.Z()), n)) >= math.cos(ANGLE_TOL) else None
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


class _Enclosure:
    """Is the gap past a floor edge inside the part? Loaded once per analysis, only when needed."""

    def __init__(self, solid):
        self.solid = solid
        self.rays = None

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
        if BRepClass3d_SolidClassifier(self.solid, gp_Pnt(*start), 1e-6).State() != TopAbs_OUT:
            return False  # material past the edge: a slope or chamfer, not a cut
        if self.rays is None:
            self.rays = _Rays(self.solid)
        c, s = math.cos(math.pi / 4), math.sin(math.pi / 4)
        dirs = [out, e, tuple(-x for x in e),
                tuple(c * out[i] + s * e[i] for i in range(3)), tuple(c * out[i] - s * e[i] for i in range(3))]
        return all(self.rays.first_hit(start, unit(d))[0] is not None for d in dirs)


def _pocket_walls(topo: Topology, floor: int, n: Vec, edges, enclosure: _Enclosure) -> list[int] | None:
    """The walls of a pocket on this floor, or None. Each outer edge of the floor meets a concave
    wall perpendicular to it, or (D-018 round 1) is cut by another feature inside the part; a cut
    pocket needs at least two walls left. A chamfer between floor and wall (D-018 round 3) leads to
    its wall and is not one."""
    walls: list[int] = []
    cut = False
    for edge in edges:
        nb = _edge_neighbour(topo, floor, edge)
        if nb is not None and _wall_kind(topo.faces[nb], n) and _concave(topo, floor, nb, edge):
            if nb not in walls:
                walls.append(nb)
        elif nb is not None and (beyond := _floor_chamfer_walls(topo, floor, nb, n, edge)):
            walls.extend(w for w in beyond if w not in walls)
        elif nb is not None and enclosure.inside(topo.faces[floor], n, edge):
            cut = True
        else:
            return None
    if cut and len(walls) < 2:
        return None
    return walls


def _floor_chamfer_walls(topo: Topology, floor: int, nb: int, n: Vec, edge) -> list[int]:
    """The walls past a chamfer between floor and wall (D-018 round 3): `nb` is a sloped plane,
    concave to the floor, that meets walls perpendicular to the floor at concave edges. Empty when
    `nb` is not such a chamfer. A chamfer is a strip: its edge to the wall runs parallel to its edge
    to the floor (a corner chamfer between two walls meets them across, and is no floor)."""
    face = topo.faces[nb]
    m = _plane_normal(face)
    if m is None or _wall_kind(face, n) or abs(dot(m, n)) >= math.cos(ANGLE_TOL) or not _concave(topo, floor, nb, edge):
        return []
    along = _edge_mid(edge)[1]
    return [k for k, edges in topo.neighbours(nb).items() if k != floor and _wall_kind(topo.faces[k], n)
            and any(_concave(topo, nb, k, e) and abs(dot(_edge_mid(e)[1], along)) >= math.cos(ANGLE_TOL) for e in edges)]


CHAMFER_MAX_TURN_DEG = 60 - math.degrees(ANGLE_TOL)  # a regular hexagon pocket turns 60 deg at each wall


def _corner_chamfers(topo: Topology, walls: list[int]) -> set[int]:
    """Planar walls that cut a corner between two planar walls (D-018 round 3): the wall turns by the
    same angle (0.05 deg) to each of its two planar neighbour walls, under CHAMFER_MAX_TURN_DEG. A side
    of a regular hexagon turns 60 deg each way and stays a wall."""
    normals = {w: m for w in walls if (m := _plane_normal(topo.faces[w])) is not None}
    out = set()
    for w, m in normals.items():
        turns = [math.degrees(math.acos(max(-1.0, min(1.0, dot(m, normals[k]))))) for k in topo.neighbours(w)
                 if k in normals and k != w]
        if len(turns) == 2 and abs(turns[0] - turns[1]) <= 0.05 and turns[0] < CHAMFER_MAX_TURN_DEG:
            out.add(w)
    return out


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


def _narrowest(topo: Topology, walls: list[int]) -> float:
    """Smallest distance between two planar walls that face each other (opposed normals, 0.5 deg)."""
    planes = [(w, _outward_normal(topo.faces[w])[1], _centre(topo.faces[w])) for w in walls
              if BRepAdaptor_Surface(topo.faces[w], True).GetType() == GeomAbs_Plane]
    best = math.inf
    for i, (a, na, ca) in enumerate(planes):
        for b, nb, cb in planes[i + 1:]:
            if dot(na, nb) > -math.cos(ANGLE_TOL) or dot(na, _sub(cb, ca)) <= 0:
                continue
            best = min(best, _distance(topo.faces[a], topo.faces[b]))
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


def pockets(solid, faces, frame: dict[str, Vec], hole_faces: set[int]) -> tuple[list[dict], list[dict]]:
    """Closed pockets and their inside corners. Returns (pockets, corners), unnumbered."""
    from OCC.Core.BRepTools import breptools as bt
    from .tools import pick_end_mill
    topo = Topology(solid, faces)
    cyls = {i: c for i, f in enumerate(faces) if (c := _cylinder(i, f))}
    found_p, found_c = [], []
    enclosure = _Enclosure(solid)
    for fid, face in enumerate(faces):
        if fid in hole_faces:
            continue
        n = _plane_normal(face)
        if n is None:
            continue
        outer = bt.OuterWire(topods.Face(face))
        outer_edges = _wire_edges(outer)
        walls = _pocket_walls(topo, fid, n, outer_edges, enclosure)
        if not walls:
            continue
        if all(w in cyls for w in walls) and (len({round(cyls[w].radius, 3) for w in walls}) == 1
                                              or all(_same_line(cyls[w], cyls[walls[0]]) for w in walls)):
            continue  # a flat-bottom hole, counterbore floor or groove (walls on one axis), not a pocket
        chamfers = _corner_chamfers(topo, walls)
        walls = [w for w in walls if w not in chamfers]
        islands: list[int] = []
        exp = TopExp_Explorer(face, TopAbs_EDGE)
        while exp.More():
            edge = exp.Current()
            exp.Next()
            if any(edge.IsSame(o) for o in outer_edges):
                continue
            nb = _edge_neighbour(topo, fid, edge)
            if nb is not None and nb not in walls and nb not in islands and _wall_kind(faces[nb], n) \
                    and _concave(topo, fid, nb, edge):
                islands.append(nb)
        floor_h = dot(_outward_normal(face)[0], n)
        depth = max(dot(p, n) for w in walls for p in _points(faces[w])) - floor_h
        corners = _corners(topo, walls, cyls)
        min_r = min((r for _, r, _ in corners), default=math.inf)
        width = _narrowest(topo, walls + islands)
        tool, undersized = pick_end_mill(min_r, width)
        pocket_faces = sorted({fid, *walls, *islands})
        dirs = [d] if (d := _frame_dir(n, frame)) else []
        found_p.append({"kind": "pocket", "faces": pocket_faces, "axis": list(n), "open_dirs": dirs,
                        "open_vectors": [list(n)],
                        "dims_mm": {"depth": depth, "min_corner_radius": 0.0 if min_r == math.inf else min_r,
                                    "end_mill_mm": tool, "undersized": int(undersized)}})
        if width != math.inf:  # no two walls face each other: no width limit, and no key
            found_p[-1]["dims_mm"]["narrowest_width"] = width
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


def walls(solid, faces) -> list[dict]:
    """Pairs of parallel planar faces with outward normals pointing away from each other and solid
    material between them. Unnumbered."""
    from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Common
    from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_Transform
    from OCC.Core.gp import gp_Trsf
    topo = Topology(solid, faces)
    rays = _Rays(solid)
    planes = [(i, *_plane_info(f)) for i, f in enumerate(faces)
              if BRepAdaptor_Surface(f, True).GetType() == GeomAbs_Plane]
    out = []
    for k, (ia, pa, na, ba) in enumerate(planes):
        for ib, pb, nb, bb in planes[k + 1:]:
            if dot(na, nb) > -math.cos(ANGLE_TOL):
                continue
            t = -dot(_sub(pb, pa), na)  # how far b lies behind a, into a's material side
            if t <= 1e-6:
                continue  # facing each other (a slot's sides) or in one plane
            move = gp_Trsf()
            move.SetTranslation(gp_Vec(*(c * -t for c in na)))
            a_on_b = BRepBuilderAPI_Transform(faces[ia], move, True).Shape()
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
                if hit is not None and topo.fid(hit) == ia and abs(w - t) <= 0.01:
                    break
            else:
                continue
            out.append({"kind": "wall", "faces": [ia, ib], "axis": [-c for c in na], "open_dirs": [],
                        "open_vectors": [], "dims_mm": {"thickness": t, "overlap_mm2": overlap}})
    return out


# --- S4 (D-016): thin material at holes ---

SIDE_STEP_DEG = 15  # rays around a hole's side every 15 deg, then every 1 deg within 15 deg of the nearest
SIDE_HEIGHTS = 3  # at 3 heights along its round part
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
    within that distance of the hole's box: a face outside it is farther than any hit that counts."""

    def __init__(self, faces, boxes, topo: Topology, own: set[int]):
        from OCC.Core.Bnd import Bnd_Box
        self.faces, self.boxes, self.topo, self.own = faces, boxes, topo, own
        self.hole_box = Bnd_Box()
        for f in own:
            self.hole_box.Add(boxes[f])

    def nearest(self, starts: list[tuple[Vec, Vec]], keep=None) -> tuple[int, float, int] | None:
        """(face id, distance, index of the ray) of the nearest first hit, or None. `keep(n)` can turn
        down a ray by its index; it is asked only for the nearest hits, nearest first."""
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
            return None
        hits: list[tuple[float, int, int]] = []  # (distance, face id, ray) of each ray's first hit
        for n, (p, d) in enumerate(starts):
            inter.Perform(gp_Lin(gp_Pnt(*p), gp_Dir(*d)), 1e-3, radius)
            if not inter.IsDone() or inter.NbPnt() == 0:
                continue
            first = min((inter.WParameter(k), self.topo.fid(inter.Face(k))) for k in range(1, inter.NbPnt() + 1))
            hits.append((round(first[0], 9), first[1], n))
        for w, fid, n in sorted(hits):  # nearest first; ties go to the lower face id
            if keep is None or keep(n):
                return fid, w, n
        return None


def hole_walls(solid, faces, hole_list: list[dict]) -> list[dict]:
    """Walls at holes (D-016), unnumbered: per hole, the thinnest material around its side (rays square
    to the axis from its round part) and, for a drill point, under its tip (rays from the tip, up to
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
        cyls = [c for f in h["faces"] if (c := _cylinder(f, faces[f]))]
        if cyls:
            x, y = _ref_frame(cyls[0].axis)
            lo, hi = min(c.lo for c in cyls), max(c.hi for c in cyls)
            def ray(c: Cyl, centre: Vec, deg: int) -> tuple[Vec, Vec, int, Vec, int]:
                ang = math.radians(deg)
                d = tuple(math.cos(ang) * x[i] + math.sin(ang) * y[i] for i in range(3))
                return tuple(centre[i] + c.radius * d[i] for i in range(3)), d, c.id, centre, deg

            starts = []
            for c in cyls:
                for k in range(SIDE_HEIGHTS):
                    t = lo + (hi - lo) * (k + 1) / (SIDE_HEIGHTS + 1)
                    if not c.lo - 1e-6 <= t <= c.hi + 1e-6:
                        continue
                    centre = tuple(c.origin[i] + (t - dot(c.origin, c.axis)) * c.axis[i] for i in range(3))
                    # a face covers only its own angles (split faces); bins are whole degrees
                    starts += [ray(c, centre, deg) for deg in range(0, 360, SIDE_STEP_DEG) if deg in c.bins]
            def on(rs):  # a ray counts only if it starts on its hole face, not in a gap cut through it
                return lambda n: _on_face(faces[rs[n][2]], rs[n][0])
            found = rays.nearest([(p, d) for p, d, *_ in starts], on(starts))
            if found:
                _, _, cid, centre, deg = starts[found[2]]
                c = next(c for c in cyls if c.id == cid)
                fine = [ray(c, centre, (deg + k) % 360) for k in range(-SIDE_STEP_DEG, SIDE_STEP_DEG + 1)
                        if (deg + k) % 360 in c.bins]
                close = rays.nearest([(p, d) for p, d, *_ in fine], on(fine))
                if close and close[1] < found[1]:
                    found, starts = close, fine
                add(starts[found[2]][2], found, h["id"], "side")  # the hole face the nearest ray left from
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
