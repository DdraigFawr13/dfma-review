"""Run Analysis Situs (gitlab.com/ssv/AnalysisSitus, BSD-3) on one STEP or BREP file and print the
same JSON shape as child.py, so grade.py scores it like our own app.

    python tests/grading/schild.py <as_recognize binary> <file>

`as_recognize` is a local, git-ignored build of Analysis Situs's hole and cavity recognizers (its
`recognize-holes` and `recognize-cavities` commands, unlimited radius and size). It prints 1-based
MapShapes face ids over the whole loaded shape; this script lists the faces in the same order, with
their STEP entity names (MFCAD++ labels), using our own reader of the file.

Analysis Situs has no pocket recognizer in its open code: a "cavity" is any depression, holes and
through passages included. Here hole faces are its holes, and "pocket" faces are cavity faces that
are not hole faces. Holes carry no through/blind type (open_ends None).
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "service")]
MARK = "@@grade-result@@"
TIME_LIMIT_S = 170.0


def _ids(binary: str, path: str, mode: str) -> list[int]:
    proc = subprocess.run([binary, path, mode, "0"], capture_output=True, text=True, timeout=TIME_LIMIT_S)
    lines = [ln for ln in proc.stdout.splitlines() if ln.startswith("FIDS:")]
    if proc.returncode != 0 or not lines:
        raise RuntimeError(f"as_recognize {mode} exit {proc.returncode}: {proc.stderr.strip()[-200:]}")
    return [int(v) for v in lines[-1][5:].split()]


def _shape(path: str):
    """The whole file shape and, for STEP, the reader (for entity names)."""
    if path.lower().endswith(".brep"):
        from OCC.Core.BRep import BRep_Builder
        from OCC.Core.BRepTools import breptools
        from OCC.Core.TopoDS import TopoDS_Shape
        shape = TopoDS_Shape()
        breptools.Read(shape, path, BRep_Builder())
        return shape, None
    from OCC.Core.STEPControl import STEPControl_Reader
    reader = STEPControl_Reader()
    reader.ReadFile(path)
    reader.TransferRoots()
    return reader.OneShape(), reader


def run(binary: str, path: str) -> dict:
    from OCC.Core.StepRepr import StepRepr_RepresentationItem
    from OCC.Core.TopAbs import TopAbs_FACE
    from OCC.Core.TopExp import topexp
    from OCC.Core.TopTools import TopTools_IndexedMapOfShape
    from OCC.Core.TopoDS import topods

    from dfma.frame import face_info

    holes = set(_ids(binary, path, "holes"))
    cavities = set(_ids(binary, path, "cavities"))
    shape, reader = _shape(path)
    m = TopTools_IndexedMapOfShape()
    topexp.MapShapes(shape, TopAbs_FACE, m)
    tr = reader.WS().TransferReader() if reader is not None else None
    faces = []
    for i in range(1, m.Size() + 1):
        face = topods.Face(m.FindKey(i))
        name = None
        if tr is not None:
            item = StepRepr_RepresentationItem.DownCast(tr.EntityFromShapeResult(face, 1))
            if item is not None and item.Name() is not None:
                name = item.Name().ToCString()
        kind = face_info(i - 1, face).kind
        faces.append({"kind": kind, "kind2": kind, "name": name, "file_pos": None, "shape_id": i})
    if max(holes | cavities, default=0) > len(faces):
        raise RuntimeError(f"face id beyond {len(faces)} faces: the two readers disagree")
    feats = []
    if holes:
        feats.append({"kind": "hole", "faces": sorted(i - 1 for i in holes), "open_ends": None})
    if cavities - holes:
        feats.append({"kind": "pocket", "faces": sorted(i - 1 for i in cavities - holes), "open_ends": None})
    return {"faces": faces, "features": feats, "ignored_solids": 0, "error": None}


def main() -> int:
    try:
        out = run(sys.argv[1], sys.argv[2])
    except Exception as exc:
        out = {"faces": [], "features": [], "ignored_solids": 0, "error": f"{type(exc).__name__}: {exc}"}
    sys.stdout.write("\n" + MARK + json.dumps(out) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
