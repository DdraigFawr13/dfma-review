// Port of service/dfma/features.py lines 1668 to 1842 (port spec S6): the turning axis, grooves, bores and the turned
// profile. Read it beside the Python: the same names in camelCase and the same order of every loop.
import { ANGLE_TOL, cross, dot, unit, type Vec } from "../frame";
import type { OC } from "../oc";
import { pySum } from "../units";
import { canon, cylinder, outwardNormal, pt, RADIUS_TOL, sub, Topology, type Hole } from "./holes";

const degrees = (rad: number) => rad * (180 / Math.PI); // math.degrees: x * (180 / pi)
const neg = (a: Vec): Vec => [-a[0], -a[1], -a[2]];

export const TURN_SHARE_MIN_PCT = 40.0; // assumption (spec): under this share of cylinder and cone area, no turning axis
export const COAX_DEG = 0.5; // spec Rules "turn_offaxis": coaxial means within 0.5 deg ...
export const COAX_OFFSET_MM = 0.001 * 25.4; // ... and an offset of 0.001 in or less
export const BORE_MIN_MM = 0.5 * 25.4; // spec: an on-axis hole of 0.500 in and over is a bore

/** A cylinder or cone face: its axis line, radius (cylinders) and whether its material is inside. */
export interface Round { id: number; origin: Vec; axis: Vec; radius: number | null; convex: boolean }

export interface Turn { share_pct: number; faces: number[]; axis: Vec | null; origin?: Vec; diameter?: number; length?: number }

function roundOf(topo: Topology, faceId: number): Round | null {
  const surface = topo.surface(faceId);
  const kind = topo.type(faceId);
  let geo: OC, radius: number | null;
  if (kind === "GeomAbs_Cylinder") { geo = surface.Cylinder(); radius = geo.Radius(); }
  else if (kind === "GeomAbs_Cone") [geo, radius] = [surface.Cone(), null];
  else return null;
  const ax = geo.Axis(); // left undeleted, as holes.ts cylinder() (port spec S4 builder defaults "Mesh and memory")
  const [origin, axis] = [pt(ax.Location()), canon(unit(pt(ax.Direction())))];
  const [point, normal] = outwardNormal(topo.oc, topo.faces[faceId]);
  const rel = sub(point, origin);
  const k = dot(rel, axis);
  const radial = sub(rel, [k * axis[0], k * axis[1], k * axis[2]]);
  return { id: faceId, origin, axis, radius, convex: dot(normal, radial) > 0 };
}

/** Distance from a point to the line origin + t axis. */
function offLine(p: Vec, origin: Vec, axis: Vec): number {
  const off = cross(sub(p, origin), axis);
  return Math.sqrt(dot(off, off));
}

/** (angle in deg, offset in mm) of a line from the turning axis line: coaxial when both are within COAX_DEG and
 *  COAX_OFFSET_MM (spec Rules "turn_offaxis"). */
export function coaxial(origin: Vec, axis: Vec, lineOrigin: Vec, lineAxis: Vec): [number, number] {
  const angle = degrees(Math.acos(Math.min(1.0, Math.abs(dot(axis, lineAxis)))));
  return [angle, offLine(origin, lineOrigin, lineAxis)];
}

/** The turning axis line: the one shared by the most cylinder and cone area (spec "Turned profile"). Returns its share
 *  of the part's face area in %, the faces on it, and (when the share is at least TURN_SHARE_MIN_PCT) the profile's
 *  diameter and length. `signAxis` is frame.turningAxis's direction, whose sign the axis takes. */
