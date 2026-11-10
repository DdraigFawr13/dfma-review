// Port of service/dfma/inventor/holes.py: Hole features of an .ipt and their mapping onto the STEP's holes (spec I2+I3
// Design "Hole features (measured)", "Mapping (holes)"). A Hole feature is a feature id that is the last id of some
// face's hole tag; ids before it are its copiers. Its holes: its cylinder and cone faces grouped by axis line (axis to
// 4 decimals, the foot of the axis on the plane through the origin to 0.01 mm). Type: a cone of half-angle 59.0 +- 0.5
// deg at the deep end is a drill point; any other cone makes a countersink; two or more cylinder diameters make a
// counterbore. Diameter = the smallest cylinder. Everything is mm.
import type { Topology } from "../features/holes";
import { radiusAt } from "../features/holes";
import { MSG_FEATURE_BAD, MSG_NO_HOLE_ON_AXIS, PAIR_TOL_MM } from "../settings";
import { pyFixed, pySum, round } from "../units";
import type { Record as SabRecord, Vec } from "./sab";
import { surface, type Surf } from "./surfaces";
import type { Tag } from "./tags";
import { apply, dot, holeLine, offLine, PARALLEL, through, type StepHole, type Transform } from "./threads";
import { facePoints, TopologyError } from "./topo";

export const DRILL_HALF_DEG = 59.0;
export const DRILL_TOL_DEG = 0.5; // 118 deg drill point (the key's DrillPointAngle)
export const END_TOL_MM = 0.01; // a plane at a span end, two equal diameters

export interface IptHole {
  start: Vec; // on the axis at the open end
  axis: Vec; // unit, from the open end into the material
  copied_by: number[];
  faces: number[];
  diameter_mm: number | null;
  length_mm: number | null;
  drill_length_mm: number | null;
  drill_lo_mm: number | null;
  through: boolean;
  type: string;
  point_deg: number | null;
  cbore_diameter_mm: number | null;
  cbore_depth_mm: number | null;
  csink_diameter_mm: number | null;
  csink_deg: number | null;
  reason: string | null;
}

export interface HoleFeature {
  feature_id: number;
  holes: IptHole[];
  type: string;
  diameter_mm: number | null;
  depth_mm: number | null;
  length_mm: number | null;
  through: boolean;
  point_deg: number | null;
  cbore_diameter_mm: number | null;
  cbore_depth_mm: number | null;
  csink_diameter_mm: number | null;
  csink_deg: number | null;
  name: string | null;
  reason: string | null;
}

function iptHole(start: Vec, axis: Vec, copied: number[], faces: number[], more: Partial<IptHole> = {}): IptHole {
  return {
    start, axis, copied_by: copied, faces, diameter_mm: null, length_mm: null, drill_length_mm: null, drill_lo_mm: null,
    through: false, type: "simple", point_deg: null, cbore_diameter_mm: null, cbore_depth_mm: null,
    csink_diameter_mm: null, csink_deg: null, reason: null, ...more,
  };
}

function canon(a: Vec): Vec {
  for (const x of a) if (Math.abs(x) > 1e-9) return x > 0 ? a : [-a[0], -a[1], -a[2]];
  return a;
}

const off = offLine;
type FS = [number, Surf];

