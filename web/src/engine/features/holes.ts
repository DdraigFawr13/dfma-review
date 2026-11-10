// Port of service/dfma/features.py lines 33 to 676 (holes) and `number` (port spec S2). Read it beside the Python:
// the same names in camelCase, the same order of every loop, so faces, ends and mouths are found in the same order.
//
// A hole is a set of concave cylindrical faces that share edges, with the same axis (0.5 deg) and radius
// (0.001 mm), spanning the full 360 deg. Stepped segments join through a shoulder (a plane perpendicular to the
// axis, or a cone) into one chain; every segment takes the chain's open ends. A flat or conical bottom belongs to
// its segment.
import { ANGLE_TOL, cross, dot, unit, type Vec } from "../frame";
import type { OC } from "../oc";
import { round } from "../units";

export const RADIUS_TOL = 0.001; // mm
export const LINE_TOL = 0.01; // mm, distance between two axis lines that count as one
export const DIRS: Record<string, ["x" | "y" | "z", number]> = {
  "+X": ["x", 1], "-X": ["x", -1], "+Y": ["y", 1], "-Y": ["y", -1], "+Z": ["z", 1], "-Z": ["z", -1],
};
export type Frame = { x: Vec; y: Vec; z: Vec };

export interface Cyl {
  id: number;
  origin: Vec;
  axis: Vec;
  radius: number;
  bins: Set<number>; // whole degrees around the axis the face covers, in a frame shared by coaxial faces
  lo: number; // extent along axis (dot with axis), from points sampled on its edges
  hi: number;
  slope: number; // a tapered hole's cone: radius change per mm along the axis; radius is then at height 0
}

const radiusAt = (c: Cyl, t: number) => c.radius + c.slope * t;

export interface Segment {
  faces: number[]; // cylinder faces
  origin: Vec;
  axis: Vec;
  radius: number;
  lo: number;
  hi: number;
  bottom: number[]; // flat bottom or cone point
  shoulders: number[];
  openEnds: string[]; // "lo" / "hi"
  pointMm: number | null;
  links: Set<number>; // indices of linked segments
  groove: boolean; // wider than the segments on both sides: an internal groove, not a hole (S6)
  ring: boolean; // ends on a flat ring round a raised core on its axis: an O-ring groove (D-018 round 2)
  taperDeg: number; // a tapered hole: the cone's half-angle (D-018 tapered-holes round)
  smallRadius: number | null; // a tapered hole: the radius at its narrow end
  gapJoined: boolean; // joined across an open gap (openBetween)
  cut: boolean; // round only part of the way (HALF_TURN_DEG): no full-round depth for it
  countersinks: [string, number[], number, number][]; // (end, cone face ids, diameter, included deg) per open end (D-022)
  fullLo: number | null; // where the hole is round all the way, when an end leaves through a slope (D-022)
  fullHi: number | null;
  mouths: [string, number][]; // (end, face id) round each open end, through a countersink (D-050)
}

function segment(faces: number[], origin: Vec, axis: Vec, radius: number, lo: number, hi: number,
  taperDeg = 0, smallRadius: number | null = null): Segment {
  return {
    faces, origin, axis, radius, lo, hi, bottom: [], shoulders: [], openEnds: [], pointMm: null, links: new Set(),
    groove: false, ring: false, taperDeg, smallRadius, gapJoined: false, cut: false, countersinks: [], fullLo: null,
    fullHi: null, mouths: [],
  };
}

export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (k: number, a: Vec): Vec => [k * a[0], k * a[1], k * a[2]];
const neg = (a: Vec): Vec => [-a[0], -a[1], -a[2]];
const norm = (a: Vec) => Math.sqrt(dot(a, a));
const degrees = (rad: number) => (rad * 180) / Math.PI;

/** Python's float `%`: the result takes the divisor's sign. */
function pyMod(a: number, b: number): number {
  const m = a % b;
  return m !== 0 && (b < 0) !== (m < 0) ? m + b : m + 0;
}

/** The order CPython iterates a set of small non-negative ints built by add() in this order: slot hash & 7 of its
 *  8-slot table, a taken slot probing on to (i * 5 + 1 + perturb) & 7 (setobject.c, 3.12). A set of 5 or more grows
 *  its table; that never happens where this is used (BRIDGE_MAX_FACES), so it falls back to ascending order. */
export function pySetOrder(added: Iterable<number>): number[] {
  const items = [...new Set(added)];
  if (items.length > 4 || items.some((j) => j < 0)) return items.sort((a, b) => a - b);
  const slots: (number | undefined)[] = new Array(8);
  for (const j of items) {
    let i = j & 7;
    let perturb = j;
    while (slots[i] !== undefined) {
      perturb >>>= 5;
      i = (i * 5 + 1 + perturb) & 7;
    }
    slots[i] = j;
  }
  return slots.filter((j): j is number => j !== undefined);
}

/** Python's `x in list` for numbers, so the code below reads like features.py. */
const has = (list: readonly number[] | Set<number>, x: number) => (list instanceof Set ? list.has(x) : list.includes(x));

