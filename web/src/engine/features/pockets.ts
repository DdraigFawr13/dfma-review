// Port of service/dfma/features.py lines 678 to 1341 (pockets and corners), `_inner_points`, `_Rays` and `_box`
// (port spec S4; `_area` goes with the walls, S5). Read it beside the Python: the same names in camelCase, the same
// order of every loop and every stack pop, so walls, corners and pockets come out in the same order. Each function takes face ids where the
// Python takes `topo.faces[k]`.
import { ANGLE_TOL, cross, dot, unit, type Vec } from "../frame";
import type { OC } from "../oc";
import { round } from "../units";
import { pickEndMill } from "../tools";
import {
  cylinder, frameDir, LINE_TOL, outwardNormal, pt, RADIUS_TOL, refFrame, sameLine, sub, Topology, uvBounds,
  vertices, type Cyl, type Frame,
} from "./holes";

const DEG = Math.PI / 180;
const scale = (k: number, a: Vec): Vec => [k * a[0], k * a[1], k * a[2]];
const neg = (a: Vec): Vec => [-a[0], -a[1], -a[2]];
const norm = (a: Vec) => Math.sqrt(dot(a, a));
const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); // math.dist
const state = (s: unknown) => String(s); // the engine's enums are strings

function gpPnt(oc: OC, p: Vec): OC {
  return new oc.gp_Pnt(p[0], p[1], p[2]);
}

/** The outward normal of a face at the point of its surface nearest p. */
function normalAt(topo: Topology, faceId: number, p: Vec): Vec {
  const oc = topo.oc;
  const face = topo.faces[faceId];
  const pnt = gpPnt(oc, p);
  const surface = oc.BRep_Tool.Surface(face);
  const proj = new oc.GeomAPI_ProjectPointOnSurf(pnt, surface);
  const { U: u, V: v } = proj.LowerDistanceParameters();
  const [point, vec] = [new oc.gp_Pnt(), new oc.gp_Vec()];
  const gp = new oc.BRepGProp_Face(face, false);
  gp.Normal(u, v, point, vec);
  const out = unit([vec.X(), vec.Y(), vec.Z()]);
  gp.delete(); point.delete(); vec.delete(); proj.delete(); pnt.delete();
  return out;
}

function edgeMid(oc: OC, edge: OC): [Vec, Vec] {
  const curve = new oc.BRepAdaptor_Curve(oc.TopoDS.Edge(edge));
  const t = (curve.FirstParameter() + curve.LastParameter()) / 2;
  const [p, d] = [new oc.gp_Pnt(), new oc.gp_Vec()];
  curve.D1(t, p, d);
  const out: [Vec, Vec] = [pt(p), unit([d.X(), d.Y(), d.Z()])];
  p.delete(); d.delete(); curve.delete();
  return out;
}

export const INTO_STEPS = [0.05, 0.01, 0.002]; // mm; D-018 round 3: a sliver of floor left between two cuts is under 0.05 wide

/** The face's state at a 3D point (BRepClass_FaceClassifier with pythonocc's defaults). */
function faceState(oc: OC, face: OC, q: Vec): string {
  const pnt = gpPnt(oc, q);
  const c = new oc.BRepClass_FaceClassifier(oc.TopoDS.Face(face), pnt, 1e-6, false, 0.1);
  const s = state(c.State());
  c.delete(); pnt.delete();
  return s;
}

/** The direction from a point on a face's edge into the face (perpendicular to the edge). */
function into(oc: OC, face: OC, p: Vec, n: Vec, e: Vec): Vec | null {
  const d = unit(cross(n, e));
  for (const step of INTO_STEPS) {
    for (const s of [1, -1]) {
      const q: Vec = [p[0] + s * step * d[0], p[1] + s * step * d[1], p[2] + s * step * d[2]];
      if (faceState(oc, face, q) === "TopAbs_IN") return scale(s, d);
    }
  }
  return null;
}

/** The edge between faces a and b is concave: the material angle there is under 180 deg. Moving from the edge into
 *  face a goes along face b's outward normal (into the air on b's side). */
function concave(topo: Topology, a: number, b: number, edge: OC): boolean {
  const [p, e] = edgeMid(topo.oc, edge);
  const t = into(topo.oc, topo.faces[a], p, normalAt(topo, a, p), e);
  return t !== null && dot(normalAt(topo, b, p), t) > Math.sin(ANGLE_TOL);
}

function planeNormal(topo: Topology, faceId: number): Vec | null {
  if (topo.type(faceId) !== "GeomAbs_Plane") return null;
  return outwardNormal(topo.oc, topo.faces[faceId])[1];
}

const axisDir = (ax: OC): Vec => {
  const d = ax.Direction();
  return [d.X(), d.Y(), d.Z()];
};

export const DRAFT_MAX_DEG = 15.0; // D-018 bull-nose/draft round: a pocket wall may lean outward (open upward) this far

/** "plane", "cylinder" or "cone" for a pocket wall round the floor normal n: a cylinder on an axis along n (0.5 deg),
 *  or a plane or a cone on such an axis whose face leans outward by up to DRAFT_MAX_DEG (a drafted wall; a cone is a
 *  drafted round corner or round wall). A face leaning the other way (an undercut) or further is not a wall. */
