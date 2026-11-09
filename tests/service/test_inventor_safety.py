"""I1 S1 J6: hostile or broken .ipt files through /api/analyze; each is a 422 within the time limit and the
worker keeps serving. Files are built here from a NIST copy (no outside binaries)."""

from __future__ import annotations

import shutil
import time

import pytest
from fastapi.testclient import TestClient

from helpers import PARTS, rewrite_ipt_models

from dfma import settings
from dfma.app import create_app

INV = PARTS.parent / "inventor" / "files"
BOX = PARTS / "box_through_hole.step"


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app(dist_dir=None)) as c:
        yield c


def post(client, ipt):
    with open(BOX, "rb") as s, open(ipt, "rb") as i:
        return client.post("/api/analyze", files={"file": (BOX.name, s), "ipt": (ipt.name, i)},
                           data={"process": "mill", "material": "al6061"})


def _no_header(d: bytes) -> bytes:
    return d.replace(b"asmheader", b"xxxxxxxxx")


def _unknown_tag(d: bytes) -> bytes:
    k = d.find(b"\x0d\x09asmheader")
    if k < 0:
        return d
    j = d.find(b"\x11", k) + 1
    return d[:j] + b"\xee" + d[j + 1:]


def _cut(d: bytes) -> bytes:
    k = d.find(b"\x0d\x09asmheader")
    return d if k < 0 else d[:k + 200]


@pytest.mark.parametrize("change, message", [
    (_no_header, settings.MSG_IPT_NO_MODEL),
    (_unknown_tag, settings.MSG_IPT_FORMAT.format(version="226.0.3.65535")),
    (_cut, settings.MSG_IPT_FORMAT.format(version="226.0.3.65535")),
], ids=["no-model", "unknown-tag", "cut-short"])
def test_broken_ipt(client, tmp_path, change, message):
    p = tmp_path / "part.ipt"
    shutil.copyfile(INV / "INV_nist_ftc_11_asme1_2021.ipt", p)
    rewrite_ipt_models(p, change)
    start = time.monotonic()
    r = post(client, p)
    assert time.monotonic() - start < settings.TIME_LIMIT_S
    assert (r.status_code, r.json()) == (422, {"error": message})
    assert client.post("/api/analyze", files={"file": (BOX.name, open(BOX, "rb"))}).status_code == 200


def test_not_an_ipt(client, tmp_path):
    p = tmp_path / "notes.ipt"
    p.write_text("not a compound file")
    r = post(client, p)
    assert (r.status_code, r.json()) == (422, {"error": settings.MSG_IPT_NOT_IPT})


# --- I2 S1 J7: hostile feature tags and topology (tests/inventor/hostile.py) ---

CTC04 = INV / "INV_nist_ctc_04_asme1_2021.ipt"


def _summary(feats) -> dict:
    return {f.feature_id: (f.type, round(f.diameter_mm or 0, 4), len(f.holes), f.reason) for f in feats}


def _read_changed(tmp_path, change):
    from dfma.inventor import read_ipt
    p = tmp_path / "part.ipt"
    shutil.copyfile(CTC04, p)
    rewrite_ipt_models(p, change)
    return read_ipt(p)


def _owner_feature() -> tuple[int, int, int]:
    """(tag number, face, feature id) of CTC 04's first hole tag on a hole's own face, from the clean file."""
    import zlib

    import olefile

    from inventor import hostile
    best = None  # the stream whose model has the most faces, as read_ipt picks it
    with olefile.OleFileIO(str(CTC04)) as f:
        for e in f.listdir(streams=True, storages=False):
            raw = f.openstream(e).read()
            k = raw.find(b"x^")
            if "/".join(e).startswith("RSeStorage/B") and k >= 0:
                d = zlib.decompressobj().decompress(raw[k:])
                m = hostile.main_model(d)
                n_faces = sum(1 for r in m[1] if r["name"] == "face") if m else 0
                if best is None or n_faces > best[0]:
                    best = (n_faces, d, m)
    from dfma.inventor import read_ipt
    _, d, m = best
    feats = read_ipt(CTC04).hole_features
    for n in range(len(hostile.hole_tags(d, m[1]))):
        face = hostile.owner_face(d, n)
        fid = next((x.feature_id for x in feats for h in x.holes if face in h.faces), None)
        if fid is not None:
            return n, face, fid
    raise AssertionError("no hole tag")


