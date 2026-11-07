"""Fixed settings, plus loaders for the editable config/*.toml files (thresholds, tools)."""

from __future__ import annotations

import tomllib
from functools import cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = REPO_ROOT / "web"
DIST_DIR = WEB_DIR / "dist"
CONFIG_DIR = REPO_ROOT / "config"

HOST = "127.0.0.1"
DEFAULT_PORT = 8000

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 52,428,800 bytes
TIME_LIMIT_S = 60.0

# Mesh deflections (assumption, spec Flow step 6).
MESH_LINEAR_MM = 0.05
MESH_ANGULAR_RAD = 0.5

PROCESSES = ("mill", "turn")
MATERIALS = ("al6061", "steel1018", "ss304", "plastic")

MSG_NOT_STEP = "This is not a STEP file this tool can read"
MSG_NO_SOLID = "No solid found in this file"
MSG_TOO_LARGE = "File is larger than 50 MB"
MSG_TOO_LONG = "This file took too long to analyse"
MSG_FAILED = "The analysis failed on this file. Try again, or try another file."

ASSUMPTIONS = [
    "Mesh deflection 0.05 mm linear, 0.5 rad angular (assumption).",
    "Exterior profiles, steps, open-sided pockets, threads, floor fillets and thin cylindrical shells "
    "are not planned or ruled on in this version.",
    "End mills are the inch list in config/tools.toml for every file; no metric end mills in this version (assumption).",
    "Walls are pairs of parallel planar faces with at least 10 mm2 of overlap and material between them "
    "(assumption); curved walls and thin cylindrical shells are not measured.",
    "Engraved text and logos are read as pockets: their sharp corners are real geometry, but engraving tools may accept them.",
]


@cache
def _toml(name: str) -> dict:
    with open(CONFIG_DIR / name, "rb") as f:
        return tomllib.load(f)


def thresholds(material: str) -> dict:
    """The rule limits for one material, from config/thresholds.toml."""
    return _toml("thresholds.toml")[material]


def tools_config() -> dict:
    return _toml("tools.toml")