/** Python's tuple comparison for (z, y, x) rounded to 9 places against (0, 0, 0). */
function canonPositive(axis: Vec): boolean {
  const key = [round(axis[2], 9), round(axis[1], 9), round(axis[0], 9)];
  for (const k of key) {
    if (k > 0) return true;
    if (k < 0) return false;
  }
  return false;
}

/** One sign for an axis line, so coaxial faces share a direction and a height scale. */
export function canon(axis: Vec): Vec {
  return canonPositive(axis) ? axis : neg(axis);
}

/** Two unit vectors perpendicular to the axis, the same for either axis sign. */
export function refFrame(axis: Vec): [Vec, Vec] {
  const a = canon(axis);
  const seed: Vec = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = unit(cross(a, seed));
  return [x, cross(a, x)];
}

/** The engine calls the hole finder needs, on one solid's faces. */
export class Topology {
  readonly faceIndex: OC;
  readonly edgeFaces: OC;
  private lines: OC = null;
  private readonly nbCache = new Map<number, Map<number, OC[]>>();
  private readonly ptCache = new Map<number, Vec[]>();
  private readonly surfCache = new Map<number, OC>();

  constructor(readonly oc: OC, readonly solid: OC, readonly faces: OC[]) {
    const E = oc.TopAbs_ShapeEnum;
    this.faceIndex = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
    oc.TopExp.MapShapes(solid, E.TopAbs_FACE, this.faceIndex);
    this.edgeFaces = new oc.NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher();
    oc.TopExp.MapShapesAndAncestors(solid, E.TopAbs_EDGE, E.TopAbs_FACE, this.edgeFaces);
  }

  /** Whether any face crosses the line p + t d strictly between t0 and t1. */
  lineHits(p: Vec, d: Vec, t0: number, t1: number): boolean {
    const oc = this.oc;
    if (this.lines === null) {
      this.lines = new oc.IntCurvesFace_ShapeIntersector();
      this.lines.Load(this.solid, 1e-7);
    }
    const [pnt, dir] = [new oc.gp_Pnt(p[0], p[1], p[2]), new oc.gp_Dir(d[0], d[1], d[2])];
    const lin = new oc.gp_Lin(pnt, dir);
    this.lines.Perform(lin, t0 + 1e-6, t1 - 1e-6);
    const hit = this.lines.IsDone() && this.lines.NbPnt() > 0;
    lin.delete(); pnt.delete(); dir.delete();
    return hit;
  }

  fid(face: OC): number {
    return this.faceIndex.FindIndex(face) - 1;
  }

  /** Neighbouring face ids, each with the shared edges, in the order features.py finds them. */
  neighbours(faceId: number): Map<number, OC[]> {
    const cached = this.nbCache.get(faceId);
    if (cached) return cached;
    const oc = this.oc;
    const out = new Map<number, OC[]>();
    const exp = new oc.TopExp_Explorer(this.faces[faceId], oc.TopAbs_ShapeEnum.TopAbs_EDGE);
    for (; exp.More(); exp.Next()) {
      const edge = exp.Current();
      const idx = this.edgeFaces.FindIndex(edge);
      if (idx) {
        const list = new oc.NCollection_List_TopoDS_Shape(this.edgeFaces.FindFromIndex(idx));
        while (list.Size()) {
          const oid = this.fid(list.First());
          list.RemoveFirst();
          if (oid !== faceId) {
            if (!out.has(oid)) out.set(oid, []);
            out.get(oid)!.push(edge);
          }
        }
        list.delete();
      }
    }
    exp.delete();
    this.nbCache.set(faceId, out);
    return out;
  }

  /** The face's BRepAdaptor_Surface, made once. */
  surface(faceId: number): OC {
    let s = this.surfCache.get(faceId);
    if (!s) {
      s = new this.oc.BRepAdaptor_Surface(this.faces[faceId], true);
      this.surfCache.set(faceId, s);
    }
    return s;
  }

  type(faceId: number): string {
    return String(this.surface(faceId).GetType()); // the engine's enums are strings
  }

  /** points() of a face, sampled once. */
  facePoints(faceId: number): Vec[] {
    let p = this.ptCache.get(faceId);
    if (!p) {
      p = points(this.oc, this.faces[faceId]);
      this.ptCache.set(faceId, p);
    }
    return p;
  }
}

export function pt(p: OC): Vec {
  return [p.X(), p.Y(), p.Z()];
}

export function vertices(oc: OC, shape: OC): Vec[] {
  const out: Vec[] = [];
  const exp = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_VERTEX);
  for (; exp.More(); exp.Next()) {
    const p = oc.BRep_Tool.Pnt(oc.TopoDS.Vertex(exp.Current()));
    out.push(pt(p));
    p.delete();
  }
  exp.delete();
  return out;
}

