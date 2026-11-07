"""Lengths are millimetres inside; inches on screen (D-005)."""

from __future__ import annotations

MM_PER_IN = 25.4


def mm_to_in(mm: float) -> float:
    return mm / MM_PER_IN


METRIC = ("mm", "cm", "m")  # D-020: centimetre and metre files are metric too


def unit_name(file_length_unit: str) -> str:
    """Map the length unit a STEP file declares to "mm", "cm", "m", "inch", "none" (it declares none,
    D-020) or "other"."""
    name = file_length_unit.strip().lower()
    if name in ("mm", "millimetre", "millimeter"):
        return "mm"
    if name in ("cm", "centimetre", "centimeter"):
        return "cm"
    if name in ("m", "metre", "meter"):
        return "m"
    if not name:
        return "none"
    if name in ("in", "inch", "inches"):
        return "inch"
    return "other"


def fraction(inches: float) -> str | None:
    """"1/4", "1 1/2"; None unless within 0.0005 in of a 1/64 in multiple (spec Units; web/src/format.ts)."""
    sixty_fourths = round(inches * 64)
    if sixty_fourths == 0 or abs(inches - sixty_fourths / 64) > 0.0005 + 1e-12:
        return None
    whole, n = divmod(abs(sixty_fourths), 64)
    sign = "-" if sixty_fourths < 0 else ""
    if n == 0:
        return f"{sign}{whole}"
    d = 64
    while n % 2 == 0:
        n //= 2
        d //= 2
    return f"{sign}{whole} {n}/{d}" if whole else f"{sign}{n}/{d}"


def fmt_in(inches: float, with_fraction: bool = False) -> str:
    """"0.250 in", or "0.250 in (1/4)" with a fraction where one fits."""
    text = f"{inches:.3f}"
    if float(text) == 0:
        text = f"{0:.3f}"
    frac = fraction(inches) if with_fraction else None
    return f"{text} in ({frac})" if frac else f"{text} in"
