// Port of service/dfma/inventor/threads.py: thread records of an .ipt, and their mapping onto the STEP's holes (spec
// I1 Design "Thread records", "Mapping"). Inventor 2021 names the record `NMx_Thread_Entity-NamingMatching-attrib`;
// 2024 writes `ATTRIB_CUSTOM-attrib` whose first string is `INV_NMX_THREAD_TAG`. Its 4th pointer is the threaded
// face; its first two vectors are two points whose distance is the thread depth; its second-last vector is the
// thread's start and its last the axis into the material. Strings after the tag: nominal size, designation, standard,
// '', '', class, pitch, then seven limits (major min, major max, pitch min, pitch max, minor min, minor max, tap drill).
// Lengths in the model are cm; everything here is mm.
import { cylinder, radiusAt, type Cyl, type Topology } from "../features/holes";
import { PAIR_TOL_MM } from "../settings";
import { pyFixed, pySum, round } from "../units";
import { ref, type Record as SabRecord, type Vec } from "./sab";
import { surfaceOf } from "./surfaces";

export const THREAD_2021 = "NMx_Thread_Entity";
export const THREAD_2024_TAG = "INV_NMX_THREAD_TAG";
export const NOT_UNDERSTOOD = "thread record not understood";
export const PARALLEL = 0.9999; // |dot| of two axes taken as parallel (spec "Mapping")

export interface Thread {
  id: string;
  designation: string | null;
  cls: string | null;
  standard: string | null;
  pitch_mm: number | null;
  depth_mm: number | null;
  tap_drill_mm: number | null;
  minor_mm: [number, number] | null;
  major_mm: [number, number] | null;
  start: Vec | null;
  end: Vec | null;
  axis: Vec | null;
  face: string; // the threaded face: "hole" (a concave cylinder), "shaft", "cone" or "other"
  reason: string | null;
  feature_id: number | null;
  feature_name: string | null;
}

/** (rows, shift) applied to every .ipt point and vector first (test harness only). */
export type Transform = [number[][], number[]] | null | undefined;

