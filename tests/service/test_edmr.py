"""EDMR subset (tests/edmr): every file is scored, and no result gets worse (D-011).

Files run through the analysis worker, so one that crashes OpenCascade is a "crash" result,
not a dead test run. Status order: crash < read_error < ok.
"""

from __future__ import annotations

import sys
import tomllib

import pytest

from helpers import ROOT

HERE = ROOT / "tests" / "edmr"
sys.path.insert(0, str(HERE))
from make_scorecard import files, outcome  # noqa: E402

SCORECARD = {f["path"]: f for f in tomllib.loads((HERE / "scorecard.toml").read_text(encoding="utf-8"))["file"]}
FILES = files()
RANK = {"crash": 0, "read_error": 1, "ok": 2}


@pytest.fixture(scope="module")
def run():
    from dfma.worker import Worker
    worker = Worker()
    worker.start()
    yield worker.run
    worker.stop()


def test_every_file_is_scored():
    assert len(FILES) == 113
    assert sorted(p.relative_to(HERE).as_posix() for p in FILES) == sorted(SCORECARD)


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_edmr_file(path, run):
    now = outcome(path, run)
    was = SCORECARD[path.relative_to(HERE).as_posix()]
    assert RANK[now["status"]] >= RANK[was["status"]], f'{path.name}: {was["status"]} -> {now["status"]}'
    if now["status"] == "ok" and was["status"] == "ok":
        assert now["face_count"] == was["face_count"]
        assert now["not_analysed"] <= was["not_analysed"]
        assert now["features"] >= was["features"]
