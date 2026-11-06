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


def single_face():
    return BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), 0, 20, 0, 10).Face()


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

    def add(shape, name, unit, holes, findings=(), **extra):
        write_step(shape, name, "INCH" if unit == "inch" else "MM")
        entry = {"name": name, "units": unit, "face_count": face_count(shape),
                 "features": {**NO_FEATURES, "hole": holes}, **extra}
        if findings:
            entry["finding"] = list(findings)
        parts.append(entry)

    def finding(rule, severity, measured, probe):
        return {"rule": rule, "severity": severity, "measured": measured, "probe_mm": [round(v, 4) for v in probe]}

    shape = box_through_hole()
    # 6.35 mm is 1/4 in: a standard inch drill, accepted in mm files too (D-013).
    add(shape, "box_through_hole", "mm", 1)
    add(shape, "box_inch", "inch", 1)

    add(blind_block(1, 1, 2.5, 0.25, 2.0), "deep_hole", "inch", 1,
        [finding("hole_depth", "medium", 8.0, (0.5 * IN + 0.125 * IN, 0.5 * IN, 1.5 * IN))])
    add(blind_block(1, 1, 3.25, 0.25, 2.75), "very_deep_hole", "inch", 1,
        [finding("hole_depth", "high", 11.0, (0.5 * IN + 0.125 * IN, 0.5 * IN, 2.0 * IN))])
    add(through_block(2, 1, 0.5, 0.26), "odd_hole", "inch", 1,
        [finding("hole_size", "medium", 0.26, (1.0 * IN + 0.13 * IN, 0.5 * IN, 0.25 * IN))])
    add(fillet_not_hole(), "fillet_not_hole", "inch", 0)
    add(metric_block(6.55), "odd_metric_hole", "mm", 1,
        [finding("hole_size", "medium", round(6.55 / IN, 4), (25.0 + 3.275, 12.5, 6.0))])
    add(metric_block(6.5), "metric_hole", "mm", 1)
    add(blind_block(2, 2, 1, 0.5, 0.75), "flat_bottom_hole", "inch", 1)
    add(two_holes_web(), "two_holes_web", "inch", 2)
    add(split_hole(), "split_hole", "inch", 1)
    add(stepped_hole(), "stepped_hole", "inch", 2)
    shape, point = drill_point_hole()
    add(shape, "drill_point_hole", "inch", 1, point_mm=round(point, 4))
    add(clean_holes(), "clean_holes", "inch", 2)

    write_step(single_face(), "no_solid", "MM")
    (HERE / "not_step.step").write_text("This is a text file, not a STEP file.\n", encoding="utf-8", newline="\n")

    (HERE / "expected.toml").write_text(toml_parts(parts), encoding="utf-8", newline="\n")
    print(f"wrote {len(parts)} expected parts and {len(parts) + 2} part files to {HERE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
