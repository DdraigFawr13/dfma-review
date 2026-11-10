// Port of service/dfma/rules/corner_radius.py: one finding per inside corner, at the worst severity that applies; the
// title names every reason. Radius 0: high (needs EDM or a corner radius); radius under min_radius_in (1/32 in):
// medium; radius over 0 and pocket depth / the end mill that fits over max_depth_ratio: medium.
import { fmtIn, MM_PER_IN, pastLimit, pyFixed, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "corner_radius";
export const PROCESSES = ["mill"] as const;
const EPS = 1e-9;
const SHARP_MM = 1e-6;
export const SUGGEST_SHARP = "Add a corner radius of 0.031 in (1/32) or more; a larger radius lets a larger end mill cut the pocket.";
export const SUGGEST_SMALL = "Make the corner radius 0.031 in (1/32) or more if the design allows.";
export const SUGGEST_TOOL = "Make the corner radius or the gap larger, or the pocket shallower, if the design allows.";

type Table = { min_radius_in: number; max_depth_ratio: number; source: string };

export function check(features: Feature[], _part: PartSummary, limits: Limits): Finding[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const minIn = table.min_radius_in;
  const minText = fmtIn(minIn, true);
  const out: Finding[] = [];
  for (const f of features) {
    if (f.kind !== "corner") continue;
    const dims = f.dims_mm;
    const rIn = dims.radius / MM_PER_IN;
    const base = { rule: ID, faces: f.faces, feature: f.id, threshold_source: table.source };
    if (dims.radius <= SHARP_MM) {
      out.push({ ...base, severity: "high", title: "Sharp inside corner: needs EDM (spark erosion) or a corner radius",
        measured: 0.0, limit: minIn, unit: "in", suggestion: SUGGEST_SHARP });
      continue;
    }
    const reasons: [string, number, number, string, string][] = []; // radius reason first
    if (rIn < minIn - EPS) reasons.push([`Corner radius ${fmtIn(rIn)} under ${minText}`, round(rIn, 6), minIn, "in", SUGGEST_SMALL]);
    const ratio = dims.depth / dims.end_mill_mm;
    if (ratio > table.max_depth_ratio + EPS) {
      const text = `the end mill that fits cuts ${pastLimit(ratio, table.max_depth_ratio, 1)}× its diameter deep (limit ${pyFixed(table.max_depth_ratio, 1)}×)`;
      reasons.push([text, round(ratio, 4), table.max_depth_ratio, "ratio", SUGGEST_TOOL]);
    }
    if (!reasons.length) continue;
    let title = reasons.map((r) => r[0]).join("; ");
    if (reasons[0][3] === "ratio") title = `Corner radius ${fmtIn(rIn)}: ${title}`;
    const lead = reasons[0];
    out.push({ ...base, severity: "medium", title, measured: lead[1], limit: lead[2], unit: lead[3],
      suggestion: reasons.map((r) => r[4]).join(" ") });
  }
  return out;
}

/** The corners this rule passed, with the math (D-023 proposed). */
export function passes(features: Feature[], _part: PartSummary, limits: Limits): Pass[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const [minIn, maxRatio] = [table.min_radius_in, table.max_depth_ratio];
  const out: Pass[] = [];
  for (const f of features) {
    if (f.kind !== "corner") continue;
    const dims = f.dims_mm;
    const rIn = dims.radius / MM_PER_IN;
    const ratio = dims.depth / dims.end_mill_mm;
    if (dims.radius <= SHARP_MM || rIn < minIn - EPS || ratio > maxRatio + EPS) continue;
    out.push({ rule: ID, feature: f.id, faces: f.faces, threshold_source: table.source,
      title: `Radius ${fmtIn(rIn)}, and the end mill that fits is short enough`,
      math: `radius ${pyFixed(rIn, 4)} in ≥ ${pyFixed(minIn, 5)} in (1/32); ${pyFixed(dims.depth / MM_PER_IN, 3)} in deep ÷ `
        + `${pyFixed(dims.end_mill_mm / MM_PER_IN, 3)} in end mill = ${pyFixed(ratio, 2)}× ≤ ${pyFixed(maxRatio, 1)}×` });
  }
  return out;
}
