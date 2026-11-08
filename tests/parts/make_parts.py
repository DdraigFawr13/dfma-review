"""Build every test part with OpenCascade and write the STEP files and expected.toml.

Run from the repo root inside the dfma environment:  python tests/parts/make_parts.py
Both outputs are committed. Face counts come from the shapes built here
(TopExp.MapShapes), never from the service, so the tests are not circular.
"""

from __future__ import annotations

import sys
from pathlib import Path

import math

from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_MakeFace
from OCC.Core.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCone, BRepPrimAPI_MakeCylinder
from OCC.Core.TopAbs import TopAbs_EDGE
from OCC.Core.TopoDS import topods
from OCC.Core.BRep import BRep_Tool
from OCC.Core.GeomAbs import GeomAbs_Line
from OCC.Core.BRepAdaptor import BRepAdaptor_Curve
from OCC.Core.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Pln, gp_Pnt
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Core.Interface import Interface_Static
from OCC.Core.Message import Message_Gravity, message
from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Writer
from OCC.Core.TopAbs import TopAbs_FACE
from OCC.Core.TopExp import topexp
from OCC.Core.TopTools import TopTools_IndexedMapOfShape

HERE = Path(__file__).resolve().parent
IN = 25.4  # mm per inch

# Keep OpenCascade's transfer banners off the console.
message.DefaultMessenger().Printers().First().SetTraceLevel(Message_Gravity.Message_Fail)


def face_count(shape) -> int:
    faces = TopTools_IndexedMapOfShape()
    topexp.MapShapes(shape, TopAbs_FACE, faces)
    return faces.Size()


def write_step(shape, name: str, unit: str) -> None:
    """Write `shape` (modelled in mm) to tests/parts/<name>.step in `unit` (MM or INCH)."""
    writer = STEPControl_Writer()
    Interface_Static.SetCVal("write.step.unit", unit)
    writer.Transfer(shape, STEPControl_AsIs)
    status = writer.Write(str(HERE / f"{name}.step"))
    if status != IFSelect_RetDone:
        raise RuntimeError(f"could not write {name}.step")


def box_through_hole():
    """2.000 x 1.000 x 0.500 in block with a centred 0.250 in hole through the 0.500 in side."""
    box = BRepPrimAPI_MakeBox(2.0 * IN, 1.0 * IN, 0.5 * IN).Shape()
    axis = gp_Ax2(gp_Pnt(1.0 * IN, 0.5 * IN, -1.0), gp_Dir(0, 0, 1))
    hole = BRepPrimAPI_MakeCylinder(axis, 0.125 * IN, 0.5 * IN + 2.0).Shape()
    cut = BRepAlgoAPI_Cut(box, hole)
    cut.Build()
    return cut.Shape()


def cut(shape, *tools):
    for tool in tools:
        op = BRepAlgoAPI_Cut(shape, tool)
        op.Build()
        if not op.IsDone():
            raise RuntimeError("cut failed")
        shape = op.Shape()
    return shape


def block(l_in, w_in, h_in):
    """A block from the origin, sizes in inches, modelled in mm."""
    return BRepPrimAPI_MakeBox(l_in * IN, w_in * IN, h_in * IN).Shape()


def hole_from_top(x_mm, y_mm, top_mm, d_mm, depth_mm, angle=2 * math.pi):
    """A cylinder tool from `depth_mm` below the top face to 1 mm above it (open to +Z)."""
    axis = gp_Ax2(gp_Pnt(x_mm, y_mm, top_mm - depth_mm), gp_Dir(0, 0, 1))
    return BRepPrimAPI_MakeCylinder(axis, d_mm / 2, depth_mm + 1.0, angle).Shape()


def through_z(x_mm, y_mm, h_mm, d_mm, angle=2 * math.pi, start=0.0):
    axis = gp_Ax2(gp_Pnt(x_mm, y_mm, -1.0), gp_Dir(0, 0, 1))
    if start:
        axis.Rotate(gp_Ax1(gp_Pnt(x_mm, y_mm, 0), gp_Dir(0, 0, 1)), start)
    return BRepPrimAPI_MakeCylinder(axis, d_mm / 2, h_mm + 2.0, angle).Shape()


def blind_block(l, w, h, d, depth):
    """A block with a flat-bottom hole of diameter d (in), `depth` in deep, centred on +Z."""
    return cut(block(l, w, h), hole_from_top(l * IN / 2, w * IN / 2, h * IN, d * IN, depth * IN))


def through_block(l, w, h, d):
    return cut(block(l, w, h), through_z(l * IN / 2, w * IN / 2, h * IN, d * IN))


