"""Rewrite one feature tag or topology pointer of a NIST .ipt in place, for the hostile-data tests (spec I2+I3 J7,
Builder defaults). Works on the inflated model bytes that tests/helpers.py `rewrite_ipt_models` hands over:
`tokens` walks the SAB records as dfma.inventor.sab does and returns each value's byte offset, so a change keeps
every other byte where it was (and the stream's size, where the change allows it)."""

from __future__ import annotations

import struct

HEADER = b"\x0d\x09asmheader"
_FIXED = {0x04: 4, 0x15: 4, 0x0c: 4, 0x06: 8, 0x13: 24, 0x14: 24, 0x16: 16, 0x03: 2, 0x02: 1, 0x05: 4}


def records(d: bytes, start: int) -> list[dict]:
    """[{name, values: [(tag, offset of the value's tag byte)]}] from the header at `start` to End-of-ASM-data."""
    out, cur, name, i = [], [], None, start
    while i < len(d):
        t, at = d[i], i
        i += 1
        if t == 0x11:
            out.append({"name": name, "values": cur})
            cur, name = [], None
            continue
        if t in (0x0d, 0x0e, 0x07, 0x12):
            n = d[i]
            s = d[i + 1:i + 1 + n].decode("latin1")
            i += 1 + n
            if t in (0x0d, 0x0e) and not cur:
                name = s if name is None else f"{name}-{s}"
                if name.endswith("End-of-ASM-data") or name.startswith("Begin-of-ASM-History-Data"):
                    return out
            else:
                cur.append(("s", at))
            continue
        if t in (0x08, 0x09):
            w = 2 if t == 0x08 else 4
            n = struct.unpack_from("<H" if w == 2 else "<I", d, i)[0]
            cur.append(("s", at))
            i += w + n
            continue
        if t in _FIXED:
            cur.append((t, at))
            i += _FIXED[t]
            continue
        if t in (0x0a, 0x0b, 0x0f, 0x10):
            continue
        raise ValueError(f"unknown tag {t:#x} at {at}")
    return out


def main_model(d: bytes) -> tuple[int, list[dict]] | None:
    """(start, records) of the model with the most faces in these bytes, or None."""
    best = None
    k = d.find(HEADER)
    while k >= 0:
        recs = records(d, k)
        n = sum(1 for r in recs if r["name"] == "face")
        if best is None or n > best[2]:
            best = (k, recs, n)
        k = d.find(HEADER, k + 1)
    return (best[0], best[1]) if best and best[2] else None


def _int_at(d: bytes, at: int) -> int:
    return struct.unpack_from("<i", d, at + 1)[0]


def _put_int(d: bytearray, at: int, v: int) -> None:
    struct.pack_into("<i", d, at + 1, v)


_PREFIX = {"hole": "NMx_Hole_Brep_tag", "blend": "NMx_blend_tag"}  # Inventor 2021 tag records (CTC 04)


def hole_tags(d: bytes, recs: list[dict], kind: str = "hole") -> list[dict]:
    return [r for r in recs if (r["name"] or "").startswith(_PREFIX[kind])]


def _skip(d: bytes, kind: str = "hole") -> bool:
    """A stream with no model, or a model with no tags of this kind: left as it is."""
    m = main_model(d)
    return m is None or not hole_tags(d, m[1], kind)


def no_end(d: bytes, n: int = 0, kind: str = "hole") -> bytes:
    """The n-th hole tag's -1 after its (k, id) pairs becomes 7: the pair list never ends."""
    if _skip(d, kind):
        return d
    _, recs = main_model(d)
    r = hole_tags(d, recs, kind)[n]
    ints = [at for t, at in r["values"] if t == 0x04]
    end = next(at for at in ints[3:] if _int_at(d, at) == -1)
    out = bytearray(d)
    _put_int(out, end, 7)
    return bytes(out)


def long_list(d: bytes, n: int = 0, pairs: int = 10_000, kind: str = "hole") -> bytes:
    """The n-th hole tag's pair list grows to `pairs` (k, id) pairs (repeats of its first), still ending in -1."""
    if _skip(d, kind):
        return d
    _, recs = main_model(d)
    r = hole_tags(d, recs, kind)[n]
    ints = [at for t, at in r["values"] if t == 0x04]
    first = ints[2]  # 2021: -1, version, then the first k
    pair = d[first:first + 10]  # (k, id): two 5-byte int values
    return d[:first] + pair * pairs + d[first + 10:]


def owner_off(d: bytes, n: int = 0, kind: str = "hole") -> bytes:
    """The n-th hole tag's owner pointer (its 4th) points past the record list."""
    if _skip(d, kind):
        return d
    _, recs = main_model(d)
    r = hole_tags(d, recs, kind)[n]
    ptrs = [at for t, at in r["values"] if t == 0x0c]
    out = bytearray(d)
    _put_int(out, ptrs[3], 10_000_000)
    return bytes(out)


def owner_face(d: bytes, n: int = 0, kind: str = "hole") -> int:
    """The face record index the n-th hole tag sits on (before any change)."""
    _, recs = main_model(d)
    r = hole_tags(d, recs, kind)[n]
    return _int_at(d, [at for t, at in r["values"] if t == 0x0c][3])


def cycle(d: bytes, face: int) -> bytes:
    """The first coedge of the face's first loop gets as its next another coedge that loops on itself (a full
    circle): the ring never gets back to its first coedge."""
    if _skip(d):  # CTC 04's main model holds hole and blend tags; other streams' models are left alone
        return d
    _, recs = main_model(d)
    if face >= len(recs) or recs[face]["name"] != "face":  # another stream's model
        return d

    def ptrs(rec: int) -> list[int]:
        return [at for t, at in recs[rec]["values"] if t == 0x0c]

    first = _int_at(d, ptrs(_int_at(d, ptrs(face)[3]))[3])
    other = next(i for i, r in enumerate(recs) if r["name"] == "coedge" and i != first
                 and _int_at(d, ptrs(i)[2]) == i)
    out = bytearray(d)
    _put_int(out, ptrs(first)[2], other)
    return bytes(out)
