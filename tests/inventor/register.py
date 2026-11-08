"""Line up an .ipt with a STEP from another CAD system (test harness only, spec I1 "Test files"; D-032 keeps
any rotation or shift search out of the app).

From the 2026-11-08 spike (docs/research/inventor-spike/register.py): try the 24 axis-aligned rotations; for
each, vote for shifts from .ipt corners onto STEP corners on a 0.1 mm grid; score the best shifts by corners that
land on a STEP corner plus 10 per .ipt cylinder that lands on a STEP hole axis. Added here: the winning shift is
refined past the 0.1 mm grid, as the median offset of corner pairs that lie within 0.2, then 0.05, then 0.02 mm
of each other (a median, because two CAD systems place some corners differently; CTC 04's mean was 0.013 mm off).
"""

from __future__ import annotations

import collections
import itertools
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "service"))

from dfma.features import _cylinder  # noqa: E402
from dfma.inventor import ole, sab  # noqa: E402
from dfma.inventor.pair import step_corners  # noqa: E402


def rotations() -> list[list[list[int]]]:
    out = []
    for perm in itertools.permutations(range(3)):
        for sg in itertools.product((1, -1), repeat=3):
            m = [[0] * 3 for _ in range(3)]
            for r in range(3):
                m[r][perm[r]] = sg[r]
            det = (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                   + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))
            if det == 1:
                out.append(m)
    return out


def _mul(m, v):
    return tuple(sum(m[r][c] * v[c] for c in range(3)) for r in range(3))


def _key(v):
    return tuple(round(x, 1) for x in v)


def ipt_cylinders(path) -> list[tuple[tuple, tuple, float]]:
    """(origin mm, axis, diameter mm) of every cylinder face of the .ipt's main model, convex or concave."""
    f = ole.Ipt(path)
    try:
        best = None
        for d in f.models():
            k = d.find(sab.HEADER)
            while k >= 0:
                _, recs = sab.split(d, k)
                n = sum(1 for r in recs if r.name == "face")
                if best is None or n > best[1]:
                    best = (recs, n)
                k = d.find(sab.HEADER, k + 1)
    finally:
        f.close()
    recs, out = best[0], []
    for r in recs:
        if r.name != "face":
            continue
        s = next((q for p in r.of("p") if (q := sab.ref(recs, p, suffix="surface")) is not None), None)
        if s is None or not (recs[s].name or "").startswith("cone"):
            continue
        vs, ds = recs[s].of("v"), recs[s].of("d")
        if len(vs) < 3 or len(ds) < 2 or abs(ds[1]) > 1e-9:
            continue
        out.append((tuple(10 * x for x in vs[0]), tuple(vs[1]), 20 * math.sqrt(sum(x * x for x in vs[2]))))
    return out


def step_holes(holes: list[dict], faces) -> list[tuple[tuple, tuple, float]]:
    """(a point on the axis, axis, diameter) of each STEP hole and bore."""
    out = []
    for h in holes:
        c = next((c for i in h["faces"] if (c := _cylinder(i, faces[i], tapers=True))), None)
        if c is not None:
            out.append((c.origin, c.axis, h["dims_mm"]["diameter"]))
    return out


def _axis_hits(m, t, cyls, holes) -> int:
    n = 0
    for o, a, d in cyls:
        o2 = tuple(x + y for x, y in zip(_mul(m, o), t))
        a2 = _mul(m, a)
        for ho, ha, hd in holes:
            if abs(sum(x * y for x, y in zip(ha, a2))) < 0.999 or abs(hd - d) >= 0.15:
                continue
            w = [ho[k] - o2[k] for k in range(3)]
            c = (w[1] * a2[2] - w[2] * a2[1], w[2] * a2[0] - w[0] * a2[2], w[0] * a2[1] - w[1] * a2[0])
            if math.sqrt(sum(x * x for x in c)) < 0.05:
                n += 1
                break
    return n


def register(ipt_part, ipt_path, step_part, holes: list[dict]) -> tuple[list[list[float]], list[float]]:
    """(rows, shift): .ipt point p goes to rows·p + shift in the STEP's frame."""
    spts = step_corners(step_part.solid)
    sset = {_key(p) for p in spts}
    cells: dict = collections.defaultdict(list)
    for p in spts:
        cells[_key(p)].append(p)
    ipts = ipt_part.corners_mm
    cyls, hs = ipt_cylinders(ipt_path), step_holes(holes, step_part.faces)
    best = None
    sample = ipts[::max(1, len(ipts) // 80)]
    for m in rotations():
        votes = collections.Counter()
        for p in sample:
            q = _mul(m, p)
            for s in spts:
                votes[_key([s[i] - q[i] for i in range(3)])] += 1
        for t, _ in votes.most_common(5):
            hit = sum(1 for p in ipts if _key([x + y for x, y in zip(_mul(m, p), t)]) in sset)
            score = hit + 10 * _axis_hits(m, t, cyls, hs)
            if best is None or score > best[0]:
                best = (score, m, list(t))
    _, m, t = best
    for radius in (0.2, 0.05, 0.02):  # refine past the 0.1 mm grid (docstring)
        diffs = []
        for p in ipts:
            q = [x + y for x, y in zip(_mul(m, p), t)]
            near = None
            for dx, dy, dz in itertools.product((-0.1, 0.0, 0.1), repeat=3):
                for s in cells.get(_key([q[0] + dx, q[1] + dy, q[2] + dz]), ()):
                    d = math.dist(s, q)
                    if d < radius and (near is None or d < near[0]):
                        near = (d, s)
            if near is not None:
                diffs.append([near[1][k] - q[k] for k in range(3)])
        if not diffs:
            break
        t = [t[k] + sorted(d[k] for d in diffs)[len(diffs) // 2] for k in range(3)]
    return [list(map(float, r)) for r in m], [float(x) for x in t]
