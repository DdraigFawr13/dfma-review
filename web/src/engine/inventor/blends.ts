// Port of service/dfma/inventor/blends.py: fillets and chamfers of an .ipt and their mapping onto the STEP's faces
// (spec I2+I3 Design "Blends (measured)", "Mapping (blends)"). A blend feature is the last id of a face's blend tag.
// Fillet: all its faces are cylinders, tori or spheres of one radius within 0.001 mm, or splines. Chamfer: every face a
// plane or a cone of half-angle 10 to 80 deg. Else not mapped. Chamfer distances: plane chamfer from its two neighbour
// planes with the longest shared edges; cone chamfer [radial, axial]. Everything is mm.
import type { OC } from "../oc";
import type { Topology } from "../features/holes";
import { pt } from "../features/holes";
import { MSG_BLEND_SHAPE, MSG_CHAMFER_NEIGHBOURS, MSG_NO_BLEND_FACE, PAIR_TOL_MM } from "../settings";
import { pySum, round } from "../units";
import type { Record as SabRecord, Vec } from "./sab";
import { degrees, surf, surface, type Surf } from "./surfaces";
import type { Tag } from "./tags";
import { apply, dist, dot, type Transform } from "./threads";
import { inMm, r4 } from "./holes";
import { facePoints, neighbours, TopologyError } from "./topo";

export const RADIUS_TOL_MM = 0.001; // one fillet radius (spec)
export const CHAMFER_CONE_DEG = [10.0, 80.0]; // a cone chamfer's half-angle (spec)
export const PARALLEL = 1 - 1e-6; // |cos| of two axes or normals that count as parallel
const FILLET_KINDS = ["cyl", "torus", "sphere"];
export const BOX_MARGIN_MM = 1.0; // a face's vertex centre may sit this far outside its STEP face's box