/** One hole from its cylinder and cone faces (fl) and its feature's plane faces. */
function hole(recs: SabRecord[], fl: FS[], planes: FS[], axis: Vec, foot: Vec, copied: number[]): IptHole {
  const faces = fl.map(([f]) => f);
  const pts = new Map<number, Vec[]>();
  try {
    for (const [f] of fl) pts.set(f, facePoints(recs, f));
  } catch (e) {
    if (e instanceof TopologyError) return iptHole(foot, axis, copied, faces, { reason: MSG_FEATURE_BAD });
    throw e;
  }
  const hs = [...pts.values()].flatMap((ps) => ps.map((p) => dot(p, axis)));
  const cyls = fl.filter(([, s]) => s.kind === "cyl");
  if (!hs.length || !cyls.length || [...pts.values()].some((ps) => !ps.length)) { // a face with no points can't be placed
    return iptHole(foot, axis, copied, faces, { reason: MSG_FEATURE_BAD });
  }
  const [lo, hi] = [Math.min(...hs), Math.max(...hs)];
  const diams = [...new Set(cyls.map(([, s]) => round(2 * s.radius!, 4)))].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const d of diams) { // equal within END_TOL_MM
    if (groups.length && d - groups[groups.length - 1][groups[groups.length - 1].length - 1] <= END_TOL_MM) groups[groups.length - 1].push(d);
    else groups.push([d]);
  }
  const small = groups[0][0];
  const lastG = groups[groups.length - 1];
  const large = lastG[lastG.length - 1];
  const span = (fs: number[]): [number, number] => {
    const v = fs.flatMap((f) => pts.get(f)!.map((p) => dot(p, axis)));
    return [Math.min(...v), Math.max(...v)];
  };
  const smallFaces = cyls.filter(([, s]) => 2 * s.radius! <= small + END_TOL_MM).map(([f]) => f);
  const largeFaces = groups.length > 1 ? cyls.filter(([, s]) => 2 * s.radius! >= large - END_TOL_MM).map(([f]) => f) : [];
  const drills: FS[] = [];
  const sinks: FS[] = [];
  for (const [f, s] of fl) {
    if (s.kind === "cone") (Math.abs(s.halfAngleDeg! - DRILL_HALF_DEG) <= DRILL_TOL_DEG ? drills : sinks).push([f, s]);
  }
  const near = (h: number): "lo" | "hi" | null => {
    if (Math.abs(h - lo) <= END_TOL_MM) return "lo";
    if (Math.abs(h - hi) <= END_TOL_MM) return "hi";
    return null;
  };
  // The deep end: the end with the drill-point cone, else a plane face of this feature across the axis there
  let deep: "lo" | "hi" | null = null;
  for (const [f] of drills) {
    const [a, b] = span([f]);
    deep = Math.abs(b - hi) < Math.abs(a - lo) ? "hi" : "lo";
  }
  if (deep === null) {
    for (const [f, s] of planes) {
      if (Math.abs(Math.abs(dot(s.axis!, axis)) - 1) > 1e-4) continue;
      let ps: Vec[];
      try {
        ps = facePoints(recs, f);
      } catch (e) {
        if (e instanceof TopologyError) continue;
        throw e;
      }
      // A bottom closes the hole: a disc whose points all lie on the hole's rim
      if (!ps.length || ps.some((p) => Math.abs(off(p, foot, axis) - small / 2) > END_TOL_MM)) continue;
      const e = near(dot(ps[0], axis));
      if (e !== null) { deep = e; break; }
    }
  }
  // A drill point closes the hole only when it reaches its tip (CTC 04 Hole12 and Hole13, build default, S1)
  const tipped = drills.some(([f]) => pts.get(f)!.length > 0 && Math.min(...pts.get(f)!.map((p) => off(p, foot, axis))) <= END_TOL_MM);
  const isThrough = deep === null || (drills.length > 0 && !tipped);
  if (deep === null) { // through: the open end is where the counterbore or countersink sits
    const wide = sinks.length ? sinks.map(([f]) => f) : largeFaces;
    if (wide.length) {
      const [a, b] = span(wide);
      deep = Math.abs(b - hi) < Math.abs(a - lo) ? "lo" : "hi";
    } else deep = "hi";
  }
  const sign = deep === "hi" ? 1.0 : -1.0;
  const into: Vec = [sign * axis[0], sign * axis[1], sign * axis[2]];
  const openH = deep === "hi" ? lo : hi;
  const feet = fl.map(([, sf]) => { // the line's foot from the faces themselves, not the rounded grouping key
    const t0 = dot(sf.origin!, axis);
    return [0, 1, 2].map((k) => sf.origin![k] - t0 * axis[k]);
  });
  const exact = [0, 1, 2].map((k) => pySum(feet.map((p) => p[k])) / feet.length);
  const start: Vec = [0, 1, 2].map((k) => exact[k] + openH * axis[k]) as Vec;
  const [a, b] = span(smallFaces);
  const h = iptHole(start, into, copied, faces, {
    diameter_mm: small, length_mm: hi - lo, drill_length_mm: b - a, drill_lo_mm: deep === "hi" ? a - lo : hi - b,
    through: isThrough,
  });
  if (drills.length) h.point_deg = round(2 * drills[0][1].halfAngleDeg!, 4);
  if (sinks.length) {
    h.type = "countersink";
    h.csink_deg = round(2 * sinks[0][1].halfAngleDeg!, 4);
    h.csink_diameter_mm = 2 * Math.max(...sinks.flatMap(([f]) => pts.get(f)!.map((p) => off(p, foot, axis))));
  } else if (largeFaces.length) h.type = "counterbore";
  if (largeFaces.length) {
    const [c, d] = span(largeFaces);
    h.cbore_diameter_mm = large;
    h.cbore_depth_mm = d - c;
  }
  return h;
}

function copiers(faces: [number, number[]][], run: FS[]): number[] {
  const mine = new Set(run.map(([f]) => f));
  const out: number[] = [];
  for (const [f, copied] of faces) if (mine.has(f)) for (const c of copied) if (!out.includes(c)) out.push(c);
  return out;
}

