"""Analyse one STEP or BREP file for the grading scorer, in its own process, and print JSON.

Run by grade.py as `python tests/grading/child.py <file>`; never import it into the scorer's
process (some outside files crash OpenCascade, LESSONS "read"). The analysis is the app's own
`dfma.analyze.analyze`; for a .brep file only the reader is swapped.

Output: one line starting with MARK, then a JSON object:
  faces:     one entry per face id (our order), {"kind", "kind2", "name", "file_pos", "shape_id"}
             kind2     = the face kind from the second reader (must equal kind)
             name      = the STEP face entity's name (MFCAD++ writes its label here), or None
             file_pos  = 0-based position of that entity among ADVANCED_FACEs in the file, or None
             shape_id  = 1-based index of the face in MapShapes over the whole file shape
                         (the id Analysis Situs uses), or None
  features:  [{"kind", "faces", "open_ends"}] for holes and pockets
  ignored_solids, error
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARK = "@@grade-result@@"
sys.path[:0] = [str(ROOT / "service")]


def _face_map(shape):
    from OCC.Core.TopAbs import TopAbs_FACE
    from OCC.Core.TopExp import topexp
    from OCC.Core.TopTools import TopTools_IndexedMapOfShape
    m = TopTools_IndexedMapOfShape()
    topexp.MapShapes(shape, TopAbs_FACE, m)
    return m


def _read_brep(path: str):
    from OCC.Core.BRep import BRep_Builder
    from OCC.Core.BRepTools import breptools
    from OCC.Core.TopAbs import TopAbs_SOLID
    from OCC.Core.TopExp import TopExp_Explorer
    from OCC.Core.TopoDS import TopoDS_Shape, topods

    from dfma import settings
    from dfma.errors import ReadError
    from dfma.read import ReadResult, volume

    shape = TopoDS_Shape()
    if not breptools.Read(shape, path, BRep_Builder()) or shape.IsNull():
        raise ReadError(settings.MSG_NOT_STEP)
    solids, exp = [], TopExp_Explorer(shape, TopAbs_SOLID)
    while exp.More():
        solids.append(topods.Solid(exp.Current()))
        exp.Next()
    if not solids:
        raise ReadError(settings.MSG_NO_SOLID)
    vols = [volume(s) for s in solids]
    best = max(range(len(solids)), key=lambda i: vols[i])  # the same choice as read_step
    m = _face_map(solids[best])
    faces = [topods.Face(m.FindKey(i)) for i in range(1, m.Size() + 1)]
    return shape, ReadResult(solids[best], faces, "mm", vols[best], len(solids) - 1)


def _step_names(path: str, n_faces: int) -> tuple[list, object, list, list]:
    """Each face's STEP entity name and file position, from a second reader of the same file.

    The shapes of two readers are different objects, so faces are joined by index: this reader
    picks the largest solid as read_step does and maps its faces in MapShapes order, which is
    deterministic for one file. grade.py checks that the face kinds of both lists agree.
    """
    from OCC.Core.STEPControl import STEPControl_Reader
    from OCC.Core.StepRepr import StepRepr_RepresentationItem
    from OCC.Core.TopAbs import TopAbs_SOLID
    from OCC.Core.TopExp import TopExp_Explorer
    from OCC.Core.TopoDS import topods

    from dfma.frame import face_info
    from dfma.read import volume

    reader = STEPControl_Reader()
    reader.ReadFile(path)
    reader.TransferRoots()
    shape = reader.OneShape() if reader.NbShapes() else None
    if shape is None or shape.IsNull():
        return [(None, None)] * n_faces, None, [], []
    solids, exp = [], TopExp_Explorer(shape, TopAbs_SOLID)
    while exp.More():
        solids.append(topods.Solid(exp.Current()))
        exp.Next()
    if not solids:
        return [(None, None)] * n_faces, shape, [], []
    vols = [volume(s) for s in solids]
    m = _face_map(solids[max(range(len(solids)), key=lambda i: vols[i])])
    faces = [topods.Face(m.FindKey(i)) for i in range(1, m.Size() + 1)]
    model = reader.StepModel()
    order = {}
    for i in range(1, model.NbEntities() + 1):
        if model.Value(i).DynamicType().Name() == "StepShape_AdvancedFace":
            order[i] = len(order)
    tr = reader.WS().TransferReader()
    out = []
    for face in faces:
        ent = tr.EntityFromShapeResult(face, 1)
        if ent is None:
            out.append((None, None))
            continue
        item = StepRepr_RepresentationItem.DownCast(ent)
        name = item.Name().ToCString() if item is not None and item.Name() is not None else None
        out.append((name, order.get(model.Number(ent))))
    return out, shape, faces, [face_info(i, f).kind for i, f in enumerate(faces)]


def run(path: str) -> dict:
    import dfma.analyze as an
    from dfma.read import read_step

    holder: dict = {}
    if path.lower().endswith(".brep"):
        def reader(p):
            holder["shape"], result = _read_brep(str(p))
            return result
    else:
        def reader(p):
            result = read_step(p)
            holder["names"], holder["shape"], holder["own_faces"], holder["kinds2"] = _step_names(
                str(p), len(result.faces))
            return result
    def keep(p):
        holder["part"] = reader(p)
        return holder["part"]
    an.read_step = keep
    r = an.analyze(path, Path(path).name)

    part, shape = holder["part"], holder.get("shape")
    whole = _face_map(shape) if shape is not None and not shape.IsNull() else None
    names = holder.get("names") or [(None, None)] * len(part.faces)
    faces = []
    # The whole-shape ids come from the shape the faces belong to: the second reader's for STEP.
    own = holder.get("own_faces") or part.faces
    kinds2 = holder.get("kinds2") or [f["kind"] for f in r["faces"]]
    for i, (f, (name, pos)) in enumerate(zip(r["faces"], names)):
        sid = whole.FindIndex(own[i]) if whole is not None and i < len(own) else 0
        faces.append({"kind": f["kind"], "kind2": kinds2[i] if i < len(kinds2) else None,
                      "name": name, "file_pos": pos, "shape_id": sid or None})
    feats = [{"kind": f["kind"], "faces": f["faces"], "open_ends": len(f.get("open_vectors", []))}
             for f in r["features"] if f["kind"] in ("hole", "pocket")]
    return {"faces": faces, "features": feats, "ignored_solids": r["part"]["ignored_solids"], "error": None}


def main() -> int:
    try:
        out = run(sys.argv[1])
    except Exception as exc:  # a read error or a Python-level failure; a crash kills the process
        out = {"faces": [], "features": [], "ignored_solids": 0, "error": f"{type(exc).__name__}: {exc}"}
    sys.stdout.write("\n" + MARK + json.dumps(out) + "\n")  # OpenCascade may print to stdout too
    return 0


if __name__ == "__main__":
    sys.exit(main())