function wallKind(topo: Topology, faceId: number, n: Vec): string | null {
  const surface = topo.surface(faceId);
  const kind = topo.type(faceId);
  if (kind === "GeomAbs_Cylinder") return Math.abs(dot(axisDir(surface.Cylinder().Axis()), n)) >= Math.cos(ANGLE_TOL) ? "cylinder" : null;
  if (kind === "GeomAbs_Cone") {
    if (Math.abs(dot(axisDir(surface.Cone().Axis()), n)) < Math.cos(ANGLE_TOL)) return null;
  } else if (kind !== "GeomAbs_Plane") return null;
  const lean = dot(outwardNormal(topo.oc, topo.faces[faceId])[1], n);
  if (-Math.sin(ANGLE_TOL) <= lean && lean <= Math.sin(DRAFT_MAX_DEG * DEG)) return kind === "GeomAbs_Plane" ? "plane" : "cone";
  return null;
}

function wireEdges(oc: OC, wire: OC): OC[] {
  const out: OC[] = [];
  const exp = new oc.TopExp_Explorer(wire, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
  for (; exp.More(); exp.Next()) out.push(exp.Current());
  exp.delete();
  return out;
}

function edgeNeighbour(topo: Topology, faceId: number, edge: OC): number | null {
  const idx = topo.edgeFaces.FindIndex(edge);
  if (!idx) return null;
  const list = new topo.oc.NCollection_List_TopoDS_Shape(topo.edgeFaces.FindFromIndex(idx));
  let found: number | null = null;
  while (list.Size()) {
    const oid = topo.fid(list.First());
    list.RemoveFirst();
    if (oid !== faceId) {
      found = oid;
      break;
    }
  }
  list.delete();
  return found;
}

export const BREAK_STEP = 0.01; // mm: how far past a floor edge, and below the floor, the enclosure probe starts

/** Ids of the faces on a shell other than the solid's outer one: a void sealed inside the part. */
function sealedFaces(oc: OC, solid: OC, faces: OC[]): Set<number> {
  const outer = oc.BRepClass3d.OuterShell(oc.TopoDS.Solid(solid));
  const out = new Set<number>();
  const exp = new oc.TopExp_Explorer(solid, oc.TopAbs_ShapeEnum.TopAbs_SHELL);
  for (; exp.More(); exp.Next()) {
    const shell = exp.Current();
    if (shell.IsSame(outer)) continue;
    const fexp = new oc.TopExp_Explorer(shell, oc.TopAbs_ShapeEnum.TopAbs_FACE);
    for (; fexp.More(); fexp.Next()) faces.forEach((f, i) => { if (f.IsSame(fexp.Current())) out.add(i); });
    fexp.delete();
  }
  exp.delete();
  return out;
}

/** Rays cast through one solid; the intersector is loaded once per analysis. */
export class Rays {
  private readonly inter: OC;

  constructor(readonly oc: OC, solid: OC) {
    this.inter = new oc.IntCurvesFace_ShapeIntersector();
    this.inter.Load(solid, 1e-6);
  }

  /** The face a ray from `start` along `direction` meets first beyond 1e-4 mm, and the distance. */
  firstHit(start: Vec, direction: Vec): [OC | null, number] {
    const oc = this.oc;
    const [pnt, dir] = [gpPnt(oc, start), new oc.gp_Dir(direction[0], direction[1], direction[2])];
    const lin = new oc.gp_Lin(pnt, dir);
    this.inter.Perform(lin, 1e-4, 1e9);
    let [best, bestW]: [OC | null, number] = [null, Infinity];
    if (this.inter.IsDone()) {
      for (let i = 1; i <= this.inter.NbPnt(); i++) {
        const w = this.inter.WParameter(i);
        if (w < bestW) [best, bestW] = [this.inter.Face(i), w];
      }
    }
    lin.delete(); pnt.delete(); dir.delete();
    return [best, bestW];
  }
}

/** Is the gap past a floor edge inside the part? Loaded once per analysis, only when needed. */
class Enclosure {
  rays: Rays | null = null;
  private classifier: OC = null;
  readonly sealed: Set<number>;

  constructor(readonly topo: Topology) {
    this.sealed = sealedFaces(topo.oc, topo.solid, topo.faces);
  }

  /** A floor edge with no wall (D-018 round 1): another feature cuts the pocket there. Start just past the edge and
   *  just below the floor, in the air of that feature, and cast rays in the floor's plane: outward, 45 deg either
   *  side, and both ways along the edge. Every one must meet the part again, so the gap is closed all round. */
  inside(floor: number, n: Vec, edge: OC): boolean {
    const oc = this.topo.oc;
    const [p, e] = edgeMid(oc, edge);
    const intoDir = into(oc, this.topo.faces[floor], p, n, e);
    if (intoDir === null) return false;
    const out = neg(intoDir);
    const start: Vec = [0, 1, 2].map((i) => p[i] + BREAK_STEP * out[i] - BREAK_STEP * n[i]) as Vec;
    if (this.classifier === null) this.classifier = new oc.BRepClass3d_SolidClassifier(this.topo.solid);
    const pnt = gpPnt(oc, start);
    this.classifier.Perform(pnt, 1e-6);
    pnt.delete();
    if (state(this.classifier.State()) !== "TopAbs_OUT") return false; // material past the edge: a slope or chamfer, not a cut
    if (this.rays === null) this.rays = new Rays(oc, this.topo.solid);
    const [c, s] = [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)];
    const dirs: Vec[] = [out, e, neg(e), [0, 1, 2].map((i) => c * out[i] + s * e[i]) as Vec,
      [0, 1, 2].map((i) => c * out[i] - s * e[i]) as Vec];
    return dirs.every((d) => this.rays!.firstHit(start, unit(d))[0] !== null);
  }
}