def fillet_not_hole():
    """3 x 2 x 1 in block, a 2 x 1 x 0.5 in pocket open to +Z with 0.100 in corner fillets."""
    tool = BRepPrimAPI_MakeBox(gp_Pnt(0.5 * IN, 0.5 * IN, 0.5 * IN), 2.0 * IN, 1.0 * IN, 1.0 * IN).Shape()
    fillet = BRepFilletAPI_MakeFillet(tool)
    edges = TopTools_IndexedMapOfShape()
    topexp.MapShapes(tool, TopAbs_EDGE, edges)
    for i in range(1, edges.Size() + 1):
        edge = topods.Edge(edges.FindKey(i))
        curve = BRepAdaptor_Curve(edge)
        if curve.GetType() == GeomAbs_Line and abs(curve.Line().Direction().Z()) > 0.999:
            fillet.Add(0.100 * IN, edge)
    return cut(block(3, 2, 1), fillet.Shape())


def pocket_tool(x0, y0, l, w, z0, h, r):
    """A box tool for a pocket (inches): its 4 vertical edges filleted with radius r (0: sharp)."""
    tool = BRepPrimAPI_MakeBox(gp_Pnt(x0 * IN, y0 * IN, z0 * IN), l * IN, w * IN, h * IN).Shape()
    if not r:
        return tool
    fillet = BRepFilletAPI_MakeFillet(tool)
    edges = TopTools_IndexedMapOfShape()
    topexp.MapShapes(tool, TopAbs_EDGE, edges)
    for i in range(1, edges.Size() + 1):
        edge = topods.Edge(edges.FindKey(i))
        curve = BRepAdaptor_Curve(edge)
        if curve.GetType() == GeomAbs_Line and abs(curve.Line().Direction().Z()) > 0.999:
            fillet.Add(r * IN, edge)
    return fillet.Shape()


def pocket_part(depth, r, size=(3, 2, 1), pocket=(2, 1), island=None):
    """A block with a pocket centred on +Z (inches). `island` = (side, drop): a square island
    in the middle whose top sits `drop` below the rim."""
    l, w, h = size
    pl, pw = pocket
    x0, y0 = (l - pl) / 2, (w - pw) / 2
    tool = pocket_tool(x0, y0, pl, pw, h - depth, depth + 0.5, r)
    if island:
        side, drop = island
        boss = BRepPrimAPI_MakeBox(gp_Pnt((l - side) / 2 * IN, (w - side) / 2 * IN, (h - depth - 0.1) * IN),
                                   side * IN, side * IN, (depth + 0.1 - drop) * IN).Shape()
        tool = cut(tool, boss)
    return cut(block(l, w, h), tool)


def corner_probes(depth, r, size=(3, 2, 1), pocket=(2, 1)):
    """One probe per pocket corner (mm), at mid-depth: on the fillet at 45 deg, or on the sharp edge."""
    l, w, h = size
    pl, pw = pocket
    x0, y0 = (l - pl) / 2, (w - pw) / 2
    z = h - depth / 2
    out = []
    for cx, sx in ((x0, 1), (x0 + pl, -1)):
        for cy, sy in ((y0, 1), (y0 + pw, -1)):
            d = r - r / math.sqrt(2)  # from the corner of the box to the fillet at 45 deg, along each axis
            out.append((round((cx + sx * d) * IN, 4), round((cy + sy * d) * IN, 4), round(z * IN, 4)))
    return out


def floor_probe(depth, size=(3, 2, 1), pocket=(2, 1), island=None):
    """A probe on the pocket floor (mm), clear of any island."""
    l, w, h = size
    x0, y0 = (l - pocket[0]) / 2, (w - pocket[1]) / 2
    return (round((x0 + 0.1) * IN, 4), round(w / 2 * IN, 4), round((h - depth) * IN, 4))


def metric_block(d_mm):
    return cut(BRepPrimAPI_MakeBox(50.0, 25.0, 12.0).Shape(), through_z(25.0, 12.5, 12.0, d_mm))


def two_holes_web():
    """1 x 1 x 2 in block, coaxial 0.250 in holes 0.900 in deep from +Z and -Z, 0.200 in web."""
    up = hole_from_top(0.5 * IN, 0.5 * IN, 2.0 * IN, 0.25 * IN, 0.9 * IN)
    down_axis = gp_Ax2(gp_Pnt(0.5 * IN, 0.5 * IN, 0.9 * IN), gp_Dir(0, 0, -1))
    down = BRepPrimAPI_MakeCylinder(down_axis, 0.125 * IN, 0.9 * IN + 1.0).Shape()
    return cut(block(1, 1, 2), up, down)


def split_hole():
    """odd_hole's block with a 0.250 in through hole made of two half-cylinder faces."""
    x, y, h = 1.0 * IN, 0.5 * IN, 0.5 * IN
    return cut(block(2, 1, 0.5), through_z(x, y, h, 0.25 * IN, math.pi), through_z(x, y, h, 0.25 * IN, math.pi, math.pi))


