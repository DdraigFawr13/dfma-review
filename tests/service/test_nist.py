"""Gold standard (D-011): the NIST MBE PMI files stay untouched, all read, and the map never gets worse."""

from __future__ import annotations

import time
import tomllib

import pytest

from nist_files import NIST_DIR, SHA256, ap242_files, zip_sha256

from dfma.analyze import analyze

SCORECARD = {f["name"]: f for f in tomllib.loads((NIST_DIR / "scorecard.toml").read_text(encoding="utf-8"))["file"]}
FILES = ap242_files()


def test_zip_untouched():
    assert zip_sha256() == SHA256, "tests/nist/NIST-PMI-STEP-Files.zip changed; it must stay byte for byte as NIST publishes it"


def test_every_file_is_scored():
    assert len(FILES) == 17
    assert sorted(p.name for p in FILES) == sorted(SCORECARD)


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_nist_file(path):
    start = time.monotonic()
    result = analyze(path, path.name)
    seconds = time.monotonic() - start
    score = SCORECARD[path.name]
    assert seconds < 10, f"{path.name} took {seconds:.1f} s"
    assert result["part"]["face_count"] == score["face_count"]
    # The map may only get better: fewer faces left unanalysed, at least as many features found.
    assert len(result["part"]["not_analysed_faces"]) <= score["not_analysed"]
    assert len(result["features"]) >= score["features"]