/** Faces a and b meet tangentially at the middle of the edge (normals within 0.5 deg). */
function smooth(topo: Topology, a: number, b: number, edge: OC): boolean {
  const [p] = edgeMid(topo.oc, edge);
  return dot(normalAt(topo, a, p), normalAt(topo, b, p)) >= Math.cos(ANGLE_TOL);
}

/** A face that can round a floor into its walls: a cylinder lying along the floor (axis square to n), a torus or
 *  surface of revolution on an axis along n (round a corner), or a sphere (a ball end's corner). */
function isBlend(topo: Topology, faceId: number, n: Vec): boolean {
  const s = topo.surface(faceId);
  const kind = topo.type(faceId);
  if (kind === "GeomAbs_Cylinder") return Math.abs(dot(axisDir(s.Cylinder().Axis()), n)) <= Math.sin(ANGLE_TOL);
  if (kind === "GeomAbs_Torus" || kind === "GeomAbs_SurfaceOfRevolution") { // CAD writes a near-ball corner as the latter
    const d = axisDir(kind === "GeomAbs_Torus" ? s.Torus().Axis() : s.AxeOfRevolution());
    return Math.abs(dot(d, n)) >= Math.cos(ANGLE_TOL);
  }
  return kind === "GeomAbs_Sphere";
}

/** The fillet faces between a floor and its walls, and the walls past them; null when `nb` is no such fillet or
 *  leads to no wall (features.py _blend_walls). */
function blendWalls(topo: Topology, floor: number, nb: number, n: Vec, edge: OC): [Set<number>, number[]] | null {
  if (!isBlend(topo, nb, n) || !smooth(topo, floor, nb, edge)) return null;
  const blend = new Set([nb]);
  const todo = [nb];
  const walls: number[] = [];
  let tangent = false;
  while (todo.length) {
    const cur = todo.pop()!;
    for (const [k, edges] of topo.neighbours(cur)) {
      if (k === floor || blend.has(k)) continue;
      const sm = edges.some((e) => smooth(topo, cur, k, e));
      if (wallKind(topo, k, n)) {
        if (!walls.includes(k)) walls.push(k);
        tangent = tangent || sm;
      } else if (isBlend(topo, k, n)) { // tangent, or two floor fillets meeting in a sharp corner
        blend.add(k);
        todo.push(k);
      } else return null; // past the fillet lies no wall: the round bottom of a U-slot seen from its side
    }
  }
  const [p] = edgeMid(topo.oc, edge);
  // The fillet must curve up from the floor and run into a wall tangentially, as a cutter's corner leaves it.
  if (!tangent || Math.max(...topo.facePoints(nb).map((q) => dot(q, n))) <= dot(p, n) + 1e-6) return null;
  return [blend, walls];
}

type FloorEdge = OC | [number, OC];

/** The walls of a pocket on this floor, or null (features.py _pocket_walls). */
function pocketWalls(topo: Topology, floor: number, n: Vec, edges: FloorEdge[], enclosure: Enclosure,
  blends: Set<number>, cuts: OC[] | null): number[] | null {
  const walls: number[] = [];
  let cut = false;
  for (const item of edges) { // an edge of the floor, or (floor piece, edge) for a floor in several pieces
    const [piece, edge] = Array.isArray(item) ? item : [floor, item];
    const nb = edgeNeighbour(topo, piece, edge);
    let beyond: number[] = [];
    let fill: [Set<number>, number[]] | null = null;
    if (nb !== null && wallKind(topo, nb, n) && concave(topo, piece, nb, edge)) {
      if (!walls.includes(nb)) walls.push(nb);
    } else if (nb !== null && (beyond = floorChamferWalls(topo, piece, nb, n, edge)).length) {
      for (const w of beyond) if (!walls.includes(w)) walls.push(w); // extend() with a generator: dedupes as it goes
    } else if (nb !== null && (fill = blendWalls(topo, piece, nb, n, edge))) {
      for (const b of fill[0]) blends.add(b);
      for (const w of fill[1]) if (!walls.includes(w)) walls.push(w);
    } else if (nb !== null && enclosure.inside(piece, n, edge)) {
      cut = true;
      if (cuts !== null) cuts.push(edge);
    } else return null;
  }
  if (cut && walls.length < 2) return null;
  if (walls.some((w) => knifeEdge(topo, floor, w, walls))) return null;
  return walls;
}

export const REACH_STEP = 1e-3; // mm: a reach ray starts this far off the floor

/** A cutter can reach the floor along its axis: a ray from some point inside a floor piece, along the outward
 *  normal, leaves the part (features.py _reachable). */
