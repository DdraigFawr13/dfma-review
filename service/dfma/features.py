"""Feature recognition on analytic faces (spec Design "Features"). S2: holes.

A hole is a set of concave cylindrical faces that share edges, with the same axis (0.5 deg)
and radius (0.001 mm), spanning the full 360 deg. Stepped segments join through a shoulder
(a plane perpendicular to the axis, or a cone) into one chain; every segment takes the
chain's open ends. A flat or conical bottom belongs to its segment.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from OCC.Core.BRep import BRep_Tool
from OCC.Core.BRepAdaptor import BRepAdaptor_Surface
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
SPAN_TOL = math.radians(0.5)
DIRS = {"+X": ("x", 1), "-X": ("x", -1), "+Y": ("y", 1), "-Y": ("y", -1), "+Z": ("z", 1), "-Z": ("z", -1)}


@dataclass
class Cyl:
    id: int
    origin: Vec
    axis: Vec
    radius: float
    span: float  # radians covered
    lo: float  # extent along axis (dot with axis)
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
    origin, axis = _pt(ax.Location()), unit(_pt(ax.Direction()))
    point, normal = _outward_normal(face)
    rel = _sub(point, origin)
    radial = _sub(rel, tuple(dot(rel, axis) * a for a in axis))
    if dot(normal, radial) >= 0:  # convex: the outward normal points away from the axis
        return None
    umin, umax, _, _ = breptools.UVBounds(face)
    along = [dot(_sub(v, origin), axis) for v in _vertices(face)]
    return Cyl(face_id, origin, axis, cyl.Radius(), umax - umin, min(along), max(along))


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
        # Faces of one segment can sit at different heights (a split wall); count the span once per height band.
        if sum(m.span for m in members) < 2 * math.pi - SPAN_TOL:
            continue
        base = members[0]
        out.append(Segment(sorted(group), base.origin, base.axis, base.radius,
                           min(m.lo for m in members), max(m.hi for m in members)))
    return out


def _edge_end(seg: Segment, edges) -> str:
    along = [dot(_sub(v, seg.origin), seg.axis) for e in edges for v in _vertices(e)]
    mid = sum(along) / len(along)
    return "hi" if abs(mid - seg.hi) < abs(mid - seg.lo) else "lo"


def _classify_ends(topo: Topology, segs: list[Segment]) -> None:
    owner = {f: i for i, s in enumerate(segs) for f in s.faces}
    for i, seg in enumerate(segs):
        ends: dict[str, str] = {}
        for fid in seg.faces:
            for nb, edges in topo.neighbours(fid).items():
                if nb in seg.faces:
                    continue
                end = _edge_end(seg, edges)
                kind = BRepAdaptor_Surface(topo.faces[nb], True).GetType()
                nb_nbs = set(topo.neighbours(nb))
                if kind in (GeomAbs_Plane, GeomAbs_Cone):
                    others = {owner[n] for n in nb_nbs if n in owner and owner[n] != i}
                    linked = [j for j in others if _same_line(segs[j], seg)]
                    if linked:  # a shoulder joining two segments of one stepped hole
                        seg.links.update(linked)
                        if seg.radius > max(segs[j].radius for j in linked) and nb not in seg.shoulders:
                            seg.shoulders.append(nb)
                        ends.setdefault(end, "link")
                        continue
                    if nb_nbs <= set(seg.faces):  # a disk or a cone point closing the hole
                        if nb not in seg.bottom:
                            seg.bottom.append(nb)
                        if kind == GeomAbs_Cone:
                            seg.point_mm = _cone_length(topo.faces[nb], seg)
                        ends.setdefault(end, "bottom")
                        continue
                ends[end] = "open" if ends.get(end) != "link" else "link"
        seg.open_ends = [e for e in ("hi", "lo") if ends.get(e) == "open"]


def _cone_length(face, seg: Segment) -> float:
    along = [dot(_sub(v, seg.origin), seg.axis) for v in _vertices(face)]
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