export interface Blend {
  feature_id: number;
  kind: "fillet" | "chamfer" | null;
  radius_mm: number | null;
  distances_mm: number[] | null;
  angle_deg: number | null;
  faces: number[];
  copied_by: number[];
  surfs: Map<number, Surf>;
  points: Map<number, Vec[]>;
  reason: string | null;
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function off(p: Vec, origin: Vec, axis: Vec): number {
  const d = sub(p, origin);
  const t = dot(d, axis);
  return Math.sqrt(Math.max(0.0, dot(d, d) - t * t));
}

function filletRadius(s: Surf): number | null {
  return s.kind === "torus" ? s.minor : FILLET_KINDS.includes(s.kind) ? s.radius : null;
}

function length(pts: Vec[]): number {
  const parts: number[] = [];
  for (let i = 0; i < pts.length - 1; i += 2) parts.push(dist(pts[i], pts[i + 1]));
  return pySum(parts);
}

/** [d1, d2] and the angle between the two neighbour planes; null when they aren't two planes at an angle. */
function planeChamfer(recs: SabRecord[], face: number): [number[], number] | null {
  let nbs: Map<number, Vec[]>;
  try {
    nbs = neighbours(recs, face);
  } catch (e) {
    if (e instanceof TopologyError) return null;
    throw e;
  }
  const planes = [...nbs].map(([n, pts]) => [n, pts, surface(recs, n)] as [number, Vec[], Surf])
    .filter(([, pts, s]) => s.kind === "plane" && pts.length)
    .map((x) => [x, -length(x[1])] as const)
    .sort((x, y) => x[1] - y[1]) // stable, as Python's sorted
    .slice(0, 2).map(([x]) => x);
  if (planes.length < 2) return null;
  const [[, pa, a], [, pb, b]] = planes;
  const c = cross(a.axis!, b.axis!);
  if (dot(c, c) < 1e-12) return null; // parallel neighbours (sheet-metal edges on CTC 03, FTC 09)
  const ang = degrees(Math.acos(Math.max(-1.0, Math.min(1.0, Math.abs(dot(a.axis!, b.axis!))))));
  const sin = Math.sin(ang * (Math.PI / 180));
  const da = Math.max(...pa.map((p) => Math.abs(dot(sub(p, b.origin!), b.axis!)))) / sin;
  const db = Math.max(...pb.map((p) => Math.abs(dot(sub(p, a.origin!), a.axis!)))) / sin;
  return [[da, db], ang];
}

function coneChamfer(recs: SabRecord[], face: number, s: Surf): number[] | null {
  let pts: Vec[];
  try {
    pts = facePoints(recs, face);
  } catch (e) {
    if (e instanceof TopologyError) return null;
    throw e;
  }
  if (!pts.length) return null;
  const h = pts.map((p) => dot(sub(p, s.origin!), s.axis!));
  const r = pts.map((p) => off(p, s.origin!, s.axis!));
  return [Math.max(...r) - Math.min(...r), Math.max(...h) - Math.min(...h)];
}

function size(recs: SabRecord[], b: Blend): void {
  const surfs = b.faces.map((f) => b.surfs.get(f)!);
  const kinds = new Set(surfs.map((s) => s.kind).filter((k) => k !== "other")); // spline faces carry no size
  if (kinds.size && [...kinds].every((k) => FILLET_KINDS.includes(k))) {
    const radii = surfs.filter((s) => FILLET_KINDS.includes(s.kind)).map((s) => filletRadius(s)!);
    if (Math.max(...radii) - Math.min(...radii) <= RADIUS_TOL_MM) {
      b.kind = "fillet";
      b.radius_mm = radii[0];
      return;
    }
  } else if (kinds.size && [...kinds].every((k) => k === "plane" || k === "cone")
    && surfs.every((s) => s.kind !== "cone" || (CHAMFER_CONE_DEG[0] <= s.halfAngleDeg! && s.halfAngleDeg! <= CHAMFER_CONE_DEG[1]))) {
    b.kind = "chamfer";
    for (const f of b.faces) {
      const s = b.surfs.get(f)!;
      if (s.kind === "plane") {
        const got = planeChamfer(recs, f);
        if (got !== null) { [b.distances_mm, b.angle_deg] = got; return; }
      }
      if (s.kind === "cone") {
        const got = coneChamfer(recs, f, s);
        if (got !== null) { b.distances_mm = got; return; }
      }
    }
    b.reason = MSG_CHAMFER_NEIGHBOURS;
    return;
  }
  b.reason = MSG_BLEND_SHAPE;
}

/** Every blend feature with a tagged face, in order of feature id. */
export function readBlends(recs: SabRecord[], tags: Map<number, Tag[]>): Blend[] {
  const byId = new Map<number, Blend>();
  for (const face of [...tags.keys()].sort((a, b) => a - b)) {
    const t = tags.get(face)!.find((x) => x.kind === "blend");
    if (t === undefined) continue;
    const fid = t.ids[t.ids.length - 1];
    if (!byId.has(fid)) {
      byId.set(fid, { feature_id: fid, kind: null, radius_mm: null, distances_mm: null, angle_deg: null, faces: [],
        copied_by: [], surfs: new Map(), points: new Map(), reason: null });
    }
    const b = byId.get(fid)!;
    b.faces.push(face);
    b.surfs.set(face, surface(recs, face));
    let pts: Vec[];
    try {
      pts = facePoints(recs, face);
    } catch (e) {
      if (!(e instanceof TopologyError)) throw e;
      pts = [];
    }
    b.points.set(face, pts);
    for (const c of t.ids.slice(0, -1)) if (!b.copied_by.includes(c)) b.copied_by.push(c);
  }
  return [...byId.keys()].sort((a, b) => a - b).map((fid) => {
    size(recs, byId.get(fid)!);
    return byId.get(fid)!;
  });
}

// --- Mapping (spec "Mapping (blends)"; mm, raw STEP coordinates) ---

/** The surface under each STEP face, in the same terms as an .ipt face; `other` for the rest. */
export function stepSurfaces(topo: Topology): Surf[] {
  return topo.faces.map((_, i) => {
    const a = topo.surface(i);
    const t = topo.type(i);
    if (t === "GeomAbs_Plane") {
      const g = a.Plane();
      return surf("plane", pt(g.Location()), pt(g.Axis().Direction()));
    }
    if (t === "GeomAbs_Cylinder") {
      const g = a.Cylinder();
      return surf("cyl", pt(g.Location()), pt(g.Axis().Direction()), g.Radius());
    }
    if (t === "GeomAbs_Cone") {
      const g = a.Cone();
      return surf("cone", pt(g.Location()), pt(g.Axis().Direction()), g.RefRadius(), null, degrees(Math.abs(g.SemiAngle())));
    }
    if (t === "GeomAbs_Torus") {
      const g = a.Torus();
      return surf("torus", pt(g.Location()), pt(g.Axis().Direction()), g.MajorRadius(), g.MinorRadius());
    }
    if (t === "GeomAbs_Sphere") {
      const g = a.Sphere();
      return surf("sphere", pt(g.Location()), null, g.Radius());
    }
    return surf("other");
  });
}

/** Each STEP face's bounding box (lo, hi corners, mm), as brepbndlib.Add(f, box) (the triangulation, no enlarging). */
export function stepBoxes(oc: OC, faces: OC[]): [Vec, Vec][] {
  return faces.map((f) => {
    const box = new oc.Bnd_Box();
    oc.BRepBndLib.Add(f, box, true);
    const [lo, hi] = [box.CornerMin(), box.CornerMax()];
    const out: [Vec, Vec] = [pt(lo), pt(hi)];
    lo.delete(); hi.delete(); box.delete();
    return out;
  });
}

function inside(p: Vec, box: [Vec, Vec], tol: number): boolean {
  return [0, 1, 2].every((k) => box[0][k] - tol <= p[k] && p[k] <= box[1][k] + tol);
}

function moved(s: Surf, transform: Transform): Surf {
  return {
    ...s, origin: s.origin !== null ? apply(transform, s.origin) : null,
    axis: s.axis !== null ? apply(transform, s.axis, true) : null,
  };
}

const parallel = (a: Vec, b: Vec) => Math.abs(dot(a, b)) >= PARALLEL;
const tanDeg = (d: number) => Math.tan(d * (Math.PI / 180));

/** Does the STEP surface c sit where the .ipt surface s does (its type, its axis line, centre or plane)? */
function place(s: Surf, c: Surf, tol: number): boolean {
  if (s.kind !== c.kind) return false;
  if (s.kind === "cyl") return parallel(s.axis!, c.axis!) && off(c.origin!, s.origin!, s.axis!) <= tol;
  if (s.kind === "torus") {
    // the ring radius places the face (FTC 11's second torus, measured at build)
    return parallel(s.axis!, c.axis!) && dist(s.origin!, c.origin!) <= tol && Math.abs(s.radius! - c.radius!) <= tol;
  }
  if (s.kind === "sphere") return dist(s.origin!, c.origin!) <= tol;
  if (s.kind === "plane") return parallel(s.axis!, c.axis!) && Math.abs(dot(sub(c.origin!, s.origin!), s.axis!)) <= tol;
  if (s.kind === "cone") {
    if (!(parallel(s.axis!, c.axis!) && off(c.origin!, s.origin!, s.axis!) <= tol && Math.abs(s.halfAngleDeg! - c.halfAngleDeg!) <= 0.01)) return false;
    // the same cone: the STEP cone's radius at the .ipt cone's origin equals the .ipt radius there
    const t = dot(sub(s.origin!, c.origin!), c.axis!);
    return Math.abs(c.radius! + t * tanDeg(c.halfAngleDeg!) - s.radius!) <= tol
      || Math.abs(c.radius! - t * tanDeg(c.halfAngleDeg!) - s.radius!) <= tol;
  }
  return false;
}

/** The response's `inventor.blends`. `transform` is the test harness's (never the app path). */
export function mapBlends(topo: Topology, blends: Blend[], transform?: Transform) {
  const tol = PAIR_TOL_MM;
  const step = blends.length ? stepSurfaces(topo) : [];
  const boxes = blends.length ? stepBoxes(topo.oc, topo.faces) : [];
  return blends.map((b, n0) => {
    const hits: number[] = [];
    let worst: [number, number, number] | null = null; // (gap, .ipt radius, STEP radius)
    let mapped = 0;
    let sized = 0;
    for (const f of b.faces) {
      let s = b.surfs.get(f)!;
      const fpts = b.points.get(f)!;
      if (b.kind === null || s.kind === "other" || s.origin === null || !fpts.length) continue;
      if ((b.kind === "fillet") !== FILLET_KINDS.includes(s.kind)) continue;
      sized += 1;
      s = moved(s, transform);
      const pts = fpts.map((p) => apply(transform, p));
      const centre = [0, 1, 2].map((k) => pySum(pts.map((p) => p[k])) / pts.length) as Vec;
      // the same surface, and the centre of the face's vertices inside the STEP face's box (CTC 04's chamfer planes)
      const here = step.map((_, k) => k).filter((k) => place(s, step[k], tol) && inside(centre, boxes[k], BOX_MARGIN_MM));
      if (!here.length) continue;
      mapped += 1;
      for (const k of here) if (!hits.includes(k)) hits.push(k); // disagreeing faces too: tapping the row shows them
      if (b.kind === "fillet") {
        const r = filletRadius(s)!;
        let [d, k] = [Infinity, -1];
        for (const q of here) { // min((|gap|, k)): the smallest gap, then the lowest index
          const g = Math.abs(filletRadius(step[q])! - r);
          if (g < d || (g === d && q < k)) [d, k] = [g, q];
        }
        if (d > tol && (worst === null || d > worst[0])) worst = [d, r, filletRadius(step[k])!];
      }
    }
    const gap = worst ? worst[0] : 0.0;
    const gaps: { what: string; mm: number; text: string }[] = [];
    let state: string;
    if (b.reason !== null) state = "not_mapped";
    else if (gap > 0) {
      state = "disagrees";
      gaps.push({ what: "radius", mm: round(gap, 4), text: `R${inMm(worst![1])} in the .ipt, R${inMm(worst![2])} in the STEP` });
    } else state = hits.length ? "matched" : "not_mapped";
    const reason = b.reason !== null ? b.reason : state === "not_mapped" ? MSG_NO_BLEND_FACE : null;
    return {
      id: `bl-${n0 + 1}`, feature_id: b.feature_id, kind: b.kind, radius_mm: r4(b.radius_mm),
      distances_mm: r4(b.distances_mm), angle_deg: r4(b.angle_deg), faces: sized, faces_mapped: mapped,
      copied_by: [...b.copied_by], state, step_faces: [...hits].sort((x, y) => x - y), gaps, reason,
    };
  });
}
export type BlendBlock = ReturnType<typeof mapBlends>[number];
