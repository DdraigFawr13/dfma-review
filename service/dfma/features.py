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


def _segments(topo: Topology, cyls: dict[int, Cyl]) -> list[Segment]:
    """Group concave cylinders that share edges, axis and radius; keep groups spanning 360 deg."""
    seen: set[int] = set()
    out: list[Segment] = []
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
        members = [cyls[g] for g in sorted(group)]
        span = _full_turn(members)
        if span is None:
            continue
        base = members[0]
        out.append(Segment(sorted(group), base.origin, base.axis, base.radius, *span))
    return out


def _full_turn(members: list[Cyl]) -> tuple[float, float] | None:
    """The height range where the group goes all the way round (360 deg within 1 deg), or None.

    Faces of one hole can be split lengthwise (halves) or across (stacked bands), and a hole that
    exits onto a sloped or curved face has halves of different lengths: the hole is the part that
    is round all the way, and its depth is measured there. Two half-faces that never overlap in
    height are not a hole.
    """
    cuts = sorted({round(v, 4) for m in members for v in (m.lo, m.hi)})
    full = [(a, b) for a, b in zip(cuts, cuts[1:]) if b - a > 0.01 and len(set().union(
        *(m.bins for m in members if m.lo <= a + 0.01 and m.hi >= b - 0.01))) >= 359]
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
            # A bottom closes the hole: its faces touch only this segment and each other
            # (a flat or cone point, or a filleted, ball or split bottom).
            if nb_nbs <= set(seg.faces) | set(around):
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
            if s.groove:
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


def _into(face, p: Vec, n: Vec, e: Vec, step: float = 0.05) -> Vec | None:
    """The direction from a point on a face's edge into the face (perpendicular to the edge)."""
    from OCC.Core.BRepClass import BRepClass_FaceClassifier
    from OCC.Core.TopAbs import TopAbs_IN
    d = unit(cross(n, e))
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


def _walls_across(topo: Topology, floor: int, n: Vec, edges) -> list[int] | None:
    """The concave perpendicular walls across a set of floor edges; None if any edge has none."""
    walls: list[int] = []
    for edge in edges:
        nb = _edge_neighbour(topo, floor, edge)
        if nb is None or not _wall_kind(topo.faces[nb], n) or not _concave(topo, floor, nb, edge):
            return None
        if nb not in walls:
            walls.append(nb)
    return walls


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
    for fid, face in enumerate(faces):
        if fid in hole_faces:
            continue
        n = _plane_normal(face)
        if n is None:
            continue
        outer = bt.OuterWire(topods.Face(face))
        outer_edges = _wire_edges(outer)
        walls = _walls_across(topo, fid, n, outer_edges)
        if not walls:
            continue
        if all(w in cyls for w in walls) and len({round(cyls[w].radius, 3) for w in walls}) == 1:
            continue  # a flat-bottom hole or counterbore floor, not a pocket
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
    return [p for _, p in sorted(centroids)] + samples


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
            common = BRepAlgoAPI_Common(a_on_b, faces[ib])
            common.Build()
            overlap = _area(common.Shape()) if common.IsDone() else 0.0
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
