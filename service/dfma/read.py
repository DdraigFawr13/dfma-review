"""Read a STEP file into one solid in mm, with face ids (spec Flow step 4)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from OCC.Core.BRepGProp import brepgprop
from OCC.Core.GProp import GProp_GProps
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Core.Message import Message_Gravity, message
from OCC.Core.STEPControl import STEPControl_Reader
from OCC.Core.TColStd import TColStd_SequenceOfAsciiString
from OCC.Core.TopAbs import TopAbs_FACE, TopAbs_SOLID
from OCC.Core.TopExp import TopExp_Explorer, topexp
from OCC.Core.TopoDS import TopoDS_Shape, topods
from OCC.Core.TopTools import TopTools_IndexedMapOfShape

from . import settings
from .errors import ReadError
from .units import unit_name

# Keep OpenCascade's transfer banners off the console.
message.DefaultMessenger().Printers().First().SetTraceLevel(Message_Gravity.Message_Fail)


SOLID_ENTITIES = ("StepShape_ManifoldSolidBrep", "StepShape_BrepWithVoids", "StepShape_FacetedBrep")


@dataclass
class ReadResult:
    solid: TopoDS_Shape
    faces: list  # TopoDS_Face, index = face id
    units_in_file: str
    volume_mm3: float
    ignored_solids: int


def volume(shape: TopoDS_Shape) -> float:
    props = GProp_GProps()
    brepgprop.VolumeProperties(shape, props)
    return abs(props.Mass())


def file_length_unit(reader: STEPControl_Reader) -> str:
    """The length unit the file declares. The reader itself converts to mm (its default)."""
    lengths, angles, solid_angles = (TColStd_SequenceOfAsciiString() for _ in range(3))
    reader.FileUnits(lengths, angles, solid_angles)
    names = {lengths.Value(i).ToCString() for i in range(1, lengths.Length() + 1)}
    if len(names) != 1:
        return "other"
    return unit_name(names.pop())


def read_step(path: str | Path) -> ReadResult:
    reader = STEPControl_Reader()
    try:
        status = reader.ReadFile(str(path))
    except Exception as exc:  # OpenCascade raises on some malformed files
        raise ReadError(settings.MSG_NOT_STEP) from exc
    if status != IFSelect_RetDone:
        raise ReadError(settings.MSG_NOT_STEP)
    units = file_length_unit(reader)
    reader.TransferRoots()
    if reader.NbShapes() == 0:
        # Some files (1990s AP203 exports) hold solids with no product structure, so nothing
        # is a transfer root: transfer their solid B-reps directly.
        model = reader.StepModel()
        for i in range(1, model.NbEntities() + 1):
            entity = model.Value(i)
            if entity.DynamicType().Name() in SOLID_ENTITIES:
                reader.TransferEntity(entity)
    shape = reader.OneShape() if reader.NbShapes() else None

    solids = []
    if shape is not None and not shape.IsNull():
        explorer = TopExp_Explorer(shape, TopAbs_SOLID)
        while explorer.More():
            solids.append(topods.Solid(explorer.Current()))
            explorer.Next()
    if not solids:
        raise ReadError(settings.MSG_NO_SOLID)

    volumes = [volume(s) for s in solids]
    best = max(range(len(solids)), key=lambda i: volumes[i])  # first largest on a tie
    solid = solids[best]

    face_map = TopTools_IndexedMapOfShape()
    topexp.MapShapes(solid, TopAbs_FACE, face_map)
    faces = [topods.Face(face_map.FindKey(i)) for i in range(1, face_map.Size() + 1)]
    return ReadResult(solid, faces, units, volumes[best], len(solids) - 1)
