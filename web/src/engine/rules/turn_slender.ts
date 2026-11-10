// Port of service/dfma/rules/turn_slender.py: the turned profile's length / its smallest outside diameter (D-026) over
// the medium limit is medium (3.0 for the steels, 4.0 for aluminium and plastic, D-025), over 8.0 is high. The
// suggestion names the support the ratio needs (D-026, CADEM thumb rules; Swiss-type over 10x, Wevolver).
import { MM_PER_IN, pastLimit, pyFixed, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "turn_slender";
export const PROCESSES = ["turn"] as const;
const SAME_MM = 0.001; // a profile whose smallest and largest diameters differ less than this has one diameter

type Table = { medium: number; high: number; source: string };

/** The support a turned part of this length / diameter needs. */
export function support(ratio: number): string {
  if (ratio <= 3.0) return "A chuck alone holds it.";
  if (ratio <= 6.0) return "Support the free end with a tailstock center; the part then needs a center hole.";
  if (ratio <= 12.0) return "Needs a tailstock and a steady rest, or a Swiss-type lathe.";
  return `Needs a tailstock and ${Math.ceil(ratio / 3) - 2} steady rests (${Math.ceil(ratio / 3)} holding points), ` +
    "or a Swiss-type lathe.";
}

/** [ratio, the diameter it divides by, whether the profile has more than one diameter]. */
function ratioOf(f: Feature): [number, number, boolean] {
  const d = f.dims_mm;
  const smallest = d.min_diameter ?? d.diameter;
  return [d.length / smallest, smallest, d.diameter - smallest > SAME_MM];
}

function what(stepped: boolean, dMm: number): string {
  return stepped ? `its smallest diameter, ${pyFixed(dMm / MM_PER_IN, 3)} in` : "diameter";
}

export function check(features: Feature[], _part: PartSummary, limits: Limits): Finding[] {
  const table = limits[ID] as Table | undefined;
  const out: Finding[] = [];
  for (const f of features) {
    if (f.kind !== "profile" || table === undefined) continue;
    const [ratio, d, stepped] = ratioOf(f);
    let severity: string, limit: number;
    if (ratio > table.high + 1e-9) [severity, limit] = ["high", table.high];
    else if (ratio > table.medium + 1e-9) [severity, limit] = ["medium", table.medium];
    else continue;
    const name = !stepped ? "diameter" : `its smallest diameter (${pyFixed(d / MM_PER_IN, 3)} in)`;
    out.push({ rule: ID, severity,
      title: `Length ${pastLimit(ratio, limit, 1)}× ${name} (limit ${pyFixed(limit, 1)}×)`,
      measured: round(ratio, 4), limit, unit: "ratio",
      faces: f.faces, feature: f.id, threshold_source: table.source,
      suggestion: support(ratio) + " Make it shorter or thicker if the design allows." });
  }
  return out;
}

export function passes(features: Feature[], _part: PartSummary, limits: Limits): Pass[] {
  const table = limits[ID] as Table | undefined;
  const out: Pass[] = [];
  for (const f of features) {
    if (f.kind !== "profile" || table === undefined) continue;
    const [ratio, d, stepped] = ratioOf(f);
    if (ratio > table.medium + 1e-9) continue;
    const length = f.dims_mm.length;
    out.push({ rule: ID, feature: f.id, faces: f.faces, threshold_source: table.source,
      title: `Length ${pyFixed(ratio, 1)}× ${what(stepped, d)}, at most ${pyFixed(table.medium, 1)}×`,
      math: `${pyFixed(length / MM_PER_IN, 3)} in long ÷ ${pyFixed(d / MM_PER_IN, 3)} in ` +
        `${stepped ? "smallest " : ""}diameter = ${pyFixed(ratio, 2)}× ≤ ${pyFixed(table.medium, 1)}×` });
  }
  return out;
}