def stepped_hole():
    """2 x 2 x 1 in block, a 7/16 in counterbore 0.250 in deep over a 0.250 in hole through."""
    c = 1.0 * IN
    return cut(block(2, 2, 1), hole_from_top(c, c, 1.0 * IN, 0.4375 * IN, 0.25 * IN), through_z(c, c, 1.0 * IN, 0.25 * IN))


def drill_point_hole():
    """1 x 1 x 2 in block, a 0.250 in hole 1.000 in deep to where a 118 degree point starts."""
    c, top, r = 0.5 * IN, 2.0 * IN, 0.125 * IN
    point = r / math.tan(math.radians(59.0))
    cone = BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(c, c, top - 1.0 * IN), gp_Dir(0, 0, -1)), r, 0.0, point).Shape()
    return cut(block(1, 1, 2), hole_from_top(c, c, top, 2 * r, 1.0 * IN), cone), point


def clean_holes():
    """3 x 2 x 0.75 in block, a 0.250 in and a 0.500 in through hole, 1.500 in apart."""
    h = 0.75 * IN
    return cut(block(3, 2, 0.75), through_z(0.75 * IN, 1.0 * IN, h, 0.25 * IN), through_z(2.25 * IN, 1.0 * IN, h, 0.5 * IN))


def fuse(shape, *tools):
    from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Fuse
    for tool in tools:
        op = BRepAlgoAPI_Fuse(shape, tool)
        op.SimplifyResult()
        op.Build()
        if not op.IsDone():
            raise RuntimeError("fuse failed")
        shape = op.Shape()
    return shape


def box_at(x, y, z, l, w, h):
    """A box from (x, y, z), inches, modelled in mm."""
    return BRepPrimAPI_MakeBox(gp_Pnt(x * IN, y * IN, z * IN), l * IN, w * IN, h * IN).Shape()


def thin_rib():
    """2.000 x 1.000 x 0.500 in base with a rib 1.500 long (X), 0.040 thick (Y) and 1.000 tall on top, centred."""
    return fuse(block(2, 1, 0.5), box_at(0.25, 0.48, 0.5, 1.5, 0.04, 1.0))


def slot_not_wall():
    """2.000 x 1.000 x 0.500 in block with a 0.040 in slot 0.250 in deep across it (along Y), centred."""
    return cut(block(2, 1, 0.5), box_at(0.98, -0.1, 0.25, 0.04, 1.2, 0.5))


def clean_walls():
    """3.000 x 2.000 x 0.250 in base, two 0.500 in square bosses 0.750 in tall with 1.000 in of air
    between them, and a 0.250 in hole through the base between them."""
    base = cut(block(3, 2, 0.25), through_z(1.5 * IN, 1.0 * IN, 0.25 * IN, 0.25 * IN))
    return fuse(base, box_at(0.5, 0.75, 0.25, 0.5, 0.5, 0.75), box_at(2.0, 0.75, 0.25, 0.5, 0.5, 0.75))


def thin_drill_point():
    """1.000 in cube, a 0.250 in hole from +Z with a 118 deg drill point whose tip is 0.015 in above the bottom."""
    c, top, r = 0.5 * IN, 1.0 * IN, 0.125 * IN
    point = r / math.tan(math.radians(59.0))
    start = 0.015 * IN + point  # where the point starts, above the bottom
    cone = BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(c, c, start), gp_Dir(0, 0, -1)), r, 0.0, point).Shape()
    return cut(block(1, 1, 1), hole_from_top(c, c, top, 2 * r, top - start), cone)


def hole_near_edge():
    """2.000 x 1.000 x 0.500 in block, a 0.250 in through hole whose side is 0.020 in from the -Y face."""
    return cut(block(2, 1, 0.5), through_z(1.0 * IN, 0.145 * IN, 0.5 * IN, 0.25 * IN))


def holes_close():
    """2.000 x 1.000 x 0.500 in block, two 0.250 in through holes with 0.025 in of material between them."""
    h = 0.5 * IN
    return cut(block(2, 1, 0.5), through_z(0.8625 * IN, 0.5 * IN, h, 0.25 * IN), through_z(1.1375 * IN, 0.5 * IN, h, 0.25 * IN))


# --- S5: machine and setups (spec S5; D-022) ---------------------------------------------------


def rotate_30(shape):
    """The shape turned 30 deg about the axis (1, 2, 3) through the origin: off every file axis."""
    from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_Transform
    return BRepBuilderAPI_Transform(shape, ROT30, True).Shape()


def _rot30():
    from OCC.Core.gp import gp_Trsf
    t = gp_Trsf()
    t.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(1, 2, 3)), math.radians(30))
    return t


ROT30 = _rot30()


def rotated(p):
    q = gp_Pnt(*p).Transformed(ROT30)
    return (q.X(), q.Y(), q.Z())


