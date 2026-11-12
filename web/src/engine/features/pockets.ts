// Port of service/dfma/features.py lines 678 to 1341 (pockets and corners), `_inner_points`, `_Rays` and `_box`
// (port spec S4; `_area` is in walls.ts, S5). Read it beside the Python: the same names in camelCase, the same
// order of every loop and every stack pop, so walls, corners and pockets come out in the same order. Each function takes face ids where the
// Python takes `topo.faces[k]`.
import { ANGLE_TOL, cross, dot, unit, type Vec } from "../frame";
import type { OC } from "../oc";
import { round } from "../units";
import { pickEndMill } from "../tools";
import { ORDER } from "../plan";
import {
  cylinder, frameDir, LINE_TOL, outwardNormal, pt, RADIUS_TOL, refFrame, sameLine, sub, Topology, uvBounds,
  vertices, type Cyl, type Frame,
} from "./holes";

const degrees = (rad: number) => rad * (180 / Math.PI); // math.degrees: x * (180 / pi)
const radians = (deg: number) => deg * (Math.PI / 180); // math.radians: x * (pi / 180)
/** max() and min() of a list, without spreading it into arguments (a spread of 100k+ values throws in V8). */
const maxOf = (xs: number[]) => xs.reduce((a, b) => (b > a ? b : a), -Infinity);
const minOf = (xs: number[]) => xs.reduce((a, b) => (b < a ? b : a), Infinity);
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

function edgeEnds(oc: OC, edge: OC): [Vec, Vec] {
  const curve = new oc.BRepAdaptor_Curve(oc.TopoDS.Edge(edge));
  const [a, b] = [curve.Value(curve.FirstParameter()), curve.Value(curve.LastParameter())];
  const out: [Vec, Vec] = [pt(a), pt(b)];
  a.delete(); b.delete(); curve.delete();
  return out;
}

/** A floor in several flat pieces gives its outline edges piece by piece; put them end to end round the outline, so
 *  the walls come in the order they stand (the runs of an open floor, steps and slots S2). An edge that joins nothing
 *  keeps its place after the chain. */