function reachable(topo: Topology, pieces: number[], n: Vec, rays: Rays): boolean {
  for (const k of pieces) {
    for (const p of innerPoints(topo.oc, topo.faces[k], 5)) {
      const start: Vec = [p[0] + REACH_STEP * n[0], p[1] + REACH_STEP * n[1], p[2] + REACH_STEP * n[2]];
      if (rays.firstHit(start, n)[0] === null) return true;
    }
  }
  return false;
}

export const OVER_TOL = 0.01; // mm

/** A test: does a face lie over the floor: wholly above its plane, and within the floor pieces' box in that plane. */
function overFloor(topo: Topology, pieces: number[], n: Vec): (faceId: number) => boolean {
  const [a, b] = refFrame(n);
  const pts = pieces.flatMap((k) => topo.facePoints(k));
  const [us, vs] = [pts.map((p) => dot(p, a)), pts.map((p) => dot(p, b))];
  const [loU, hiU, loV, hiV] = [Math.min(...us) - OVER_TOL, Math.max(...us) + OVER_TOL, Math.min(...vs) - OVER_TOL, Math.max(...vs) + OVER_TOL];
  const floorH = Math.max(...pts.map((p) => dot(p, n)));
  return (faceId) => topo.facePoints(faceId).every((p) => {
    const [u, v] = [dot(p, a), dot(p, b)];
    return loU <= u && u <= hiU && loV <= v && v <= hiV && dot(p, n) > floorH + OVER_TOL;
  });
}

/** The undercut of a pocket (set 2): ceilings and the walls added above them (features.py _undercut). */
function undercut(topo: Topology, walls: number[], n: Vec, skip: Set<number>, over: (f: number) => boolean): [number[], number[]] {
  const ceilings: number[] = [];
  const added: number[] = [];
  let todo = [...walls];
  while (todo.length) {
    const w = todo.pop()!;
    for (const [k, edges] of topo.neighbours(w)) {
      if (skip.has(k) || ceilings.includes(k) || walls.includes(k) || added.includes(k)) continue;
      const m = planeNormal(topo, k);
      if (m !== null && dot(m, n) <= -Math.cos(ANGLE_TOL) && over(k) && edges.some((e) => concave(topo, w, k, e))) {
        ceilings.push(k);
        for (const [j, es] of topo.neighbours(k)) {
          if (skip.has(j) || walls.includes(j) || added.includes(j) || ceilings.includes(j)) continue;
          if (wallKind(topo, j, n) && over(j) && !es.some((e) => concave(topo, k, j, e))) {
            added.push(j);
            todo.push(j);
          }
        }
      }
    }
  }
  if (ceilings.length) { // the same wall in two faces, one each side of the ceiling's height (a closed T-slot's end)
    todo = [...walls, ...added];
    while (todo.length) {
      const w = todo.pop()!;
      for (const [k, edges] of topo.neighbours(w)) {
        if (!skip.has(k) && !walls.includes(k) && !added.includes(k) && !ceilings.includes(k)
          && wallKind(topo, k, n) && over(k) && edges.some((e) => smooth(topo, w, k, e))) {
          added.push(k);
          todo.push(k);
        }
      }
    }
  }
  return [ceilings, added];
}

/** BRepExtrema_DistShapeShape(a, b).Value(), and IsDone(). */
function distShapes(oc: OC, a: OC, b: OC): [number, boolean] {
  const d = new oc.BRepExtrema_DistShapeShape(a, b, oc.Extrema_ExtFlag.Extrema_ExtFlag_MINMAX, oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad, new oc.Message_ProgressRange());
  const out: [number, boolean] = [d.IsDone() ? d.Value() : NaN, d.IsDone()];
  d.delete();
  return out;
}

/** How far an undercut reaches under its lip (D-021), in mm (features.py _overhang). */
function overhang(topo: Topology, ceilings: number[], walls: number[], upper: number[]): number {
  const oc = topo.oc;
  let best = 0.0;
  for (const c of ceilings) {
    const nbs = topo.neighbours(c);
    const below = walls.filter((w) => !upper.includes(w)).flatMap((w) => nbs.get(w) ?? []);
    const above = upper.flatMap((w) => nbs.get(w) ?? []);
    for (const e of below) {
      const [p] = edgeMid(oc, e);
      const pnt = gpPnt(oc, p);
      const mv = new oc.BRepBuilderAPI_MakeVertex(pnt);
      const v = mv.Vertex();
      // Python's .Value() reads whatever the extrema hold; on an undone run pythonocc raises, which never happens here
      const d = above.length ? Math.min(...above.map((a) => distShapes(oc, v, a)[0])) : 0.0;
      best = Math.max(best, d);
      mv.delete(); pnt.delete();
    }
  }
  return best;
}

export const KNIFE_DEG = 1.0; // deg: material angle under this at a wall's edge is no material (D-018 round 6)

/** The wall's material runs out to nothing at a convex edge to a face outside the pocket (features.py _knife_edge). */
function knifeEdge(topo: Topology, floor: number, w: number, walls: number[]): boolean {
  for (const [k, edges] of topo.neighbours(w)) {
    if (k === floor || walls.includes(k)) continue;
    for (const e of edges) {
      const [p] = edgeMid(topo.oc, e);
      if (dot(normalAt(topo, w, p), normalAt(topo, k, p)) < -Math.cos(KNIFE_DEG * DEG) && !concave(topo, w, k, e)) return true;
    }
  }
  return false;
}

