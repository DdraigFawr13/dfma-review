"""The surface under an .ipt face (spec I2+I3 Design "Parts"; layouts in docs/research/inventor-i2-probe/README.md
"Topology", measured on the 16 NIST files 2026-11-09). The model stores cm; everything here is mm.

- `plane-surface`: point, normal.
- `cone-surface`: origin, axis, major axis (its length is the radius at the origin); its 2nd float is the
  sine of the half-angle, 0 for a cylinder.
- `torus-surface`: centre, axis, then major and minor radius.
- `sphere-surface`: centre, radius.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from . import sab

Vec = tuple[float, float, float]


@dataclass(frozen=True)
class Surf:
    kind: str  # plane | cyl | cone | torus | sphere | other
    origin: Vec | None = None  # mm: plane point, axis origin, centre
    axis: Vec | None = None  # unit: plane normal, cone / cylinder / torus axis
    radius: float | None = None  # mm: cylinder, cone at its origin, torus major, sphere
    minor: float | None = None  # mm: torus minor radius
    half_angle_deg: float | None = None  # cone
    reversed: bool | None = None  # the face's first bool: True on a concave (hole) face of the NIST threads


def _unit(v) -> Vec | None:
    n = math.sqrt(sum(x * x for x in v))
    return tuple(x / n for x in v) if n > 1e-12 and math.isfinite(n) else None


def _mm(v) -> Vec:
    return tuple(10.0 * x for x in v)


def surface(recs: list[sab.Record], face: int) -> Surf:
    s = next((q for p in recs[face].of("p") if (q := sab.ref(recs, p, suffix="surface")) is not None), None)
    if s is None:
        return Surf("other")
    r = recs[s]
    name = r.name or ""
    vs = [v for v in r.of("v") if isinstance(v, tuple) and len(v) == 3]
    ds = [d for d in r.of("d") if isinstance(d, float)]
    bs = recs[face].of("b")
    rev = bool(bs[0]) if bs else None
    try:
        if name.startswith("plane") and len(vs) >= 2 and (n := _unit(vs[1])):
            return Surf("plane", _mm(vs[0]), n, reversed=rev)
        if name.startswith("cone") and len(vs) >= 3 and len(ds) >= 2 and (a := _unit(vs[1])):
            rad = 10.0 * math.sqrt(sum(x * x for x in vs[2]))
            if abs(ds[1]) <= 1e-9:
                return Surf("cyl", _mm(vs[0]), a, rad, reversed=rev)
            if abs(ds[1]) > 1:
                return Surf("other")
            return Surf("cone", _mm(vs[0]), a, rad, half_angle_deg=math.degrees(math.asin(abs(ds[1]))),
                        reversed=rev)
        if name.startswith("torus") and len(vs) >= 2 and len(ds) >= 2 and (a := _unit(vs[1])):
            # the minor radius is stored signed (-0.5 cm on CTC 04's concave fillets); its size is what we keep
            return Surf("torus", _mm(vs[0]), a, 10.0 * ds[0], 10.0 * abs(ds[1]), reversed=rev)
        if name.startswith("sphere") and vs and ds:
            return Surf("sphere", _mm(vs[0]), None, 10.0 * abs(ds[0]), reversed=rev)
    except (TypeError, ValueError):
        pass
    return Surf("other")
