"""Fixed settings. Editable thresholds arrive in config/*.toml from S2."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = REPO_ROOT / "web"
DIST_DIR = WEB_DIR / "dist"

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

ASSUMPTIONS = [
    "Mesh deflection 0.05 mm linear, 0.5 rad angular (assumption).",
    "Exterior profiles, steps, open-sided pockets, threads, floor fillets and thin cylindrical shells "
    "are not planned or ruled on in this version.",
]
