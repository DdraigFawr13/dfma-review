// Port of service/dfma/features.py lines 1355 to 1667 that S4 left: `_area`, `_touching`, `walls`, `_on_face`,
// `_NearRays` and `hole_walls` (port spec S5). `_box`, `_inner_points` and `_Rays` come from pockets.ts. Read it beside
// the Python: the same names in camelCase and the same order of every loop, so walls come out in the same order.
import { ANGLE_TOL, cross, dot, unit, type Vec } from "../frame";
import type { OC } from "../oc";
import { round } from "../units";
import { cylinder, outwardNormal, pt, refFrame, sub, Topology, vertices, type Cyl, type Hole } from "./holes";
import { box, distShapes, innerPoints, Rays } from "./pockets";

const radians = (deg: number) => deg * (Math.PI / 180); // math.radians: x * (pi / 180)
const neg = (a: Vec): Vec => [-a[0], -a[1], -a[2]];
const pyMod = (a: number, b: number) => ((a % b) + b) % b; // Python's % on ints: the sign of the divisor
const state = (s: unknown) => String(s); // the engine's enums are strings
const byNumber = (a: number, b: number) => a - b;

export const MIN_OVERLAP_MM2 = 10.0; // assumption (spec Features "Wall")
export const WALL_DRAFT_MAX_DEG = 15.0; // D-020: a wall's faces may be this far from parallel (as pocket draft, D-018)
export const WALL_DRAFT_REACH_MM = 25.4; // drafted pairs farther apart than this are not compared (assumption: no
// finding reaches 1 in, and the overlap boolean on every far pair of a large part is slow)

export interface Wall {
  kind: "wall";
  faces: number[];
  axis: number[] | null;
  open_dirs: string[];
  open_vectors: number[][];
  dims_mm: { thickness: number; overlap_mm2?: number };
  hole?: string;
  at?: string;
}

/** The surface area of a shape (features.py _area). */
export function area(oc: OC, shape: OC): number {
  const props = new oc.GProp_GProps();
  oc.BRepGProp.SurfaceProperties(shape, props, false, false);
  const out = props.Mass();
  props.delete();
  return out;
}

/** Python's `tuple(round(c, 6) for c in v)` as a set key (-0.0 and 0.0 are one key, as in Python). */
const vertexKey = (v: Vec) => v.map((c) => String(round(c, 6))).join(",");

/** The two faces share an edge or a vertex. */
function touching(topo: Topology, faces: OC[], a: number, b: number): boolean {
  if (topo.neighbours(a).has(b)) return true;
  const va = new Set(vertices(topo.oc, faces[a]).map(vertexKey));
  return vertices(topo.oc, faces[b]).some((v) => va.has(vertexKey(v)));
}

/** A copy of a shape moved by a transformation (BRepBuilderAPI_Transform(shape, trsf, True).Shape()). */
function transformed(oc: OC, shape: OC, trsf: OC): OC {
  const t = new oc.BRepBuilderAPI_Transform(shape, trsf, true, false);
  const out = t.Shape();
  t.delete();
  return out;
}

/** The common part of two faces and its area, or null when the boolean fails (Python's `except RuntimeError`). */
function common(oc: OC, a: OC, b: OC): [OC, number] | null {
  let op: OC = null;
  const range = new oc.Message_ProgressRange();
  try {
    op = new oc.BRepAlgoAPI_Common(a, b, range);
    op.Build(range); // as the Python: the constructor builds, then Build() again
    const shape = op.Shape();
    return [shape, op.IsDone() ? area(oc, shape) : 0.0];
  } catch {
    return null;
  } finally {
    op?.delete();
    range.delete();
  }
}

/** Pairs of planar faces with outward normals pointing away from each other, parallel or up to WALL_DRAFT_MAX_DEG
 *  from it (draft, D-020), and solid material between them. Unnumbered (features.py walls). */
