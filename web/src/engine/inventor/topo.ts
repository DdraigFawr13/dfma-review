// Port of service/dfma/inventor/topo.py: face topology of an .ipt's main model. Pointer positions measured on the 16
// NIST files: face -> its first loop (4th pointer); loop -> next loop (3rd), first coedge (4th), its face (5th); coedge
// -> next coedge (3rd), partner coedge (5th), edge (6th), loop (7th); edge -> vertices (3rd and 4th); vertex -> point
// (last pointer). Loops and coedge rings stop after MAX_STEPS steps. Points are mm.
import { ref, type Record, type Vec } from "./sab";

export const MAX_STEPS = 10_000;

/** A face whose loops or coedges can't be followed: its feature is then not mapped. */
export class TopologyError extends Error {}

function p(recs: Record[], i: number, k: number, name: string): number | null {
  const ps = recs[i].of("p");
  return ps.length > k ? ref(recs, ps[k], name) : null;
}

function point(recs: Record[], vertex: number): Vec | null {
  const ps = recs[vertex].of("p");
  const q = ps.length ? ref(recs, ps[ps.length - 1], "point") : null;
  const v = q !== null ? recs[q].of("v") : [];
  return v.length ? [10.0 * v[0][0], 10.0 * v[0][1], 10.0 * v[0][2]] : null;
}

/** Every coedge of the face's loops, in ring order. Raises TopologyError past MAX_STEPS steps. */
function coedges(recs: Record[], face: number): number[] {
  const out: number[] = [];
  let steps = 0;
  const seenLoops = new Set<number>();
  let loop = p(recs, face, 3, "loop");
  while (loop !== null && !seenLoops.has(loop)) {
    seenLoops.add(loop);
    const first = p(recs, loop, 3, "coedge");
    let ce = first;
    let closed = false;
    while (ce !== null) {
      steps += 1;
      if (steps > MAX_STEPS) throw new TopologyError("loop or coedge ring too long");
      out.push(ce);
      ce = p(recs, ce, 2, "coedge");
      if (ce === first) { closed = true; break; }
    }
    if (!closed && first !== null) throw new TopologyError("coedge ring does not close");
    loop = p(recs, loop, 2, "loop");
    steps += 1;
    if (steps > MAX_STEPS) throw new TopologyError("loop or coedge ring too long");
  }
  return out;
}

function edgePoints(recs: Record[], ce: number): Vec[] {
  const e = p(recs, ce, 5, "edge");
  if (e === null) return [];
  const out: Vec[] = [];
  for (const k of [2, 3]) {
    const v = p(recs, e, k, "vertex");
    const pt = v !== null ? point(recs, v) : null;
    if (pt !== null) out.push(pt);
  }
  return out;
}

/** The points of the vertices round the face, in loop order (repeats kept). */
export function facePoints(recs: Record[], face: number): Vec[] {
  return coedges(recs, face).flatMap((ce) => edgePoints(recs, ce));
}

/** Each face that shares an edge with this one, with the points of the shared edges (first met first). */
export function neighbours(recs: Record[], face: number): Map<number, Vec[]> {
  const out = new Map<number, Vec[]>();
  for (const ce of coedges(recs, face)) {
    const partner = p(recs, ce, 4, "coedge");
    if (partner === null || partner === ce) continue;
    const loop = p(recs, partner, 6, "loop");
    const other = loop !== null ? p(recs, loop, 4, "face") : null;
    if (other === null || other === face) continue;
    if (!out.has(other)) out.set(other, []);
    out.get(other)!.push(...edgePoints(recs, ce));
  }
  return out;
}