/** One hole per line, unless the line holds two or more drill-point cones (CTC 05 Hole3): then one hole per run of
 *  faces whose spans touch (build default, S1). */
function runs(recs: SabRecord[], fl: FS[], axis: Vec): FS[][] {
  const drills = fl.filter(([, s]) => s.kind === "cone" && Math.abs(s.halfAngleDeg! - DRILL_HALF_DEG) <= DRILL_TOL_DEG);
  if (drills.length < 2) return [fl];
  const spans: [number, number, number, Surf][] = [];
  try {
    for (const [f, s] of fl) {
      const v = facePoints(recs, f).map((p) => dot(p, axis));
      if (v.length) spans.push([Math.min(...v), Math.max(...v), f, s]);
    }
  } catch (e) {
    if (e instanceof TopologyError) return [fl];
    throw e;
  }
  if (spans.length !== fl.length) return [fl];
  spans.sort((x, y) => x[0] - y[0]);
  const out: FS[][] = [];
  let hi: number | null = null;
  for (const [lo, h, f, s] of spans) {
    if (hi === null || lo > hi + END_TOL_MM) out.push([]);
    out[out.length - 1].push([f, s]);
    hi = hi === null ? h : Math.max(hi, h);
  }
  return out;
}

/** Python's tuple order on two rounded start points. */
function byStart(a: IptHole, b: IptHole): number {
  for (let k = 0; k < 3; k++) {
    const [x, y] = [round(a.start[k], 4), round(b.start[k], 4)];
    if (x !== y) return x - y;
  }
  return 0;
}

/** Every Hole feature with a tagged face, in order of feature id; holes in order of start point. */
export function readHoleFeatures(recs: SabRecord[], tags: Map<number, Tag[]>): HoleFeature[] {
  const byFeature = new Map<number, [number, number[]][]>();
  for (const [face, ts] of tags) {
    const t = ts.find((x) => x.kind === "hole");
    if (t === undefined) continue;
    const fid = t.ids[t.ids.length - 1];
    if (!byFeature.has(fid)) byFeature.set(fid, []);
    byFeature.get(fid)!.push([face, t.ids.slice(0, -1)]);
  }
  const out: HoleFeature[] = [];
  for (const fid of [...byFeature.keys()].sort((a, b) => a - b)) {
    const feat: HoleFeature = {
      feature_id: fid, holes: [], type: "simple", diameter_mm: null, depth_mm: null, length_mm: null, through: false,
      point_deg: null, cbore_diameter_mm: null, cbore_depth_mm: null, csink_diameter_mm: null, csink_deg: null,
      name: null, reason: null,
    };
    const lines = new Map<string, { ax: Vec; foot: Vec; fl: FS[] }>();
    const planes: FS[] = [];
    for (const [face] of byFeature.get(fid)!) {
      const s = surface(recs, face);
      if (s.kind === "plane") { planes.push([face, s]); continue; }
      if (s.kind !== "cyl" && s.kind !== "cone") continue;
      const ax = canon(s.axis!);
      const t = dot(s.origin!, ax);
      const foot = [0, 1, 2].map((k) => round(s.origin![k] - t * ax[k], 2)) as Vec;
      const rax = ax.map((x) => round(x, 4)) as Vec;
      const key = [...rax, ...foot].map((x) => String(x + 0)).join(","); // -0 and 0 are one key, as in Python
      if (!lines.has(key)) lines.set(key, { ax: rax, foot, fl: [] });
      lines.get(key)!.fl.push([face, s]);
    }
    for (const { ax, foot, fl } of lines.values()) {
      for (const run of runs(recs, fl, ax)) feat.holes.push(hole(recs, run, planes, ax, foot, copiers(byFeature.get(fid)!, run)));
    }
    if (!feat.holes.length) continue;
    feat.holes.sort(byStart);
    const good = feat.holes.filter((h) => h.reason === null);
    if (!good.length) feat.reason = MSG_FEATURE_BAD;
    else {
      const h = good[0];
      Object.assign(feat, {
        type: h.type, diameter_mm: h.diameter_mm, length_mm: h.length_mm, through: h.through,
        depth_mm: h.through ? null : h.length_mm, point_deg: h.point_deg, csink_deg: h.csink_deg,
        csink_diameter_mm: h.csink_diameter_mm, cbore_diameter_mm: h.cbore_diameter_mm, cbore_depth_mm: h.cbore_depth_mm,
      });
    }
    out.push(feat);
  }
  return out;
}

// --- Mapping (spec "Mapping (holes)"; mm, raw STEP coordinates) ---

/** '0.984 in [25.00 mm]': inches first, mm in brackets (D-005). */
export function inMm(mm: number): string {
  return `${pyFixed(mm / 25.4, 3)} in [${pyFixed(mm, 2)} mm]`;
}