export function walls(oc: OC, solid: OC, faces: OC[]): Wall[] {
  const topo = new Topology(oc, solid, faces);
  const rays = new Rays(oc, solid);
  const planes: [number, Vec, Vec, OC][] = [];
  faces.forEach((f, i) => {
    const s = new oc.BRepAdaptor_Surface(f, true);
    const plane = state(s.GetType()) === "GeomAbs_Plane";
    s.delete();
    if (plane) planes.push([i, ...outwardNormal(oc, f), box(oc, f)]); // _plane_info
  });
  const cosDraft = Math.cos(radians(WALL_DRAFT_MAX_DEG));
  const out: Wall[] = [];
  try {
    for (let k = 0; k < planes.length; k++) {
      const [ia, pa, na] = planes[k];
      for (const [ib, pb, nb, bb] of planes.slice(k + 1)) {
        if (dot(na, nb) > -cosDraft) continue;
        const drafted = dot(na, nb) > -1 + 1e-12; // not exactly parallel: a tilted face lands off b's plane
        let [faceA, nA]: [OC, Vec] = [faces[ia], na];
        if (drafted) { // D-020: up to WALL_DRAFT_MAX_DEG from parallel; turn a parallel to b first
          if (touching(topo, faces, ia, ib)) continue; // faces that meet (a knife edge) are no wall
          if (dot(na, nb) > -Math.cos(ANGLE_TOL)) {
            const ba = box(oc, faces[ia]);
            const far = ba.Distance(bb) > WALL_DRAFT_REACH_MM;
            ba.delete();
            if (far) continue; // far ones are thick
          }
          const axis = cross(na, neg(nb));
          const [p, d] = [new oc.gp_Pnt(pa[0], pa[1], pa[2]), new oc.gp_Dir(...unit(axis))];
          const ax = new oc.gp_Ax1(p, d);
          const turn = new oc.gp_Trsf();
          turn.SetRotation(ax, Math.asin(Math.min(1.0, Math.sqrt(dot(axis, axis)))));
          [faceA, nA] = [transformed(oc, faces[ia], turn), neg(nb)];
          turn.delete(); ax.delete(); p.delete(); d.delete();
        }
        const t0 = -dot(sub(pb, pa), nA); // how far b lies behind a, into a's material side
        if (t0 <= 1e-6) continue; // facing each other (a slot's sides) or in one plane
        let t = t0;
        const move = new oc.gp_Trsf();
        const shift = new oc.gp_Vec(nA[0] * -t, nA[1] * -t, nA[2] * -t);
        move.SetTranslation(shift);
        const aOnB = transformed(oc, faceA, move);
        move.delete(); shift.delete();
        const bOnB = box(oc, aOnB);
        const apart = bOnB.IsOut(bb);
        bOnB.delete();
        if (apart) continue; // only pairs whose boxes overlap, a moved onto b's plane
        const both = common(oc, aOnB, faces[ib]); // a failed boolean skips this pair, not the whole analysis
        if (both === null) continue;
        const [shape, overlap] = both;
        if (overlap < MIN_OVERLAP_MM2) continue;
        // Solid material between them: a ray from a point inside the overlap on b, along -nb (into the material),
        // first meets face a, at distance t. Air between (two bosses) or another face in the way (a slot or
        // pocket) fails; one clear ray of the sampled points is enough.
        const down = neg(nb);
        let solidBetween = false;
        for (const q of innerPoints(oc, shape)) {
          const [hit, w] = rays.firstHit(q, down);
          if (hit !== null && topo.fid(hit) === ia && (drafted || Math.abs(w - t) <= 0.01)) {
            solidBetween = true;
            break;
          }
        }
        if (!solidBetween) continue;
        if (drafted) { // its thickness is at its thinnest place (D-020)
          const [value, done] = distShapes(oc, faces[ia], faces[ib]);
          if (!done || value <= 1e-6) continue;
          t = value;
        }
        out.push({ kind: "wall", faces: [ia, ib], axis: neg(na), open_dirs: [], open_vectors: [],
          dims_mm: { thickness: t, overlap_mm2: overlap } });
      }
    }
  } finally {
    for (const [, , , b] of planes) b.delete();
  }
  return out;
}

