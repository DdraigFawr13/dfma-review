// Port of service/dfma/rules/hole_depth.py: depth / diameter over 6.0 is medium, over 10.0 is high (limits per
// material). Holes only: a turned part's bores are judged by bore_depth (D-026).
import { MM_PER_IN, pastLimit, pyFixed, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "hole_depth";
export const PROCESSES = ["mill", "turn"] as const;
const KINDS = ["hole"];
export const SUGGESTION: Record<string, string> = {
  medium: "Needs peck drilling (drilling in short steps to clear chips). Make it shallower or larger if the design allows.",
  high: "Needs a long drill and peck drilling (drilling in short steps to clear chips). Make it shallower or larger if the design allows.",
};

type Table = { medium: number; high: number; source: string };

export function check(features: Feature[], _part: PartSummary, limits: Limits): Finding[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const out: Finding[] = [];
  for (const f of features) {
    if (!KINDS.includes(f.kind)) continue;
    const ratio = f.dims_mm.depth / f.dims_mm.diameter;
    const eps = 1e-9; // "over 6.0": a ratio that is 6.0 to rounding is not over it
    let severity: string, limit: number;
    if (ratio > table.high + eps) [severity, limit] = ["high", table.high];
    else if (ratio > table.medium + eps) [severity, limit] = ["medium", table.medium];
    else continue;
    out.push({
      rule: ID, severity,
      title: `Hole depth ${pastLimit(ratio, limit, 1)}× diameter (limit ${pyFixed(limit, 1)}×)`,
      measured: round(ratio, 4), limit, unit: "ratio",
      faces: f.faces, feature: f.id, threshold_source: table.source,
      suggestion: SUGGESTION[severity] + longest(f.dims_mm),
    });
  }
  return out;
}

/** D-022: the depth is where the hole is round all the way; a sloped exit's longest side is shown too. */
function longest(dims: Record<string, number>): string {
  if (!("max_depth" in dims)) return "";
  return ` Depth measured where the hole is round all the way (${pyFixed(dims.depth / MM_PER_IN, 3)} in); ` +
    `its longest side is ${pyFixed(dims.max_depth / MM_PER_IN, 3)} in.`;
}

/** The holes this rule passed, with the math (D-023 proposed: the "Passed" list). */
export function passes(features: Feature[], _part: PartSummary, limits: Limits): Pass[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const out: Pass[] = [];
  for (const f of features) {
    if (!KINDS.includes(f.kind)) continue;
    const [d, depth] = [f.dims_mm.diameter, f.dims_mm.depth];
    const ratio = depth / d;
    if (ratio > table.medium + 1e-9) continue;
    out.push({ rule: ID, feature: f.id, faces: f.faces, threshold_source: table.source,
      title: `Depth ${pyFixed(ratio, 1)}× diameter, at most ${pyFixed(table.medium, 1)}×`,
      math: `${pyFixed(depth / MM_PER_IN, 3)} in deep ÷ ${pyFixed(d / MM_PER_IN, 3)} in diameter = ${pyFixed(ratio, 2)}× ` +
        `≤ ${pyFixed(table.medium, 1)}×` });
  }
  return out;
}
