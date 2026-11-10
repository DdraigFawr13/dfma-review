// Port of service/dfma/rules/undercut.py: a pocket with an undercut (a lip over it, or a groove round its floor) is
// medium: it needs a T-slot or lollipop cutter (D-021). Measured: how far the undercut reaches under the lip.
import { MM_PER_IN, pyFixed, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "undercut";
export const PROCESSES = ["mill"] as const;
const EPS = 1e-9;

type Table = { max_in: number; source: string };

export function check(features: Feature[], _part: PartSummary, limits: Limits): Finding[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const limit = table.max_in;
  const out: Finding[] = [];
  for (const f of features) {
    if (f.kind !== "pocket" || !("undercut_mm" in f.dims_mm)) continue;
    const reachIn = f.dims_mm.undercut_mm / MM_PER_IN;
    if (reachIn <= limit + EPS) continue;
    out.push({ rule: ID, severity: "medium",
      title: `Undercut reaches ${pyFixed(reachIn, 3)} in sideways: needs a T-slot or lollipop cutter`,
      measured: round(reachIn, 5), limit, unit: "in",
      faces: f.faces, feature: f.id, threshold_source: table.source,
      suggestion: "Cut it with a T-slot or lollipop cutter that reaches this far, or open the undercut "
        + "to the top or split the part, if the design allows." });
  }
  return out;
}

/** The pockets this rule passed: no undercut, or one within the limit (D-023 proposed). */
export function passes(features: Feature[], _part: PartSummary, limits: Limits): Pass[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const limit = table.max_in;
  const out: Pass[] = [];
  for (const f of features) {
    if (f.kind !== "pocket") continue;
    const row = { rule: ID, feature: f.id, faces: f.faces, threshold_source: table.source };
    if (!("undercut_mm" in f.dims_mm)) {
      out.push({ ...row, title: "No undercut: a cutter reaches the whole floor from its open side",
        math: "no ceiling faces its floor, so nothing reaches under a lip" });
      continue;
    }
    const reachIn = f.dims_mm.undercut_mm / MM_PER_IN;
    if (reachIn <= limit + EPS) out.push({ ...row, title: `Undercut ${pyFixed(reachIn, 3)} in, within ${pyFixed(limit, 3)} in`,
      math: `${pyFixed(reachIn, 3)} in ≤ ${pyFixed(limit, 3)} in` });
  }
  return out;
}