@pytest.mark.parametrize("kind", ["no_end", "long_list", "owner_off"])
def test_bad_tags(tmp_path, kind):
    """A bad tag is dropped, never a refusal: its face leaves its feature and every other feature reads as before."""
    from dfma.inventor import read_ipt
    from inventor import hostile
    clean = _summary(read_ipt(CTC04).hole_features)
    n, face, fid = _owner_feature()
    feats = _read_changed(tmp_path, lambda d: getattr(hostile, kind)(d, n)).hole_features
    got = _summary(feats)
    assert {k: v for k, v in got.items() if k != fid} == {k: v for k, v in clean.items() if k != fid}
    assert all(face not in h.faces for f in feats for h in f.holes)


def test_cycling_loop(tmp_path):
    """A coedge ring that never closes stops after topo.MAX_STEPS steps; that hole is not mapped with the reason
    `feature data not understood`, and the other features read as before."""
    from dfma.inventor import map_holes, read_ipt
    from inventor import hostile
    clean = _summary(read_ipt(CTC04).hole_features)
    _, face, fid = _owner_feature()
    feats = _read_changed(tmp_path, lambda d: hostile.cycle(d, face)).hole_features
    got = _summary(feats)
    assert {k: v for k, v in got.items() if k != fid} == {k: v for k, v in clean.items() if k != fid}
    [bad] = [h for f in feats for h in f.holes if face in h.faces]
    assert bad.reason == settings.MSG_FEATURE_BAD
    rows = [h for f in map_holes(feats, [], []) for h in f["holes"] if h["reason"] == settings.MSG_FEATURE_BAD]
    assert len(rows) == 1 and rows[0]["state"] == "not_mapped"


def test_caps():
    """The caps themselves (spec Builder defaults): 64 pairs per tag, MAX_STEPS per loop or coedge ring."""
    from dfma.inventor import sab, tags, topo
    assert tags.pair_ids([1, 5] * 64 + [-1]) == [5] * 64
    assert tags.pair_ids([1, 5] * 65 + [-1]) is None
    assert tags.pair_ids([1, 5, 1, 6]) is None  # no -1
    # face -> loop -> coedge whose next is itself, but never the first: built records
    recs = [sab.Record("face", [("p", -1), ("p", -1), ("p", -1), ("p", 1)]),
            sab.Record("loop", [("p", -1), ("p", -1), ("p", -1), ("p", 2), ("p", 0)]),
            sab.Record("coedge", [("p", -1), ("p", -1), ("p", 3)]),
            sab.Record("coedge", [("p", -1), ("p", -1), ("p", 3)])]
    with pytest.raises(topo.TopologyError):
        topo.face_points(recs, 0)
    assert topo.MAX_STEPS == 10_000


def test_bad_names_stream():
    """I2 S2: a names stream that can't be read or unpacked gives no names, never a refusal (spec Builder
    defaults, I1 S3 re-check); the rank rule then leaves every Hole feature unnamed."""
    from dfma.errors import ReadError
    from dfma.inventor import names as nm, ole
    f = ole.Ipt(INV / "INV_nist_ctc_04_asme1_2021.ipt")
    try:
        assert len(nm.hole_names(f)) == 9
        assert nm.hole_names(f, stream_cap=1000) == []  # every stream over the cap: skipped, no ReadError

        def broken(name):
            raise ReadError(settings.MSG_IPT_FORMAT.format(version="unknown"))
        f.read = broken  # a stream olefile can't open
        assert nm.hole_names(f) == []
    finally:
        f.close()


