// Port of service/dfma/rules/bore_depth.py (D-026): a bore's depth / its diameter, the boring bar's reach. Over 4.0 is
// medium (needs a carbide bar), over 6.0 is high (needs a damped bar). Bores only; holes keep hole_depth.
import { MM_PER_IN, pastLimit, pyFixed, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "bore_depth";
export const PROCESSES = ["turn"] as const;
export const SUGGESTION: Record<string, string> = {
  medium: "Past a steel boring bar's reach (4× its diameter): needs a carbide bar. Make it shallower or " +
    "wider if the design allows.",
  high: "Past a carbide boring bar's reach (6× its diameter): needs a damped bar. Make it shallower or " +
    "wider if the design allows.",
};

type Table = { medium: number; high: number; source: string };

export function check(features: Feature[], _part: PartSummary, limits: Limits): Finding[] {
  const table = limits[ID] as Table | undefined;
  const out: Finding[] = [];
  for (const f of features) {
    if (f.kind !== "bore" || table === undefined) continue;
    const ratio = f.dims_mm.depth / f.dims_mm.diameter;
    let severity: string, limit: number;
    if (ratio > table.high + 1e-9) [severity, limit] = ["high", table.high];
    else if (ratio > table.medium + 1e-9) [severity, limit] = ["medium", table.medium];
    else continue;
    out.push({ rule: ID, severity,
      title: `Bore depth ${pastLimit(ratio, limit, 1)}× diameter (limit ${pyFixed(limit, 1)}×)`,
      measured: round(ratio, 4), limit, unit: "ratio",
      faces: f.faces, feature: f.id, threshold_source: table.source,
      suggestion: SUGGESTION[severity] });
  }
  return out;
}

export function passes(features: Feature[], _part: PartSummary, limits: Limits): Pass[] {
  const table = limits[ID] as Table | undefined;
  const out: Pass[] = [];
  for (const f of features) {
    if (f.kind !== "bore" || table === undefined) continue;
    const [d, depth] = [f.dims_mm.diameter, f.dims_mm.depth];
    const ratio = depth / d;
    if (ratio > table.medium + 1e-9) continue;
    out.push({ rule: ID, feature: f.id, faces: f.faces, threshold_source: table.source,
      title: `Bore depth ${pyFixed(ratio, 1)}× diameter, at most ${pyFixed(table.medium, 1)}×: a steel boring bar reaches`,
      math: `${pyFixed(depth / MM_PER_IN, 3)} in deep ÷ ${pyFixed(d / MM_PER_IN, 3)} in diameter = ${pyFixed(ratio, 2)}× ` +
        `≤ ${pyFixed(table.medium, 1)}×` });
  }
  return out;
}
