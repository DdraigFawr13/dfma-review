"""I1 S1 through /api/analyze: refusals, the pair route and the STEP-only guard (J2, J3, J6 guard)."""

from __future__ import annotations

import shutil

import pytest
from fastapi.testclient import TestClient

from helpers import PARTS
from nist_files import ap242_files

from dfma import settings
from dfma.analyze import analyze
from dfma.app import create_app
from dfma.read import read_step

INV = PARTS.parent / "inventor" / "files"
BOX = PARTS / "box_through_hole.step"


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app(dist_dir=None)) as c:
        yield c


def post(client, step, ipt=None):
    files = {"file": (step.name, open(step, "rb"), "application/octet-stream")}
    if ipt is not None:
        files["ipt"] = (ipt.name, open(ipt, "rb"), "application/octet-stream")
    try:
        return client.post("/api/analyze", files=files, data={"process": "mill", "material": "al6061"})
    finally:
        for _, f, _ in files.values():
            f.close()


def nist(stem: str):
    return next(p for p in ap242_files() if p.name.startswith(stem))


def test_no_ipt_unchanged(client):
    r = post(client, BOX)
    assert r.status_code == 200
    assert "inventor" not in r.json()
    assert settings.IPT_ASSUMPTION not in r.json()["assumptions"]


def test_nist_pair_refused(client):
    r = post(client, nist("nist_ctc_04_asme1_ap242"), INV / "INV_nist_ctc_04_asme1_2021.ipt")
    assert r.status_code == 422
    assert r.json() == {"error": "These files don't match: the STEP has 483 faces, the .ipt 368. Export the STEP "
                                 "again from this .ipt and upload both."}


def test_sheet_metal_refused(client):
    r = post(client, nist("nist_ctc_03_asme1_ap242"), INV / "INV_nist_ctc_03_asme1_2021.ipt")
    assert r.status_code == 422
    assert r.json() == {"error": "This Inventor part is a sheet-metal part. Only plain single-body parts can be "
                                 "read for now."}


def test_ipt_as_step(client, tmp_path):
    p = tmp_path / "part.stp"
    shutil.copyfile(INV / "INV_nist_ftc_11_asme1_2021.ipt", p)
    r = post(client, p)
    assert (r.status_code, r.json()) == (422, {"error": settings.MSG_IPT_NEEDS_STEP})


def test_step_as_ipt(client, tmp_path):
    p = tmp_path / "part.ipt"
    shutil.copyfile(BOX, p)
    r = post(client, BOX, p)
    assert (r.status_code, r.json()) == (422, {"error": settings.MSG_IPT_NOT_IPT})


def test_ipt_over_limit(client, tmp_path):
    big = tmp_path / "big.ipt"
    with open(big, "wb") as f:
        f.truncate(settings.MAX_UPLOAD_BYTES + 1)
    r = post(client, BOX, big)
    assert (r.status_code, r.json()) == (413, {"error": settings.MSG_TOO_LARGE})


def test_attach_in_process(monkeypatch, tmp_path):
    """The passing app path on every push (S2): read_ipt patched to an IptPart built from the STEP itself plus one
    thread on its hole, so the part type, pair check, mapping and rule all run."""
    from inventor.built import BOX_TOP, DOWN, ipt_from_step, thread
    part = ipt_from_step(BOX, [thread(BOX_TOP, DOWN, 10.0)])
    step = read_step(BOX)
    import dfma.inventor
    monkeypatch.setattr(dfma.inventor, "read_ipt", lambda path: part)
    result = analyze(BOX, BOX.name, ipt_path=tmp_path / "box.ipt", ipt_name="box.ipt")
    threads = result["inventor"].pop("threads")
    assert result["inventor"].pop("hole_features") == []  # I2 S1: always a list when an .ipt is read
    assert result["inventor"].pop("hole_names_seen") == 0  # I2 S2: the built part has no Hole names
    assert result["inventor"] == {"name": "box.ipt", "saved_with": "2024.1 (Build 281209000, 209)",
                                  "acis_version": "229.6.0.65535",
                                  "checks": {"faces": [len(step.faces)] * 2, "corners": [10, 10],
                                             "worst_corner_gap_mm": 0.0}}
    [t] = threads
    assert (t["id"], t["state"], t["hole"], t["gaps"], t["reason"]) == ("thread-1", "matched", "hole-1", [], None)
    assert t["designation"] == "1/4-20 UNC" and t["depth_mm"] == 10.0 and t["start"] == [25.4, 12.7, 12.7]
    assert result["assumptions"][-1] == settings.IPT_ASSUMPTION
    assert "thread_mismatch" in result["rules_run"]
    plain = analyze(BOX, BOX.name)
    assert "thread_mismatch" not in plain["rules_run"]
    hole = next(f for f in result["features"] if f["id"] == "hole-1")
    assert hole.pop("thread") == ["thread-1"]
    assert result["findings"] == plain["findings"] and result["features"] == plain["features"]


@pytest.mark.parametrize("step, start, length, through", [
    ("box_through_hole", (25.4, 12.7, 12.7), 12.7, True),
    ("drill_point_hole", (12.7, 12.7, 50.8), 25.4, False),
])
def test_hole_features_in_process(monkeypatch, tmp_path, step, start, length, through):
    """I2 S1 J1: a built pair (the STEP's own IptPart plus a Hole feature on its hole) through the app path: the
    response lists the feature with its hole matched to hole-1, and hole-1 names its feature."""
    import dfma.inventor
    from inventor.built import hole_feature, ipt_from_step
    feat = hole_feature(start, (0.0, 0.0, -1.0), 6.35, length, through=through,
                        point_deg=None if through else 118.0)
    part = ipt_from_step(PARTS / f"{step}.step", [], [feat])
    monkeypatch.setattr(dfma.inventor, "read_ipt", lambda path: part)
    r = analyze(PARTS / f"{step}.step", f"{step}.step", ipt_path=tmp_path / "p.ipt", ipt_name="p.ipt")
    [hf] = r["inventor"]["hole_features"]
    assert (hf["id"], hf["feature_id"], hf["name"], hf["type"], hf["diameter_mm"], hf["through"]) == (
        "hf-1", 100, None, "simple", 6.35, through)
    assert hf["depth_mm"] == (None if through else 25.4)
    [h] = hf["holes"]
    assert (h["id"], h["state"], h["hole"], h["gaps"], h["reason"], h["copied_by"]) == (
        "hf-1.1", "matched", "hole-1", [], None, [])
    assert h["start"] == list(start) and h["axis"] == [0.0, 0.0, -1.0]
    assert hf["state"] == "matched"
    assert next(f for f in r["features"] if f["id"] == "hole-1")["hole_feature"] == "hf-1"
    assert "hole_mismatch" in r["rules_run"] and not [f for f in r["findings"] if f["rule"] == "hole_mismatch"]
