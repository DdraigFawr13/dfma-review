"""Built inputs for the passing app path (spec I1 S2 "Checks that fail now"): an IptPart made from a STEP test
part itself (its corners and face count), plus threads (I1 S2) and Hole features (I2 S1) placed on its hole.
Test data, not measured threads or features."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "service"))

from dfma.inventor.blends import Blend  # noqa: E402
from dfma.inventor.holes import HoleFeature, IptHole  # noqa: E402
from dfma.inventor.surfaces import Surf  # noqa: E402
from dfma.inventor.pair import PLAIN_PART, step_corners  # noqa: E402
from dfma.inventor.part import IptPart  # noqa: E402
from dfma.inventor.threads import Thread  # noqa: E402
from dfma.read import read_step  # noqa: E402


def thread(start, axis, depth: float, *, id: str = "thread-1", designation: str = "1/4-20 UNC", cls: str = "2B",
           major=(6.35, 6.48), minor=(4.98, 5.25), tap: float = 5.11, face: str = "hole") -> Thread:
    """A thread from `start` (mm) along the unit `axis` for `depth` mm."""
    end = tuple(start[k] + depth * axis[k] for k in range(3))
    return Thread(id, designation, cls, "ANSI Unified Screw Threads", 1.27, depth, tap, list(minor), list(major),
                  tuple(start), end, tuple(axis), face)


def hole_feature(start, axis, diameter: float, length: float, *, through: bool, feature_id: int = 100,
                 point_deg: float | None = None, copied_by=()) -> HoleFeature:
    """A simple Hole feature of one hole from `start` (mm, the open end) along the unit `axis`; `length` is its
    drill cylinder's length (for a blind hole, the depth the STEP side measures)."""
    h = IptHole(tuple(start), tuple(axis), list(copied_by), [], diameter_mm=diameter, length_mm=length,
                drill_length_mm=length, drill_lo_mm=0.0, through=through, point_deg=point_deg)
    return HoleFeature(feature_id, [h], "simple", diameter, None if through else length, length, through, point_deg)


def ipt_from_step(step_path, threads: list[Thread], hole_features=(), blends=()) -> IptPart:
    step = read_step(step_path)
    return IptPart(saved_with="2024.1 (Build 281209000, 209)", acis_version="229.6.0.65535", subtype=PLAIN_PART,
                   model_state_names=["[Primary]"], solid_bodies=1, corners_mm=step_corners(step.solid),
                   face_count=len(step.faces), threads=threads, hole_features=list(hole_features),
                   blends=list(blends))


# box_through_hole.step: hole-1 is Ø6.35 mm, through, on the line x 25.4, y 12.7, z 0 to 12.7 (measured)
BOX_TOP, DOWN = (25.4, 12.7, 12.7), (0.0, 0.0, -1.0)
# drill_point_hole.step: hole-1 is Ø6.35 mm, 25.4 mm deep, blind, from z 50.8 down, at x 12.7, y 12.7 (measured)
DRILL_TOP = (12.7, 12.7, 50.8)


# I3 S3 (spec Builder defaults "Built filleted part"): a 40 x 30 x 20 mm block, x 0-40, y 0-30, z 0-20, with a 3 mm
# fillet on the vertical edge at x 0, y 0 and a 2 x 2 mm chamfer on the top edge at y 30, z 20.

def filleted_block(path) -> Path:
    """Write the block as a STEP file (mm) with OpenCascade's own fillet and chamfer; returns the path."""
    from OCC.Core.BRepAdaptor import BRepAdaptor_Curve
    from OCC.Core.BRepFilletAPI import BRepFilletAPI_MakeChamfer, BRepFilletAPI_MakeFillet
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox
    from OCC.Core.IFSelect import IFSelect_RetDone
    from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Writer
    from OCC.Core.TopAbs import TopAbs_EDGE
    from OCC.Core.TopExp import TopExp_Explorer
    from OCC.Core.TopoDS import topods

    def edge_at(shape, mid):
        e = TopExp_Explorer(shape, TopAbs_EDGE)
        while e.More():
            ed = topods.Edge(e.Current())
            c = BRepAdaptor_Curve(ed)
            p = c.Value((c.FirstParameter() + c.LastParameter()) / 2)
            if max(abs(p.X() - mid[0]), abs(p.Y() - mid[1]), abs(p.Z() - mid[2])) < 1e-6:
                return ed
            e.Next()
        raise ValueError(f"no edge at {mid}")

    box = BRepPrimAPI_MakeBox(40.0, 30.0, 20.0).Shape()
    f = BRepFilletAPI_MakeFillet(box)
    f.Add(3.0, edge_at(box, (0.0, 0.0, 10.0)))
    f.Build()
    shape = f.Shape()
    c = BRepFilletAPI_MakeChamfer(shape)
    c.Add(2.0, edge_at(shape, (20.0, 30.0, 20.0)))
    c.Build()
    w = STEPControl_Writer()
    w.Transfer(c.Shape(), STEPControl_AsIs)
    if w.Write(str(path)) != IFSelect_RetDone:
        raise OSError(f"could not write {path}")
    return Path(path)


def block_blends(fillet_r: float = 3.0) -> list[Blend]:
    """The block's fillet (radius `fillet_r`, placed as the 3 mm one) and chamfer, as read_blends would give them."""
    fillet = Blend(200, "fillet", radius_mm=fillet_r, faces=[0],
                   surfs={0: Surf("cyl", (3.0, 3.0, 0.0), (0.0, 0.0, 1.0), fillet_r)},
                   points={0: [(0.0, 3.0, 0.0), (3.0, 0.0, 0.0), (3.0, 0.0, 20.0), (0.0, 3.0, 20.0)]})
    n = 2 ** -0.5
    chamfer = Blend(201, "chamfer", distances_mm=[2.0, 2.0], angle_deg=90.0, faces=[1],
                    surfs={1: Surf("plane", (0.0, 29.0, 19.0), (0.0, n, n))},
                    points={1: [(0.0, 30.0, 18.0), (40.0, 30.0, 18.0), (40.0, 28.0, 20.0), (0.0, 28.0, 20.0)]})
    return [fillet, chamfer]