/** Python's float(s) for a finite number; null for anything float() refuses or that is not finite. */
export function pyNum(s: string): number | null {
  const t = s.trim();
  if (!/^[+-]?(?:(?:\d(?:_?\d)*)(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?$/.test(t)) return null;
  const v = Number(t.replace(/_/g, ""));
  return Number.isFinite(v) ? v : null;
}

/** Python's math.dist (the same sum of squares; the last bit may differ, the depth is rounded to 4 places). */
export function dist(a: number[], b: number[]): number {
  return Math.hypot(...a.map((x, k) => x - b[k]));
}

function faceKind(recs: SabRecord[], face: number): string {
  const s = surfaceOf(recs, face);
  if (s === null || !(recs[s].name ?? "").startsWith("cone")) return "other";
  const ds = recs[s].of("d");
  if (ds.length < 2) return "other";
  if (Math.abs(ds[1]) > 1e-9) return "cone";
  const bs = recs[face].of("b");
  return bs.length && bs[0] ? "hole" : "shaft";
}

function isThread(r: SabRecord): [boolean, string[]] {
  const name = r.name ?? "";
  const s = r.of("s");
  if (name.startsWith(THREAD_2021)) return [true, s];
  if (name.includes("ATTRIB_CUSTOM") && s.length && s[0] === THREAD_2024_TAG) return [true, s.slice(1)];
  return [false, s];
}

/** Every thread record of the main model, in record order, as thread-1, thread-2, ... */
export function readThreads(recs: SabRecord[]): Thread[] {
  const out: Thread[] = [];
  for (const r of recs) {
    const [ok, s] = isThread(r);
    if (!ok) continue;
    const ptrs = r.of("p");
    const face = ptrs.length > 3 ? ref(recs, ptrs[3], "face") : null;
    const kind = face !== null ? faceKind(recs, face) : "other";
    const vs = r.of("v");
    const ints = r.of("i");
    const at = (r.name ?? "").startsWith(THREAD_2021) ? 8 : 9;
    const nums = s.length >= 14 ? s.slice(7, 14).map(pyNum) : [];
    const t: Thread = {
      id: `thread-${out.length + 1}`, designation: s.length > 1 ? s[1] : null, cls: s.length > 5 ? s[5] : null,
      standard: s.length > 2 ? s[2] : null, pitch_mm: s.length > 6 ? pyNum(s[6]) : null, depth_mm: null,
      tap_drill_mm: null, minor_mm: null, major_mm: null, start: null, end: null, axis: null, face: kind, reason: null,
      feature_id: ints.length > at ? ints[at] : null, feature_name: null,
    };
    out.push(t);
    if (vs.length < 4 || nums.length !== 7 || nums.some((n) => n === null)) {
      t.reason = NOT_UNDERSTOOD;
      continue;
    }
    const [maj0, maj1, p0, p1, min0, min1, tap] = nums as number[];
    const depth = 10.0 * dist(vs[0], vs[1]);
    const ax = vs[vs.length - 1];
    const n = Math.sqrt(pySum(ax.map((a) => a * a)));
    if (!(maj0 <= maj1 && p0 <= p1 && min0 <= min1 && min1 < maj0) || n < 1e-9 || depth <= 0) {
      t.reason = NOT_UNDERSTOOD;
      continue;
    }
    const axis: Vec = [ax[0] / n, ax[1] / n, ax[2] / n];
    const st = vs[vs.length - 2];
    const start: Vec = [10.0 * st[0], 10.0 * st[1], 10.0 * st[2]];
    t.depth_mm = round(depth, 4);
    t.tap_drill_mm = tap;
    t.minor_mm = [min0, min1];
    t.major_mm = [maj0, maj1];
    t.start = start;
    t.axis = axis;
    t.end = [start[0] + depth * axis[0], start[1] + depth * axis[1], start[2] + depth * axis[2]];
  }
  return out;
}

// --- Mapping (spec "Mapping"; mm, raw STEP coordinates) ---

export function apply(transform: Transform, p: Vec, vector = false): Vec {
  if (!transform) return p;
  const [rows, shift] = transform;
  const q = [0, 1, 2].map((r) => pySum([0, 1, 2].map((c) => rows[r][c] * p[c]))) as Vec;
  return vector ? q : [q[0] + shift[0], q[1] + shift[1], q[2] + shift[2]];
}

/** sum(a[k] * b[k] for k in range(3)): Python 3.12 sums floats compensated (units.pySum). */
export const dot = (a: number[], b: number[]) => pySum([a[0] * b[0], a[1] * b[1], a[2] * b[2]]);

export function offLine(p: Vec, origin: Vec, axis: Vec): number {
  const d = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  const t = dot(d, axis);
  return Math.sqrt(Math.max(0.0, dot(d, d) - t * t));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StepHole = { id: string; faces: number[]; dims_mm: Record<string, number>; [k: string]: any };

/** Open at both ends: two opening vectors pointing opposite ways. */
export function through(hole: StepHole): boolean {
  const vs: number[][] = hole.open_vectors || [];
  return vs.some((a, i) => vs.slice(i + 1).some((b) => dot(a, b) < -PARALLEL));
}

/** [Cyl, overlap mm] of the hole's cylinder face that overlaps the span most, or null. */
export function holeLine(topo: Topology, hole: StepHole, start: Vec, end: Vec): [Cyl, number] | null {
  let best: [Cyl, number] | null = null;
  for (const i of hole.faces) {
    const c = cylinder(topo, i, true);
    if (c === null) continue;
    const [a, b] = [dot(start, c.axis), dot(end, c.axis)].sort((x, y) => x - y);
    const overlap = Math.max(0.0, Math.min(b, c.hi) - Math.max(a, c.lo));
    if (best === null || overlap > best[1] + 1e-9) best = [c, overlap];
  }
  return best;
}

const r4v = (v: Vec | null) => (v === null ? null : v.map((x) => round(x, 4)));

function block(t: Thread, start: Vec | null, end: Vec | null, axis: Vec | null) {
  return {
    id: t.id, designation: t.designation, class: t.cls, standard: t.standard, pitch_mm: t.pitch_mm,
    depth_mm: t.depth_mm, tap_drill_mm: t.tap_drill_mm, minor_mm: t.minor_mm, major_mm: t.major_mm,
    start: start !== null ? r4v(start) : null, end: start !== null ? r4v(end) : null,
    axis: start !== null && axis !== null ? r4v(axis) : null,
    state: "not_mapped", hole: null as string | null, gaps: [] as { what: string; mm: number; text: string }[],
    reason: null as string | null, feature_name: t.feature_name,
  };
}
export type ThreadBlock = ReturnType<typeof block>;

/** The response's thread list. Each hole a thread is mapped to gets a `thread` list of those ids. */
export function mapThreads(topo: Topology, threads: Thread[], holes: StepHole[], transform?: Transform): ThreadBlock[] {
  const tol = PAIR_TOL_MM;
  const out: ThreadBlock[] = [];
  for (const t of threads) {
    const start = t.start !== null ? apply(transform, t.start) : null;
    const end = t.end !== null ? apply(transform, t.end) : null;
    const axis = t.axis !== null ? apply(transform, t.axis, true) : null;
    const b = block(t, start, end, axis);
    out.push(b);
    if (t.reason !== null) { b.reason = t.reason; continue; }
    if (t.face === "shaft") { b.reason = "external thread: not on a hole"; continue; }
    if (t.face === "cone") { b.reason = "tapered thread: not supported yet"; continue; }
    if (t.face !== "hole") { b.reason = "the threaded face is not a cylinder"; continue; }
    let best: [number, StepHole, Cyl, number] | null = null; // overlap, hole, line, gap
    holes.forEach((h) => {
      const hit = holeLine(topo, h, start!, end!);
      if (hit === null) return;
      const [c, overlap] = hit;
      if (Math.abs(dot(c.axis, axis!)) < PARALLEL) return;
      const gap = Math.max(offLine(start!, c.origin, c.axis), offLine(end!, c.origin, c.axis));
      if (gap > radiusAt(c, dot(start!, c.axis)) + 1e-9) return;
      if (best === null || overlap > best[0]) best = [overlap, h, c, gap]; // (overlap, -index): the first on a tie
    });
    if (best === null) { b.reason = "no hole on this thread's axis"; continue; }
    const [, h, , gap] = best as [number, StepHole, Cyl, number];
    const gaps: { what: string; mm: number; text: string }[] = [];
    if (gap > tol) gaps.push({ what: "axis", mm: round(gap, 4), text: `${pyFixed(gap, 2)} mm off the hole's axis` });
    const d = h.dims_mm.diameter;
    if (d > t.major_mm![0] + tol) {
      const x = d - t.major_mm![0];
      gaps.push({ what: "diameter", mm: round(x, 4), text: `hole Ø${pyFixed(d, 2)} is ${pyFixed(x, 2)} mm over the thread's major diameter` });
    } else if (d < t.minor_mm![0] - tol) {
      const x = t.minor_mm![0] - d;
      gaps.push({ what: "diameter", mm: round(x, 4), text: `hole Ø${pyFixed(d, 2)} is ${pyFixed(x, 2)} mm under the thread's minor diameter` });
    }
    const depth = "max_depth" in h.dims_mm ? h.dims_mm.max_depth : h.dims_mm.depth;
    if (!through(h) && t.depth_mm! > depth + tol) {
      gaps.push({ what: "depth", mm: round(t.depth_mm! - depth, 4), text: `thread ${pyFixed(t.depth_mm!, 2)} deep in a ${pyFixed(depth, 2)} hole` });
    }
    b.hole = h.id;
    b.gaps = gaps;
    b.state = gaps.length ? "disagrees" : "matched";
    (h.thread ??= []).push(t.id);
  }
  return out;
}