/** The walls past a chamfer between floor and wall (D-018 round 3); empty when `nb` is no such chamfer. */
function floorChamferWalls(topo: Topology, floor: number, nb: number, n: Vec, edge: OC): number[] {
  const surface = topo.surface(nb);
  if (topo.type(nb) === "GeomAbs_Cone") {
    const ax = surface.Cone().Axis();
    const [o, d] = [pt(ax.Location()), unit(pt(ax.Direction()))];
    if (Math.abs(dot(d, n)) < Math.cos(ANGLE_TOL) || !concave(topo, floor, nb, edge)) return [];
    const out: number[] = [];
    for (const [k, edges] of topo.neighbours(nb)) {
      if (k === floor || topo.type(k) !== "GeomAbs_Cylinder" || !wallKind(topo, k, n)) continue;
      const off = cross(sub(pt(topo.surface(k).Cylinder().Axis().Location()), o), d);
      if (norm(off) <= LINE_TOL && edges.some((e) => concave(topo, nb, k, e))) out.push(k);
    }
    return out;
  }
  const m = planeNormal(topo, nb);
  if (m === null || wallKind(topo, nb, n) || Math.abs(dot(m, n)) >= Math.cos(ANGLE_TOL) || !concave(topo, floor, nb, edge)) return [];
  const along = edgeMid(topo.oc, edge)[1];
  const out: number[] = [];
  for (const [k, edges] of topo.neighbours(nb)) {
    if (k !== floor && wallKind(topo, k, n)
      && edges.some((e) => concave(topo, nb, k, e) && Math.abs(dot(edgeMid(topo.oc, e)[1], along)) >= Math.cos(ANGLE_TOL))) out.push(k);
  }
  return out;
}

export const CHAMFER_MAX_TURN_DEG = 60 - ANGLE_TOL / DEG; // a regular hexagon pocket turns 60 deg at each wall

/** How long a wall runs across the floor: the widest spread of its points square to n. */
function span(topo: Topology, faceId: number, n: Vec): number {
  const pts = topo.facePoints(faceId).map((p) => sub(p, scale(dot(p, n), n)));
  let best = 0.0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) best = Math.max(best, dist(pts[i], pts[j]));
  return best;
}

/** Planar walls that cut a corner between two planar walls (D-018 rounds 3 and 5; features.py _corner_chamfers). */
function cornerChamfers(topo: Topology, walls: number[], n: Vec): Set<number> {
  const normals = new Map<number, Vec>();
  for (const w of walls) {
    const m = planeNormal(topo, w);
    if (m !== null) normals.set(w, m);
  }
  const like = new Map<number, number[]>();
  for (const [w, m] of normals) {
    const nbs = [...topo.neighbours(w).keys()].filter((k) => normals.has(k) && k !== w);
    const turns = nbs.map((k) => Math.acos(Math.max(-1.0, Math.min(1.0, dot(m, normals.get(k)!)))) / DEG);
    if (turns.length === 2 && Math.abs(turns[0] - turns[1]) <= 0.05 && turns[0] < CHAMFER_MAX_TURN_DEG) like.set(w, nbs);
  }
  const spans = new Map([...like.keys()].map((w) => [w, span(topo, w, n)]));
  return new Set([...like].filter(([w, nbs]) => nbs.every((k) => !like.has(k) || spans.get(w)! < spans.get(k)! - LINE_TOL)).map(([w]) => w));
}

function sharedEdges(topo: Topology, a: number, b: number): OC[] {
  return topo.neighbours(a).get(b) ?? [];
}

function distance(oc: OC, a: OC, b: OC): number {
  const [d, done] = distShapes(oc, a, b);
  return done ? d : Infinity;
}

function centre(oc: OC, face: OC): Vec {
  const props = new oc.GProp_GProps();
  oc.BRepGProp.SurfaceProperties(face, props, false, false);
  const c = props.CentreOfMass();
  const out = pt(c);
  c.delete(); props.delete();
  return out;
}

/** The flat faces joined to this one, edge to edge, in its plane, itself included, or null when it stands alone. */
function floorPieces(topo: Topology, fid: number, n: Vec, skip: Set<number>): number[] | null {
  const h = dot(outwardNormal(topo.oc, topo.faces[fid])[0], n);
  const group = new Set([fid]);
  const todo = [fid];
  while (todo.length) {
    const cur = todo.pop()!;
    for (const k of topo.neighbours(cur).keys()) {
      if (group.has(k) || skip.has(k)) continue;
      const m = planeNormal(topo, k);
      if (m !== null && dot(m, n) >= Math.cos(ANGLE_TOL) && Math.abs(dot(outwardNormal(topo.oc, topo.faces[k])[0], n) - h) <= 1e-4) {
        group.add(k);
        todo.push(k);
      }
    }
  }
  return group.size > 1 ? [...group].sort((a, b) => a - b) : null;
}

export const RIM_BREAK_MAX_SHARE = 0.5; // an edge break on a pocket's rim is at most half the pocket's depth tall