function chainEdges(oc: OC, items: [number, OC][]): [number, OC][] {
  if (items.length < 3) return items;
  const ends = items.map(([, e]) => edgeEnds(oc, e));
  const near = (p: Vec, q: Vec) => norm(sub(p, q)) <= 1e-4;
  const used = new Set([0]);
  const out = [items[0]];
  let tail = ends[0][1];
  for (let found = true; found && used.size < items.length;) {
    found = false;
    for (let i = 0; i < items.length && !found; i++) {
      if (used.has(i)) continue;
      if (near(ends[i][0], tail)) tail = ends[i][1];
      else if (near(ends[i][1], tail)) tail = ends[i][0];
      else continue;
      used.add(i); out.push(items[i]); found = true;
    }
  }
  return [...out, ...items.filter((_, i) => !used.has(i))];
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
  if (-Math.sin(ANGLE_TOL) <= lean && lean <= Math.sin(radians(DRAFT_MAX_DEG))) return kind === "GeomAbs_Plane" ? "plane" : "cone";
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
    for (; fexp.More(); fexp.Next()) {
      const cur = fexp.Current();
      faces.forEach((f, i) => { if (f.IsSame(cur)) out.add(i); });
    }
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
    return this.gap(floor, n, edge) === "closed";
  }

  /** What lies past a floor edge with no wall: "closed" (inside(): another feature's air, closed all round), "open"
   *  (air whose rays escape the part: a step's or slot's open edge) or "material" (a slope or chamfer past the edge,
   *  or no direction into the floor). */
  gap(floor: number, n: Vec, edge: OC): "closed" | "open" | "material" {
    const oc = this.topo.oc;
    const [p, e] = edgeMid(oc, edge);
    const intoDir = into(oc, this.topo.faces[floor], p, n, e);
    if (intoDir === null) { whyAdd(floor, "NOINTO"); return "material"; }
    const out = neg(intoDir);
    const start: Vec = [0, 1, 2].map((i) => p[i] + BREAK_STEP * out[i] - BREAK_STEP * n[i]) as Vec;
    if (this.classifier === null) this.classifier = new oc.BRepClass3d_SolidClassifier(this.topo.solid);
    const pnt = gpPnt(oc, start);
    this.classifier.Perform(pnt, 1e-6);
    pnt.delete();
    if (state(this.classifier.State()) !== "TopAbs_OUT") return "material"; // material past the edge: a slope or chamfer, not a cut
    if (this.rays === null) this.rays = new Rays(oc, this.topo.solid);
    const [c, s] = [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)];
    const dirs: Vec[] = [out, e, neg(e), [0, 1, 2].map((i) => c * out[i] + s * e[i]) as Vec,
      [0, 1, 2].map((i) => c * out[i] - s * e[i]) as Vec];
    return dirs.every((d) => this.rays!.firstHit(start, unit(d))[0] !== null) ? "closed" : "open";
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
function blendWalls(topo: Topology, floor: number, nb: number, n: Vec, edge: OC, open = false): [Set<number>, number[]] | null {
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
      // Open floors (steps and slots): a face the fillet meets at an outside (convex) edge is where the fillet runs out
      // of the part, as at a step's open end, not a wall past it.
      if (open && !sm && !edges.some((e) => concave(topo, cur, k, e) || concave(topo, k, cur, e))) continue;
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
  if (!tangent || maxOf(topo.facePoints(nb).map((q) => dot(q, n))) <= dot(p, n) + 1e-6) return null;
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

/** One floor edge in an open floor's outline, in wire order: a wall edge (the walls it leads to), an open edge (no wall,
 *  and the gap past it is open to the outside) or a cut edge (another feature cuts the floor there). */
export interface TraceEdge { kind: "wall" | "open" | "cut"; walls: number[]; edge: OC; piece: number }

export const CHAMFER_TURN_MAX_DEG = 60; // a chamfer turns under this from a face it breaks; a wall meets its top at about 90 deg
export const CHAMFER_NARROW_SHARE = 0.5; // a chamfer is under half as wide across the floor normal as it runs along it

/** A flat face that breaks an edge between two other faces (D-093): narrow (its spread across n under
 *  CHAMFER_NARROW_SHARE of its run along n), and meeting a face other than `floor` at an outside (convex) edge, turning
 *  between 0.5 and CHAMFER_TURN_MAX_DEG deg from it. A step's wall, drafted up to 15 deg, turns 75 or more at its top. */
function chamferFace(topo: Topology, k: number, floor: number, n: Vec): boolean {
  if (topo.type(k) !== "GeomAbs_Plane") return false;
  const along = topo.facePoints(k).map((p) => dot(p, n));
  if (span(topo, k, n) >= CHAMFER_NARROW_SHARE * (maxOf(along) - minOf(along))) return false;
  for (const [j, edges] of topo.neighbours(k)) {
    if (j === floor) continue;
    for (const e of edges) {
      const [p] = edgeMid(topo.oc, e);
      const turn = degrees(Math.acos(Math.max(-1, Math.min(1, dot(normalAt(topo, k, p), normalAt(topo, j, p))))));
      if (turn > degrees(ANGLE_TOL) && turn < CHAMFER_TURN_MAX_DEG && !concave(topo, k, j, e) && !concave(topo, j, k, e)) return true;
    }
  }
  return false;
}

/** The walls of an open floor (steps and slots spec, Design "Finder"), with every edge's kind in `trace`; null when an
 *  edge has no neighbour, the floor has no wall or no open edge, or a pocket test (cut with under two walls, a knife
 *  edge) fails. pocketWalls' tests in its order, but an open edge no longer ends the walk. The enclosure test runs only
 *  once a wall is found, so a face with no wall (most outside faces) costs no rays. */
function openWalls(topo: Topology, floor: number, n: Vec, edges: FloorEdge[], enclosure: Enclosure, blends: Set<number>,
  trace: TraceEdge[]): number[] | null {
  const walls: number[] = [];
  const rest: [number, TraceEdge][] = [];
  for (const item of edges) {
    const [piece, edge] = Array.isArray(item) ? item : [floor, item];
    const nb = edgeNeighbour(topo, piece, edge);
    if (nb === null) { OPEN_DIAG.last = "no neighbour"; return null; }
    let beyond: number[] = [];
    let fill: [Set<number>, number[]] | null = null;
    let found: number[] | null = null;
    if (wallKind(topo, nb, n) && concave(topo, piece, nb, edge)) found = [nb];
    else if ((beyond = floorChamferWalls(topo, piece, nb, n, edge)).length) found = beyond;
    else if ((fill = blendWalls(topo, piece, nb, n, edge, true))) {
      for (const b of fill[0]) blends.add(b);
      found = fill[1];
    }
    const t: TraceEdge = { kind: found ? "wall" : "open", walls: found ?? [], edge, piece };
    trace.push(t);
    if (found) for (const w of found) { if (!walls.includes(w)) walls.push(w); }
    else rest.push([piece, t]);
  }
  if (!walls.length) { OPEN_DIAG.last = "no wall"; return null; }
  if (!rest.length) { OPEN_DIAG.last = "walls all round"; return null; }
  let cut = false;
  for (const [piece, t] of rest) {
    const gap = enclosure.gap(piece, n, t.edge);
    if (gap === "material") { OPEN_DIAG.last = "material past edge"; return null; } // a slope or rounded side past the edge: not an open edge (Terms, "Open edge")
    if (gap === "closed") {
      t.kind = "cut";
      cut = true;
    }
  }
  if (!trace.some((t) => t.kind === "open")) { OPEN_DIAG.last = "no open edge"; return null; }
  if (cut && walls.length < 2) { OPEN_DIAG.last = "cut, one wall"; return null; }
  // No knife-edge test here (round 4, D-094): a zero-thickness edge of stock where a cylinder wall meets a slot wall stops no cutter; pockets keep theirs
  return walls;
}

/** The walls in order round the floor, split wherever an open or cut edge comes between them (Terms, "Run"); with
 *  `same`, a cut between two pieces of one wall (another feature cut through it, as a pocket beside a step) does not
 *  split it. */
export function runs(trace: { kind: string; walls: number[] }[], same: (a: number, b: number) => boolean = () => false): number[][] {
  // Start at an open edge, which always ends a run, so a run is never cut where the walk wraps (audit F7, D-092);
  // with none, at a cut, and the last run joins the first when the cut between them is within one wall.
  const firstOpen = trace.findIndex((t) => t.kind === "open");
  const start = firstOpen >= 0 ? firstOpen : trace.findIndex((t) => t.kind !== "wall");
  if (start < 0) return [[...new Set(trace.flatMap((t) => t.walls))]];
  const out: number[][] = [];
  let cur: number[] = [];
  let cutAfter: number | null = null; // the last wall before a run of cut edges
  for (let i = 1; i <= trace.length; i++) {
    const t = trace[(start + i) % trace.length];
    if (t.kind === "open") {
      if (cur.length) out.push(cur);
      [cur, cutAfter] = [[], null];
    } else if (t.kind === "cut") {
      if (cur.length && cutAfter === null) cutAfter = cur[cur.length - 1];
    } else {
      if (cutAfter !== null && !t.walls.some((w) => same(cutAfter!, w))) {
        out.push(cur);
        cur = [];
      }
      cutAfter = null;
      for (const w of t.walls) if (!cur.includes(w)) cur.push(w);
    }
  }
  if (cur.length) out.push(cur);
  if (firstOpen < 0 && out.length > 1) { // closed by cuts all round: the wrap is a cut between the last run and the first
    const [last, first] = [out[out.length - 1], out[0]];
    if (first.some((w) => same(last[last.length - 1], w))) out.splice(0, 1, ...[[...new Set([...out.pop()!, ...first])]]);
  }
  return out;
}

/** Two planar faces on one plane (normals within 0.5 deg, 1e-4 mm apart). */
function coplanar(topo: Topology, a: number, b: number): boolean {
  if (topo.type(a) !== "GeomAbs_Plane" || topo.type(b) !== "GeomAbs_Plane") return false;
  const [pa, na] = outwardNormal(topo.oc, topo.faces[a]);
  const [pb, nb] = outwardNormal(topo.oc, topo.faces[b]);
  return dot(na, nb) >= Math.cos(ANGLE_TOL) && Math.abs(dot(sub(pb, pa), na)) <= 1e-4;
}

export const FACING_DEG = 2 * DRAFT_MAX_DEG; // two drafted slot walls may each lean 15 deg

/** Two planar walls face each other across the floor: their outward normals, projected on the floor plane, point at
 *  each other within FACING_DEG, and the floor lies between them (Terms, "Facing pair"). */
function facing(topo: Topology, a: number, b: number, n: Vec, floorAt: Vec): boolean {
  if (topo.type(a) !== "GeomAbs_Plane" || topo.type(b) !== "GeomAbs_Plane") return false;
  const flat = (v: Vec): Vec | null => {
    const w = sub(v, scale(dot(v, n), n));
    return norm(w) < 1e-9 ? null : unit(w);
  };
  const [pa, pb] = [flat(outwardNormal(topo.oc, topo.faces[a])[1]), flat(outwardNormal(topo.oc, topo.faces[b])[1])];
  if (pa === null || pb === null || dot(pa, pb) > -Math.cos(radians(FACING_DEG))) return false;
  const [ca, cb] = [centre(topo.oc, topo.faces[a]), centre(topo.oc, topo.faces[b])];
  return dot(pa, sub(cb, ca)) > 0 && dot(pa, sub(floorAt, ca)) > 0 && dot(pb, sub(floorAt, cb)) > 0;
}

export const STEP_ARC_MAX_DEG = 180 - FACING_DEG; // a step's walls all face one side of the floor
/** A floor whose walls are one flat face and one cylinder is a quarter-round notch (MFCAD++ circular blind step): its
 *  walls span 180 deg, which a round-ended slot (two cylinders and a flat) also does, so only this pair gets the wider
 *  limit (round 4, D-094; measured: all 5 new calls on the first set were class 21, the 19 slot calls stayed out). */
export const SECTOR_ARC_MAX_DEG = 181;
function arcLimit(topo: Topology, walls: number[]): number {
  const flat = walls.filter((w) => topo.type(w) === "GeomAbs_Plane").length;
  return walls.length === 2 && flat === 1 && topo.type(walls[0]) !== topo.type(walls[1]) ? SECTOR_ARC_MAX_DEG : STEP_ARC_MAX_DEG;
}

/** The smallest arc, in degrees, holding the outward directions of a run's walls on the floor plane: a flat wall by
 *  its normal, a round one by its normals at its vertices. An L step's walls cover 90 deg; a U (a slot's sides, or a
 *  blind slot seen from its end wall) 180; a pocket broken open at one corner, as a triangle, more. */
export function wallArc(topo: Topology, ws: number[], n: Vec): number {
  const [a, b] = refFrame(n);
  const angles: number[] = [];
  for (const w of ws) {
    const plane = topo.type(w) === "GeomAbs_Plane";
    const normals = plane ? [outwardNormal(topo.oc, topo.faces[w])[1]] : topo.facePoints(w).map((p) => normalAt(topo, w, p));
    for (const m of normals) {
      const [u, v] = [dot(m, a), dot(m, b)];
      if (Math.hypot(u, v) > 1e-9) angles.push(degrees(Math.atan2(v, u)));
    }
  }
  if (angles.length < 2) return 0;
  angles.sort((x, y) => x - y);
  let gap = angles[0] + 360 - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
  return 360 - gap;
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
  const [loU, hiU, loV, hiV] = [minOf(us) - OVER_TOL, maxOf(us) + OVER_TOL, minOf(vs) - OVER_TOL, maxOf(vs) + OVER_TOL];
  const floorH = maxOf(pts.map((p) => dot(p, n)));
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
export function distShapes(oc: OC, a: OC, b: OC): [number, boolean] {
  const range = new oc.Message_ProgressRange();
  const d = new oc.BRepExtrema_DistShapeShape(a, b, oc.Extrema_ExtFlag.Extrema_ExtFlag_MINMAX, oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad, range);
  const out: [number, boolean] = [d.IsDone() ? d.Value() : NaN, d.IsDone()];
  d.delete(); range.delete();
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
      const d = above.length ? minOf(above.map((a) => distShapes(oc, v, a)[0])) : 0.0;
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
      if (dot(normalAt(topo, w, p), normalAt(topo, k, p)) < -Math.cos(radians(KNIFE_DEG)) && !concave(topo, w, k, e)) return true;
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

export const CHAMFER_MAX_TURN_DEG = 60 - degrees(ANGLE_TOL); // a regular hexagon pocket turns 60 deg at each wall

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
    const turns = nbs.map((k) => degrees(Math.acos(Math.max(-1.0, Math.min(1.0, dot(m, normals.get(k)!))))));
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
      const [lo, hi] = [minOf(h), maxOf(h)];
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

/** A step or a slot (steps and slots spec, D-079): an open floor with its walls. `floor` is the floor's face id. */
export interface OpenFeature {
  kind: "step" | "slot";
  faces: number[];
  floor: number;
  axis: number[];
  open_dirs: string[];
  open_vectors: number[][];
  dims_mm: Record<string, number>;
  open_edges?: number;
  open_ends?: number;
  end_type?: "open" | "round" | "flat";
}

/** An open floor found in the pockets() loop, before it is classified. */
interface OpenFloor { fid: number; n: Vec; dir: string; pieces: number[]; walls: number[]; blends: Set<number>; trace: TraceEdge[] }

function outerWire(oc: OC, face: OC): OC {
  return oc.BRepTools.OuterWire(oc.TopoDS.Face(face));
}

/** Closed pockets and their inside corners, then steps and slots (steps and slots spec). Returns [pockets, corners,
 *  steps, slots, the steps' and slots' corners], unnumbered (features.py pockets, then the open floors). The open
 *  floors' corners come apart so the pockets' corners keep their numbers. */
export function pockets(oc: OC, solid: OC, faces: OC[], frame: Frame, holeFaces: Set<number>):
  [Pocket[], CornerFeature[], OpenFeature[], OpenFeature[], CornerFeature[], CornerFeature[]] {
  const topo = new Topology(oc, solid, faces);
  const cyls = new Map<number, Cyl>();
  faces.forEach((_, i) => {
    const c = cylinder(topo, i);
    if (c) cyls.set(i, c);
  });
  const foundP: Pocket[] = [];
  const foundC: CornerFeature[] = [];
  const enclosure = new Enclosure(topo);
  const openFloors: OpenFloor[] = [];
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
    if ((!(alone && alone.length) || reached === false) && (group = floorPieces(topo, fid, n, holeFaces)) && minOf(group) === fid) {
      // A floor in several flat pieces: its outline is the pieces' edges that no other piece shares.
      pieces = group;
      const g = group;
      outerEdges = g.flatMap((k) => wireEdges(oc, outerWire(oc, faces[k])).filter((e) => !g.includes(edgeNeighbour(topo, k, e) as number))
        .map((e) => [k, e] as [number, OC]));
      cuts = [];
      walls = pocketWalls(topo, fid, n, outerEdges, enclosure, blends, cuts);
      if (walls && walls.length) [walls, reached] = floorChecks(topo, cyls, walls, pieces, n, enclosure);
    }
    if (!(walls && walls.length) || !reached) {
      const open = openFloor(topo, fid, n, frame, holeFaces, enclosure);
      if (open) openFloors.push(open);
      return;
    }
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
    const top = maxOf(walls.flatMap((w) => topo.facePoints(w).map((p) => dot(p, n))));
    const own = new Set([...pieces, ...walls, ...islands, ...blends, ...ceilings]);
    const depth = rimTop(topo, walls, own, n, top, top - floorH) - floorH;
    const found = corners(topo, walls, cyls);
    const minR = found.length ? minOf(found.map(([, r]) => r)) : Infinity;
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
        pocket: minOf(pocketFaces) }; // its pocket's lowest face; linkCorners makes it the pocket's id
      if (edge) corner.edge_mm = edge; // a sharp corner has no face of its own: the viewer draws this edge
      foundC.push(corner);
    }
  });
  const pocketFaceSet = new Set(foundP.flatMap((p) => p.faces));
  const openCorners: CornerFeature[] = [];
  const slotCorners: CornerFeature[] = [];
  // A floor whose walls all meet it on an inner loop of the wall (an island in that face: a rib or boss standing on a
  // plate, seen from the boss's side) is not a step; a step's wall meets its floor on the wall's outer boundary.
  const onIsland = (o: OpenFloor) => o.walls.every((w) => {
    const outer = wireEdges(oc, outerWire(oc, faces[w]));
    const shared = o.pieces.flatMap((k) => sharedEdges(topo, k, w));
    return shared.length > 0 && shared.every((e) => !outer.some((x) => x.IsSame(e)));
  });
  const confirmed = (o: OpenFloor) => !onIsland(o);
  const [steps, slots] = classifyOpen(topo, cyls, openFloors.filter((o) => !pocketFaceSet.has(o.fid) && confirmed(o)), openCorners, slotCorners, frame, enclosure);
  return [foundP, foundC, steps, slots, openCorners, slotCorners];
}

