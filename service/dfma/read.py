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
    free_edges: int = 0  # edges on one face only, when an open shell was read as the solid (D-018 round 4)


def volume(shape: TopoDS_Shape) -> float:
    props = GProp_GProps()
    brepgprop.VolumeProperties(shape, props)
    return abs(props.Mass())


def file_length_unit(reader: STEPControl_Reader) -> str:
    """The length unit the file declares. The reader itself converts to mm (its default)."""
    lengths, angles, solid_angles = (TColStd_SequenceOfAsciiString() for _ in range(3))
    reader.FileUnits(lengths, angles, solid_angles)
    names = {lengths.Value(i).ToCString() for i in range(1, lengths.Length() + 1)}
    if not names:
        return "none"
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
    # Shells outside any solid, in a file that declares solids: a solid whose shell has a gap. Close
    # each and let it compete with the closed solids, so a gapped main part saved next to a small
    # closed body is not dropped for it (stress test, HANDOFF 3a).
    gaps: list[int] = [0] * len(solids)
    if shape is not None and not shape.IsNull() and _declares_solid(reader):
        closed, free = _solids_from_shells(shape, beside_solids=bool(solids))
        solids += closed
        gaps += free
    if not solids:
        raise ReadError(settings.MSG_NO_SOLID)

    volumes = [volume(s) for s in solids]
    best = max(range(len(solids)), key=lambda i: volumes[i])  # first largest on a tie
    solid = solids[best]
    free_edges = gaps[best]

    face_map = TopTools_IndexedMapOfShape()
    topexp.MapShapes(solid, TopAbs_FACE, face_map)
    faces = [topods.Face(face_map.FindKey(i)) for i in range(1, face_map.Size() + 1)]
    return ReadResult(solid, faces, units, volumes[best], len(solids) - 1, free_edges)


def _declares_solid(reader: STEPControl_Reader) -> bool:
    model = reader.StepModel()
    return any(model.Value(i).DynamicType().Name() in SOLID_ENTITIES for i in range(1, model.NbEntities() + 1))


GAP_MAX_SHARE = 0.1  # assumption: beside closed solids, a shell with more than 10% of its edges on one face is
# an open surface (a construction sheet), not a gapped solid


def _solids_from_shells(shape: TopoDS_Shape, beside_solids: bool = False) -> tuple[list, list[int]]:
    """D-018 round 4: the file declares a solid, but its shell has a gap (an edge on one face only),
    so OpenCascade returns the shell alone. Close each shell that lies in no solid and count its gap's
    edges, which analyze() lists under assumptions (one count per closed shell). `beside_solids`: the file
    also holds closed solids, so only shells with a small gap (GAP_MAX_SHARE) compete with them."""
    from OCC.Core.ShapeFix import ShapeFix_Solid
    from OCC.Core.TopAbs import TopAbs_EDGE, TopAbs_SHELL
    from OCC.Core.TopTools import TopTools_IndexedDataMapOfShapeListOfShape
    solids, free = [], []
    explorer = TopExp_Explorer(shape, TopAbs_SHELL, TopAbs_SOLID)  # shells in no solid
    while explorer.More():
        shell = topods.Shell(explorer.Current())
        explorer.Next()
        edges = TopTools_IndexedDataMapOfShapeListOfShape()
        topexp.MapShapesAndAncestors(shell, TopAbs_EDGE, TopAbs_FACE, edges)
        n_free = sum(1 for i in range(1, edges.Size() + 1) if edges.FindFromIndex(i).Size() == 1)
        if beside_solids and n_free > GAP_MAX_SHARE * edges.Size():  # an open surface, not a gapped solid
            continue
        free.append(n_free)
        solids.append(topods.Solid(ShapeFix_Solid().SolidFromShell(shell)))
    return solids, free