def tilted_cylinder(centre_in, d_in, tilt_deg, before_in, after_in):
    """A cylinder tool of diameter d_in whose axis runs through centre_in (inches), tilted tilt_deg from -Z
    towards -X; it starts before_in up the axis from the centre and runs after_in down past it."""
    a = math.radians(tilt_deg)
    u = (-math.sin(a), 0.0, -math.cos(a))  # down the hole
    start = tuple((centre_in[i] - before_in * u[i]) * IN for i in range(3))
    return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(*start), gp_Dir(*u)), d_in / 2 * IN, (before_in + after_in) * IN).Shape(), u


def two_sided_block():
    """J4: 2 x 3 x 1.5 in block; a 1.25 x 1.0 x 0.25 in pocket open to the top (model +Z), a 1.0 x 0.75 x 0.25 in
    pocket open to the bottom (model -Z), both r 0.125 in, and a 0.250 in blind hole 0.750 in deep from the
    model +X face at y 1.5, z 0.75."""
    top = pocket_tool(0.375, 0.25, 1.25, 1.0, 1.25, 0.75, 0.125)
    bottom = pocket_tool(0.5, 1.75, 1.0, 0.75, -0.5, 0.75, 0.125)
    hole = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(1.25 * IN, 1.5 * IN, 0.75 * IN), gp_Dir(1, 0, 0)), 0.125 * IN, 1.0 * IN).Shape()
    return cut(block(2, 3, 1.5), top, bottom, hole)


def angled_hole():
    """2 x 2 x 1 in block, a 0.250 in hole through its middle, tilted 30 deg from Z towards X."""
    tool, _ = tilted_cylinder((1.0, 1.0, 0.5), 0.25, 30, 1.0, 1.0)
    return cut(block(2, 2, 1), tool)


def angled_hole_in_pocket():
    """D-022: 2.5 x 2 x 1 in block, a 1.5 x 1.0 x 0.25 in pocket (r 0.125 in) from the top, and a 0.250 in hole
    drilled from the middle of its floor through the bottom, tilted 20 deg."""
    pocket = pocket_tool(0.5, 0.5, 1.5, 1.0, 0.75, 0.75, 0.125)
    tool, u = tilted_cylinder((1.25, 1.0, 0.75), 0.25, 20, 0.3, 1.1)
    return cut(block(2.5, 2, 1), pocket, tool), u


def through_hole_two_dirs():
    """1.25 x 2.5 x 1 in block, a 0.250 in hole through it along X (open both ways: 1 setup, not 2)."""
    hole = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(-1.0, 1.25 * IN, 0.5 * IN), gp_Dir(1, 0, 0)), 0.125 * IN, 1.25 * IN + 2.0).Shape()
    return cut(block(1.25, 2.5, 1), hole)


def clean_one_setup():
    """2.5 x 2 x 1 in block; from the top: a 1.0 x 1.0 x 0.25 in pocket (r 0.125 in), a 0.250 in through hole
    and a 0.250 in blind hole 0.500 in deep."""
    pocket = pocket_tool(0.25, 0.5, 1.0, 1.0, 0.75, 0.75, 0.125)
    return cut(block(2.5, 2, 1), pocket, through_z(1.875 * IN, 0.5 * IN, 1.0 * IN, 0.25 * IN),
               hole_from_top(1.875 * IN, 1.5 * IN, 1.0 * IN, 0.25 * IN, 0.5 * IN))


def countersunk_hole():
    """D-022: 2 x 1 x 0.5 in block, a 0.250 in through hole with an 82 deg countersink to 0.500 in at the top."""
    r, R = 0.125 * IN, 0.25 * IN
    h = (R - r) / math.tan(math.radians(41))
    # from radius r at depth h below the top, widening 41 deg from the axis, to 1 mm above the top
    cone = BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(1.0 * IN, 0.5 * IN, 0.5 * IN - h), gp_Dir(0, 0, 1)),
                                r, r + (h + 1.0) * math.tan(math.radians(41)), h + 1.0).Shape()
    return cut(block(2, 1, 0.5), through_z(1.0 * IN, 0.5 * IN, 0.5 * IN, 0.25 * IN), cone)


def single_face():
    return BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), 0, 20, 0, 10).Face()



# --- S6: turning (spec S6, J5) ---------------------------------------------------------------------


def rod(d_in, l_in, at_in=(0.0, 0.0, 0.0), axis=(0, 0, 1)):
    """A cylinder of diameter d_in and length l_in (inches) from at_in along axis, modelled in mm."""
    return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(*(a * IN for a in at_in)), gp_Dir(*axis)), d_in / 2 * IN,
                                    l_in * IN).Shape()


def slender_shaft():
    """J5: 0.500 in diameter, 4.500 in long along Z, a 0.125 in cross hole through it along X at mid-length."""
    return cut(rod(0.5, 4.5), rod(0.125, 1.0, (-0.5, 0.0, 2.25), (1, 0, 0)))


def stout_shaft():
    """1.000 in diameter, 5.000 in long: length 5.0x diameter."""
    return rod(1.0, 5.0)