/** Points sampled along every edge of a shape (vertices alone miss saddle-shaped edges). */
export function points(oc: OC, shape: OC, perEdge = 9): Vec[] {
  const out: Vec[] = [];
  const exp = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
  for (; exp.More(); exp.Next()) {
    const edge = oc.TopoDS.Edge(exp.Current());
    if (!oc.BRep_Tool.Degenerated(edge)) {
      const curve = new oc.BRepAdaptor_Curve(edge);
      const [a, b] = [curve.FirstParameter(), curve.LastParameter()];
      for (let i = 0; i < perEdge; i++) {
        const p = curve.Value(a + ((b - a) * i) / (perEdge - 1));
        out.push(pt(p));
        p.delete();
      }
      curve.delete();
    }
  }
  exp.delete();
  return out.length ? out : vertices(oc, shape);
}

export function uvBounds(oc: OC, face: OC): [number, number, number, number] {
  const b = oc.BRepTools.UVBounds(face);
  return [b.UMin, b.UMax, b.VMin, b.VMax];
}

/** Whole degrees around the axis covered by the face's u range (sampled every 0.5 deg). */
function angleBins(oc: OC, face: OC, surface: OC, origin: Vec, axis: Vec): Set<number> {
  const [umin, umax, vmin, vmax] = uvBounds(oc, face);
  const [x, y] = refFrame(axis);
  const steps = Math.max(2, Math.trunc(degrees(umax - umin) * 2) + 1);
  const out = new Set<number>();
  for (let i = 0; i <= steps; i++) {
    const p = surface.Value(umin + ((umax - umin) * i) / steps, (vmin + vmax) / 2);
    const r = sub(pt(p), origin);
    p.delete();
    const a = pyMod(degrees(Math.atan2(dot(r, y), dot(r, x))), 360);
    out.add(pyMod(Math.trunc(a), 360));
  }
  return out;
}

/** A point at the middle of the face's UV box and the outward normal there. */
export function outwardNormal(oc: OC, face: OC): [Vec, Vec] {
  const [umin, umax, vmin, vmax] = uvBounds(oc, face);
  const [point, vec] = [new oc.gp_Pnt(), new oc.gp_Vec()];
  const gp = new oc.BRepGProp_Face(face, false);
  gp.Normal((umin + umax) / 2, (vmin + vmax) / 2, point, vec);
  const out: [Vec, Vec] = [pt(point), unit([vec.X(), vec.Y(), vec.Z()])];
  gp.delete(); point.delete(); vec.delete();
  return out;
}

export const TAPER_MAX_DEG = 15.0; // a cone this steep or less is a tapered hole's wall (taper pins 0.6, pipe threads
// 1.8, drafts a few deg); countersinks (41-60), entry chamfers (45) and drill points (59) are steeper

/** A concave cylinder face as a hole piece; with `tapers`, a concave cone of half-angle up to TAPER_MAX_DEG too (a
 *  tapered hole), its radius given at height 0 on the shared axis scale. */
export function cylinder(topo: Topology, faceId: number, tapers = false): Cyl | null {
  const oc = topo.oc;
  const face = topo.faces[faceId];
  const surface = topo.surface(faceId);
  const kind = topo.type(faceId);
  let geo: OC;
  if (kind === "GeomAbs_Cylinder") geo = surface.Cylinder();
  else if (kind === "GeomAbs_Cone" && tapers && Math.abs(degrees(surface.Cone().SemiAngle())) <= TAPER_MAX_DEG) geo = surface.Cone();
  else return null;
  const ax = geo.Axis();
  const dir = unit(pt(ax.Direction()));
  const [origin, axis] = [pt(ax.Location()), canon(dir)];
  const [point, normal] = outwardNormal(oc, face);
  const rel = sub(point, origin);
  const radial = sub(rel, scale(dot(rel, axis), axis));
  if (dot(normal, radial) >= 0) return null; // convex: the outward normal points away from the axis
  const along = topo.facePoints(faceId).map((v) => dot(v, axis)); // heights on the shared scale (see canon)
  const bins = angleBins(oc, face, surface, origin, axis);
  const [lo, hi] = [Math.min(...along), Math.max(...along)];
  if (kind === "GeomAbs_Cylinder") return { id: faceId, origin, axis, radius: geo.Radius(), bins, lo, hi, slope: 0 };
  // gp_Cone: radius RefRadius at Location, growing by tan(SemiAngle) along its own direction
  const slope = Math.tan(geo.SemiAngle()) * (dot(dir, axis) > 0 ? 1 : -1);
  return { id: faceId, origin, axis, radius: geo.RefRadius() - slope * dot(origin, axis), bins, lo, hi, slope };
}

export function sameLine(a: { axis: Vec; origin: Vec }, b: { axis: Vec; origin: Vec }): boolean {
  if (Math.abs(dot(a.axis, b.axis)) < Math.cos(ANGLE_TOL)) return false;
  return norm(cross(sub(b.origin, a.origin), a.axis)) <= LINE_TOL;
}

export const HALF_TURN_DEG = 189; // D-018 round 2: a hole cut by another feature still covers this much (1.05 pi)

const sameBore = (a: Cyl, b: Cyl) => Math.abs(a.radius - b.radius) <= RADIUS_TOL && sameLine(a, b) && Math.abs(a.slope - b.slope) <= 1e-6;

