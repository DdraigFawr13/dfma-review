// Port of service/dfma/inventor/pair.py: checks before mapping (spec I1 Design "Checks before mapping"). First failure
// wins. check_pair (face count, outer size, corners) stays provisional until Morgan's first work pair is measured
// (spec S1 "First", D-035).
import type { OC } from "../oc";
import { pt } from "../features/holes";
import { ReadError, type ReadResult } from "../read";
import { MSG_IPT_TYPE, MSG_PAIR_MISMATCH, PAIR_TOL_MM } from "../settings";
import { pyFixed, pyG, round } from "../units";
import { PLAIN_PART, SHEET_METAL, type IptPart } from "./part";
import type { Vec } from "./sab";

/** The kind of part refused, or null for a plain single-body part. */
export function partTypeReason(ipt: IptPart, step: ReadResult): string | null {
  if (ipt.subtype === SHEET_METAL) return "sheet-metal part";
  if (ipt.subtype !== PLAIN_PART) return "part of a type this tool can't read yet"; // any other document type, or none
  if (ipt.model_state_names.length > 1) return "part with Model States";
  if (step.ignoredSolids > 0 || ipt.solid_bodies > 1) return "multi-body part";
  return null;
}

export function checkPartType(ipt: IptPart, step: ReadResult): void {
  const kind = partTypeReason(ipt, step);
  if (kind !== null) throw new ReadError(MSG_IPT_TYPE.replace("{kind}", kind));
}

/** Every TopAbs_VERTEX of the STEP solid, in mm. */
export function stepCorners(oc: OC, solid: OC): Vec[] {
  const m = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
  oc.TopExp.MapShapes(solid, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, m);
  const out: Vec[] = [];
  for (let i = 1; i <= m.Size(); i++) {
    const p = oc.BRep_Tool.Pnt(oc.TopoDS.Vertex(m.FindKey(i)));
    out.push(pt(p));
    p.delete?.();
  }
  m.delete();
  return out;
}

function bbox(pts: Vec[]): number[] {
  const out = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { out[k] = Math.min(out[k], p[k]); out[k + 3] = Math.max(out[k + 3], p[k]); }
  return out;
}

// (dx ** 2 + dy ** 2 + dz ** 2) ** 0.5: glibc pow is correctly rounded, so x ** 0.5 is sqrt(x) there
const d3 = (p: Vec, q: Vec) => Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2]));
/** Python's int(c // tol): float floor division as CPython works it out (fmod, then the rounded quotient). */
export function floorDiv(vx: number, wx: number): number {
  let mod = vx % wx; // fmod
  let div = (vx - mod) / wx;
  if (mod && (wx < 0) !== (mod < 0)) { mod += wx; div -= 1.0; }
  if (!div) return 0;
  let fl = Math.floor(div);
  if (div - fl > 0.5) fl += 1.0;
  return fl;
}
const cell = (c: number, tol: number) => floorDiv(c, tol);

/** For each point, its distance to the nearest of `others` when that is within `tol`, else Infinity; looked up in
 *  tol-sized grid cells with their 26 neighbours. */
function gaps(pts: Vec[], others: Vec[], tol: number): number[] {
  const cells = new Map<string, Vec[]>();
  for (const q of others) {
    const key = q.map((c) => cell(c, tol)).join(",");
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(q);
  }
  return pts.map((p) => {
    const [cx, cy, cz] = p.map((c) => cell(c, tol));
    let best = Infinity;
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      for (const q of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) best = Math.min(best, d3(p, q));
    }
    return best <= tol ? best : Infinity;
  });
}

/** The worst corner gap in mm: exact nearest distances for up to `cap` corners outside the tolerance. */
function worstGap(pts: Vec[], others: Vec[], gs: number[], cap = 200): number {
  const far = pts.filter((_, i) => gs[i] === Infinity).slice(0, cap);
  let worst = 0.0; // max(..., default=0.0); every gap is 0 or more
  for (const g of gs) if (g !== Infinity) worst = Math.max(worst, g);
  for (const p of far) {
    let near = Infinity;
    for (const q of others) near = Math.min(near, d3(p, q));
    worst = Math.max(worst, near);
  }
  return worst;
}

export interface Checks { faces: [number, number]; corners: [number, number]; worst_corner_gap_mm: number | null }

/** [reason the pair is refused or null, the checks block]. */
export function pairReason(oc: OC, ipt: IptPart, step: ReadResult): [string | null, Checks] {
  const tol = PAIR_TOL_MM;
  const s = stepCorners(oc, step.solid);
  const checks: Checks = { faces: [ipt.face_count, step.faces.length], corners: [ipt.corners_mm.length, s.length], worst_corner_gap_mm: null };
  if (ipt.face_count !== step.faces.length) return [`the STEP has ${step.faces.length} faces, the .ipt ${ipt.face_count}`, checks];
  if (!ipt.corners_mm.length || !s.length) return [`the .ipt has ${ipt.corners_mm.length} corners, the STEP ${s.length}`, checks];
  const [a, b] = [bbox(ipt.corners_mm), bbox(s)];
  const box = Math.max(...a.map((x, k) => Math.abs(x - b[k])));
  if (box > tol) return [`the parts' outer corners differ by up to ${pyFixed(box, 2)} mm`, checks];
  if (ipt.corners_mm.length !== s.length) return [`the .ipt has ${ipt.corners_mm.length} corners, the STEP ${s.length}`, checks];
  for (const [pts, others, self, other] of [[ipt.corners_mm, s, ".ipt", "STEP"], [s, ipt.corners_mm, "STEP", ".ipt"]] as [Vec[], Vec[], string, string][]) {
    const gs = gaps(pts, others, tol);
    const n = gs.filter((g) => g === Infinity).length;
    const worst = worstGap(pts, others, gs);
    checks.worst_corner_gap_mm = Math.max(checks.worst_corner_gap_mm ?? 0.0, round(worst, 4));
    if (n) return [`${n} of ${pts.length} corners of the ${self} are more than ${pyG(tol)} mm from the ${other} (worst ${pyFixed(worst, 2)} mm)`, checks];
  }
  return [null, checks];
}

/** The checks block when the pair lines up; ReadError(MSG_PAIR_MISMATCH) with the first reason else. */
export function checkPair(oc: OC, ipt: IptPart, step: ReadResult): Checks {
  const [reason, checks] = pairReason(oc, ipt, step);
  if (reason !== null) throw new ReadError(MSG_PAIR_MISMATCH.replace("{reason}", reason));
  return checks;
}

export function inventorBlock(ipt: IptPart, name: string, checks: Checks) {
  return { name, saved_with: ipt.saved_with, acis_version: ipt.acis_version, checks };
}
