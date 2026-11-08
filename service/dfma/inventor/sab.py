"""Split the ACIS binary (SAB) model inside an .ipt into records (spec I1 Design "Parts").

Rewritten from the 2026-11-08 spike (docs/research/inventor-spike/sab.py), from the bytes of the NIST files.
A record is a list of tagged values ending with tag 0x11; tags 0x0d/0x0e at a record's start make its name
(parts joined with '-'). Every length is checked against the data, pointers are checked where they are used
(`ref`), and an unknown tag raises MSG_IPT_FORMAT. Lengths in the model are cm.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

from .. import settings
from ..errors import ReadError

HEADER = b"\x0d\x09asmheader"


@dataclass
class Record:
    name: str | None
    values: list = field(default_factory=list)  # (kind, value): 's' str, 'i' int, 'p' pointer, 'd' float,
    # 'v' 3-vector, 'v2' 2-vector, 'b' bool, '{' / '}' brackets

    def of(self, kind: str) -> list:
        return [v for k, v in self.values if k == kind]


_FIXED = {0x04: ("i", "<i", 4), 0x15: ("i", "<i", 4), 0x0c: ("p", "<i", 4), 0x06: ("d", "<d", 8),
          0x13: ("v", "<3d", 24), 0x14: ("v", "<3d", 24), 0x16: ("v2", "<2d", 16), 0x03: ("i", "<h", 2),
          0x02: ("i", "<B", 1), 0x05: ("d", "<f", 4)}


def split(d: bytes, start: int) -> tuple[str, list[Record]]:
    """Records from offset `start` (the 0x0d tag of `asmheader`) up to `End-of-ASM-data` or the history section.
    Returns (version, records)."""
    version = "unknown"

    def fail():
        raise ReadError(settings.MSG_IPT_FORMAT.format(version=version))

    def take(i: int, n: int) -> bytes:
        if n < 0 or i + n > len(d):
            fail()
        return d[i:i + n]

    i, recs, cur, name = start, [], [], None
    while True:
        if i >= len(d):
            fail()  # no End-of-ASM-data: the data ran out
        t = d[i]
        i += 1
        if t == 0x11:
            recs.append(Record(name, cur))
            if len(recs) == 1:  # the asmheader record: its first version-like string
                version = next((s for s in recs[0].of("s") if s[:1].isdigit() and "." in s), version)
            cur, name = [], None
            continue
        if t in (0x0d, 0x0e, 0x07, 0x12):
            n = take(i, 1)[0]
            s = take(i + 1, n).decode("latin1")
            i += 1 + n
            if t in (0x0d, 0x0e) and not cur:
                name = s if name is None else f"{name}-{s}"
                if name.endswith("End-of-ASM-data") or name.startswith("Begin-of-ASM-History-Data"):
                    # The live model ends here; what follows is ACIS history (delta_state records holding old
                    # copies of entities, numbered apart from the model), measured in CTC 01 (2026-11-08)
                    return version, recs
            else:
                cur.append(("s", s))
            continue
        if t in (0x08, 0x09):
            w = 2 if t == 0x08 else 4
            n = struct.unpack("<H" if w == 2 else "<I", take(i, w))[0]
            cur.append(("s", take(i + w, n).decode("latin1")))
            i += w + n
            continue
        if t in _FIXED:
            kind, fmt, n = _FIXED[t]
            v = struct.unpack(fmt, take(i, n))
            cur.append((kind, v if len(v) > 1 else v[0]))
            i += n
            continue
        if t in (0x0a, 0x0b):
            cur.append(("b", t == 0x0a))
            continue
        if t in (0x0f, 0x10):
            cur.append(("{" if t == 0x0f else "}", None))
            continue
        fail()


def ref(recs: list[Record], p, name: str | None = None, suffix: str | None = None) -> int | None:
    """A pointer value checked to lie in the record list (and to name the kind asked for), else None."""
    if not isinstance(p, int) or not 0 <= p < len(recs):
        return None
    n = recs[p].name or ""
    if name is not None and n != name:
        return None
    if suffix is not None and not n.endswith(suffix):
        return None
    return p


def link(recs: list[Record], rec: Record, name: str) -> int | None:
    """The first pointer of `rec` that points at a record called `name`."""
    return next((q for p in rec.of("p") if (q := ref(recs, p, name)) is not None), None)