/** The open floor on this face, or null (Terms, "Open floor"): a plane on a part-frame axis whose outline has at least
 *  one wall and one open edge, reached by a cutter along its normal. A floor in several flat pieces is taken once,
 *  from its lowest-numbered piece, with the pieces' shared outline. */
/** Grading only (D-093): with `on`, the open-floor search also records, per shape it leaves out of steps on purpose,
 *  the faces involved, so the scorer can put labelled step faces of those shapes on their own line. It never changes
 *  a result; the app leaves it off. Reset `held` before each analysis. */
export const OPEN_DIAG: { on: boolean; held: [string, number[]][]; why: Map<number, string[]>; last: string } = { on: false, held: [], why: new Map(), last: "" };
const whyAdd = (f: number, r: string) => { if (OPEN_DIAG.on) { const l = OPEN_DIAG.why.get(f) ?? []; l.push(r); OPEN_DIAG.why.set(f, l); } };

function openFloor(topo: Topology, fid: number, n: Vec, frame: Frame, holeFaces: Set<number>, enclosure: Enclosure): OpenFloor | null {
  const oc = topo.oc;
  const dir = frameDir(n, frame);
  if (dir === null) whyAdd(fid, "OFFAXIS");
  // Grading (D-093): a V-floor is two planes off the part axes meeting at a concave edge with no flat floor on a part
  // axis beside either (a notch's diagonal walls stand on one), whatever lies past their other edges
  if (dir === null && OPEN_DIAG.on) {
    const nbs = (k: number) => wireEdges(oc, outerWire(oc, topo.faces[k])).map((e) => [edgeNeighbour(topo, k, e), e] as [number | null, OC])
      .filter(([nb]) => nb !== null && nb !== k && !holeFaces.has(nb)) as [number, OC][];
    const axisFloor = (k: number) => nbs(k).some(([nb, e]) => { const nn = planeNormal(topo, nb); return nn !== null && frameDir(nn, frame) !== null && concave(topo, k, nb, e); });
    const v = nbs(fid).find(([nb, e]) => { const nn = planeNormal(topo, nb); return nn !== null && frameDir(nn, frame) === null && concave(topo, fid, nb, e); });
    if (v && !axisFloor(fid) && !axisFloor(v[0])) OPEN_DIAG.held.push(["tilted", [fid, v[0]]]);
  }
  const group = floorPieces(topo, fid, n, holeFaces);
  if (group && minOf(group) !== fid) return null;
  const pieces = group ?? [fid];
  const edges: FloorEdge[] = group
    ? chainEdges(oc, group.flatMap((k) => wireEdges(oc, outerWire(oc, topo.faces[k])).filter((e) => !group.includes(edgeNeighbour(topo, k, e) as number))
      .map((e) => [k, e] as [number, OC])))
    : wireEdges(oc, outerWire(oc, topo.faces[fid]));
  const blends = new Set<number>();
  const trace: TraceEdge[] = [];
  const walls = openWalls(topo, fid, n, edges, enclosure, blends, trace);
  if (walls === null) { whyAdd(fid, "floor: " + OPEN_DIAG.last); return null; }
  const own = () => [...pieces, ...walls, ...blends];
  if (enclosure.rays === null) enclosure.rays = new Rays(oc, topo.solid);
  if (dir === null) {
    const axisWall = walls.some((w) => topo.type(w) === "GeomAbs_Plane" && frameDir(outwardNormal(oc, topo.faces[w])[1], frame) !== null);
    if (axisWall && reachable(topo, pieces, n, enclosure.rays)) OPEN_DIAG.held.push(["tilted", own()]);
    for (const f of own()) whyAdd(f, axisWall ? "tilted floor, axis wall" : "tilted floor, no axis wall");
    return null;
  }
  // A floor no cutter reaches along its normal is no step (as pockets; D-093); grading notes one reached from a side
  if (reachable(topo, pieces, n, enclosure.rays)) return { fid, n, dir, pieces, walls, blends, trace };
  if (OPEN_DIAG.on && openVectors(topo, trace, n).some((v) => frameDir(v, frame) !== null && reachable(topo, pieces, v, enclosure.rays!))) {
    OPEN_DIAG.held.push(["side", own()]);
  }
  for (const f of own()) whyAdd(f, "floor not reached along its normal");
  return null;
}

