// P1 removal volume (machining spec, Design "P1: removal"; D-088): how much material comes off the stock block, each
// hole's and pocket's own volume from its sizes, and how much no found feature explains. Milled parts only.
import type { Removal } from "../api";
import { round } from "./units";

export type { Removal };

/** The assumption line for milled parts, after the shared ASSUMPTIONS (P1, D-088, D-089): a turned part has no removal
 *  block. Kept here, not in settings.ts, which holds the frozen settings.py port (settings.test.ts). */
export const REMOVAL_ASSUMPTION = "Removal is the stock block minus the part's exact volume; each hole's and pocket's own volume comes from its sizes (approximate), and the rest is material no found feature explains, such as an outside profile.";

/** Feature kinds with a volume of their own. Steps and slots (steps-slots S1, S2) add `step` and `slot` with the
 *  pocket's formula. */
export const VOLUME_KINDS = ["hole", "pocket", "step", "slot"]; // steps and slots S1, S2, with the pocket's formula

type Feat = { id: string; kind: string; faces: number[]; axis?: number[]; dims_mm?: Record<string, number> };
type FaceMesh = { kind: string; positions: ArrayLike<number>; indices: ArrayLike<number> };

const FLOOR_MM = 0.01; // a floor triangle's highest point is this close to the pocket's lowest point

/** A pocket's floor area: the area, projected across its axis, of its triangles that face along the axis and lie on
 *  its lowest level (highest vertex within 0.01 mm of it), plus those of a non-planar face that reaches that level
 *  (a floor fillet). Island tops and ceilings are higher, so they are left out; a floor at several heights counts only
 *  the lowest (an undercount, approximate by design). */
function floorArea(f: Feat, faces: FaceMesh[]): number {
  const a = f.axis!;
  const tris: { face: number; c: number; top: number }[] = [];
  const lowOf = new Map<number, number>();
  let low = Infinity;
  for (const i of f.faces) {
    const { positions: p, indices: ix } = faces[i];
    let faceLow = Infinity;
    for (let t = 0; t < ix.length; t += 3) {
      const v = [0, 1, 2].map((j) => [p[3 * ix[t + j]], p[3 * ix[t + j] + 1], p[3 * ix[t + j] + 2]]);
      const h = v.map((x) => x[0] * a[0] + x[1] * a[1] + x[2] * a[2]);
      const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
      const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      tris.push({ face: i, c: (n[0] * a[0] + n[1] * a[1] + n[2] * a[2]) / 2, top: Math.max(...h) });
      faceLow = Math.min(faceLow, ...h);
    }
    lowOf.set(i, faceLow);
    low = Math.min(low, faceLow);
  }
  let area = 0;
  for (const t of tris) {
    if (t.c <= 0) continue;
    const fillet = faces[t.face].kind !== "plane" && lowOf.get(t.face)! <= low + FLOOR_MM;
    if (t.top <= low + FLOOR_MM || fillet) area += t.c;
  }
  return area;
}

/** The removal block for a milled part. `bboxMm` is the part's extents in the part frame (before inch rounding);
 *  `faces` the meshes by face index, with each face's kind. */
export function removal(features: Feat[], faces: FaceMesh[], bboxMm: number[], partMm3: number): Removal {
  const stock = round(bboxMm[0] * bboxMm[1] * bboxMm[2], 3);
  const part = round(partMm3, 3);
  const total = round(stock - part, 3); // from the rounded pair, so total = stock - part to 0.001 mm3
  const vols = features.filter((f) => VOLUME_KINDS.includes(f.kind)).map((f) => {
    const d = f.dims_mm ?? {};
    // A hole segment: its cylinder; drill points and countersinks not counted (assumption, small).
    const v = f.kind === "hole" ? Math.PI * (d.diameter / 2) ** 2 * d.depth : floorArea(f, faces) * d.depth;
    return { feature: f.id, volume_mm3: v };
  });
  const sum = vols.reduce((s, f) => s + f.volume_mm3, 0);
  const explained = Math.min(sum, total);
  const unexplained = total - explained;
  return {
    stock_mm3: stock,
    part_mm3: part,
    total_mm3: total,
    features: vols.map((f) => ({ feature: f.feature, volume_mm3: round(f.volume_mm3, 3) })),
    features_sum_mm3: round(sum, 3),
    explained_mm3: round(explained, 3),
    unexplained_mm3: round(unexplained, 3),
    unexplained_pct: round(total > 0 ? unexplained / total * 100 : 0, 2),
  };
}
