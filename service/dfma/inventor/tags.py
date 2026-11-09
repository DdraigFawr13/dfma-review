"""Feature tags on the faces of an .ipt's main model (spec I2+I3 Design "Parts", "Hole features").

Measured on the 16 NIST files (docs/research/inventor-i2-probe/geo.py), 2026-11-09:
- Inventor 2021 names a tag record `NMx_Hole_Brep_tag-...-attrib` or `NMx_blend_tag-...-attrib`; Inventor 2024
  writes `ATTRIB_CUSTOM-attrib` whose first string is `INV_NMX_HOLE_TAG` or `INV_NMX_BLEND_TAG`.
- Its ints: 2021 `-1, <version 43>, ...`; 2024 `-1, 1, <version 44>, ...`. After the version come pairs
  `(k, feature id)` up to `k == -1`. The last id is the feature that made the face; ids before it are the
  pattern or mirror features that copied it. `k` (1, 2 or 3) is not used.
- Its owner is its 4th pointer (index 3); a tag counts only when that is a `face` record.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import sab

MAX_PAIRS = 64  # a tag with more (k, id) pairs is dropped (spec Builder defaults)
_KINDS_2021 = {"NMx_Hole_Brep_tag": "hole", "NMx_blend_tag": "blend"}
_KINDS_2024 = {"INV_NMX_HOLE_TAG": "hole", "INV_NMX_BLEND_TAG": "blend"}


@dataclass(frozen=True)
class Tag:
    kind: str  # "hole" | "blend"
    ids: tuple[int, ...]  # feature ids in record order; the last made the face


def _kind_and_ints(r: sab.Record) -> tuple[str | None, list]:
    name = r.name or ""
    ints = r.of("i")
    if name.startswith("ATTRIB_CUSTOM"):
        s = r.of("s")
        return (_KINDS_2024.get(s[0]) if s else None), ints[3:]  # after -1, 1, version
    return _KINDS_2021.get(name.split("-", 1)[0]), ints[2:]  # after -1, version


def pair_ids(ints: list) -> list[int] | None:
    """The ids of the (k, id) pairs up to k == -1; None when the list doesn't end in -1 or holds over 64 pairs."""
    out = []
    k = 0
    while k < len(ints):
        if ints[k] == -1:
            return out
        if k + 1 >= len(ints) or len(out) >= MAX_PAIRS:
            return None
        out.append(ints[k + 1])
        k += 2
    return None


def feature_tags(recs: list[sab.Record]) -> dict[int, list[Tag]]:
    """Hole and blend tags by the index of the face record they sit on. Bad tags are dropped."""
    out: dict[int, list[Tag]] = {}
    for r in recs:
        kind, ints = _kind_and_ints(r)
        if kind is None:
            continue
        ptrs = r.of("p")
        face = sab.ref(recs, ptrs[3], "face") if len(ptrs) > 3 else None
        if face is None:
            continue
        ids = pair_ids(ints)
        if not ids or not all(isinstance(x, int) and x > 0 for x in ids):
            continue
        out.setdefault(face, []).append(Tag(kind, tuple(ids)))
    return out