/** Group concave cylinders that share edges, axis and radius, then join groups on one axis line with one radius
 *  whose heights overlap (the pieces of a hole another feature cuts through, D-018 round 2), or that leave an open
 *  gap between them (openBetween); groups holding a face in `noGap` are not joined across a gap. Keep groups that
 *  go all the way round, or at least HALF_TURN_DEG where no part of them does. */
function segments(topo: Topology, cyls: Map<number, Cyl>, noGap: Set<number> = new Set()): Segment[] {
  const seen = new Set<number>();
  const groups: number[][] = [];
  for (const fid of [...cyls.keys()].sort((a, b) => a - b)) {
    if (seen.has(fid)) continue;
    const group: number[] = [];
    const todo = [fid];
    seen.add(fid);
    while (todo.length) {
      const cur = todo.pop()!;
      group.push(cur);
      for (const nb of topo.neighbours(cur).keys()) {
        const c = cyls.get(nb);
        if (c && !seen.has(nb) && sameBore(c, cyls.get(fid)!)) {
          seen.add(nb);
          todo.push(nb);
        }
      }
    }
    groups.push(group.sort((a, b) => a - b));
  }
  const merged: number[][] = [];
  const gapJoined = new Set<number>();
  for (const group of groups) {
    const lo = Math.min(...group.map((g) => cyls.get(g)!.lo));
    const hi = Math.max(...group.map((g) => cyls.get(g)!.hi));
    let placed = false;
    for (const other of merged) {
      const [a, b] = [cyls.get(other[0])!, cyls.get(group[0])!];
      const olo = Math.min(...other.map((g) => cyls.get(g)!.lo));
      const ohi = Math.max(...other.map((g) => cyls.get(g)!.hi));
      if (sameBore(a, b)) {
        if (Math.min(hi, ohi) - Math.max(lo, olo) > 0.01) {
          // overlapping: one hole
        } else if (![...group, ...other].some((g) => noGap.has(g)) && openBetween(topo, cyls, group, other)) {
          for (const g of [...group, ...other]) gapJoined.add(g);
        } else continue;
        other.push(...group);
        other.sort((x, y) => x - y);
        placed = true;
        break;
      }
    }
    if (!placed) merged.push(group);
  }
  const out: Segment[] = [];
  for (const group of merged) {
    const members = group.map((g) => cyls.get(g)!);
    const whole = fullTurn(members);
    const span = whole ?? fullTurn(members, HALF_TURN_DEG);
    if (span === null) continue;
    const base = members[0];
    if (base.slope) { // a tapered hole: its size is the wide end, and it keeps the narrow end
      const ends = [radiusAt(base, span[0]), radiusAt(base, span[1])].sort((a, b) => a - b);
      out.push(segment(group, base.origin, base.axis, ends[1], span[0], span[1], degrees(Math.atan(Math.abs(base.slope))), ends[0]));
    } else out.push(segment(group, base.origin, base.axis, base.radius, span[0], span[1]));
    out[out.length - 1].gapJoined = group.some((g) => gapJoined.has(g));
    out[out.length - 1].cut = whole === null;
  }
  return out;
}

export const GAP_LINE_RADIUS = 0.9; // of the bore's radius: where the lines that probe a gap run
export const GAP_MAX_DIAMETERS = 3.0; // assumption: one drill crosses a gap up to 3 diameters long

/** Two groups of one bore (one axis line, one radius) that leave a gap along it, with nothing solid inside the bore
 *  across the gap. Five lines along the axis cross it, on the axis and at GAP_LINE_RADIUS of the radius every
 *  90 deg; a face crossing any of them closes the gap. */
function openBetween(topo: Topology, cyls: Map<number, Cyl>, a: number[], b: number[]): boolean {
  const spans: [number, number][] = [];
  for (const g of [a, b]) {
    const members = g.map((k) => cyls.get(k)!);
    const span = fullTurn(members) ?? fullTurn(members, HALF_TURN_DEG);
    if (span === null) return false;
    spans.push(span);
  }
  spans.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const [[, ahi], [blo]] = spans;
  if (blo < ahi - 0.01) return false; // they overlap: not a gap (the caller joins overlapping groups)
  const c = cyls.get(a[0])!;
  if (blo - ahi > GAP_MAX_DIAMETERS * 2 * radiusAt(c, ahi)) return false;
  const [x, y] = refFrame(c.axis);
  const base = sub(c.origin, scale(dot(c.origin, c.axis), c.axis)); // the axis point at height 0
  const [t0, t1] = blo - ahi > 0.02 ? [ahi - 0.01, blo + 0.01] : [(ahi + blo) / 2 - 0.01, (ahi + blo) / 2 + 0.01];
  const r = GAP_LINE_RADIUS * Math.min(radiusAt(c, t0), radiusAt(c, t1));
  for (const [ox, oy] of [[0, 0], [r, 0], [0, r], [-r, 0], [0, -r]]) {
    const p: Vec = [0, 1, 2].map((k) => base[k] + ox * x[k] + oy * y[k]) as Vec;
    if (topo.lineHits(p, c.axis, t0, t1)) return false;
  }
  return true;
}

