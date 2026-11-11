// Port of tests/inventor/register.py (test harness only, spec I1 "Test files"; D-032 keeps any rotation or shift
// search out of the app): line an .ipt up with a STEP from another CAD system. Try the 24 axis-aligned rotations; for
// each, vote for shifts from .ipt corners onto STEP corners on a 0.1 mm grid; score the best shifts by corners that
// land on a STEP corner plus 10 per .ipt cylinder that lands on a STEP hole axis; then refine the winning shift past
// the grid as the median offset of corner pairs within 0.2, 0.05, then 0.02 mm of each other.
import { cylinder, Topology } from "../engine/features/holes";
import type { OC } from "../engine/oc";
import { find, Ipt } from "../engine/inventor/ole";
import * as sab from "../engine/inventor/sab";
import type { Vec } from "../engine/inventor/sab";
import { stepCorners } from "../engine/inventor/pair";
import type { IptPart } from "../engine/inventor/part";
import type { ReadResult } from "../engine/read";
import { pySum, round } from "../engine/units";

type Mat = number[][];
export type Cylinder = [Vec, Vec, number]; // origin mm, axis, diameter mm

/** The 24 proper rotations that permute and flip the axes, in Python's itertools order. */
export function rotations(): Mat[] {
  const out: Mat[] = [];
  const perms: number[][] = [];
  for (const a of [0, 1, 2]) for (const b of [0, 1, 2]) for (const c of [0, 1, 2]) if (a !== b && b !== c && a !== c) perms.push([a, b, c]);
  for (const perm of perms) {
    for (const s0 of [1, -1]) for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
      const sg = [s0, s1, s2];
      const m: Mat = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let r = 0; r < 3; r++) m[r][perm[r]] = sg[r];
      const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      if (det === 1) out.push(m);
    }
  }
  return out;
}

const mul = (m: Mat, v: number[]): Vec => [0, 1, 2].map((r) => pySum([0, 1, 2].map((c) => m[r][c] * v[c]))) as Vec;

/** Python's round(x, 1) as a whole number of tenths (two floats are equal exactly when their tenths are). Away from
 *  a tie the plain product is right; near one, the exact `round` decides. */
function tenths(x: number): number {
  const v = x * 10;
  if (Math.abs(v - Math.floor(v) - 0.5) > 1e-6) return Math.round(v) + 0;
  return Math.round(round(x, 1) * 10) + 0;
}
const key = (v: number[]): string => `${tenths(v[0])},${tenths(v[1])},${tenths(v[2])}`;
const keyFloats = (k: string): number[] => k.split(",").map((n) => Number(n) / 10); // the key's value, as Python's round gives it

const dist = (a: number[], b: number[]) => Math.sqrt(pySum([0, 1, 2].map((k) => (a[k] - b[k]) * (a[k] - b[k]))));

/** (origin mm, axis, diameter mm) of every cylinder face of the .ipt's main model, convex or concave. */
export async function iptCylinders(bytes: Uint8Array): Promise<Cylinder[]> {
  const f = await Ipt.open(bytes);
  let best: [sab.Record[], number] | null = null;
  for (const d of f.models()) {
    let k = find(d, sab.HEADER);
    while (k >= 0) {
      const [, recs] = sab.split(d, k);
      const n = recs.filter((r) => r.name === "face").length;
      if (best === null || n > best[1]) best = [recs, n];
      k = find(d, sab.HEADER, k + 1);
    }
  }
  const recs = best![0];
  const out: Cylinder[] = [];
  for (const r of recs) {
    if (r.name !== "face") continue;
    let s: number | null = null;
    for (const p of r.of("p")) { const q = sab.ref(recs, p, null, "surface"); if (q !== null) { s = q; break; } }
    if (s === null || !(recs[s].name ?? "").startsWith("cone")) continue;
    const vs = recs[s].of("v");
    const ds = recs[s].of("d");
    if (vs.length < 3 || ds.length < 2 || Math.abs(ds[1]) > 1e-9) continue;
    out.push([vs[0].map((x) => 10 * x) as Vec, [...vs[1]] as Vec, 20 * Math.sqrt(pySum(vs[2].map((x) => x * x)))]);
  }
  return out;
}

