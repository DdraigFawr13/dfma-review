"""Run Quiddity (github.com/pzfreo/quiddity-python, Apache-2.0) on one STEP or BREP file, in its own
process, and print the same JSON shape as child.py, so grade.py scores it like our own app.

Run with an interpreter that has Quiddity 0.3.x installed (not the dfma environment):
    <quiddity-venv>/bin/python tests/grading/qchild.py <file>
Nothing from Quiddity is copied here; this calls its public import and its inventory, the same
calls its own scorer makes (tools/run_effectiveness_baseline.py, raw frame).

Face order and names: faces are listed in MapShapes order over the whole file shape (first
occurrence in explorer order), each with its STEP entity name, from a reader of our own. Quiddity's
faces are joined to these by centre of mass and area, because its import makes its own shapes.
Hole and pocket faces are Quiddity's "defining" faces; its wider "constituent" faces are given too.
"""

from __future__ import annotations

import json
import sys
import warnings

warnings.simplefilter("ignore", FutureWarning)
MARK = "@@grade-result@@"
HOLE_FAMILIES = {"holes"}
POCKET_FAMILIES = {"pockets", "prismatic-pockets"}


def _faces(shape) -> list:
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    out, ex = [], TopExp_Explorer(shape, TopAbs_FACE)
    while ex.More():
        f = TopoDS.Face(ex.Current())
        if not any(f.IsSame(g) for g in out):
            out.append(f)
        ex.Next()
    return out


def _key(face) -> tuple:
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    props = GProp_GProps()
    BRepGProp.SurfaceProperties_s(face, props)
    c = props.CentreOfMass()
    return (round(c.X(), 3), round(c.Y(), 3), round(c.Z(), 3), round(props.Mass(), 3))


def _kind(face) -> str:
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Cone, GeomAbs_Cylinder, GeomAbs_Plane, GeomAbs_Torus
    t = BRepAdaptor_Surface(face, True).GetType()
    return {GeomAbs_Plane: "plane", GeomAbs_Cylinder: "cylinder", GeomAbs_Cone: "cone", GeomAbs_Torus: "torus"}.get(t, "other")


def _family(candidate) -> str:
    """The scoring family, as Quiddity's scorer derives it (effectiveness_report._scoring_family)."""
    fam = candidate.family.value
    fam = fam.replace("_", "-")
    if fam != "section-recesses":
        return fam
    rec = candidate.record
    if rec.classification.feature_kind == "passage":
        return "passages"
    return "pockets" if rec.classification.section_shape in {"obround", "circular"} else "prismatic-pockets"


def run(path: str) -> dict:
    from quiddity import import_step_geometry
    from quiddity._dispositions import Outcome
    from quiddity.result import _take_inventory

    if path.lower().endswith(".brep"):
        from OCP.BRep import BRep_Builder
        from OCP.BRepTools import BRepTools
        from OCP.TopoDS import TopoDS_Shape
        from build123d import Solid
        whole = TopoDS_Shape()
        BRepTools.Read_s(whole, path, BRep_Builder())
        names = None
        part = Solid(whole) if whole.ShapeType().name == "TopAbs_SOLID" else __import__("build123d").Shape.cast(whole)
    else:
        from OCP.STEPControl import STEPControl_Reader
        reader = STEPControl_Reader()
        reader.ReadFile(path)
        reader.TransferRoots()
        whole = reader.OneShape()
        tr = reader.WS().TransferReader()
        names = tr
        part = import_step_geometry(path)

    mine = _faces(whole)
    index = {}
    for i, f in enumerate(mine):
        index.setdefault(_key(f), i)
    faces = []
    for f in mine:
        name = None
        if names is not None:
            ent = names.EntityFromShapeResult(f, 1)
            if ent is not None and hasattr(ent, "Name") and ent.Name() is not None:
                name = ent.Name().ToCString()
        k = _kind(f)
        faces.append({"kind": k, "kind2": k, "name": name, "file_pos": None, "shape_id": len(faces) + 1})

    qfaces = list(part.faces())
    qmap = [index.get(_key(f.wrapped)) for f in qfaces]
    product = _take_inventory(part)
    graph = product.context.graph
    qindex = {face: i for i, face in enumerate(qfaces)}
    feats, unmatched = [], 0
    for d in product.reconciliation.dispositions:
        if d.outcome is not Outcome.ACCEPTED:
            continue
        cand = d.candidate
        fam = _family(cand)
        kind = "hole" if fam in HOLE_FAMILIES else "pocket" if fam in POCKET_FAMILIES else None
        if kind is None:
            continue
        def ids(nodes):
            nonlocal unmatched
            out = []
            for node in nodes:
                j = qmap[qindex[graph.face(node)]]
                if j is None:
                    unmatched += 1
                else:
                    out.append(j)
            return sorted(set(out))
        defining = ids(product.evidence.defining_of(cand))
        constituent = ids(product.evidence.constituent_of(cand))
        open_ends = 1
        if kind == "hole":
            open_ends = 2 if getattr(cand.record, "bottom", None) == "through" else 1
        feats.append({"kind": kind, "family": fam, "faces": defining, "constituent": constituent, "open_ends": open_ends})
    return {"faces": faces, "features": feats, "ignored_solids": 0, "unmatched_faces": unmatched,
            "quiddity_faces": len(qfaces), "error": None}


def main() -> int:
    try:
        out = run(sys.argv[1])
    except Exception as exc:  # a read error or a Python-level failure; a crash kills the process
        out = {"faces": [], "features": [], "ignored_solids": 0, "error": f"{type(exc).__name__}: {exc}"}
    sys.stdout.write("\n" + MARK + json.dumps(out) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
