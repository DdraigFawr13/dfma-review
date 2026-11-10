// Port of service/dfma/inventor/surfaces.py: the surface under an .ipt face. The model stores cm; everything here is
// mm. plane: point, normal. cone: origin, axis, major axis (its length is the radius at the origin); its 2nd float is
// the sine of the half-angle, 0 for a cylinder. torus: centre, axis, then major and minor radius. sphere: centre, radius.
import { pySum } from "../units";
import { ref, type Record, type Vec } from "./sab";

export interface Surf {
  kind: "plane" | "cyl" | "cone" | "torus" | "sphere" | "other";
  origin: Vec | null; // mm: plane point, axis origin, centre
  axis: Vec | null; // unit: plane normal, cone / cylinder / torus axis
  radius: number | null; // mm: cylinder, cone at its origin, torus major, sphere
  minor: number | null; // mm: torus minor radius
  halfAngleDeg: number | null; // cone
  reversed: boolean | null; // the face's first bool
}

export function surf(kind: Surf["kind"], origin: Vec | null = null, axis: Vec | null = null, radius: number | null = null,
  minor: number | null = null, halfAngleDeg: number | null = null, reversed: boolean | null = null): Surf {
  return { kind, origin, axis, radius, minor, halfAngleDeg, reversed };
}

export function unit(v: Vec): Vec | null {
  const n = Math.sqrt(pySum([v[0] * v[0], v[1] * v[1], v[2] * v[2]])); // Python 3.12 sum(): compensated
  return n > 1e-12 && Number.isFinite(n) ? [v[0] / n, v[1] / n, v[2] / n] : null;
}

const mm = (v: Vec): Vec => [10.0 * v[0], 10.0 * v[1], 10.0 * v[2]];
export const degrees = (r: number) => r * (180 / Math.PI); // math.degrees

/** The face's first pointer to a `*surface` record. */
export function surfaceOf(recs: Record[], face: number): number | null {
  for (const p of recs[face].of("p")) {
    const q = ref(recs, p, null, "surface");
    if (q !== null) return q;
  }
  return null;
}

export function surface(recs: Record[], face: number): Surf {
  const s = surfaceOf(recs, face);
  if (s === null) return surf("other");
  const r = recs[s];
  const name = r.name ?? "";
  const vs = r.of("v");
  const ds = r.of("d");
  const bs = recs[face].of("b");
  const rev = bs.length ? bs[0] : null;
  if (name.startsWith("plane") && vs.length >= 2) {
    const n = unit(vs[1]);
    if (n) return surf("plane", mm(vs[0]), n, null, null, null, rev);
  }
  if (name.startsWith("cone") && vs.length >= 3 && ds.length >= 2) {
    const a = unit(vs[1]);
    if (a) {
      const rad = 10.0 * Math.sqrt(pySum(vs[2].map((x) => x * x)));
      if (Math.abs(ds[1]) <= 1e-9) return surf("cyl", mm(vs[0]), a, rad, null, null, rev);
      if (Math.abs(ds[1]) > 1) return surf("other");
      return surf("cone", mm(vs[0]), a, rad, null, degrees(Math.asin(Math.abs(ds[1]))), rev);
    }
  }
  if (name.startsWith("torus") && vs.length >= 2 && ds.length >= 2) {
    const a = unit(vs[1]);
    // the minor radius is stored signed (-0.5 cm on CTC 04's concave fillets); its size is what we keep
    if (a) return surf("torus", mm(vs[0]), a, 10.0 * ds[0], 10.0 * Math.abs(ds[1]), null, rev);
  }
  if (name.startsWith("sphere") && vs.length && ds.length) return surf("sphere", mm(vs[0]), null, 10.0 * Math.abs(ds[0]), null, null, rev);
  return surf("other");
}