/** The height range where the group goes all the way round (360 deg within 1 deg), or null. With a smaller
 *  `minDeg`: the range where it covers at least that much (a cut hole). */
function fullTurn(members: Cyl[], minDeg = 359): [number, number] | null {
  const cuts = [...new Set(members.flatMap((m) => [round(m.lo, 4), round(m.hi, 4)]))].sort((p, q) => p - q);
  const full: [number, number][] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    if (!(b - a > 0.01)) continue;
    const covered = new Set<number>();
    for (const m of members) if (m.lo <= a + 0.01 && m.hi >= b - 0.01) for (const d of m.bins) covered.add(d);
    if (covered.size >= minDeg) full.push([a, b]);
  }
  if (!full.length) return null;
  return [Math.min(...full.map((f) => f[0])), Math.max(...full.map((f) => f[1]))];
}

/** "hi" or "lo" when the shared edges lie at an end of the segment; null for an edge partway along it. */
function edgeEnd(oc: OC, seg: Segment, edges: OC[]): string | null {
  const along = edges.flatMap((e) => points(oc, e).map((v) => dot(v, seg.axis)));
  if (Math.max(...along) >= seg.hi - 0.01) return "hi";
  if (Math.min(...along) <= seg.lo + 0.01) return "lo";
  return null;
}

/** A plane perpendicular to the axis, or a cone on the same axis. */
function isShoulder(topo: Topology, faceId: number, seg: Segment): boolean {
  const kind = topo.type(faceId);
  if (kind === "GeomAbs_Plane") {
    const [, n] = outwardNormal(topo.oc, topo.faces[faceId]);
    return Math.abs(dot(n, seg.axis)) >= Math.cos(ANGLE_TOL);
  }
  if (kind === "GeomAbs_Cone") {
    const ax = topo.surface(faceId).Cone().Axis();
    const [o, d] = [pt(ax.Location()), unit(pt(ax.Direction()))];
    return Math.abs(dot(d, seg.axis)) >= Math.cos(ANGLE_TOL) && norm(cross(sub(o, seg.origin), seg.axis)) <= LINE_TOL;
  }
  return false;
}

function classifyEnds(topo: Topology, segs: Segment[]): void {
  const oc = topo.oc;
  const owner = new Map<number, number>();
  segs.forEach((s, i) => s.faces.forEach((f) => owner.set(f, i)));
  segs.forEach((seg, i) => {
    const ends = new Map<string, string>();
    const around = new Map<number, OC[]>(); // a dict comprehension: a later face's edges replace, the place stays
    for (const fid of seg.faces) for (const [nb, edges] of topo.neighbours(fid)) if (!has(seg.faces, nb)) around.set(nb, edges);
    for (const [nb, edges] of around) {
      // Each end the face meets, by edge: a radial hole through a round shaft opens onto the same face at both ends.
      const byEnd = new Map<string, OC[]>();
      for (const e of edges) {
        const end = edgeEnd(oc, seg, [e]);
        if (end !== null) {
          if (!byEnd.has(end)) byEnd.set(end, []);
          byEnd.get(end)!.push(e);
        }
      }
      for (const end of byEnd.keys()) {
        const nbNbs = new Set(topo.neighbours(nb).keys());
        const bridged = bridge(topo, segs, owner, i, nb);
        if (bridged) { // joins two segments of one stepped hole
          const [linked, shoulders] = bridged;
          for (const j of linked) seg.links.add(j);
          if (seg.radius > Math.max(...linked.map((j) => segs[j].radius))) {
            for (const k of shoulders) if (!seg.shoulders.includes(k)) seg.shoulders.push(k);
          }
          if (!ends.has(end)) ends.set(end, "link");
          continue;
        }
        // A flat ring at the end, with a second loop of edges inside it where a core rises on the same axis
        // (directly or through a chamfer): an O-ring groove, not a hole (D-018 round 2).
        if (isShoulder(topo, nb, seg) && [...nbNbs].some((k) => !has(seg.faces, k) && (core(topo, k, seg) ||
            (isShoulder(topo, k, seg) && topo.type(k) === "GeomAbs_Cone" &&
              [...topo.neighbours(k).keys()].some((j) => core(topo, j, seg)))))) {
          seg.ring = true;
        }
        // A bottom closes the hole: its faces touch only this segment and each other, and lie within its radius.
        // A flat bottom that another feature cuts into still closes the hole.
        const flat = topo.type(nb) === "GeomAbs_Plane" && isShoulder(topo, nb, seg);
        const inside = [...nbNbs].every((k) => has(seg.faces, k) || around.has(k));
        const closed = !(inside || flat) ? closedBottom(topo, seg, nb, end) : [nb];
        if (closed && within(topo, nb, seg)) {
          for (const k of closed) if (!seg.bottom.includes(k)) seg.bottom.push(k);
          if (topo.type(nb) === "GeomAbs_Cone") seg.pointMm = coneLength(topo, nb, seg);
          if (ends.get(end) !== "link") ends.set(end, "bottom");
          continue;
        }
        // Anything else is an open end, with the hole's own axis also on a pocket floor (D-022).
        if (!ends.has(end)) ends.set(end, "open");
        seg.mouths.push([end, nb]);
        const csk = countersink(topo, seg, nb);
        if (csk && !seg.countersinks.some((c) => c[0] === end)) {
          seg.countersinks.push([end, ...csk]);
          // D-050: a countersunk hole enters the face round its cone
          for (const k of csk[0]) for (const j of topo.neighbours(k).keys()) {
            if (!has(seg.faces, j) && !csk[0].includes(j)) seg.mouths.push([end, j]);
          }
        }
      }
      if (!seg.cut) { // where it is round all the way (D-022)
        for (const [end, es] of byEnd) {
          for (const e of es) {
            const along = points(oc, e).map((v) => dot(v, seg.axis));
            if (end === "hi" && Math.min(...along) > seg.lo + 0.01) {
              seg.fullHi = Math.min(seg.fullHi !== null ? seg.fullHi : seg.hi, Math.min(...along));
            } else if (end === "lo" && Math.max(...along) < seg.hi - 0.01) {
              seg.fullLo = Math.max(seg.fullLo !== null ? seg.fullLo : seg.lo, Math.max(...along));
            }
          }
        }
      }
    }
    seg.openEnds = ["hi", "lo"].filter((e) => ends.get(e) === "open");
    seg.countersinks = seg.countersinks.filter((c) => seg.openEnds.includes(c[0]));
    seg.groove = ends.get("hi") === "link" && ends.get("lo") === "link" && [...seg.links].every((j) => segs[j].radius < seg.radius);
  });
  // A link found from one side only (a shoulder partway along a bore joined across a gap) still joins the chain.
  segs.forEach((seg, i) => {
    for (const j of seg.links) segs[j].links.add(i);
  });
}

