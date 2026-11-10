"""The NIST MBE PMI gold-standard files (D-011): checksum and unpack on demand."""

from __future__ import annotations

import hashlib
import shutil
import tempfile
import zipfile
from pathlib import Path

from helpers import ROOT

NIST_DIR = ROOT / "tests" / "nist"
ZIP = NIST_DIR / "NIST-PMI-STEP-Files.zip"
SHA256 = "8fa78429e6d8d9b0d7681d223b6aa9ec98c3772185c55b1a0e3679b21c181911"
CACHE = NIST_DIR / ".cache"


def zip_sha256() -> str:
    return hashlib.sha256(ZIP.read_bytes()).hexdigest()


def ap242_files() -> list[Path]:
    """Unpack the zip once (into tests/nist/.cache) and return its AP242 STEP files, sorted."""
    folder = CACHE / "NIST-PMI-STEP-Files"
    if not folder.is_dir():
        CACHE.mkdir(exist_ok=True)
        # Unpack into a private folder, then rename it into place in one step: parallel test workers
        # (pytest-xdist) never see a half-written file, and a worker that loses the race drops its copy.
        work = Path(tempfile.mkdtemp(dir=CACHE, prefix=".unpack-"))
        try:
            with zipfile.ZipFile(ZIP) as z:
                for member in z.infolist():
                    target = (work / member.filename).resolve()
                    if not target.is_relative_to(work.resolve()):  # never write outside the cache
                        raise RuntimeError(f"unsafe path in zip: {member.filename}")
                z.extractall(work)
            try:
                (work / folder.name).rename(folder)
            except OSError:
                if not folder.is_dir():
                    raise
        finally:
            shutil.rmtree(work, ignore_errors=True)
    return sorted(folder.glob("*_ap242*.stp"))
