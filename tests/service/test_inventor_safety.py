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