def test_names_need_equal_counts():
    """I2 S2: one name too many or too few and no feature is named (never a shifted guess)."""
    from dfma.inventor import names as nm
    from dfma.inventor.holes import HoleFeature
    feats = [HoleFeature(30), HoleFeature(10)]
    nm.assign(feats, ["Hole1"])
    assert [f.name for f in feats] == [None, None]
    nm.assign(feats, ["Hole1", "Hole2", "Hole3"])
    assert [f.name for f in feats] == [None, None]
    nm.assign(feats, ["Hole1", "Hole2"])
    assert [f.name for f in feats] == ["Hole2", "Hole1"]  # the smallest id gets the smallest number



# --- I3 S3 J7: hostile blend tags and topology (the same helpers, on blend tags) ---

def _blends(part) -> dict:
    return {b.feature_id: (b.kind, b.radius_mm and round(b.radius_mm, 4),
                           b.distances_mm and [round(x, 4) for x in b.distances_mm], b.reason) for b in part.blends}


def _blend_face(n: int) -> tuple[int, int]:
    """(face, blend id) of the n-th blend tag of CTC 04's main model, from the clean file."""
    import zlib

    import olefile

    from dfma.inventor import read_ipt
    from inventor import hostile
    best = None  # the stream whose model has the most faces, as read_ipt picks it
    with olefile.OleFileIO(str(CTC04)) as f:
        for e in f.listdir(streams=True, storages=False):
            raw = f.openstream(e).read()
            k = raw.find(b"x^")
            if "/".join(e).startswith("RSeStorage/B") and k >= 0:
                d = zlib.decompressobj().decompress(raw[k:])
                m = hostile.main_model(d)
                n_faces = sum(1 for r in m[1] if r["name"] == "face") if m else 0
                if best is None or n_faces > best[0]:
                    best = (n_faces, d)
    face = hostile.owner_face(best[1], n, "blend")
    return face, next(b.feature_id for b in read_ipt(CTC04).blends if face in b.faces)


@pytest.mark.parametrize("kind", ["no_end", "long_list", "owner_off"])
def test_bad_blend_tags(tmp_path, kind):
    """A bad blend tag is dropped, never a refusal: its face leaves its blend, every other blend reads as before."""
    from dfma.inventor import read_ipt
    from inventor import hostile
    clean = read_ipt(CTC04)
    face, fid = _blend_face(0)
    part = _read_changed(tmp_path, lambda d: getattr(hostile, kind)(d, 0, kind="blend"))
    got, want = _blends(part), _blends(clean)
    assert {k: v for k, v in got.items() if k != fid} == {k: v for k, v in want.items() if k != fid}
    assert all(face not in b.faces for b in part.blends)
    assert _summary(part.hole_features) == _summary(clean.hole_features)


def test_cycling_chamfer_face(tmp_path):
    """A coedge ring that never closes on a chamfer face: that face gives no size and no points, the chamfer takes
    its size from its next face, and nothing is refused."""
    from dfma.inventor import read_ipt
    from inventor import hostile
    clean = read_ipt(CTC04)
    [chamfer] = [b for b in clean.blends if b.kind == "chamfer"]
    face = next(f for f in chamfer.faces if chamfer.surfs[f].kind == "plane")
    part = _read_changed(tmp_path, lambda d: hostile.cycle(d, face))
    [got] = [b for b in part.blends if b.feature_id == chamfer.feature_id]
    assert got.points[face] == [] and got.reason is None
    assert [round(x, 4) for x in got.distances_mm] == [5.0, 5.0]
    assert {k: v for k, v in _blends(part).items() if k != chamfer.feature_id} == {
        k: v for k, v in _blends(clean).items() if k != chamfer.feature_id}
