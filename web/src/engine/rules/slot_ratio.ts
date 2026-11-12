// Steps and slots S2 (D-068, D-079): a slot deeper than `max_ratio` (6) times its width is medium; shops cut a deep
// narrow slot only with a long, thin tool. Measured: depth ÷ the narrowest width between its facing walls.
import { fmtIn, MM_PER_IN, pyFixed, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "slot_ratio";
export const PROCESSES = ["mill"] as const;
const EPS = 1e-9;

type Table = { max_ratio: number; source: string };

export function check(features: Feature[], _part: PartSummary, limits: Limits): Finding[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const out: Finding[] = [];
  for (const f of features) {
    const width = f.dims_mm.narrowest_width;
    if (f.kind !== "slot" || !(width > 0)) continue;
    const ratio = f.dims_mm.depth / width;
    if (ratio <= table.max_ratio + EPS) continue;
    out.push({ rule: ID, severity: "medium",
      title: `Slot ${pyFixed(ratio, 1)}× deeper than wide (limit ${pyFixed(table.max_ratio, 1)}×)`,
      measured: round(ratio, 4), limit: table.max_ratio, unit: "ratio",
      faces: f.faces, feature: f.id, threshold_source: table.source,
      suggestion: "Make it wider or shallower, or open one side into a step, if the design allows." });
  }
  return out;
}

/** The slots this rule passed, with the math (D-023). */
export function passes(features: Feature[], _part: PartSummary, limits: Limits): Pass[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const out: Pass[] = [];
  for (const f of features) {
    const width = f.dims_mm.narrowest_width;
    if (f.kind !== "slot" || !(width > 0)) continue;
    const ratio = f.dims_mm.depth / width;
    if (ratio > table.max_ratio + EPS) continue;
    out.push({ rule: ID, feature: f.id, faces: f.faces, threshold_source: table.source,
      title: `Depth ${pyFixed(ratio, 1)}× the width, at most ${pyFixed(table.max_ratio, 1)}×`,
      math: `${fmtIn(f.dims_mm.depth / MM_PER_IN)} deep ÷ ${fmtIn(width / MM_PER_IN)} wide = ${pyFixed(ratio, 2)}× ≤ ${pyFixed(table.max_ratio, 1)}×` });
  }
  return out;
}