/** The outward unit vector across each open edge, deduplicated within 0.5 deg. */
function openVectors(topo: Topology, trace: TraceEdge[], n: Vec): Vec[] {
  const out: Vec[] = [];
  for (const t of trace) {
    if (t.kind !== "open") continue;
    const [p, e] = edgeMid(topo.oc, t.edge);
    const d = into(topo.oc, topo.faces[t.piece], p, n, e);
    if (d === null) continue;
    const v = neg(d);
    if (!out.some((w) => dot(w, v) >= Math.cos(ANGLE_TOL))) out.push(v);
  }
  return out;
}

const faceKey = (faces: Iterable<number>) => [...new Set(faces)].sort((a, b) => a - b).join(",");

export const SLOT_OPEN_MIN = 0.9;
/** The share of a floor's sample points whose ray along the floor's normal leaves the part. A slot's floor is open to
 *  the sky everywhere; a rectangular passage seen from one wall has its opposite wall over part of it (steps and slots
 *  S2: 22 of 33 class 3 calls in 40 sampled parts had under 0.7; 2 of about 100 right calls under 0.9). */
function openShare(topo: Topology, pieces: number[], n: Vec): number {
  const rr = new Rays(topo.oc, topo.solid);
  let esc = 0, tot = 0;
  for (const k of pieces) for (const p of innerPoints(topo.oc, topo.faces[k], 5)) {
    tot++;
    if (rr.firstHit([p[0] + REACH_STEP * n[0], p[1] + REACH_STEP * n[1], p[2] + REACH_STEP * n[2]], n)[0] === null) esc++;
  }
  return esc / Math.max(tot, 1);
}

