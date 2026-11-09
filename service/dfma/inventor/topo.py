"""Face topology of an .ipt's main model: the points round a face and the faces next to it.

Pointer positions measured on the 16 NIST files (docs/research/inventor-i2-probe/topo.py, s17.py), 2026-11-09:
face -> its first loop (4th pointer); loop -> next loop (3rd), first coedge (4th), its face (5th);
coedge -> next coedge (3rd), partner coedge (5th), edge (6th), loop (7th); edge -> vertices (3rd and 4th);
vertex -> point (last pointer). Every pointer is checked with `sab.ref`; loops and coedge rings stop after
MAX_STEPS steps (a cycle that never closes, or hostile data). Points are mm.
"""

from __future__ import annotations

from . import sab

MAX_STEPS = 10_000

Vec = tuple[float, float, float]


class TopologyError(ValueError):
    """A face whose loops or coedges can't be followed: its feature is then not mapped."""


def _p(recs, i: int, k: int, name: str) -> int | None:
    ps = recs[i].of("p")
    return sab.ref(recs, ps[k], name) if len(ps) > k else None


def _point(recs, vertex: int) -> Vec | None:
    ps = recs[vertex].of("p")
    q = sab.ref(recs, ps[-1], "point") if ps else None
    v = recs[q].of("v") if q is not None else []
    return tuple(10.0 * c for c in v[0]) if v else None


def _coedges(recs, face: int):
    """Every coedge of the face's loops, in ring order. Raises TopologyError past MAX_STEPS steps."""
    steps = 0
    seen_loops = set()
    loop = _p(recs, face, 3, "loop")
    while loop is not None and loop not in seen_loops:
        seen_loops.add(loop)
        first = _p(recs, loop, 3, "coedge")
        ce = first
        while ce is not None:
            steps += 1
            if steps > MAX_STEPS:
                raise TopologyError("loop or coedge ring too long")
            yield ce
            ce = _p(recs, ce, 2, "coedge")
            if ce == first:
                break
        else:
            if first is not None:
                raise TopologyError("coedge ring does not close")
        loop = _p(recs, loop, 2, "loop")
        steps += 1
        if steps > MAX_STEPS:
            raise TopologyError("loop or coedge ring too long")


def _edge_points(recs, ce: int) -> list[Vec]:
    e = _p(recs, ce, 5, "edge")
    if e is None:
        return []
    out = []
    for k in (2, 3):
        v = _p(recs, e, k, "vertex")
        if v is not None and (pt := _point(recs, v)) is not None:
            out.append(pt)
    return out


def face_points(recs: list[sab.Record], face: int) -> list[Vec]:
    """The points of the vertices round the face, in loop order (repeats kept)."""
    return [p for ce in _coedges(recs, face) for p in _edge_points(recs, ce)]


def neighbours(recs: list[sab.Record], face: int) -> dict[int, list[Vec]]:
    """Each face that shares an edge with this one, with the points of the shared edges."""
    out: dict[int, list[Vec]] = {}
    for ce in _coedges(recs, face):
        partner = _p(recs, ce, 4, "coedge")
        if partner is None or partner == ce:
            continue
        loop = _p(recs, partner, 6, "loop")
        other = _p(recs, loop, 4, "face") if loop is not None else None
        if other is None or other == face:
            continue
        out.setdefault(other, []).extend(_edge_points(recs, ce))
    return out