/** The height the pocket opens at: its walls' top, or above it the top of an edge break on its rim. */
function rimTop(topo: Topology, walls: number[], own: Set<number>, n: Vec, top: number, depth: number): number {
  let best = top;
  for (const w of walls) {
    for (const k of topo.neighbours(w).keys()) {
      if (own.has(k)) continue;
      const kind = topo.type(k);
      if (kind === "GeomAbs_Plane") {
        const c = Math.abs(dot(outwardNormal(topo.oc, topo.faces[k])[1], n));
        if (!(0.17 < c && c < 0.98)) continue; // 10 to 80 deg
      } else if (!["GeomAbs_Cone", "GeomAbs_Cylinder", "GeomAbs_Torus"].includes(kind)) continue;
      const h = topo.facePoints(k).map((p) => dot(p, n));
      const [lo, hi] = [Math.min(...h), Math.max(...h)];
      if (lo >= top - 0.01 && hi - lo <= RIM_BREAK_MAX_SHARE * depth) best = Math.max(best, hi);
    }
  }
  return best;
}

/** A face's bounding box, enlarged by 0.01 mm (features.py _box). */
export function box(oc: OC, shape: OC): OC {
  const b = new oc.Bnd_Box();
  oc.BRepBndLib.Add(shape, b, true);
  b.Enlarge(0.01);
  return b;
}

/** Python's tuple order for (gap, face id). */
const byGapThenId = (x: [number, number], y: [number, number]) => (x[0] !== y[0] ? x[0] - y[0] : x[1] - y[1]);

/** Smallest distance between two planar walls that face each other, and between a round island face and any wall or
 *  island face it does not touch (features.py _narrowest). */
function narrowest(topo: Topology, walls: number[], islands: number[] = []): number {
  const oc = topo.oc;
  const planes = walls.filter((w) => topo.type(w) === "GeomAbs_Plane")
    .map((w) => [w, outwardNormal(oc, topo.faces[w])[1], centre(oc, topo.faces[w])] as [number, Vec, Vec]);
  let best = Infinity;
  planes.forEach(([a, na, ca], i) => {
    for (const [b, nb, cb] of planes.slice(i + 1)) {
      if (dot(na, nb) > -Math.cos(ANGLE_TOL) || dot(na, sub(cb, ca)) <= 0) continue;
      best = Math.min(best, distance(oc, topo.faces[a], topo.faces[b]));
    }
  });
  const rounds = islands.filter((w) => topo.type(w) !== "GeomAbs_Plane");
  const boxes = new Map<number, OC>();
  if (rounds.length) for (const w of new Set([...walls, ...rounds])) boxes.set(w, box(oc, topo.faces[w]));
  for (const a of rounds) {
    const near = new Set(topo.neighbours(a).keys());
    // nearest boxes first, and a pair whose boxes are already farther apart than the best gap is skipped
    const pairs = walls.filter((b) => b !== a && !near.has(b)).map((b) => [boxes.get(a).Distance(boxes.get(b)), b] as [number, number]);
    for (const [gap, b] of pairs.sort(byGapThenId)) {
      if (gap >= best) break;
      const d = distance(oc, topo.faces[a], topo.faces[b]);
      if (d > 1e-6) best = Math.min(best, d);
    }
  }
  for (const b of boxes.values()) b.delete();
  return best;
}

/** Python's sorted() of 3-tuples. */
const byTuple = (p: Vec, q: Vec) => (p[0] !== q[0] ? p[0] - q[0] : p[1] !== q[1] ? p[1] - q[1] : p[2] - q[2]);

type Corner = [number[], number, number[][] | null];

/** Inside corners between the outer walls: concave fillets (split faces merged) and sharp edges (features.py _corners). */
function corners(topo: Topology, walls: number[], cyls: Map<number, Cyl>): Corner[] {
  const out: Corner[] = [];
  const seen = new Set<number>();
  const ordered = [...walls].sort((a, b) => a - b);
  for (const w of ordered) {
    const c = cyls.get(w);
    if (!c || seen.has(w)) continue;
    const group: number[] = [];
    const todo = [w];
    seen.add(w);
    while (todo.length) {
      const cur = todo.pop()!;
      group.push(cur);
      for (const nb of topo.neighbours(cur).keys()) {
        const o = cyls.get(nb);
        if (walls.includes(nb) && o && !seen.has(nb) && Math.abs(o.radius - c.radius) <= RADIUS_TOL && sameLine(o, c)) {
          seen.add(nb);
          todo.push(nb);
        }
      }
    }
    out.push([group.sort((a, b) => a - b), c.radius, null]);
  }
  // Sharp corners: any two walls meeting at a concave, non-tangent edge.
  const groupOf = new Map<number, number>();
  out.forEach(([faces], i) => faces.forEach((f) => groupOf.set(f, i)));
  ordered.forEach((a, i) => {
    for (const b of ordered.slice(i + 1)) {
      if (groupOf.has(a) && groupOf.get(b) === groupOf.get(a)) continue;
      const edges = sharedEdges(topo, a, b).filter((e) => concave(topo, a, b, e) || concave(topo, b, a, e));
      if (edges.length) {
        const ends = vertices(topo.oc, edges[0]).sort(byTuple);
        out.push([[a, b], 0.0, [[...ends[0]], [...ends[ends.length - 1]]]]);
      }
    }
  });
  return out;
}