export function r4(v: number | number[] | null): number | number[] | null {
  return v === null ? null : typeof v === "number" ? round(v, 4) : v.map((x) => round(x, 4));
}

type Gap = { what: string; mm: number; text: string };

/** The response's `inventor.hole_features`. Each STEP hole an .ipt hole maps to gets `hole_feature`, the first such
 *  feature's id. `transform` is the test harness's (never the app path). */
export function mapHoles(topo: Topology, features: HoleFeature[], holes: StepHole[], transform?: Transform) {
  const tol = PAIR_TOL_MM;
  return features.map((feat, n0) => {
    const fid = `hf-${n0 + 1}`;
    const rows = feat.holes.map((ih, m0) => {
      const start = apply(transform, ih.start);
      const axis = apply(transform, ih.axis, true);
      const row = {
        id: `${fid}.${m0 + 1}`, start: r4(start), axis: r4(axis), copied_by: [...ih.copied_by], state: "not_mapped",
        hole: null as string | null, gaps: [] as Gap[], reason: null as string | null,
      };
      if (ih.reason !== null) { row.reason = ih.reason; return row; }
      const a: Vec = [0, 1, 2].map((k) => start[k] + ih.drill_lo_mm! * axis[k]) as Vec; // the drill cylinder's span
      const b: Vec = [0, 1, 2].map((k) => a[k] + ih.drill_length_mm! * axis[k]) as Vec;
      let best: [number, StepHole, number] | null = null;
      for (const h of holes) {
        const hit = holeLine(topo, h, a, b);
        if (hit === null) continue;
        const [c, overlap] = hit;
        if (Math.abs(dot(c.axis, axis)) < PARALLEL) continue;
        const gap = Math.max(offLine(a, c.origin, c.axis), offLine(b, c.origin, c.axis));
        if (gap > radiusAt(c, dot(a, c.axis)) + 1e-9) continue;
        if (best === null || overlap > best[0]) best = [overlap, h, gap];
      }
      if (best === null) { row.reason = MSG_NO_HOLE_ON_AXIS; return row; }
      const [, h, gap] = best;
      const gaps: Gap[] = [];
      if (gap > tol) gaps.push({ what: "axis", mm: round(gap, 4), text: `${inMm(gap)} off the hole's axis` });
      const d = h.dims_mm.diameter;
      if (Math.abs(d - ih.diameter_mm!) > tol) {
        gaps.push({ what: "diameter", mm: round(Math.abs(d - ih.diameter_mm!), 4), text: `Ø${inMm(ih.diameter_mm!)} in the .ipt, Ø${inMm(d)} in the STEP` });
      }
      const stepThrough = "blind" in h ? !h.blind : through(h); // every hole and bore carries `blind`
      const depth = "max_depth" in h.dims_mm ? h.dims_mm.max_depth : h.dims_mm.depth;
      if (ih.through !== stepThrough) {
        const x = Math.abs(ih.length_mm! - depth);
        gaps.push({ what: "through", mm: round(x, 4), text: ih.through ? "the .ipt hole is through, the STEP hole is blind" : "the .ipt hole is blind, the STEP hole is through" });
      } else if (!ih.through && Math.abs(depth - ih.drill_length_mm!) > tol) {
        const x = Math.abs(depth - ih.drill_length_mm!);
        gaps.push({ what: "depth", mm: round(x, 4), text: `the Ø${inMm(ih.diameter_mm!)} section is ${inMm(ih.drill_length_mm!)} long in the .ipt, ${inMm(depth)} in the STEP` });
      }
      row.hole = h.id;
      row.gaps = gaps;
      row.state = gaps.length ? "disagrees" : "matched";
      if (!("hole_feature" in h)) h.hole_feature = fid;
      return row;
    });
    const st = rows.map((r) => r.state);
    const state = st.includes("disagrees") ? "disagrees" : st.includes("not_mapped") ? "not_mapped" : "matched";
    return {
      id: fid, feature_id: feat.feature_id, name: feat.name, type: feat.type, diameter_mm: r4(feat.diameter_mm),
      depth_mm: r4(feat.depth_mm), length_mm: r4(feat.length_mm), through: feat.through, point_deg: r4(feat.point_deg),
      cbore_diameter_mm: r4(feat.cbore_diameter_mm), cbore_depth_mm: r4(feat.cbore_depth_mm),
      csink_diameter_mm: r4(feat.csink_diameter_mm), csink_deg: r4(feat.csink_deg), holes: rows, state, reason: feat.reason,
    };
  });
}
export type HoleFeatureBlock = ReturnType<typeof mapHoles>[number];
