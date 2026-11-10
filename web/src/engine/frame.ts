// Port of service/dfma/frame.py: face kinds and the part frame (spec Flow step 5).
// +Z is the outward normal of the largest planar face; +X the outward normal of the largest planar face
// perpendicular to Z (within 0.5 deg); Y = Z x X. Areas within 0.1% tie, and ties go to the lowest face id.
import type { OC } from "./oc";

export type Vec = [number, number, number];

export const ANGLE_TOL = (0.5 * Math.PI) / 180;
export const AREA_TIE = 0.001; // 0.1%

export interface FaceInfo {
  id: number;
  kind: "plane" | "cylinder" | "cone" | "torus" | "other";
  area: number;
  normal: Vec | null; // outward normal, planes only
  axis: Vec | null; // cylinders and cones
}

export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function unit(a: Vec): Vec {
  const n = Math.sqrt(dot(a, a));
  return [a[0] / n, a[1] / n, a[2] / n];
}

const KINDS: Record<string, FaceInfo["kind"]> = {
  GeomAbs_Plane: "plane", GeomAbs_Cylinder: "cylinder", GeomAbs_Cone: "cone", GeomAbs_Torus: "torus",
};

function kindOf(type: unknown): FaceInfo["kind"] {
  return KINDS[String(type)] ?? "other"; // the engine's enums are strings
}

export function faceInfo(oc: OC, faceId: number, face: unknown): FaceInfo {
  const surface = new oc.BRepAdaptor_Surface(face, true);
  const kind = kindOf(surface.GetType());
  const props = new oc.GProp_GProps();
  oc.BRepGProp.SurfaceProperties(face, props, false, false);
  let normal: Vec | null = null;
  let axis: Vec | null = null;
  if (kind === "plane") {
    const b = oc.BRepTools.UVBounds(face);
    const point = new oc.gp_Pnt();
    const vec = new oc.gp_Vec();
    const gp = new oc.BRepGProp_Face(face, false);
    gp.Normal((b.UMin + b.UMax) / 2, (b.VMin + b.VMax) / 2, point, vec); // follows face orientation
    normal = unit([vec.X(), vec.Y(), vec.Z()]);
    gp.delete(); point.delete(); vec.delete();
  } else if (kind === "cylinder" || kind === "cone") {
    const d = (kind === "cylinder" ? surface.Cylinder() : surface.Cone()).Axis().Direction();
    axis = [d.X(), d.Y(), d.Z()];
  }
  const area = props.Mass();
  props.delete(); surface.delete();
  return { id: faceId, kind, area, normal, axis };
}

export function largest(candidates: FaceInfo[]): FaceInfo | null {
  if (!candidates.length) return null;
  let top = -Infinity;
  for (const f of candidates) if (f.area > top) top = f.area; // a loop: a spread fails past ~120k faces
  return candidates.filter((f) => f.area >= top * (1 - AREA_TIE)).reduce((a, b) => (b.id < a.id ? b : a));
}

export function partFrame(infos: FaceInfo[], vertices: Vec[]): { x: Vec; y: Vec; z: Vec } {
  const planes = infos.filter((f) => f.kind === "plane");
  const top = largest(planes);
  const z: Vec = top !== null ? top.normal! : turningAxis(infos, vertices) ?? [0, 0, 1];
  const side = largest(planes.filter((f) => Math.abs(dot(f.normal!, z)) <= Math.sin(ANGLE_TOL)));
  let x: Vec;
  if (side !== null) {
    x = side.normal!;
  } else {
    let ref: Vec = [1, 0, 0];
    if (Math.abs(dot(ref, z)) >= Math.cos((10 * Math.PI) / 180)) ref = [0, 1, 0];
    const d = dot(ref, z);
    x = unit([ref[0] - d * z[0], ref[1] - d * z[1], ref[2] - d * z[2]]);
  }
  const d = dot(x, z); // make X exactly perpendicular to Z (it is within 0.5 deg)
  x = unit([x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]]);
  return { x, y: cross(z, x), z };
}

/** The axis direction carrying the most cylinder and cone area; sign towards the end with more mesh vertices
 *  within 0.01 mm of its extreme (frame.py turning_axis). */
export function turningAxis(infos: FaceInfo[], vertices: Vec[]): Vec | null {
  const groups: [Vec, number][] = [];
  for (const f of infos) {
    if (f.axis === null) continue;
    const g = groups.find((g) => Math.abs(dot(g[0], f.axis!)) >= Math.cos(ANGLE_TOL));
    if (g) g[1] += f.area;
    else groups.push([f.axis, f.area]);
  }
  if (!groups.length) return null;
  let axis = groups.reduce((a, b) => (b[1] > a[1] ? b : a))[0]; // max keeps the first on a tie
  if (vertices.length) {
    const along = vertices.map((v) => dot(v, axis));
    let hi = -Infinity, lo = Infinity;
    for (const a of along) { if (a > hi) hi = a; if (a < lo) lo = a; }
    const atHi = along.filter((a) => a >= hi - 0.01).length;
    const atLo = along.filter((a) => a <= lo + 0.01).length;
    if (atLo > atHi) axis = [-axis[0], -axis[1], -axis[2]];
  }
  return axis;
}

/** Extents along frame X, Y and Z, from the mesh vertices. */
export function extentsMm(frame: { x: Vec; y: Vec; z: Vec }, vertices: Vec[]): number[] {
  return (["x", "y", "z"] as const).map((k) => {
    if (!vertices.length) return 0;
    let hi = -Infinity, lo = Infinity;
    for (const v of vertices) { const a = dot(v, frame[k]); if (a > hi) hi = a; if (a < lo) lo = a; }
    return hi - lo;
  });
}
