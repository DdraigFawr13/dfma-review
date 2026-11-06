"""Shared helpers for the service and e2e tests (on the path through pytest.ini)."""

from __future__ import annotations

import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / "tests" / "parts"


def expected_parts() -> list[dict]:
    with open(PARTS / "expected.toml", "rb") as f:
        return tomllib.load(f).get("part", [])


def expected(name: str) -> dict:
    for part in expected_parts():
        if part["name"] == name:
            return part
    raise KeyError(name)

