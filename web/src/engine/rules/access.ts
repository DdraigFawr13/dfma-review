// Port of service/dfma/rules/access.py: a hole or pocket that opens along none of +-X +-Y +-Z of the part frame
// (within 0.5 deg) needs a 4/5-axis mill or a fixture (spec Rules). Medium (D-050); a hole is high when it also enters
// its flat face more than 0.5 deg off square. Measured: the angle between its nearest open vector and the nearest
// frame axis; limit 0.5. A feature with no open end is not judged. Its pocket branch has nothing to judge until S4.
import type { Vec } from "../frame";
import { pyFixed, pySum, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "access";
export const PROCESSES = ["mill"] as const;
export const LIMIT_DEG = 0.5;
export const SQUARE_DEG = 0.5; // D-050: how far off square a hole may enter its face (assumption)
const KINDS = ["hole", "pocket"];

/** Degrees between a vector and the nearest of +-X +-Y +-Z of the frame. */
function angleToAxes(v: number[], frame: PartSummary["frame"]): number {
  const best = Math.max(...(["x", "y", "z"] as const).map((k) => Math.abs(pySum((frame[k] as Vec).map((a, i) => v[i] * a)))));
  return (Math.acos(Math.min(1.0, best)) * 180) / Math.PI;
}

export function check(features: Feature[], part: PartSummary, _limits: Limits): Finding[] {
  const frame = part.frame;
  const out: Finding[] = [];
  for (const f of features) {
    if (!KINDS.includes(f.kind) || f.open_dirs.length || !f.open_vectors.length) continue;
    const angle = Math.min(...(f.open_vectors as number[][]).map((v) => angleToAxes(v, frame)));
    if (angle <= LIMIT_DEG) continue; // open_dirs uses the same 0.5 deg; a rounding gap is not a finding
    const entry = f.entry_deg as number | null | undefined;
    if (f.kind === "hole" && entry != null && entry > SQUARE_DEG) { // D-050: it enters its face at a slant
      out.push({ rule: ID, severity: "high",
        title: `Hole opens ${pyFixed(angle, 1)}° off the part's axes and enters its face ${pyFixed(entry, 1)}° off square: ` +
          "needs a 4/5-axis mill or a fixture, and the drill can walk",
        measured: round(entry, 3), limit: SQUARE_DEG, unit: "deg",
        faces: f.faces, feature: f.id, threshold_source: "assumption",
        suggestion: "Make it square to the face it starts from (a flat spot or boss there), or line it up with a face of the part." });
      continue;
    }
    const what = f.kind === "hole" ? "Hole" : "Pocket";
    out.push({ rule: ID, severity: "medium", // D-050: holes and pockets alike
      title: `${what} opens ${pyFixed(angle, 1)}° off the part's axes: needs a 4/5-axis mill or a fixture`,
      measured: round(angle, 3), limit: LIMIT_DEG, unit: "deg",
      faces: f.faces, feature: f.id, threshold_source: "spec",
      suggestion: "Line it up with a face of the part, or plan a 4/5-axis mill or an angled fixture." });
  }
  return out;
}

/** The holes and pockets a 3-axis mill reaches (D-023 proposed). */
export function passes(features: Feature[], part: PartSummary, _limits: Limits): Pass[] {
  const frame = part.frame;
  const out: Pass[] = [];
  for (const f of features) {
    if (!KINDS.includes(f.kind) || !f.open_vectors.length) continue;
    const angle = Math.min(...(f.open_vectors as number[][]).map((v) => angleToAxes(v, frame)));
    if (!f.open_dirs.length) continue; // check() flags it, or (within 0.5 deg to rounding) neither: never passed
    out.push({ rule: ID, feature: f.id, faces: f.faces, threshold_source: "spec",
      title: `Opens along ${(f.open_dirs as string[]).map((d) => d.replace("-", "−")).join(" and ")}: a 3-axis mill reaches it`,
      math: `${pyFixed(angle, 2)}° off the nearest axis ≤ ${LIMIT_DEG}°` });
  }
  return out;
}