// --- S4 (D-016): thin material at holes ---

export const SIDE_STEP_DEG = 15; // rays around a hole's side every 15 deg, then every 1 deg within 15 deg of the nearest
export const SIDE_STEP_MM = 1.0; // at heights about 1 mm apart along its round part (set 3), at least 3 and at most 48
export const SIDE_HEIGHTS_MIN = 3;
export const SIDE_HEIGHTS_MAX = 48;
export const TIP_TILTS = [0, 10, 20, 30]; // deg off the axis, for rays from a drill point's tip (its surface is 31 deg off it)
export const TIP_TURNS = 12; // around the axis at each tilt
export const HOLE_WALL_MAX_MM = 0.25 * 25.4; // material at a hole is measured up to 0.250 in (assumption): over every limit

/** The point lies on the face itself or its boundary (a seam between split faces), not where a cross hole or an
 *  exit has cut the face away (features.py _on_face; BRepClass_FaceClassifier with pythonocc's defaults). */
function onFace(oc: OC, face: OC, p: Vec): boolean {
  const pnt = new oc.gp_Pnt(p[0], p[1], p[2]);
  const c = new oc.BRepClass_FaceClassifier(oc.TopoDS.Face(face), pnt, 1e-4, false, 0.1);
  const out = state(c.State()) !== "TopAbs_OUT";
  c.delete(); pnt.delete();
  return out;
}

type Hit = [number, number, number]; // (distance, face id, index of the ray)
const byHit = (a: Hit, b: Hit) => (a[0] !== b[0] ? a[0] - b[0] : a[1] !== b[1] ? a[1] - b[1] : a[2] - b[2]);

/** First hits of rays from one hole, up to HOLE_WALL_MAX_MM, testing only the faces whose boxes lie within that
 *  distance of the hole's box. Faces that share an edge with the hole are not tested (features.py _NearRays). */
class NearRays {
  private readonly own: Set<number>;
  private readonly holeBox: OC;
  private inter: OC | null | undefined = undefined; // undefined: not loaded yet; null: no face near
  private comp: OC = null;

  constructor(readonly oc: OC, readonly faces: OC[], readonly boxes: OC[], readonly topo: Topology, own: Set<number>) {
    this.own = new Set(own);
    for (const f of own) for (const n of topo.neighbours(f).keys()) this.own.add(n); // the hole and what it opens onto
    this.holeBox = new oc.Bnd_Box();
    for (const f of own) this.holeBox.Add(boxes[f]);
  }

  /** (face id, distance, index of the ray) of the nearest first hit, or null. */
  nearest(starts: [Vec, Vec][], keep?: (n: number) => boolean): [number, number, number] | null {
    for (const [w, fid, n] of this.hits(starts)) { // nearest first; ties go to the lower face id
      if (keep === undefined || keep(n)) return [fid, w, n];
    }
    return null;
  }

