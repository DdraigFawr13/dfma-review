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


def rewrite_ipt_models(path: Path, change) -> None:
    """Replace each model stream's inflated data with change(data), recompressed into the same size."""
    import zlib

    import olefile

    with olefile.OleFileIO(str(path), write_mode=True) as f:
        for e in f.listdir(streams=True, storages=False):
            name = "/".join(e)
            if not name.startswith("RSeStorage/B"):
                continue
            raw = f.openstream(name).read()
            k = raw.find(b"x^")
            if k < 0:
                continue
            data = zlib.decompressobj().decompress(raw[k:])
            new = raw[:k] + zlib.compress(change(data), 5)  # level 2-5 writes the header `x^`, as Inventor does
            assert len(new) <= len(raw), "the changed model must fit its stream"
            f.write_stream(name, new + b"\x00" * (len(raw) - len(new)))
