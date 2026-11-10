"""Reference fingerprint of each STEP file from the app's own reader (pythonocc-core, OCCT 8.0.1).

Run inside the dfma environment:  python spikes/ocjs/fingerprint.py <step folder> <out.json>
fingerprint.mjs writes the same shape from @taucad/opencascade.js; compare.mjs diffs the two.
Per face (in the app's face-id order): surface kind, area, the numbers the recognizer reads
(plane normal, cylinder radius and axis, cone angle, sphere and torus radii), whether it is
reversed, and the ids of the faces it shares an edge with.
"""

from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "service"))

from OCC.Core.Bnd import Bnd_Box  # noqa: E402
from OCC.Core.BRepAdaptor import BRepAdaptor_Surface  # noqa: E402
from OCC.Core.BRepBndLib import brepbndlib  # noqa: E402
from OCC.Core.BRepGProp import brepgprop  # noqa: E402
from OCC.Core.GProp import GProp_GProps  # noqa: E402
from OCC.Core.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_REVERSED  # noqa: E402
from OCC.Core.TopExp import topexp  # noqa: E402
from OCC.Core.TopTools import TopTools_IndexedDataMapOfShapeListOfShape, TopTools_IndexedMapOfShape  # noqa: E402

from dfma.errors import ReadError  # noqa: E402
from dfma.read import read_step  # noqa: E402

KINDS = {0: "Plane", 1: "Cylinder", 2: "Cone", 3: "Sphere", 4: "Torus", 5: "Bezier", 6: "BSpline",
         7: "Revolution", 8: "Extrusion", 9: "Offset", 10: "Other"}


def canon(x: float, y: float, z: float) -> list[float]:
    """A direction with its sign fixed (first non-zero component positive)."""
    for c in (x, y, z):
        if abs(c) > 1e-9:
            s = 1.0 if c > 0 else -1.0
            return [round(s * x, 6) + 0.0, round(s * y, 6) + 0.0, round(s * z, 6) + 0.0]
    return [0.0, 0.0, 0.0]


def face_print(face) -> dict:
    s = BRepAdaptor_Surface(face, True)
    kind = KINDS.get(int(s.GetType()), str(s.GetType()))
    props = GProp_GProps()
    brepgprop.SurfaceProperties(face, props)
    out: dict = {"kind": kind, "area": props.Mass(), "rev": face.Orientation() == TopAbs_REVERSED}
    if kind == "Plane":
        d = s.Plane().Axis().Direction()
        out["dir"] = canon(d.X(), d.Y(), d.Z())
    elif kind == "Cylinder":
        c = s.Cylinder()
        d = c.Axis().Direction()
        out["r"] = c.Radius()
        out["dir"] = canon(d.X(), d.Y(), d.Z())
    elif kind == "Cone":
        c = s.Cone()
        d = c.Axis().Direction()
        out["deg"] = math.degrees(c.SemiAngle())
        out["dir"] = canon(d.X(), d.Y(), d.Z())
    elif kind == "Sphere":
        out["r"] = s.Sphere().Radius()
    elif kind == "Torus":
        t = s.Torus()
        out["r"] = t.MajorRadius()
        out["r2"] = t.MinorRadius()
    return out


def fingerprint(path: Path) -> dict:
    t0 = time.perf_counter()
    try:
        res = read_step(path)
    except ReadError as exc:
        return {"error": str(exc)}
    read_s = time.perf_counter() - t0
    solid, faces = res.solid, res.faces
    fmap = TopTools_IndexedMapOfShape()
    topexp.MapShapes(solid, TopAbs_FACE, fmap)
    emap = TopTools_IndexedDataMapOfShapeListOfShape()
    topexp.MapShapesAndAncestors(solid, TopAbs_EDGE, TopAbs_FACE, emap)
    nbrs: list[set[int]] = [set() for _ in faces]
    for i in range(1, emap.Size() + 1):
        ids = sorted({fmap.FindIndex(f) - 1 for f in emap.FindFromIndex(i)})
        for a in ids:
            nbrs[a].update(b for b in ids if b != a)
    box = Bnd_Box()
    brepbndlib.Add(solid, box)
    props = GProp_GProps()
    brepgprop.SurfaceProperties(solid, props)
    return {
        "units": res.units_in_file, "volume": res.volume_mm3, "area": props.Mass(),
        "ignored_solids": res.ignored_solids, "free_edges": res.free_edges,
        "edges": emap.Size(), "bbox": list(box.Get()), "read_s": read_s,
        "faces": [dict(face_print(f), n=sorted(nbrs[i])) for i, f in enumerate(faces)],
    }


def main() -> None:
    folder, out = Path(sys.argv[1]), Path(sys.argv[2])
    result = {}
    for p in sorted(folder.glob("*.stp")):
        result[p.name] = fingerprint(p)
        print(p.name, len(result[p.name].get("faces", [])), "faces", flush=True)
    out.write_text(json.dumps(result))


if __name__ == "__main__":
    main()