export function turnedProfile(topo: Topology, areas: number[], verts: Vec[], signAxis: Vec | null): Turn {
  const rounds: Round[] = [];
  for (let i = 0; i < topo.faces.length; i++) {
    const r = roundOf(topo, i);
    if (r) rounds.push(r);
  }
  const lines: { origin: Vec; axis: Vec; area: number; ids: number[] }[] = [];
  for (const r of rounds) {
    const line = lines.find((l) => {
      const [angle, off] = coaxial(r.origin, r.axis, l.origin, l.axis);
      return angle <= COAX_DEG && off <= COAX_OFFSET_MM;
    });
    if (line) {
      line.area += areas[r.id];
      line.ids.push(r.id);
    } else lines.push({ origin: r.origin, axis: r.axis, area: areas[r.id], ids: [r.id] });
  }
  const total = pySum(areas);
  if (!lines.length || total <= 0) return { share_pct: 0.0, faces: [], axis: null };
  // max(key=(area, -min(ids))): the first of the largest area, and on a tie the line holding the lowest face id
  const best = lines.reduce((a, b) => (b.area > a.area || (b.area === a.area && Math.min(...b.ids) < Math.min(...a.ids)) ? b : a));
  let axis = best.axis;
  if (signAxis !== null && dot(axis, signAxis) < 0) axis = neg(axis);
  const share = (100.0 * best.area) / total;
  const out: Turn = { share_pct: share, faces: [...best.ids].sort((a, b) => a - b), axis, origin: best.origin };
  if (share + 1e-9 >= TURN_SHARE_MIN_PCT) {
    let [hi, lo, far] = [-Infinity, Infinity, -Infinity];
    for (const v of verts) { // loops, not spreads: a large part has more vertices than a call takes arguments
      const a = dot(v, axis);
      if (a > hi) hi = a;
      if (a < lo) lo = a;
      const d = offLine(v, best.origin, axis);
      if (d > far) far = d;
    }
    out.diameter = 2 * far; // the stock it turns from
    out.length = hi - lo;
  }
  return out;
}

function planeOn(topo: Topology, faceId: number, axis: Vec): boolean {
  if (topo.type(faceId) !== "GeomAbs_Plane") return false;
  const n = outwardNormal(topo.oc, topo.faces[faceId])[1];
  return Math.abs(dot(n, axis)) >= Math.cos(ANGLE_TOL);
}

/** The smallest and largest distance of a face's edge points from the axis line. */
function radii(topo: Topology, faceId: number, origin: Vec, axis: Vec): [number, number] {
  const d = topo.facePoints(faceId).map((p) => offLine(p, origin, axis));
  return [Math.min(...d), Math.max(...d)];
}

export interface Groove {
  kind: "groove"; faces: number[]; axis: number[]; open_dirs: string[]; open_vectors: number[][]; outside: boolean;
  dims_mm: { width: number; depth: number; diameter: number };
}

/** Grooves on the turning axis (spec Features "Groove"), unnumbered: a cylindrical floor on the axis between two planar
 *  faces square to the axis, deeper than the cylinders on both sides. Width is the distance between the two side faces;
 *  depth how far the shallower side rises past the floor. */
export function grooves(topo: Topology, turn: Turn, skip: Set<number>): Groove[] {
  const [origin, axis] = [turn.origin!, turn.axis!];
  const out: Groove[] = [];
  for (const fid of turn.faces) {
    if (skip.has(fid)) continue;
    const r = roundOf(topo, fid);
    if (r === null || r.radius === null) continue;
    const sides = [...topo.neighbours(fid).keys()].filter((nb) => planeOn(topo, nb, axis));
    if (sides.length !== 2) continue;
    const rise = sides.map((nb) => {
      const [lo, hi] = radii(topo, nb, origin, axis);
      return r.convex ? hi - r.radius! : r.radius! - lo;
    });
    if (Math.min(...rise) <= RADIUS_TOL) continue;
    const [a, b] = sides.map((nb) => dot(outwardNormal(topo.oc, topo.faces[nb])[0], axis));
    out.push({ kind: "groove", faces: [fid, ...sides].sort((x, y) => x - y), axis: [...axis], open_dirs: [],
      open_vectors: [], outside: r.convex,
      dims_mm: { width: Math.abs(a - b), depth: Math.min(...rise), diameter: 2 * r.radius } });
  }
  return out;
}

export type Turned<T> = T & { on_axis?: boolean; off_axis_deg?: number; off_axis_mm?: number };

