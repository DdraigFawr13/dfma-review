// Port of service/dfma/rules/hole_size.py: a diameter that matches no drill within 0.0005 in is medium (spec Rules,
// D-010). A tapered hole (D-018 tapered-holes round) is reamed to its taper, so no drill size applies to it.
import { drillRangeMm, matchToleranceMm, nearestDrill } from "../tools";
import { fmtIn, MM_PER_IN, pyFixed, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "hole_size";
export const PROCESSES = ["mill", "turn"] as const;
const SOURCE = "drill list in config/tools.toml";

export function check(features: Feature[], part: PartSummary, _limits: Limits): Finding[] {
  const units = part.units_in_file;
  const tol = matchToleranceMm();
  const [, top] = drillRangeMm(units);
  const out: Finding[] = [];
  for (const f of features) {
    if (f.kind !== "hole") continue;
    const d = f.dims_mm.diameter;
    if (f.dims_mm.taper_deg) continue; // a tapered hole is reamed to its taper, not drilled to a size
    if (d > top + tol) continue; // above the drill range: milled with an end mill instead (D-010)
    const drill = nearestDrill(d, units);
    if (Math.abs(d - drill.diameter_mm) <= tol) continue;
    const drillIn = drill.diameter_mm / MM_PER_IN;
    const nearest = drill.metric ? `Nearest drill ${drill.label} (${pyFixed(drillIn, 3)} in).` : `Nearest drill ${fmtIn(drillIn, true)}.`;
    out.push({
      rule: ID, severity: "medium",
      title: `Hole ${fmtIn(d / MM_PER_IN, true)} not a standard drill size`,
      measured: round(d / MM_PER_IN, 6), limit: round(drillIn, 6), unit: "in",
      faces: f.faces, feature: f.id, threshold_source: SOURCE,
      suggestion: `${nearest} Use it if the fit allows.`,
    });
  }
  return out;
}

/** The holes this rule passed or did not judge, and why (D-023 proposed). */
export function passes(features: Feature[], part: PartSummary, _limits: Limits): Pass[] {
  const units = part.units_in_file;
  const tol = matchToleranceMm();
  const [, top] = drillRangeMm(units);
  const out: Pass[] = [];
  for (const f of features) {
    if (f.kind !== "hole") continue;
    const d = f.dims_mm.diameter;
    const row = { rule: ID, feature: f.id, faces: f.faces, threshold_source: SOURCE };
    if (f.dims_mm.taper_deg) {
      out.push({ ...row, title: "Tapered: reamed, so no drill size applies", math: `taper ${pyFixed(f.dims_mm.taper_deg, 2)}° a side` });
      continue;
    }
    if (d > top + tol) {
      out.push({ ...row, title: "Above the drill range: cut with an end mill",
        math: `${pyFixed(d / MM_PER_IN, 3)} in > largest drill ${pyFixed(top / MM_PER_IN, 3)} in` });
      continue;
    }
    const drill = nearestDrill(d, units);
    const gap = Math.abs(d - drill.diameter_mm);
    if (gap > tol) continue;
    const name = drill.metric ? drill.label : fmtIn(drill.diameter_mm / MM_PER_IN, true);
    out.push({ ...row, title: `Standard drill: ${name}`,
      math: `|${pyFixed(d / MM_PER_IN, 4)} − ${pyFixed(drill.diameter_mm / MM_PER_IN, 4)}| = ${pyFixed(gap / MM_PER_IN, 4)} in ` +
        `≤ ${pyFixed(tol / MM_PER_IN, 4)} in` });
  }
  return out;
}