/** Every wall is a cylinder or cone on one axis line: a groove round a core or a stepped bore, not a pocket. */
function oneAxis(topo: Topology, walls: number[]): boolean {
  const lines: [Vec, Vec][] = [];
  for (const w of walls) {
    const surface = topo.surface(w);
    let ax: OC;
    if (topo.type(w) === "GeomAbs_Cylinder") ax = surface.Cylinder().Axis();
    else if (topo.type(w) === "GeomAbs_Cone") ax = surface.Cone().Axis(); // a tapered round recess: a hole, not a pocket
    else return false;
    lines.push([pt(ax.Location()), unit(pt(ax.Direction()))]);
  }
  const [o0, d0] = lines[0];
  for (const [o, d] of lines.slice(1)) {
    const off = cross(sub(o, o0), d0);
    if (Math.abs(dot(d, d0)) < Math.cos(ANGLE_TOL) || norm(off) > LINE_TOL) return false;
  }
  return true;
}

/** (walls, reached) for a floor that has walls (features.py _floor_checks). */
function floorChecks(topo: Topology, cyls: Map<number, Cyl>, wallsIn: number[], pieces: number[], n: Vec,
  enclosure: Enclosure): [number[] | null, boolean | null] {
  if (wallsIn.every((w) => cyls.has(w)) && new Set(wallsIn.map((w) => round(cyls.get(w)!.radius, 3))).size === 1) {
    return [null, null]; // a flat-bottom hole or counterbore floor, not a pocket
  }
  if (oneAxis(topo, wallsIn)) return [null, null]; // a ring groove
  const chamfers = cornerChamfers(topo, wallsIn, n);
  const walls = wallsIn.filter((w) => !chamfers.has(w));
  if (!walls.length) return [null, null];
  if (pieces.every((k) => enclosure.sealed.has(k))) return [walls, true]; // a void sealed inside the part
  if (enclosure.rays === null) enclosure.rays = new Rays(topo.oc, topo.solid);
  return [walls, reachable(topo, pieces, n, enclosure.rays)];
}

export interface Pocket {
  kind: "pocket";
  faces: number[];
  axis: number[];
  open_dirs: string[];
  open_vectors: number[][];
  dims_mm: Record<string, number>;
}
export interface CornerFeature {
  kind: "corner";
  faces: number[];
  axis: number[];
  open_dirs: string[];
  open_vectors: number[][];
  dims_mm: Record<string, number>;
  pocket: number | string | null;
  edge_mm?: number[][];
}

function outerWire(oc: OC, face: OC): OC {
  return oc.BRepTools.OuterWire(oc.TopoDS.Face(face));
}

/** Closed pockets and their inside corners. Returns [pockets, corners], unnumbered (features.py pockets). */
export function pockets(oc: OC, solid: OC, faces: OC[], frame: Frame, holeFaces: Set<number>): [Pocket[], CornerFeature[]] {
  const topo = new Topology(oc, solid, faces);
  const cyls = new Map<number, Cyl>();
  faces.forEach((_, i) => {
    const c = cylinder(topo, i);
    if (c) cyls.set(i, c);
  });
  const foundP: Pocket[] = [];
  const foundC: CornerFeature[] = [];
  const enclosure = new Enclosure(topo);
  faces.forEach((face, fid) => {
    if (holeFaces.has(fid)) return;
    const n = planeNormal(topo, fid);
    if (n === null) return;
    let outerEdges: FloorEdge[] = wireEdges(oc, outerWire(oc, face));
    const blends = new Set<number>();
    let pieces = [fid];
    let cuts: OC[] = [];
    let walls = pocketWalls(topo, fid, n, outerEdges, enclosure, blends, cuts);
    let reached: boolean | null = null;
    const alone = walls;
    if (walls && walls.length) [walls, reached] = floorChecks(topo, cyls, walls, pieces, n, enclosure);
    let group: number[] | null = null;
    if ((!(alone && alone.length) || reached === false) && (group = floorPieces(topo, fid, n, holeFaces)) && Math.min(...group) === fid) {
      // A floor in several flat pieces: its outline is the pieces' edges that no other piece shares.
      pieces = group;
      const g = group;
      outerEdges = g.flatMap((k) => wireEdges(oc, outerWire(oc, faces[k])).filter((e) => !g.includes(edgeNeighbour(topo, k, e) as number))
        .map((e) => [k, e] as [number, OC]));
      cuts = [];
      walls = pocketWalls(topo, fid, n, outerEdges, enclosure, blends, cuts);
      if (walls && walls.length) [walls, reached] = floorChecks(topo, cyls, walls, pieces, n, enclosure);
    }
    if (!(walls && walls.length) || !reached) return;
    const sealed = pieces.every((k) => enclosure.sealed.has(k));
    const [ceilings, upper] = sealed ? [[], []] as [number[], number[]]
      : undercut(topo, walls, n, new Set([...pieces, ...holeFaces]), overFloor(topo, pieces, n));
    walls = [...walls, ...upper];
    const islands: number[] = [];
    const rim = outerEdges.map((e) => (Array.isArray(e) ? e[1] : e));
    for (const piece of pieces) {
      const exp = new oc.TopExp_Explorer(faces[piece], oc.TopAbs_ShapeEnum.TopAbs_EDGE);
      for (; exp.More(); exp.Next()) {
        const edge = exp.Current();
        if (rim.some((o) => edge.IsSame(o))) continue;
        const nb = edgeNeighbour(topo, piece, edge);
        if (nb === null || pieces.includes(nb)) continue;
        let fill: [Set<number>, number[]] | null = null;
        if (!walls.includes(nb) && !islands.includes(nb) && wallKind(topo, nb, n) && concave(topo, piece, nb, edge)) {
          islands.push(nb);
        } else if (!blends.has(nb) && (fill = blendWalls(topo, piece, nb, n, edge))) {
          for (const b of fill[0]) blends.add(b); // an island rounded into the floor
          for (const w of fill[1]) if (!walls.includes(w) && !islands.includes(w)) islands.push(w);
        }
      }
      exp.delete();
    }
    const floorH = dot(outwardNormal(oc, face)[0], n);
    const top = Math.max(...walls.flatMap((w) => topo.facePoints(w).map((p) => dot(p, n))));
    const own = new Set([...pieces, ...walls, ...islands, ...blends, ...ceilings]);
    const depth = rimTop(topo, walls, own, n, top, top - floorH) - floorH;
    const found = corners(topo, walls, cyls);
    const minR = found.length ? Math.min(...found.map(([, r]) => r)) : Infinity;
    const width = narrowest(topo, [...walls, ...islands], islands);
    const [tool, undersized] = pickEndMill(minR, width);
    const pocketFaces = [...own].sort((a, b) => a - b);
    const d = frameDir(n, frame);
    const dims: Record<string, number> = { depth, min_corner_radius: minR === Infinity ? 0.0 : minR, end_mill_mm: tool, undersized: Number(undersized) };
    if (width !== Infinity) dims.narrowest_width = width; // no two walls face each other: no width limit, and no key
    // An undercut (set 2, D-021): how far it reaches under the lip, only with walls all round.
    if (ceilings.length && !cuts.length) dims.undercut_mm = overhang(topo, ceilings, walls, upper);
    foundP.push({ kind: "pocket", faces: pocketFaces, axis: [...n], open_dirs: d ? [d] : [], open_vectors: [[...n]], dims_mm: dims });
    for (const [cfaces, r, edge] of found) {
      const [ctool] = pickEndMill(r, width);
      const corner: CornerFeature = { kind: "corner", faces: cfaces, axis: [...n], open_dirs: [], open_vectors: [],
        dims_mm: { radius: r, depth, end_mill_mm: ctool },
        pocket: Math.min(...pocketFaces) }; // its pocket's lowest face; linkCorners makes it the pocket's id
      if (edge) corner.edge_mm = edge; // a sharp corner has no face of its own: the viewer draws this edge
      foundC.push(corner);
    }
  });
  return [foundP, foundC];
}