def shaft_with_groove_and_bore():
    """1.500 in diameter, 3.000 in long; an outside groove 0.125 in wide and 0.100 in deep from z 1.500 in; a 0.750 in
    bore 1.000 in deep from the top, with an inside groove 0.875 in across and 0.125 in wide from z 2.400 in."""
    ring = cut(rod(2.0, 0.125, (0, 0, 1.5)), rod(1.3, 0.125, (0, 0, 1.5)))
    return cut(rod(1.5, 3.0), ring, rod(0.75, 1.5, (0, 0, 2.0)), rod(0.875, 0.125, (0, 0, 2.4)))


def flange_bolt_hole():
    """A flange: 2.000 in across and 0.500 in thick, with a 1.000 in hub 1.000 in long on top; a 0.250 in bolt
    hole through the flange, parallel to the axis and 0.750 in off it (Morgan, 2026-11-08: an off-centre hole)."""
    return cut(fuse(rod(2.0, 0.5), rod(1.0, 1.0, (0, 0, 0.5))), rod(0.25, 1.0, (0.75, 0.0, -0.25)))


def clean_shaft():
    """1.000 in diameter for 2.000 in, then 0.750 in to 3.000 in long; a 0.1875 in (3/16) hole 0.5625 in deep on
    the axis from the small end (3.0x diameter)."""
    return cut(fuse(rod(1.0, 2.0), rod(0.75, 1.0, (0, 0, 2.0))), rod(0.1875, 1.0, (0, 0, 2.4375)))

# --- expected.toml (small string writer; reading uses tomllib) -----------------


def toml_value(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, dict):
        return "{ " + ", ".join(f"{k} = {toml_value(v)}" for k, v in value.items()) + " }"
    if isinstance(value, list):
        return "[" + ", ".join(toml_value(v) for v in value) + "]"
    raise TypeError(type(value))


def toml_parts(parts: list[dict]) -> str:
    out = ["# Generated by tests/parts/make_parts.py; don't edit by hand.", ""]
    for part in parts:
        out.append("[[part]]")
        for key, value in part.items():
            if key != "finding":
                out.append(f"{key} = {toml_value(value)}")
        for finding in part.get("finding", []):
            out.append("[[part.finding]]")
            out.extend(f"{k} = {toml_value(v)}" for k, v in finding.items())
        out.append("")
    return "\n".join(out)


NO_FEATURES = {"hole": 0, "pocket": 0, "corner": 0, "wall": 0}


