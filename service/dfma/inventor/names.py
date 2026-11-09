"""Hole feature names by the rank rule (spec I2+I3 "Names (measured; the rank rule)", D-039).

Measured on the 16 NIST files (docs/research/inventor-i2-probe/s25.py, s28.py): Hole names are UTF-16 texts
`Hole<n>` in the smallest `RSeStorage/B` stream that has an `RSeStorage/M` partner and holds at least one. Where
their count equals the count of Hole features, the k-th smallest feature id has the k-th name by number (70 of 70
key Holes right, 0 wrong). This is an inference with no id link (spec "Risks"): any other count gives no names.
English default names only: a renamed or localised Hole is not a `Hole<n>` text, so the counts differ and the
part shows none (fails safe).
"""

from __future__ import annotations

import re

from ..errors import ReadError
from . import ole

_TEXT = re.compile(rb"(?:[\x20-\x7e]\x00){3,60}")  # printable UTF-16LE runs, as the probe read them
_HOLE = re.compile(r"Hole\d{1,9}")


def hole_names(f: ole.Ipt, stream_cap: int | None = None) -> list[str]:
    """The distinct `Hole<n>` texts of that stream, sorted by number; [] when no stream holds any or a stream
    can't be read (bad data gives no names, never a refusal)."""
    best = None  # (inflated length, stream name, names)
    for name in sorted(f.names):
        if not name.startswith("RSeStorage/B") or "RSeStorage/M" + name[len("RSeStorage/B"):] not in f.names:
            continue
        try:
            data = f.inflate(name, stream_cap)
        except ReadError:
            continue
        if data is None or (best is not None and len(data) >= best[0]):
            continue  # ties on size go to the first name in sort order
        found = {t for m in _TEXT.finditer(data) if _HOLE.fullmatch(t := m.group().decode("utf-16le"))}
        if found:
            best = (len(data), name, found)
    return sorted(best[2], key=lambda t: int(t[4:])) if best else []


def assign(features: list, names: list[str]) -> None:
    """The rank rule: the k-th smallest feature id gets the k-th name, only when the counts are equal."""
    if len(names) != len(features):
        return
    for feat, n in zip(sorted(features, key=lambda x: x.feature_id), names):
        feat.name = n