  /** (distance, face id, index of the ray) of each ray's first hit within reach, nearest first. */
  hits(starts: [Vec, Vec][]): Hit[] {
    const oc = this.oc;
    const radius = HOLE_WALL_MAX_MM;
    if (this.inter === undefined) { // one intersector per hole, over the faces near it
      const near = this.boxes.map((_, i) => i).filter((i) => !this.own.has(i) && this.boxes[i].Distance(this.holeBox) <= radius);
      this.inter = null;
      if (near.length) {
        const builder = new oc.BRep_Builder();
        this.comp = new oc.TopoDS_Compound();
        builder.MakeCompound(this.comp);
        for (const i of near) builder.Add(this.comp, this.faces[i]);
        builder.delete();
        this.inter = new oc.IntCurvesFace_ShapeIntersector();
        this.inter.Load(this.comp, 1e-6);
      }
    }
    const inter = this.inter;
    if (inter === null) return [];
    const hits: Hit[] = [];
    starts.forEach(([p, d], n) => {
      const [pnt, dir] = [new oc.gp_Pnt(p[0], p[1], p[2]), new oc.gp_Dir(d[0], d[1], d[2])];
      const lin = new oc.gp_Lin(pnt, dir);
      inter.Perform(lin, 1e-3, radius);
      lin.delete(); pnt.delete(); dir.delete();
      if (!inter.IsDone() || inter.NbPnt() === 0) return;
      let first: [number, number] | null = null; // min((w, face id)): Python's tuple order
      for (let k = 1; k <= inter.NbPnt(); k++) {
        const c: [number, number] = [inter.WParameter(k), this.topo.fid(inter.Face(k))];
        if (first === null || c[0] < first[0] || (c[0] === first[0] && c[1] < first[1])) first = c;
      }
      hits.push([round(first![0], 9), first![1], n]);
    });
    return hits.sort(byHit);
  }

  delete(): void {
    this.inter?.delete();
    this.comp?.delete();
    this.holeBox.delete();
  }
}

type Start = [Vec, Vec, number, Vec, number]; // (start, direction, cylinder face id, centre, deg)

/** Walls at holes (D-016), unnumbered: per hole, the thinnest material between its side and each face near it and,
 *  for a drill point, under its tip, when it is at most 0.250 in. Two holes that find each other give one wall
 *  (features.py hole_walls). */
