"""Lengths are millimetres inside; inches on screen (D-005)."""

from __future__ import annotations

MM_PER_IN = 25.4


def mm_to_in(mm: float) -> float:
    return mm / MM_PER_IN


def unit_name(file_length_unit: str) -> str:
    """Map the length unit a STEP file declares to "mm", "inch" or "other"."""
    name = file_length_unit.strip().lower()
    if name in ("mm", "millimetre", "millimeter"):
        return "mm"
    if name in ("in", "inch", "inches"):
        return "inch"
    return "other"