/** Steps and slots from the open floors (spec Design, "Classify an open floor"; Terms, "Same feature"). Slots are
 *  classified so that a slot's side wall, seen as a floor, is not called a step; S1 emits no slot. Step corners are
 *  added to `cornerOut`. */
function classifyOpen(topo: Topology, cyls: Map<number, Cyl>, floors: OpenFloor[], cornerOut: CornerFeature[], slotCornerOut: CornerFeature[], frame: Frame,
  enclosure: Enclosure): [OpenFeature[], OpenFeature[]] {
  const oc = topo.oc;
  const stepFloors: OpenFloor[] = [];
  const slotSets: Set<number>[] = [];
  const slotFloors: [OpenFloor, number[][]][] = [];
  for (const o of floors) {
    const rs = runs(o.trace, (a, b) => coplanar(topo, a, b));
    const at = centre(oc, topo.faces[o.fid]);
    const face = (a: number, b: number) => facing(topo, a, b, o.n, at);
    const pairIn = (ws: number[]) => ws.some((a, i) => ws.slice(i + 1).some((b) => face(a, b)));
    const own = new Set([...o.pieces, ...o.walls, ...o.blends]);
    const isSlot = (rs.length === 2 && rs.every((r) => r.length === 1) && face(rs[0][0], rs[1][0]))
      || (rs.length === 1 && rs[0].length >= 3 && face(rs[0][0], rs[0][rs[0].length - 1]));
    if (rs.length === 1 && !pairIn(rs[0]) && wallArc(topo, rs[0], o.n) < arcLimit(topo, rs[0])) stepFloors.push(o);
    else if (!isSlot) for (const f of own) whyAdd(f, "classify: " + (rs.length !== 1 ? `${rs.length} runs` : pairIn(rs[0]) ? "facing wall pair" : "wall arc >= 150"));
    else {
      slotSets.push(own);
      slotFloors.push([o, rs]);
      // Grading (D-093): a U of 4 flat faces, 3 walls and 1 open edge is the shape of a blind slot (MFCAD++ class 17)
      if (OPEN_DIAG.on && own.size === 4 && [...own].every((f) => topo.type(f) === "GeomAbs_Plane") && rs[0].length === 3
        && o.trace.filter((t) => t.kind === "open").length === 1 && !o.trace.some((t) => t.kind === "cut")) OPEN_DIAG.held.push(["u-slot", [...own]]);
    }
  }
  // A slot whose floor another feature breaks into strips (a channel over grooves or cross holes): each strip sees one
  // wall, so it reads as a step. Two step floors on one plane whose single walls face each other across them are that
  // slot's pieces, not steps; so is a step seen from one of those walls (round 2; UMD base1).
  const one = stepFloors.filter((o) => o.walls.length === 1 && topo.type(o.walls[0]) === "GeomAbs_Plane");
  const strips = new Set<OpenFloor>();
  for (const a of one) for (const b of one) {
    if (a === b || a.walls[0] === b.walls[0] || !coplanar(topo, a.fid, b.fid)) continue;
    if (facing(topo, a.walls[0], b.walls[0], a.n, centre(oc, topo.faces[a.fid]))) { strips.add(a); strips.add(b); }
  }
  if (strips.size) {
    const pairs = [...strips].map((o) => [o.fid, o.walls[0]]);
    const pieceOf = (o: OpenFloor) => { const f = new Set([...o.pieces, ...o.walls]); return pairs.some(([x, y]) => f.has(x) && f.has(y)); };
    for (let i = stepFloors.length - 1; i >= 0; i--) if (pieceOf(stepFloors[i])) stepFloors.splice(i, 1);
  }
  // One feature per face set; its floor the face whose direction comes first in ORDER (Terms, "Same feature").
  const bySet = new Map<string, OpenFloor>();
  const rankOf = (d: string) => ORDER.indexOf(d as (typeof ORDER)[number]);
  for (const o of stepFloors) {
    const own = [...o.pieces, ...o.walls, ...o.blends];
    if (slotSets.some((s) => own.every((f) => s.has(f)))) continue; // a slot's side wall seen as a floor
    const key = faceKey(own);
    const had = bySet.get(key);
    if (!had || rankOf(o.dir) < rankOf(had.dir)) bySet.set(key, o);
  }
  // A step whose faces all lie in a larger step's is part of it, seen from one of its walls (a wall cut in two)
  const sets = [...bySet.values()].map((o) => new Set([...o.pieces, ...o.walls, ...o.blends]));
  const kept = [...bySet.values()].filter((_, i) => !sets.some((s, j) => j !== i && s.size > sets[i].size && [...sets[i]].every((f) => s.has(f))));
  const steps: OpenFeature[] = [];
  for (const o of kept) {
    const { fid, n, pieces, blends, trace } = o;
    // A chamfer beside another wall is its own operation (D-093, edge breaks D-075), kept out of the step's faces. A
    // chamfer-shaped wall that is the step's only one stays: MFCAD++ calls such a notch a triangular blind step (20).
    const plain = o.walls.filter((w) => !chamferFace(topo, w, fid, n));
    const walls = plain.length ? plain : o.walls;
    const floorH = dot(outwardNormal(oc, topo.faces[fid])[0], n);
    const top = maxOf(walls.flatMap((w) => topo.facePoints(w).map((p) => dot(p, n))));
    const own = new Set([...pieces, ...walls, ...blends]);
    const depth = rimTop(topo, walls, own, n, top, top - floorH) - floorH;
    const found = corners(topo, walls, cyls);
    const minR = found.length ? minOf(found.map(([, r]) => r)) : Infinity;
    const [tool, undersized] = pickEndMill(minR, Infinity);
    const stepFaces = [...own].sort((a, b) => a - b);
    const dirs = [o.dir];
    if (walls.length === 1 && topo.type(walls[0]) === "GeomAbs_Plane") { // D-079: the wall's side too, when a cutter reaches it
      const m = outwardNormal(oc, topo.faces[walls[0]])[1];
      const d = frameDir(m, frame);
      if (enclosure.rays === null) enclosure.rays = new Rays(oc, topo.solid);
      if (d !== null && reachable(topo, walls, m, enclosure.rays)) dirs.push(d);
    }
    dirs.sort((a, b) => rankOf(a) - rankOf(b));
    const vectors: Vec[] = [[...n] as Vec];
    for (const out of openVectors(topo, trace, n)) if (!vectors.some((v) => dot(v, out) >= Math.cos(ANGLE_TOL))) vectors.push(out);
    steps.push({ kind: "step", faces: stepFaces, floor: fid, axis: [...n], open_dirs: dirs, open_vectors: vectors.map((v) => [...v]),
      dims_mm: { depth, length: maxOf(walls.map((w) => span(topo, w, n))), min_corner_radius: minR === Infinity ? 0.0 : minR,
        end_mill_mm: tool, undersized: Number(undersized) },
      open_edges: trace.filter((t) => t.kind === "open").length });
    for (const [cfaces, r, edge] of found) {
      const [ctool] = pickEndMill(r, Infinity);
      const corner: CornerFeature = { kind: "corner", faces: cfaces, axis: [...n], open_dirs: [], open_vectors: [],
        dims_mm: { radius: r, depth, end_mill_mm: ctool }, pocket: minOf(stepFaces) };
      if (edge) corner.edge_mm = edge;
      cornerOut.push(corner);
    }
  }
  // Slots (S2): one feature per face set, its floor the face first in ORDER (as steps)
  const slotBy = new Map<string, [OpenFloor, number[][]]>();
  for (const sf of slotFloors) {
    const key = faceKey([...sf[0].pieces, ...sf[0].walls, ...sf[0].blends]);
    const had = slotBy.get(key);
    if (!had || rankOf(sf[0].dir) < rankOf(had[0].dir)) slotBy.set(key, sf);
  }
  const slots: OpenFeature[] = [];
  for (const [o, rs] of slotBy.values()) {
    const { fid, n, pieces, blends, trace, walls } = o;
    const own = new Set([...pieces, ...walls, ...blends]);
    if (openShare(topo, pieces, n) < SLOT_OPEN_MIN) { for (const f of own) whyAdd(f, "slot: floor covered by a wall past it"); continue; }
    // The facing pair: a U's first and last wall, or the two runs of a through slot; between them the end walls
    const pair: [number, number] = rs.length === 2 ? [rs[0][0], rs[1][0]] : [rs[0][0], rs[0][rs[0].length - 1]];
    const ends = rs.length === 1 ? rs[0].slice(1, -1) : [];
    const floorH = dot(outwardNormal(oc, topo.faces[fid])[0], n);
    const top = maxOf(walls.flatMap((w) => topo.facePoints(w).map((p) => dot(p, n))));
    const depth = rimTop(topo, walls, own, n, top, top - floorH) - floorH;
    const width = distShapes(oc, topo.faces[pair[0]], topo.faces[pair[1]])[0];
    const found = corners(topo, walls, cyls);
    const minR = found.length ? minOf(found.map(([, r]) => r)) : Infinity;
    const [tool, undersized] = pickEndMill(minR, width);
    const openEnds = trace.filter((t) => t.kind === "open").length;
    const round = ends.length === 1 && topo.type(ends[0]) === "GeomAbs_Cylinder" && cyls.has(ends[0]);
    const endType: "open" | "round" | "flat" = rs.length === 2 ? "open" : round ? "round" : "flat";
    const slotFaces = [...own].sort((a, b) => a - b);
    const vectors: Vec[] = [[...n] as Vec];
    for (const out of openVectors(topo, trace, n)) if (!vectors.some((v) => dot(v, out) >= Math.cos(ANGLE_TOL))) vectors.push(out);
    const dims: Record<string, number> = { depth, length: maxOf(pair.map((w) => span(topo, w, n))), narrowest_width: width,
      min_corner_radius: minR === Infinity ? 0.0 : minR, end_mill_mm: tool, undersized: Number(undersized) };
    if (round) dims.end_radius = cyls.get(ends[0])!.radius;
    slots.push({ kind: "slot", faces: slotFaces, floor: fid, axis: [...n], open_dirs: [o.dir], open_vectors: vectors.map((v) => [...v]),
      dims_mm: dims, open_ends: openEnds, end_type: endType });
    for (const [cfaces, r, edge] of found) {
      const [ctool] = pickEndMill(r, width);
      const corner: CornerFeature = { kind: "corner", faces: cfaces, axis: [...n], open_dirs: [], open_vectors: [],
        dims_mm: { radius: r, depth, end_mill_mm: ctool }, pocket: minOf(slotFaces) };
      if (edge) corner.edge_mm = edge;
      slotCornerOut.push(corner);
    }
  }
  return [steps, slots];
}

/** Each corner's `pocket`: the id of the pocket it sits in (D-049). Run after both are numbered. */
export function linkCorners(pocketList: { id: string; faces: number[] }[], cornerList: { pocket: number | string | null }[]): void {
  const byFace = new Map(pocketList.map((p) => [minOf(p.faces), p.id]));
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
        const tr = tri.Triangle(i);
        const t = tr.Get();
        tr.delete();
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