export function holeWalls(oc: OC, solid: OC, faces: OC[], holeList: Hole[]): Wall[] {
  const topo = new Topology(oc, solid, faces);
  const boxes = faces.map((f) => box(oc, f));
  const out = new Map<string, Wall>(); // insertion order, as a Python dict (a smaller thickness replaces in place)
  const holeOf = new Map<number, string>();
  for (const h of holeList) for (const f of h.faces) holeOf.set(f, h.id);
  /** hole_of.get(fid, fid), as a key that keeps a hole id and a face id apart. */
  const otherOf = (fid: number) => (holeOf.has(fid) ? `h:${holeOf.get(fid)}` : `f:${fid}`);

  const add = (own: number, found: [number, number, number], holeId: string, where: string) => {
    // Between two holes the key is the pair of holes, so split hole faces still give one wall.
    const other = holeOf.get(found[0]);
    const key = other ? JSON.stringify(["holes", ...[holeId, other].sort()]) : JSON.stringify([own, found[0]].sort(byNumber));
    const prev = out.get(key);
    if (prev === undefined || found[1] < prev.dims_mm.thickness) {
      out.set(key, { kind: "wall", faces: [own, found[0]].sort(byNumber), axis: null, open_dirs: [], open_vectors: [],
        dims_mm: { thickness: found[1] }, hole: holeId, at: where });
    }
  };

  try {
    for (const h of holeList) {
      const own = new Set(h.faces);
      const rays = new NearRays(oc, faces, boxes, topo, own);
      try {
        const cyls = h.faces.map((f) => cylinder(topo, f, true)).filter((c): c is Cyl => c !== null);
        if (cyls.length) {
          const [x, y] = refFrame(cyls[0].axis);
          const lo = cyls.reduce((m, c) => (c.lo < m ? c.lo : m), Infinity);
          const hi = cyls.reduce((m, c) => (c.hi > m ? c.hi : m), -Infinity);
          const ray = (c: Cyl, centre: Vec, deg: number): Start => {
            const ang = radians(deg);
            const d: Vec = [0, 1, 2].map((i) => Math.cos(ang) * x[i] + Math.sin(ang) * y[i]) as Vec;
            const r = c.radius + c.slope * dot(centre, c.axis); // a tapered hole's radius changes along it
            return [[0, 1, 2].map((i) => centre[i] + r * d[i]) as Vec, d, c.id, centre, deg];
          };
          const starts: Start[] = [];
          const heights = Math.min(SIDE_HEIGHTS_MAX, Math.max(SIDE_HEIGHTS_MIN, Math.ceil((hi - lo) / SIDE_STEP_MM)));
          for (const c of cyls) {
            for (let k = 0; k < heights; k++) {
              const t = lo + ((hi - lo) * (k + 0.5)) / heights;
              if (!(c.lo - 1e-6 <= t && t <= c.hi + 1e-6)) continue;
              const centre = [0, 1, 2].map((i) => c.origin[i] + (t - dot(c.origin, c.axis)) * c.axis[i]) as Vec;
              // a face covers only its own angles (split faces); bins are whole degrees
              for (let deg = 0; deg < 360; deg += SIDE_STEP_DEG) if (c.bins.has(deg)) starts.push(ray(c, centre, deg));
            }
          }
          // a ray counts only if it starts on its hole face, not in a gap cut through it
          const on = (rs: Start[]) => (n: number) => onFace(oc, faces[rs[n][2]], rs[n][0]);
          const keep = on(starts);
          const seen = new Set<string>();
          // The nearest hit on each other face (or other hole): every thin side, not only the thinnest (set 3).
          for (const [w, fid, n] of rays.hits(starts.map(([p, d]) => [p, d]))) {
            const other = otherOf(fid);
            if (seen.has(other) || !keep(n)) continue;
            seen.add(other);
            let [found, rs]: [[number, number, number], Start[]] = [[fid, w, n], starts];
            const [, , cid, centre, deg] = starts[n];
            const c = cyls.find((cy) => cy.id === cid)!;
            const fine: Start[] = [];
            for (let k = -SIDE_STEP_DEG; k <= SIDE_STEP_DEG; k++) {
              if (c.bins.has(pyMod(deg + k, 360))) fine.push(ray(c, centre, pyMod(deg + k, 360)));
            }
            const onFine = on(fine);
            let close: [number, number, number] | null = null;
            for (const [w2, f2, m] of rays.hits(fine.map(([p, d]) => [p, d]))) {
              if (otherOf(f2) === other && onFine(m)) { close = [f2, w2, m]; break; }
            }
            if (close && close[1] < found[1]) [found, rs] = [close, fine];
            add(rs[found[2]][2], found, h.id, "side"); // the hole face the nearest ray left from
          }
        }
        let tip: [number, [number, number, number]] | null = null;
        for (const f of h.faces) {
          const surface = new oc.BRepAdaptor_Surface(faces[f], true);
          try {
            if (state(surface.GetType()) !== "GeomAbs_Cone" || !("point_mm" in h.dims_mm)) continue;
            const cone = surface.Cone();
            const apexP = cone.Apex();
            const apex = pt(apexP);
            apexP.delete(); cone.delete();
            const deeper = neg(h.axis as Vec); // a hole's axis points out of the material at its open end
            const [x, y] = refFrame(deeper);
            const starts: [Vec, Vec][] = [];
            for (const tilt of TIP_TILTS) {
              for (let k = 0; k < (tilt ? TIP_TURNS : 1); k++) {
                const [a, b] = [radians(tilt), (2 * Math.PI * k) / TIP_TURNS];
                starts.push([apex, [0, 1, 2].map((i) => Math.cos(a) * deeper[i] + Math.sin(a) * (
                  Math.cos(b) * x[i] + Math.sin(b) * y[i])) as Vec]);
              }
            }
            const found = rays.nearest(starts); // a point split into several faces is one tip: keep the nearest
            if (found && (tip === null || found[1] < tip[1][1] - 1e-9)) tip = [f, found];
          } finally {
            surface.delete();
          }
        }
        if (tip) add(tip[0], tip[1], h.id, "tip");
      } finally {
        rays.delete();
      }
    }
  } finally {
    for (const b of boxes) b.delete();
  }
  return [...out.values()];
}