/** (a point on the axis, axis, diameter) of each STEP hole and bore; `holes` are the analysis's hole features. */
export function stepHoles(holes: { faces: number[]; dims_mm: { diameter: number } }[], topo: Topology): Cylinder[] {
  const out: Cylinder[] = [];
  for (const h of holes) {
    let c = null;
    for (const i of h.faces) { c = cylinder(topo, i, true); if (c) break; }
    if (c !== null) out.push([c.origin, c.axis, h.dims_mm.diameter]);
  }
  return out;
}

function axisHits(m: Mat, t: number[], cyls: Cylinder[], holes: Cylinder[]): number {
  let n = 0;
  for (const [o, a, d] of cyls) {
    const o2 = mul(m, o).map((x, k) => x + t[k]);
    const a2 = mul(m, a);
    for (const [ho, ha, hd] of holes) {
      if (Math.abs(pySum([0, 1, 2].map((k) => ha[k] * a2[k]))) < 0.999 || Math.abs(hd - d) >= 0.15) continue;
      const w = [0, 1, 2].map((k) => ho[k] - o2[k]);
      const c = [w[1] * a2[2] - w[2] * a2[1], w[2] * a2[0] - w[0] * a2[2], w[0] * a2[1] - w[1] * a2[0]];
      if (Math.sqrt(pySum(c.map((x) => x * x))) < 0.05) { n++; break; }
    }
  }
  return n;
}

/** (rows, shift): .ipt point p goes to rows . p + shift in the STEP's frame. `iptPath` of Python is the .ipt's bytes. */
export async function register(oc: OC, ipt: IptPart, iptBytes: Uint8Array, step: ReadResult,
  holes: { faces: number[]; dims_mm: { diameter: number } }[]): Promise<[number[][], number[]]> {
  const spts = stepCorners(oc, step.solid);
  const sset = new Set(spts.map(key));
  const cells = new Map<string, Vec[]>();
  for (const p of spts) { const k = key(p); if (!cells.has(k)) cells.set(k, []); cells.get(k)!.push(p); }
  const ipts = ipt.corners_mm;
  const cyls = await iptCylinders(iptBytes);
  const hs = stepHoles(holes, new Topology(oc, step.solid, step.faces));
  let best: [number, Mat, number[]] | null = null;
  const stride = Math.max(1, Math.floor(ipts.length / 80));
  const sample = ipts.filter((_, i) => i % stride === 0);
  for (const m of rotations()) {
    const votes = new Map<string, number>(); // insertion order, as Counter
    for (const p of sample) {
      const q = mul(m, p);
      for (const s of spts) {
        const k = key([s[0] - q[0], s[1] - q[1], s[2] - q[2]]);
        votes.set(k, (votes.get(k) ?? 0) + 1);
      }
    }
    // most_common(5): by count, descending; a tie keeps first-seen order
    const top = [...votes].sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [k] of top) {
      const t = keyFloats(k);
      let hit = 0;
      for (const p of ipts) { const q = mul(m, p); if (sset.has(key([q[0] + t[0], q[1] + t[1], q[2] + t[2]]))) hit++; }
      const score = hit + 10 * axisHits(m, t, cyls, hs);
      if (best === null || score > best[0]) best = [score, m, t];
    }
  }
  const [, m] = best!;
  let t = best![2];
  for (const radius of [0.2, 0.05, 0.02]) { // refine past the 0.1 mm grid
    const diffs: number[][] = [];
    for (const p of ipts) {
      const mp = mul(m, p);
      const q = [0, 1, 2].map((k) => mp[k] + t[k]);
      let near: [number, Vec] | null = null;
      for (const dx of [-0.1, 0.0, 0.1]) for (const dy of [-0.1, 0.0, 0.1]) for (const dz of [-0.1, 0.0, 0.1]) {
        for (const s of cells.get(key([q[0] + dx, q[1] + dy, q[2] + dz])) ?? []) {
          const d = dist(s, q);
          if (d < radius && (near === null || d < near[0])) near = [d, s];
        }
      }
      if (near !== null) diffs.push([0, 1, 2].map((k) => near![1][k] - q[k]));
    }
    if (!diffs.length) break;
    t = t.map((x, k) => x + diffs.map((d) => d[k]).sort((a, b) => a - b)[Math.floor(diffs.length / 2)]);
  }
  return [m.map((r) => r.map(Number)), t.map(Number)];
}