export const COUNTERSINK_MAX_DEG = 60.0; // half-angle: 82, 90, 100 and 120 deg countersinks, and 45 deg entry chamfers

/** A cone on the hole's axis at an open end, steeper than a taper and widening out of the part: a countersink or an
 *  entry chamfer (D-022). Returns (its cone faces, its wide diameter, included angle). */
function countersink(topo: Topology, seg: Segment, nb: number): [number[], number, number] | null {
  if (topo.type(nb) !== "GeomAbs_Cone" || !isShoulder(topo, nb, seg)) return null;
  const half = Math.abs(degrees(topo.surface(nb).Cone().SemiAngle()));
  if (!(TAPER_MAX_DEG < half && half <= COUNTERSINK_MAX_DEG + degrees(ANGLE_TOL))) return null; // 120 deg: 60 to rounding
  const cones = [nb, ...[...topo.neighbours(nb).keys()].filter((k) => !has(seg.faces, k) &&
    topo.type(k) === "GeomAbs_Cone" && isShoulder(topo, k, seg))]; // a split cone
  const radius = (p: Vec) => norm(cross(sub(p, seg.origin), seg.axis));
  const wide = Math.max(...cones.flatMap((k) => topo.facePoints(k).map(radius)));
  if (wide <= seg.radius + 0.01) return null;
  return [[...cones].sort((a, b) => a - b), 2 * wide, round(2 * half, 1)];
}

export const BRIDGE_MAX_FACES = 4; // a shoulder with an edge break: a floor ring, a chamfer or fillet at the bore

/** A shoulder face (a plane square to the axis, or a cone on it), or a torus on the axis (a fillet). */
function roundAbout(topo: Topology, faceId: number, seg: Segment): boolean {
  if (isShoulder(topo, faceId, seg)) return true;
  if (topo.type(faceId) !== "GeomAbs_Torus") return false;
  const ax = topo.surface(faceId).Torus().Axis();
  const [o, d] = [pt(ax.Location()), unit(pt(ax.Direction()))];
  return Math.abs(dot(d, seg.axis)) >= Math.cos(ANGLE_TOL) && norm(cross(sub(o, seg.origin), seg.axis)) <= LINE_TOL;
}

/** Segments on segment i's axis line that face nb joins it to, through up to BRIDGE_MAX_FACES faces round the axis,
 *  and the faces that are the shoulder: all of them, except a chamfer or fillet at the narrower bore. null when nb
 *  joins no other segment. */
