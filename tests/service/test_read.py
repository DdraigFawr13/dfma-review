"""S1: reading a part, the response shape, bad input, limits and runtime (J1, J7)."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from helpers import PARTS, expected

from dfma.analyze import ReadError, analyze
from dfma.app import create_app
from dfma.worker import AnalysisTimeout, Worker, run_analysis

NOT_STEP = "This is not a STEP file this tool can read"
NO_SOLID = "No solid found in this file"
TOO_LARGE = "File is larger than 50 MB"
TOO_LONG = "This file took too long to analyse"

EMPTY_UNTIL_LATER = ("features", "findings", "setups", "operations", "tools", "cost_drivers")


def check_box(result: dict, name: str, units: str) -> None:
    part = result["part"]
    assert part["name"] == f"{name}.step"
    assert part["units_in_file"] == units
    assert sorted(part["bbox_in"], reverse=True) == pytest.approx([2.0, 1.0, 0.5], abs=0.001)
    assert part["face_count"] == expected(name)["face_count"]
    assert part["ignored_solids"] == 0
    assert part["not_analysed_faces"] == []
    # 2 x 1 x 0.5 in block minus a 0.25 in hole through 0.5 in.
    volume = (2 * 1 * 0.5 - 3.141592653589793 * 0.125**2 * 0.5) * 25.4**3
    assert part["volume_mm3"] == pytest.approx(volume, rel=1e-4)
    # The frame is right-handed and +Z is a large face's normal (the 0.5 in direction).
    frame = part["frame"]
    assert part["bbox_in"][2] == pytest.approx(0.5, abs=0.001)
    z = frame["z"]
    cross = [frame["x"][1] * frame["y"][2] - frame["x"][2] * frame["y"][1],
             frame["x"][2] * frame["y"][0] - frame["x"][0] * frame["y"][2],
             frame["x"][0] * frame["y"][1] - frame["x"][1] * frame["y"][0]]
    assert cross == pytest.approx(z, abs=1e-9)

    faces = result["faces"]
    assert [f["id"] for f in faces] == list(range(part["face_count"]))
    assert sorted(f["kind"] for f in faces) == ["cylinder"] + ["plane"] * 6
    for face in faces:
        assert len(face["positions"]) % 3 == 0 and face["positions"]
        assert len(face["indices"]) % 3 == 0 and face["indices"]
        assert max(face["indices"]) < len(face["positions"]) // 3
    xs = [v for f in faces for v in f["positions"][0::3]]
    assert max(xs) - min(xs) == pytest.approx(50.8, abs=0.01)  # file coordinates, mm

    for key in EMPTY_UNTIL_LATER:
        assert result[key] == []
    assert result["machine"] is None
    assert result["turn_axis"] is None
    assert result["tool_changes"] == 0
    assert isinstance(result["assumptions"], list)


def test_box_through_hole():
    check_box(analyze(PARTS / "box_through_hole.step", "box_through_hole.step"), "box_through_hole", "mm")


def test_units_inch_file():
    check_box(analyze(PARTS / "box_inch.step", "box_inch.step"), "box_inch", "inch")


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app(dist_dir=None)) as c:
        yield c


def post(client, path, process="mill", material="al6061"):
    with open(path, "rb") as f:
        return client.post("/api/analyze", files={"file": (path.name, f, "application/octet-stream")},
                           data={"process": process, "material": material})


def test_bad_files(client):
    for name, message in (("not_step", NOT_STEP), ("no_solid", NO_SOLID)):
        with pytest.raises(ReadError) as err:
            analyze(PARTS / f"{name}.step", f"{name}.step")
        assert str(err.value) == message
        response = post(client, PARTS / f"{name}.step")
        assert response.status_code == 422
        assert response.json() == {"error": message}
    # The app keeps working after bad files.
    response = post(client, PARTS / "box_through_hole.step")
    assert response.status_code == 200
    assert response.json()["part"]["face_count"] == expected("box_through_hole")["face_count"]


def test_bad_fields(client):
    assert post(client, PARTS / "box_through_hole.step", process="drill").status_code == 422
    assert post(client, PARTS / "box_through_hole.step", material="gold").status_code == 422
    response = post(client, PARTS / "box_through_hole.step", process="turn", material="plastic")
    assert response.status_code == 200


def test_upload_limit(client, tmp_path):
    big = tmp_path / "big.step"
    with open(big, "wb") as f:
        f.truncate(50 * 1024 * 1024 + 1)
    response = post(client, big)
    assert response.status_code == 413
    assert response.json() == {"error": TOO_LARGE}

    # No Content-Length (chunked body): the stream is cut off at 50 MB.
    def chunks():
        block = b"0" * (1024 * 1024)
        for _ in range(51):
            yield block

    response = client.post("/api/analyze", content=chunks(),
                           headers={"Content-Type": "multipart/form-data; boundary=x"})
    assert response.status_code == 413
    assert response.json() == {"error": TOO_LARGE}
    assert post(client, PARTS / "box_through_hole.step").status_code == 200


@pytest.fixture(scope="module")
def warm_worker():
    worker = Worker()
    worker.start()
    worker.run(PARTS / "box_through_hole.step", "box_through_hole.step", "mill", "al6061")
    yield worker
    worker.stop()


def test_time_limit(warm_worker):
    with pytest.raises(AnalysisTimeout) as err:
        warm_worker.run(PARTS / "box_through_hole.step", "box_through_hole.step", "mill", "al6061",
                        time_limit_s=0.001)
    assert str(err.value) == TOO_LONG
    # A new worker replaces the stopped one, and it still answers.
    result = warm_worker.run(PARTS / "box_through_hole.step", "box_through_hole.step", "mill", "al6061")
    assert result["part"]["face_count"] == expected("box_through_hole")["face_count"]
    # The module-level entry point named in J7 enforces the same limit.
    run_analysis(PARTS / "box_through_hole.step", "box_through_hole.step", "mill", "al6061")
    with pytest.raises(AnalysisTimeout):
        run_analysis(PARTS / "box_through_hole.step", "box_through_hole.step", "mill", "al6061",
                     time_limit_s=0.001)


STEP_PARTS = sorted(PARTS.glob("*.step"))


def test_parts_collected():
    assert len(STEP_PARTS) >= 4


@pytest.mark.parametrize("path", STEP_PARTS, ids=[p.stem for p in STEP_PARTS])
def test_runtime(path):
    """Every committed part finishes in under 10 s, including worker start."""
    worker = Worker()
    start = time.perf_counter()
    try:
        worker.start()
        try:
            worker.run(path, path.name, "mill", "al6061")
        except ReadError:
            pass  # bad files must also answer within the limit
    finally:
        elapsed = time.perf_counter() - start
        worker.stop()
    assert elapsed < 10.0, f"{path.name} took {elapsed:.2f} s"