def main() -> int:
    parts: list[dict] = []

    # Wall counts are counted by hand from the spec's rule (S4 "Settled at build"), never from the
    # service: every pair of opposed planar faces with material between them and 10 mm2 of overlap.
    # A plain block has 3 (its X, Y and Z pairs).
    def add(shape, name, unit, holes, findings=(), pockets=0, corners=0, walls=3, **extra):
        write_step(shape, name, "INCH" if unit == "inch" else "MM")
        entry = {"name": name, "units": unit, "face_count": face_count(shape),
                 "features": {**NO_FEATURES, "hole": holes, "pocket": pockets, "corner": corners, "wall": walls},
                 **extra}
        if findings:
            entry["finding"] = list(findings)
        parts.append(entry)

    def finding(rule, severity, measured, probe):
        return {"rule": rule, "severity": severity, "measured": measured, "probe_mm": [round(v, 4) for v in probe]}

    shape = box_through_hole()
    # 6.35 mm is 1/4 in: a standard inch drill, accepted in mm files too (D-013).
    add(shape, "box_through_hole", "mm", 1)
    add(shape, "box_inch", "inch", 1)

    add(blind_block(1, 1, 2.5, 0.25, 2.0), "deep_hole", "inch", 1, walls=4,  # + hole bottom to the far face
        findings=[finding("hole_depth", "medium", 8.0, (0.5 * IN + 0.125 * IN, 0.5 * IN, 1.5 * IN))])
    add(blind_block(1, 1, 3.25, 0.25, 2.75), "very_deep_hole", "inch", 1, walls=4,
        findings=[finding("hole_depth", "high", 11.0, (0.5 * IN + 0.125 * IN, 0.5 * IN, 2.0 * IN))])
    add(through_block(2, 1, 0.5, 0.26), "odd_hole", "inch", 1,
        [finding("hole_size", "medium", 0.26, (1.0 * IN + 0.13 * IN, 0.5 * IN, 0.25 * IN))])
    add(fillet_not_hole(), "fillet_not_hole", "inch", 0, pockets=1, corners=4, walls=8)  # 3/16 in fits: 2.67, clean
    add(metric_block(6.55), "odd_metric_hole", "mm", 1,
        [finding("hole_size", "medium", round(6.55 / IN, 4), (25.0 + 3.275, 12.5, 6.0))])
    add(metric_block(6.5), "metric_hole", "mm", 1)
    add(blind_block(2, 2, 1, 0.5, 0.75), "flat_bottom_hole", "inch", 1, walls=4)
    add(two_holes_web(), "two_holes_web", "inch", 2, walls=4)  # + the 0.200 in web; each bottom to the far face crosses the other hole
    add(split_hole(), "split_hole", "inch", 1)
    add(stepped_hole(), "stepped_hole", "inch", 2, walls=4)  # + the shoulder to the bottom
    shape, point = drill_point_hole()
    add(shape, "drill_point_hole", "inch", 1, point_mm=round(point, 4))
    add(clean_holes(), "clean_holes", "inch", 2)

    # S3 pockets (spec S3 "Settled at build"). Ratios: depth / the end mill pick_end_mill returns.
    def corners(depth, r, severity, measured, **kw):
        return [finding("corner_radius", severity, measured, p) for p in corner_probes(depth, r, **kw)]

    def pocket_finding(depth, measured, **kw):
        return finding("pocket_depth", "medium", measured, floor_probe(depth, **kw))

    add(pocket_part(0.25, 0), "pocket_sharp", "inch", 0,
        corners(0.25, 0, "high", 0.0) + [pocket_finding(0.25, 8.0)], pockets=1, corners=4, walls=8)  # nothing fits: 1/32 in, undersized
    add(pocket_part(0.0625, 0.020), "pocket_small_radius", "inch", 0,
        corners(0.0625, 0.020, "medium", 0.02), pockets=1, corners=4, walls=8)  # 1/32 in: 2.0, no depth finding
    add(pocket_part(0.5, 0.050), "pocket_long_thin_tool", "inch", 0,
        corners(0.5, 0.050, "medium", round(0.5 / 0.09375, 4)) + [pocket_finding(0.5, round(0.5 / 0.09375, 4))],
        pockets=1, corners=4, walls=8)  # 3/32 in: 5.33
    add(pocket_part(0.8, 0.150), "pocket_deep", "inch", 0, [pocket_finding(0.8, 3.2)], pockets=1, corners=4, walls=8)  # 1/4 in
    add(pocket_part(0.8, 0.300, size=(3.5, 2.5, 1.25), pocket=(2.5, 1.5)), "pocket_deep_wide", "inch", 0,
        pockets=1, corners=4, walls=8)  # 1/2 in: 1.6, clean
    add(pocket_part(0.6, 0.140, island=(0.6, 0.1)), "pocket_island", "inch", 0,
        [pocket_finding(0.6, 3.2)], pockets=1, corners=4, walls=11)  # + island top to bottom, island X and Y pairs; 0.200 in gap: 3/16 in, not 1/4 in
    add(pocket_part(0.4, 0.150), "clean_pocket", "inch", 0, pockets=1, corners=4, walls=8)  # 1/4 in: 1.6

    # S4 walls (spec S4 "Settled at build"). Limits: 0.030 in al6061, 0.020 in steels, 0.060 in plastic.
    rib_probe = (1.0 * IN, 0.48 * IN, 1.0 * IN)  # middle of the rib's -Y side
    # base X, Y and Z pairs, rib top to base bottom, rib X pair, rib Y pair (0.040 in)
    add(thin_rib(), "thin_rib", "inch", 0, walls=6)  # 0.040 in is over 0.030 in: clean in 6061
    add(thin_rib(), "thin_rib", "inch", 0, walls=6, material="plastic",
        findings=[finding("thin_wall", "high", 0.04, rib_probe)])  # under 0.060 in
    # block 3, 4 pocket walls to outer faces, floor to bottom: a 0.015 in floor, under every limit
    add(pocket_part(0.485, 0.150, size=(3, 2, 0.5)), "thin_floor", "inch", 0, pockets=1, corners=4, walls=8,
        findings=[finding("thin_wall", "high", 0.015, (1.5 * IN, 1.0 * IN, 0.015 * IN))])  # 1/4 in: 1.94
    # X pair (below the slot), Y pair, each top half to the bottom, slot floor to the bottom, each slot
    # side to its outer end face; the slot's sides face each other across air, so they are no wall.
    add(slot_not_wall(), "slot_not_wall", "inch", 0, walls=7)
    add(slot_not_wall(), "slot_not_wall", "inch", 0, walls=7, material="plastic")  # 0.040 in would be flagged here
    # base X, Y and Z pairs, each boss top to the base bottom, each boss's X and Y pairs; the outer
    # sides of the two bosses face away from each other with air between: no wall.
    add(clean_walls(), "clean_walls", "inch", 1, walls=9)
    # D-016: material at a hole, measured up to 0.250 in, so the earlier parts' holes (0.364 in or more
    # from any other face) add none. Each part below adds one wall to its block's 3.
    add(thin_drill_point(), "thin_drill_point", "inch", 1, walls=4,  # the cone tip to the bottom face
        findings=[finding("thin_wall", "high", 0.015, (0.5 * IN, 0.5 * IN, 0.015 * IN))])  # probe: the tip
    add(hole_near_edge(), "hole_near_edge", "inch", 1, walls=4,  # the hole's side to the -Y face
        findings=[finding("thin_wall", "high", 0.02, (1.0 * IN, 0.02 * IN, 0.25 * IN))])
    add(holes_close(), "holes_close", "inch", 2, walls=4,  # one wall between the two holes, found from both
        findings=[finding("thin_wall", "high", 0.025, (0.9875 * IN, 0.5 * IN, 0.25 * IN))])

    # S5 plan (spec Plan; D-022). Frame (spec Flow 5): +Z is the largest planar face's normal, so with features
    # cut into the top the bottom face is larger and the top reads -Z; +X is the largest face square to it.
    # Setups list each one's features by probe points (file coordinates, mm).
    two = two_sided_block()
    # Bottom face larger (smaller pocket) -> +Z is model -Z; the -X face is larger than the drilled +X face ->
    # +X is model -X. The bottom pocket opens +Z, the top pocket -Z, the hole -X. Walls: block 3; each pocket
    # 4 walls to their outer faces and the floor to the far face (5 each); the hole's flat bottom to the -X face.
    add(two, "two_sided_block", "inch", 1, pockets=2, corners=8, walls=14, machine="3-axis mill",
        setups=[{"dir": "+Z", "probes": [[1.0 * IN, 2.125 * IN, 0.25 * IN]]},
                {"dir": "-Z", "probes": [[1.0 * IN, 0.75 * IN, 1.25 * IN]]},
                {"dir": "-X", "probes": [[1.625 * IN, 1.625 * IN, 0.75 * IN]]}],
        tools=["em-0.250", "dr-0.2500"], tool_changes=3)
    # 30 deg off every axis: the access finding, and nothing to plan (it is in no setup).
    add(angled_hole(), "angled_hole", "inch", 1, machine="4/5-axis mill or fixture",
        findings=[finding("access", "high", 30.0, (1.0 * IN, 1.125 * IN, 0.5 * IN))],
        setups=[{"dir": "+Z", "probes": []}], tools=[], tool_changes=0)
    shape, u = angled_hole_in_pocket()
    mid = tuple((c + 0.4 * ui) * IN for c, ui in zip((1.25, 1.0, 0.75), u))
    # The hole keeps its own axis on the pocket floor (D-022): flagged; the pocket opens -Z (top).
    add(shape, "angled_hole_in_pocket", "inch", 1, pockets=1, corners=4, walls=8, machine="4/5-axis mill or fixture",
        findings=[finding("access", "high", 20.0, (mid[0], mid[1] + 0.125 * IN, mid[2]))],
        setups=[{"dir": "-Z", "probes": [[0.6 * IN, 1.0 * IN, 0.75 * IN]]}], tools=["em-0.250"], tool_changes=1)
    # The X faces are the largest square to Z: the hole opens +X and -X, and +X comes first.
    add(through_hole_two_dirs(), "through_hole_two_dirs", "inch", 1, machine="3-axis mill",
        setups=[{"dir": "+X", "probes": [[0.625 * IN, 1.375 * IN, 0.5 * IN]]}], tools=["dr-0.2500"], tool_changes=1)
    one = clean_one_setup()
    one_setup = [[0.3 * IN, 1.0 * IN, 0.75 * IN], [1.875 * IN, 0.625 * IN, 0.5 * IN], [1.875 * IN, 1.625 * IN, 0.75 * IN]]
    # block 3, pocket 5, the blind hole's flat bottom to the bottom face 1
    add(one, "clean_one_setup", "inch", 2, pockets=1, corners=4, walls=9, machine="3-axis mill",
        setups=[{"dir": "-Z", "probes": one_setup}], tools=["em-0.250", "dr-0.2500"], tool_changes=2)
    add(rotate_30(one), "rotated_block", "inch", 2, pockets=1, corners=4, walls=9, machine="3-axis mill",
        setups=[{"dir": "-Z", "probes": [list(rotated(p)) for p in one_setup]}], tools=["em-0.250", "dr-0.2500"],
        tool_changes=2)
    # The countersink is cut from its own end (the top, -Z), so the hole is drilled from there too.
    add(countersunk_hole(), "countersunk_hole", "inch", 1, machine="3-axis mill",
        setups=[{"dir": "-Z", "probes": [[1.0 * IN, 0.625 * IN, 0.2 * IN]]}], tools=["dr-0.2500", "cs-82"],
        tool_changes=2)

    # S6 turning (spec S6, J5). Walls counted by hand: opposed planar faces square to the axis with material
    # between and 10 mm2 of overlap; no hole wall is measured to a face the hole opens onto (stress test 3a).
    # `turn` counts the turning features (bore, groove, profile). Setups list features by probe points.
    sl = [[0.0, 0.0625 * IN, 2.25 * IN]]  # the cross hole's wall
    od = (0.25 * IN, 0.0, 1.0 * IN)  # on the 0.500 in outside diameter
    add(slender_shaft(), "slender_shaft", "inch", 1, walls=1, process="turn", material="steel1018",  # the two ends
        turn={"bore": 0, "groove": 0, "profile": 1}, machine="lathe with live tooling",
        findings=[finding("turn_slender", "high", 9.0, od), finding("turn_offaxis", "medium", 90.0, sl[0])],
        setups=[{"dir": "turn", "probes": [list(od)] + sl}], tools=["turn", "dr-0.1250"], tool_changes=2)
    # The same part for milling (Morgan compares): no frame face square to Z, so +X is the file X axis; the
    # hole opens +X and -X. The outside is not planned (assumptions).
    add(slender_shaft(), "slender_shaft", "inch", 1, walls=1, material="steel1018", machine="3-axis mill",
        setups=[{"dir": "+X", "probes": sl}], tools=["dr-0.1250"], tool_changes=1)
    st = (0.5 * IN, 0.0, 2.0 * IN)
    add(stout_shaft(), "stout_shaft", "inch", 0, walls=1, process="turn", turn={"bore": 0, "groove": 0, "profile": 1},
        findings=[finding("turn_slender", "medium", 5.0, st)], machine="lathe",
        setups=[{"dir": "turn", "probes": [list(st)]}], tools=["turn"], tool_changes=1)
    # Walls: bottom to the lower groove side (1.500), to the top ring (3.000), to the bore floor (2.000) and to
    # the inside groove's lower side (2.400); the upper groove side to the top (1.375); the inside groove's
    # upper side to the top (0.475). The groove sides face each other across air.
    add(shaft_with_groove_and_bore(), "shaft_with_groove_and_bore", "inch", 0, walls=6, process="turn",
        material="steel1018", turn={"bore": 1, "groove": 2, "profile": 1}, machine="lathe",
        setups=[{"dir": "turn", "probes": [[0.75 * IN, 0.0, 0.5 * IN], [0.375 * IN, 0.0, 2.2 * IN],
                                            [0.65 * IN, 0.0, 1.56 * IN], [0.4375 * IN, 0.0, 2.46 * IN]]}],
        tools=["turn", "bore", "groove-0.125"], tool_changes=3)
    # box_through_hole for turning: the hole is the only round face, 5.4% of the area (spec: under 40%).
    hole_area = math.pi * 0.25 * 0.5
    share = 100 * hole_area / (7.0 - 2 * math.pi * 0.125 ** 2 + hole_area)
    add(box_through_hole(), "block_as_turn", "inch", 1, process="turn", turn={"bore": 0, "groove": 0, "profile": 0},
        findings=[finding("turn_axis", "high", round(share, 4), (1.125 * IN, 0.5 * IN, 0.25 * IN))],
        setups=[], tools=[], tool_changes=0)  # no machine (test_turning)
    # Walls: the flange's bottom to its top ring (0.500) and to the hub's end (1.500); the bolt hole's side to the
    # rim (0.125 in of material). Length 1.500 in over the 1.000 in hub: 1.5x, clean.
    fb = [0.875 * IN, 0.0, 0.25 * IN]  # on the bolt hole's wall, away from the axis
    add(flange_bolt_hole(), "flange_bolt_hole", "inch", 1, walls=3, process="turn", material="steel1018",
        turn={"bore": 0, "groove": 0, "profile": 1}, machine="lathe with live tooling",
        findings=[finding("turn_offaxis", "medium", 0.75, fb)],
        setups=[{"dir": "turn", "probes": [[1.0 * IN, 0.0, 0.25 * IN], fb]}], tools=["turn", "dr-0.2500"], tool_changes=2)
    # Walls: bottom to the shoulder (2.000), to the top ring (3.000) and to the hole's floor (2.4375); the hole is
    # 0.281 in from the 0.750 in diameter, over the 0.250 in wall cap.
    cs = [[0.5 * IN, 0.0, 1.0 * IN], [0.09375 * IN, 0.0, 2.7 * IN]]
    add(clean_shaft(), "clean_shaft", "inch", 1, walls=3, process="turn", turn={"bore": 0, "groove": 0, "profile": 1},
        machine="lathe", setups=[{"dir": "turn", "probes": cs}], tools=["turn", "dr-0.1875"], tool_changes=2)

    write_step(single_face(), "no_solid", "MM")
    (HERE / "not_step.step").write_text("This is a text file, not a STEP file.\n", encoding="utf-8", newline="\n")

    (HERE / "expected.toml").write_text(toml_parts(parts), encoding="utf-8", newline="\n")
    print(f"wrote {len(parts)} expected parts and {len(parts) + 2} part files to {HERE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