function bridge(topo: Topology, segs: Segment[], owner: Map<number, number>, i: number, nb: number): [number[], number[]] | null {
  const seg = segs[i];
  if (!roundAbout(topo, nb, seg)) return null;
  const group = [nb];
  const todo = [nb];
  const linked = new Set<number>();
  while (todo.length) {
    const cur = todo.pop()!;
    for (const k of topo.neighbours(cur).keys()) {
      if (owner.has(k)) {
        if (owner.get(k) !== i && sameLine(segs[owner.get(k)!], seg)) linked.add(owner.get(k)!);
      } else if (!group.includes(k) && roundAbout(topo, k, seg)) {
        if (group.length >= BRIDGE_MAX_FACES) return null;
        group.push(k);
        todo.push(k);
      }
    }
  }
  if (!linked.size) return null;
  // Python's max over [seg, *linked] keeps the first on a tie, in the set's own iteration order
  const candidates = [seg, ...pySetOrder(linked).map((j) => segs[j])];
  const wide = candidates.reduce((a, b) => (b.radius > a.radius ? b : a));
  if (!group.every((k) => within(topo, k, wide))) return null;
  const sortedLinked = [...linked].sort((a, b) => a - b);
  if (group.length === 1) return [sortedLinked, group];
  const narrow = new Set<number>();
  for (const j of [i, ...linked]) if (segs[j] !== wide) for (const f of segs[j].faces) narrow.add(f);
  const edgeBreak = group.filter((k) => topo.type(k) !== "GeomAbs_Plane" && [...topo.neighbours(k).keys()].some((n) => narrow.has(n)));
  return [sortedLinked, group.filter((k) => !edgeBreak.includes(k))];
}

export const BOTTOM_MAX_FACES = 12; // a filleted, ball or split bottom has a few faces; more is another feature
const TIP = ["GeomAbs_Plane", "GeomAbs_Cone", "GeomAbs_Torus", "GeomAbs_Sphere"]; // what a drill or end-mill tip leaves

/** The faces that close the hole past `nb`, or null: every face joined to `nb` away from the bore lies within the
 *  bore's radius and past its end, and is a face a tool tip leaves. */
function closedBottom(topo: Topology, seg: Segment, nb: number, end: string): number[] | null {
  const pastEnd = (k: number) => {
    if (!TIP.includes(topo.type(k))) return false;
    const along = topo.facePoints(k).map((v) => dot(v, seg.axis));
    return end === "lo" ? Math.max(...along) <= seg.lo + 0.01 : Math.min(...along) >= seg.hi - 0.01;
  };
  if (!pastEnd(nb)) return null;
  const group = new Set([nb]);
  const todo = [nb];
  while (todo.length) {
    const cur = todo.pop()!;
    for (const k of topo.neighbours(cur).keys()) {
      if (has(seg.faces, k) || group.has(k)) continue;
      if (group.size >= BOTTOM_MAX_FACES || !within(topo, k, seg) || !pastEnd(k)) return null;
      group.add(k);
      todo.push(k);
    }
  }
  return [...group].sort((a, b) => a - b);
}

/** Every point on the face's edges lies within the segment's radius of its axis: the face can close the hole. */
function within(topo: Topology, faceId: number, seg: Segment): boolean {
  for (const p of topo.facePoints(faceId)) if (norm(cross(sub(p, seg.origin), seg.axis)) > seg.radius + 0.01) return false;
  return true;
}

/** A convex cylinder on the segment's axis, narrower than it: the raised core of a ring groove. */
function core(topo: Topology, faceId: number, seg: Segment): boolean {
  if (topo.type(faceId) !== "GeomAbs_Cylinder") return false;
  const cyl = topo.surface(faceId).Cylinder();
  if (cyl.Radius() >= seg.radius - RADIUS_TOL) return false;
  const ax = cyl.Axis();
  const [o, d] = [pt(ax.Location()), unit(pt(ax.Direction()))];
  if (Math.abs(dot(d, seg.axis)) < Math.cos(ANGLE_TOL) || norm(cross(sub(o, seg.origin), seg.axis)) > LINE_TOL) return false;
  const [point, normal] = outwardNormal(topo.oc, topo.faces[faceId]);
  const rel = sub(point, o);
  return dot(normal, sub(rel, scale(dot(rel, d), d))) > 0;
}

function coneLength(topo: Topology, faceId: number, seg: Segment): number {
  const along = topo.facePoints(faceId).map((v) => dot(v, seg.axis));
  return Math.max(...along) - Math.min(...along);
}

function chains(segs: Segment[]): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (seen.has(i)) continue;
    const chain: number[] = [];
    const todo = [i];
    seen.add(i);
    while (todo.length) {
      const cur = todo.pop()!;
      chain.push(cur);
      for (const j of segs[cur].links) {
        if (!seen.has(j)) {
          seen.add(j);
          todo.push(j);
        }
      }
    }
    out.push(chain.sort((a, b) => a - b));
  }
  return out;
}

export function frameDir(v: Vec, frame: Frame): string | null {
  for (const [name, [key, sign]] of Object.entries(DIRS)) if (dot(v, scale(sign, frame[key])) >= Math.cos(ANGLE_TOL)) return name;
  return null;
}

/** Degrees off square between a hole and the flat face round an open end, at its squarest open end (D-050). null
 *  when no open end meets a flat face. */
function entryDeg(topo: Topology, chain: Segment[]): number | null {
  let best: number | null = null;
  for (const s of chain) {
    for (const [end, fid] of s.mouths) {
      if (!s.openEnds.includes(end)) continue;
      if (topo.type(fid) !== "GeomAbs_Plane") continue;
      const d = topo.surface(fid).Plane().Axis().Direction();
      const deg = degrees(Math.acos(Math.min(1.0, Math.abs(dot(s.axis, [d.X(), d.Y(), d.Z()])))));
      best = best === null ? deg : Math.min(best, deg);
    }
  }
  return best === null ? null : round(best, 3);
}

