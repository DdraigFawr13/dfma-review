// Port of service/dfma/rules/thin_wall.py: a wall thinner than the material's limit is high (spec Rules; S4 "Settled
// at build"). Limits: 0.030 in (al6061), 0.020 in (steel1018, ss304), 0.060 in (plastic), from config/thresholds.toml.
import { MM_PER_IN, pyFixed, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "thin_wall";
export const PROCESSES = ["mill", "turn"] as const; // spec Flow: shared by both processes
const EPS = 1e-9;

type Table = { min_in: number; source: string };

export function check(features: Feature[], _part: PartSummary, limits: Limits): Finding[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const limit = table.min_in;
  const out: Finding[] = [];
  for (const f of features) {
    if (f.kind !== "wall") continue;
    const tIn = f.dims_mm.thickness / MM_PER_IN;
    if (tIn >= limit - EPS) continue; // "under 0.030 in": a wall that is 0.030 in to rounding is not under it
    let shown = pyFixed(tIn, 3);
    if (shown === pyFixed(limit, 3)) shown = pyFixed(tIn, 4); // 0.02996 in would read "0.030 in thick (limit 0.030 in)"
    out.push({ rule: ID, severity: "high",
      title: `Wall ${shown} in thick (limit ${pyFixed(limit, 3)} in)`,
      measured: round(tIn, 5), limit, unit: "in",
      faces: f.faces, feature: f.id, threshold_source: table.source,
      suggestion: `Make the wall ${pyFixed(limit, 3)} in or thicker if the design allows.` });
  }
  return out;
}

/** The walls this rule passed, with the math (D-023 proposed). */
export function passes(features: Feature[], _part: PartSummary, limits: Limits): Pass[] {
  const table = limits[ID] as Table | undefined;
  if (table === undefined) return [];
  const limit = table.min_in;
  const out: Pass[] = [];
  for (const f of features) {
    if (f.kind !== "wall") continue;
    const tIn = f.dims_mm.thickness / MM_PER_IN;
    if (tIn < limit - EPS) continue;
    out.push({ rule: ID, feature: f.id, faces: f.faces, threshold_source: table.source,
      title: `${pyFixed(tIn, 3)} in thick, at least ${pyFixed(limit, 3)} in`,
      math: `${pyFixed(tIn, 3)} in ≥ ${pyFixed(limit, 3)} in` });
  }
  return out;
}