/** Each corner's `pocket`: the id of the pocket it sits in (D-049). Run after both are numbered. */
export function linkCorners(pocketList: { id: string; faces: number[] }[], cornerList: { pocket: number | string | null }[]): void {
  const byFace = new Map(pocketList.map((p) => [Math.min(...p.faces), p.id]));
  for (const c of cornerList) c.pocket = byFace.get(c.pocket as number) ?? null;
}

/** Points inside a shape's faces: the centroids of their mesh triangles (largest first, at most 24), then a grid x
 *  grid sample of each face's UV box kept where it lies inside the face (features.py _inner_points). */
export function innerPoints(oc: OC, shape: OC, grid = 9): Vec[] {
  const mesher = new oc.BRepMesh_IncrementalMesh(shape, 0.5, false, 0.5, true);
  mesher.delete();
  const centroids: [number, Vec][] = [];
  const samples: Vec[] = [];
  const exp = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  for (; exp.More(); exp.Next()) {
    const face = oc.TopoDS.Face(exp.Current());
    const location = new oc.TopLoc_Location();
    const tri = oc.BRep_Tool.Triangulation(face, location, 0);
    if (tri && !(tri.IsNull?.() ?? false)) {
      for (let i = 1; i <= tri.NbTriangles(); i++) {
        const t = tri.Triangle(i).Get();
        const [a, b, c] = [t.theN1, t.theN2, t.theN3].map((k: number) => {
          const p = tri.Node(k);
          const v = pt(p);
          p.delete?.();
          return v;
        }) as Vec[];
        const x = cross(sub(b, a), sub(c, a));
        const area = 0.5 * Math.sqrt(dot(x, x));
        centroids.push([-round(area, 6), [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]]);
      }
    }
    location.delete();
    const [umin, umax, vmin, vmax] = uvBounds(oc, face);
    const surface = new oc.BRepAdaptor_Surface(face, true);
    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        const u = umin + ((umax - umin) * (i + 0.5)) / grid;
        const v = vmin + ((vmax - vmin) * (j + 0.5)) / grid;
        const p2 = new oc.gp_Pnt2d(u, v);
        const cls = new oc.BRepClass_FaceClassifier(face, p2, 1e-6, false, 0.1);
        if (state(cls.State()) === "TopAbs_IN") {
          const p = surface.Value(u, v);
          samples.push(pt(p));
          p.delete();
        }
        cls.delete(); p2.delete();
      }
    }
    surface.delete();
  }
  exp.delete();
  centroids.sort((p, q) => (p[0] !== q[0] ? p[0] - q[0] : byTuple(p[1], q[1])));
  return [...centroids.slice(0, 24).map(([, p]) => p), ...samples]; // at most 24 centroids, then the grid
}

