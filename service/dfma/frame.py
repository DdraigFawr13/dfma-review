"""Face kinds and the part frame (spec Flow step 5).

+Z is the outward normal of the largest planar face; +X the outward normal of the largest
planar face perpendicular to Z (within 0.5 deg); Y = Z x X. Areas within 0.1% tie, and ties
go to the lowest face id. All later directions (+-X +-Y +-Z) are in this frame.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from OCC.Core.BRepAdaptor import BRepAdaptor_Surface
from OCC.Core.BRepGProp import BRepGProp_Face, brepgprop
from OCC.Core.BRepTools import breptools
from OCC.Core.GeomAbs import GeomAbs_Cone, GeomAbs_Cylinder, GeomAbs_Plane, GeomAbs_Torus
from OCC.Core.GProp import GProp_GProps
from OCC.Core.gp import gp_Pnt, gp_Vec

Vec = tuple[float, float, float]

KINDS = {GeomAbs_Plane: "plane", GeomAbs_Cylinder: "cylinder", GeomAbs_Cone: "cone", GeomAbs_Torus: "torus"}
ANGLE_TOL = math.radians(0.5)
AREA_TIE = 0.001  # 0.1%


@dataclass
class FaceInfo:
    id: int
    kind: str
    area: float
    normal: Vec | None  # outward normal, planes only
    axis: Vec | None  # cylinders and cones


def dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a: Vec, b: Vec) -> Vec:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def unit(a: Vec) -> Vec:
    n = math.sqrt(dot(a, a))
    return (a[0] / n, a[1] / n, a[2] / n)


def face_info(face_id: int, face) -> FaceInfo:
    surface = BRepAdaptor_Surface(face, True)
    kind = KINDS.get(surface.GetType(), "other")
    props = GProp_GProps()
    brepgprop.SurfaceProperties(face, props)
    normal = axis = None
    if kind == "plane":
        umin, umax, vmin, vmax = breptools.UVBounds(face)
        point, vec = gp_Pnt(), gp_Vec()
        BRepGProp_Face(face).Normal((umin + umax) / 2, (vmin + vmax) / 2, point, vec)  # follows face orientation
        normal = unit((vec.X(), vec.Y(), vec.Z()))
    elif kind in ("cylinder", "cone"):
        d = (surface.Cylinder() if kind == "cylinder" else surface.Cone()).Axis().Direction()
        axis = (d.X(), d.Y(), d.Z())
    return FaceInfo(face_id, kind, props.Mass(), normal, axis)


def largest(candidates: list[FaceInfo]) -> FaceInfo | None:
    if not candidates:
        return None
    top = max(f.area for f in candidates)
    return min((f for f in candidates if f.area >= top * (1 - AREA_TIE)), key=lambda f: f.id)


def part_frame(infos: list[FaceInfo], vertices: list[Vec]) -> dict[str, Vec]:
    planes = [f for f in infos if f.kind == "plane"]
    top = largest(planes)
    if top is not None:
        z = top.normal
    else:
        z = turning_axis(infos, vertices)
        if z is None:
            z = (0.0, 0.0, 1.0)

    side = largest([f for f in planes if abs(dot(f.normal, z)) <= math.sin(ANGLE_TOL)])
    if side is not None:
        x = side.normal
    else:
        ref = (1.0, 0.0, 0.0)
        if abs(dot(ref, z)) >= math.cos(math.radians(10)):
            ref = (0.0, 1.0, 0.0)
        d = dot(ref, z)
        x = unit((ref[0] - d * z[0], ref[1] - d * z[1], ref[2] - d * z[2]))
    # Make X exactly perpendicular to Z (it is within 0.5 deg).
    d = dot(x, z)
    x = unit((x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]))
    return {"x": x, "y": cross(z, x), "z": z}


def turning_axis(infos: list[FaceInfo], vertices: list[Vec]) -> Vec | None:
    """The axis direction carrying the most cylinder and cone area.

    Sign: towards the end with more face area at its extreme (spec Flow step 5), measured here
    as the number of mesh vertices within 0.01 mm of each extreme along the axis.
    """
    groups: list[list] = []  # [direction, area]
    for f in infos:
        if f.axis is None:
            continue
        for g in groups:
            if abs(dot(g[0], f.axis)) >= math.cos(ANGLE_TOL):
                g[1] += f.area
                break
        else:
            groups.append([f.axis, f.area])
    if not groups:
        return None
    axis = max(groups, key=lambda g: g[1])[0]
    along = [dot(v, axis) for v in vertices]
    if along:
        hi, lo = max(along), min(along)
        at_hi = sum(1 for a in along if a >= hi - 0.01)
        at_lo = sum(1 for a in along if a <= lo + 0.01)
        if at_lo > at_hi:
            axis = (-axis[0], -axis[1], -axis[2])
    return axis


def extents_mm(frame: dict[str, Vec], vertices: list[Vec]) -> list[float]:
    """Extents along frame X, Y and Z, from the mesh vertices."""
    out = []
    for key in ("x", "y", "z"):
        along = [dot(v, frame[key]) for v in vertices]
        out.append(max(along) - min(along) if along else 0.0)
    return out
