// Port of service/dfma/rules/pocket_depth.py: pocket depth / the diameter of the end mill that fits over 3.0 is
// medium; the advice counts the passes at a safe depth (D-052).
import { fmtIn, fraction, MM_PER_IN, pastLimit, pyFixed, pyG, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "pocket_depth";
export const PROCESSES = ["mill"] as const;
const EPS = 1e-9;

type Table = { medium: number; pass_xd: number; source: string };

export function check(features: Feature[], _part: PartSummary, limits: Limits): Finding[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const out: Finding[] = [];
  for (const f of features) {
    if (f.kind !== "pocket") continue;
    const dims = f.dims_mm;
    const ratio = dims.depth / dims.end_mill_mm;
    if (ratio <= table.medium + EPS) continue;
    const dIn = dims.end_mill_mm / MM_PER_IN;
    const tool = fraction(dIn) || pyFixed(dIn, 3);
    // D-052 (Morgan): the passes at a safe depth it takes; each pass still needs the tool to reach the full depth
    const stepMax = table.pass_xd * dims.end_mill_mm;
    const passes = Math.max(1, Math.ceil(dims.depth / stepMax - 1e-6));
    const passIn = dims.depth / passes / MM_PER_IN;
    let suggestion = `Cut it in ${passes} passes of ${fmtIn(passIn, true)} each (at most ${pyG(table.pass_xd)}× the `
      + `tool per pass, an estimate); the tool still reaches ${fmtIn(dims.depth / MM_PER_IN)} deep, `
      + `so it is a long-reach ${tool} in end mill. Or make the pocket shallower, or its corners and gaps `
      + "larger, if the design allows.";
    if (dims.undersized) suggestion += " Smallest tool used: no end mill in the list fits the corners.";
    out.push({ rule: ID, severity: "medium",
      title: `Pocket depth ${pastLimit(ratio, table.medium, 1)}× the end mill that fits (limit ${pyFixed(table.medium, 1)}×)`,
      measured: round(ratio, 4), limit: table.medium, unit: "ratio",
      faces: f.faces, feature: f.id, threshold_source: table.source,
      passes, pass_in: round(passIn, 6), suggestion });
  }
  return out;
}

/** The pockets this rule passed, with the math (D-023 proposed). */
export function passes(features: Feature[], _part: PartSummary, limits: Limits): Pass[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const out: Pass[] = [];
  for (const f of features) {
    if (f.kind !== "pocket") continue;
    const dims = f.dims_mm;
    const ratio = dims.depth / dims.end_mill_mm;
    if (ratio > table.medium + EPS) continue;
    const dIn = dims.end_mill_mm / MM_PER_IN;
    const tool = fraction(dIn) || pyFixed(dIn, 3);
    out.push({ rule: ID, feature: f.id, faces: f.faces, threshold_source: table.source,
      title: `Depth ${pyFixed(ratio, 1)}× the ${tool} in end mill that fits, at most ${pyFixed(table.medium, 1)}×`,
      math: `${fits(dims)}; ${pyFixed(dims.depth / MM_PER_IN, 3)} in deep ÷ ${pyFixed(dIn, 3)} in = ${pyFixed(ratio, 2)}× `
        + `≤ ${pyFixed(table.medium, 1)}×` });
  }
  return out;
}

/** Why this end mill: the largest whose radius fits the smallest corner and whose diameter fits the gap. */
function fits(dims: Record<string, number>): string {
  const dIn = dims.end_mill_mm / MM_PER_IN;
  const parts = [`radius ${pyFixed(dIn / 2, 3)} in ≤ corner ${pyFixed(dims.min_corner_radius / MM_PER_IN, 3)} in`];
  if ("narrowest_width" in dims) parts.push(`${pyFixed(dIn, 3)} in ≤ narrowest gap ${pyFixed(dims.narrowest_width / MM_PER_IN, 3)} in`);
  return "end mill " + parts.join(", ");
}