export interface Hole {
  id: string;
  kind: "hole";
  faces: number[];
  axis: number[];
  open_dirs: string[];
  open_vectors: number[][];
  blind: boolean;
  dims_mm: Record<string, number>;
  chain: number;
  entry_deg: number | null;
  countersink_faces?: number[];
  countersink_vectors?: number[][];
  countersink_degs?: number[];
  countersink_end_faces?: number[][];
}

export function holes(oc: OC, solid: OC, faces: OC[], frame: Frame): Hole[] {
  const topo = new Topology(oc, solid, faces);
  const cyls = new Map<number, Cyl>();
  faces.forEach((_, i) => {
    const c = cylinder(topo, i, true);
    if (c) cyls.set(i, c);
  });
  let segs = segments(topo, cyls);
  classifyEnds(topo, segs);
  // Two counterbores that face each other across an open cavity (NIST ctc_02) join into one bore wider than both its
  // ends, which reads as a groove and would drop out: keep them apart.
  const undo = new Set(segs.filter((s) => s.gapJoined && s.groove).flatMap((s) => s.faces));
  if (undo.size) {
    segs = segments(topo, cyls, undo);
    classifyEnds(topo, segs);
  }
  const features: Omit<Hole, "id">[] = [];
  chains(segs).forEach((chain, n) => {
    const nChain = n + 1;
    const entry = entryDeg(topo, chain.map((i) => segs[i]));
    const vectors: Vec[] = [];
    for (const i of chain) {
      const s = segs[i];
      for (const end of s.openEnds) {
        const v = end === "hi" ? s.axis : neg(s.axis);
        if (!vectors.some((w) => dot(v, w) > 0.9999)) vectors.push(v);
      }
    }
    for (const i of chain) {
      const s = segs[i];
      if (s.groove || s.ring) continue;
      let lo = s.fullLo !== null ? s.fullLo : s.lo;
      let hi = s.fullHi !== null ? s.fullHi : s.hi;
      if (hi - lo <= 0.01) [lo, hi] = [s.lo, s.hi]; // slopes at both ends that cross: the longest side
      const dims: Record<string, number> = { diameter: 2 * s.radius, depth: hi - lo };
      if ((s.hi - s.lo) - (hi - lo) > 0.01) dims.max_depth = s.hi - s.lo; // an end leaves through a slope (D-022)
      if (s.pointMm !== null) dims.point_mm = s.pointMm;
      if (s.taperDeg) {
        dims.taper_deg = s.taperDeg;
        dims.small_diameter = 2 * s.smallRadius!;
      }
      const dirs = vectors.map((v) => frameDir(v, frame)).filter((d): d is string => d !== null);
      let csk = {};
      if (s.countersinks.length) { // D-022: the cone stays out of `faces`; the hole records it
        dims.countersink_diameter = Math.max(...s.countersinks.map((c) => c[2]));
        dims.countersink_deg = s.countersinks[0][3];
        csk = {
          countersink_faces: [...new Set(s.countersinks.flatMap((c) => c[1]))].sort((a, b) => a - b),
          countersink_vectors: s.countersinks.map((c) => [...(c[0] === "hi" ? s.axis : neg(s.axis))]),
          countersink_degs: s.countersinks.map((c) => c[3]), // per end, as the vectors
          countersink_end_faces: s.countersinks.map((c) => [...c[1]]), // each end's cone faces
        };
      }
      features.push({
        kind: "hole",
        faces: [...s.faces, ...s.bottom, ...s.shoulders].sort((a, b) => a - b),
        axis: [...(vectors.length ? vectors[0] : s.axis)],
        open_dirs: [...new Set(dirs)],
        open_vectors: vectors.map((v) => [...v]),
        blind: s.bottom.length > 0, // a bottom closes this segment (I2; open_vectors are the whole chain's)
        dims_mm: dims,
        chain: nChain, // the same for every segment of one stepped hole (renumbered below)
        entry_deg: entry, // D-050: how far off square it enters its flat face; null: no flat face
        ...csk,
      });
    }
  });
  features.sort((a, b) => Math.min(...a.faces) - Math.min(...b.faces)); // stable, as Python's sort
  const renumber = new Map<number, number>();
  return features.map((f, n) => {
    if (!renumber.has(f.chain)) renumber.set(f.chain, renumber.size + 1);
    return { id: `hole-${n + 1}`, ...f, chain: renumber.get(f.chain)! };
  });
}

/** features.py number(): "<kind>-1", "<kind>-2"… by lowest face, then by the sorted faces. */
export function number<T extends { faces: number[] }>(features: T[], kind: string): (T & { id: string })[] {
  const key = (f: T) => [...f.faces].sort((a, b) => a - b);
  const sorted = [...features].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    for (let i = 0; i < Math.min(ka.length, kb.length); i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return ka.length - kb.length;
  });
  return sorted.map((f, n) => ({ id: `${kind}-${n + 1}`, ...f }));
}