/** On-axis holes of 0.500 in and over become bores; the rest stay holes (spec Features "Bore": never both). Returns
 *  [holes, bores] renumbered in face order, and the old id -> new id map. Each keeps `on_axis` for analyze. */
export function splitBores(topo: Topology, holeList: Hole[], turn: Turn): [Turned<Hole>[], Turned<Hole>[], Map<string, string>] {
  const keep: Turned<Hole>[] = [];
  const bores: Turned<Hole>[] = [];
  for (const h0 of holeList) {
    let line = null;
    for (const f of h0.faces) {
      line = cylinder(topo, f, true);
      if (line) break;
    }
    let on = false;
    if (line !== null) {
      const [angle, off] = coaxial(line.origin, line.axis, turn.origin!, turn.axis!);
      on = angle <= COAX_DEG && off <= COAX_OFFSET_MM;
    }
    const h: Turned<Hole> = { ...h0, on_axis: on };
    (on && h.dims_mm.diameter >= BORE_MIN_MM - 1e-6 ? bores : keep).push(h);
  }
  const ids = new Map<string, string>();
  for (const [kind, group] of [["hole", keep], ["bore", bores]] as const) {
    group.forEach((h, n) => {
      ids.set(h.id, `${kind}-${n + 1}`);
      h.id = `${kind}-${n + 1}`;
      (h as { kind: string }).kind = kind;
    });
  }
  return [keep, bores, ids];
}

/** (angle deg, offset mm) of a pocket from the turning axis: its opening direction, through the area centroid of its
 *  faces. */
export function pocketOnAxis(oc: OC, pocket: { faces: number[]; axis: number[] }, faces: OC[], turn: Turn): [number, number] {
  const [comp, builder] = [new oc.TopoDS_Compound(), new oc.BRep_Builder()];
  builder.MakeCompound(comp);
  for (const f of pocket.faces) builder.Add(comp, faces[f]);
  const props = new oc.GProp_GProps();
  oc.BRepGProp.SurfaceProperties(comp, props, false, false);
  const c = props.CentreOfMass();
  const centre = pt(c);
  c.delete(); props.delete(); builder.delete(); comp.delete();
  return coaxial(centre, pocket.axis as Vec, turn.origin!, turn.axis!);
}

/** (angle deg, offset mm) of a hole or bore from the turning axis (analyze.py _off_axis): its first cylinder's line, or
 *  (90, 0) when it has none. */
export function holeOffAxis(topo: Topology, f: { faces: number[] }, turn: Turn): [number, number] {
  for (const i of f.faces) {
    const line = cylinder(topo, i, true);
    if (line) return coaxial(line.origin, line.axis, turn.origin!, turn.axis!);
  }
  return [90.0, 0.0];
}

export interface Profile {
  kind: "profile"; faces: number[]; axis: number[]; open_dirs: string[]; open_vectors: number[][];
  dims_mm: { diameter: number; min_diameter: number; length: number; share_pct: number };
}

/** The turned profile (kind "profile"): the outside cylinders and cones on the axis and the faces square to it, other
 *  than those of holes, bores and grooves. */
export function profileFeature(topo: Topology, turn: Turn, taken: Set<number>): Profile {
  const own: number[] = [];
  const rs: number[] = [];
  const onAxis = new Set(turn.faces);
  for (let i = 0; i < topo.faces.length; i++) {
    if (taken.has(i)) continue;
    const r = onAxis.has(i) ? roundOf(topo, i) : null;
    if ((r !== null && r.convex) || planeOn(topo, i, turn.axis!)) {
      own.push(i);
      if (r !== null && r.radius !== null) rs.push(r.radius);
    }
  }
  // D-026: the smallest outside diameter too (a thin neck behind a big head is slender; grooves excluded)
  const smallest = rs.length ? Math.min(2 * Math.min(...rs), turn.diameter!) : turn.diameter!;
  return { kind: "profile", faces: own, axis: [...turn.axis!], open_dirs: [], open_vectors: [],
    dims_mm: { diameter: turn.diameter!, min_diameter: smallest, length: turn.length!, share_pct: turn.share_pct } };
}
