"""Shared helpers for the service and e2e tests (on the path through pytest.ini)."""

from __future__ import annotations

import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / "tests" / "parts"


def expected_parts() -> list[dict]:
    with open(PARTS / "expected.toml", "rb") as f:
        return tomllib.load(f).get("part", [])


def expected(name: str) -> dict:
    for part in expected_parts():
        if part["name"] == name:
            return part
    raise KeyError(name)



def faces_near(step_path: Path, probe_mm, tol_mm: float = 0.01) -> set[int]:
    """Ids of the faces within `tol_mm` of a probe point, measured on the exact B-rep (spec J3)."""
    from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
    from OCC.Core.BRepExtrema import BRepExtrema_DistShapeShape
    from OCC.Core.gp import gp_Pnt

    from dfma.read import read_step

    vertex = BRepBuilderAPI_MakeVertex(gp_Pnt(*probe_mm)).Vertex()
    hits = set()
    for face_id, face in enumerate(read_step(step_path).faces):
        dist = BRepExtrema_DistShapeShape(vertex, face)
        if dist.IsDone() and dist.Value() <= tol_mm:
            hits.add(face_id)
    return hits
