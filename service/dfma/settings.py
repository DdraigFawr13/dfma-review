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
MSG_OPEN_SHELL = ("The solid in this file has a gap: {n} of its edges belong to one face only. It was closed and "
                  "analysed as a solid, so results near the gap may be wrong.")
MSG_NO_UNIT = ("This file declares no length unit. It was read as millimetres; if it was drawn in inches, every "
               "size here is 25.4 times too small (D-020).")
MSG_TOO_LARGE = "File is larger than 50 MB"
MSG_TOO_LONG = "This file took too long to analyse"
MSG_FAILED = "The analysis failed on this file. Try again, or try another file."

ASSUMPTIONS = [
    "Mesh deflection 0.05 mm linear, 0.5 rad angular (assumption).",
    "Exterior profiles, steps, open-sided pockets, threads and floor fillets "
    "are not planned or ruled on in this version.",
    "End mills are the inch list in config/tools.toml for every file; no metric end mills in this version (assumption).",
    "Walls are pairs of planar faces, parallel or up to 15 deg from it (draft, measured at the thinnest place), "
    "with at least 10 mm2 of overlap and material between them (assumption), plus the material around a hole's side and under a drill point, measured up to 0.250 in "
    "(assumption); other curved walls, such as thin cylindrical shells, are not measured.",
    "Tool loads count every tool loaded, including the first in each setup (spec Plan).",
    "Setups cover the holes and pockets a 3-axis mill reaches along the part's axes; a feature that needs a "
    "4/5-axis mill or a fixture, and a void sealed inside the part, are in no setup and their tools are not listed.",
    "A countersink or entry chamfer is cut from its own end after drilling, with one countersink tool per angle "
    "(D-022).",
    "Engraved text and logos are read as pockets: their sharp corners are real geometry, but engraving tools may accept them.",
]

TURN_ASSUMPTIONS = [
    "Turning: the diameter is the largest outside diameter and the length the extent along the axis, so a thin "
    "section behind a large head can read as stocky (spec).",
    "Turning: no turning axis is found when round faces on one axis are under 40% of the part's surface (assumption).",
    "Turning: one setup; one tool load per tool (turn, drills on the axis, bore, groove, then off-axis tools). "
    "Bores are on-axis holes of 0.500 in and over; parting off, threads and flipping the part are not planned.",
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


def drivers_config() -> dict:
    """The cost drivers from config/drivers.toml, in file order (S7)."""
    return _toml("drivers.toml")
