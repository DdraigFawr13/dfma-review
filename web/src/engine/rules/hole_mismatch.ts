// Port of service/dfma/rules/hole_mismatch.py: an .ipt hole that disagrees with the STEP hole it sits on (D-032). One
// medium finding per `disagrees` hole; after thread_mismatch, and skips a STEP hole that already has a thread_mismatch
// finding (one finding per hole).
import { PAIR_TOL_MM } from "../settings";
import { mmToIn, round } from "../units";
import { CAUSE, gapsText, SOURCE, worstIn } from "./thread_mismatch";
import type { Feature, Finding, Limits, PartSummary } from "./types";

export const ID = "hole_mismatch";
export const PROCESSES = ["mill", "turn"] as const;
export const SUGGESTION = "Export the STEP again from this .ipt, or check this Hole feature in Inventor.";

export function check(features: Feature[], part: PartSummary, _limits: Limits): Finding[] {
  const byId = new Map(features.map((f) => [f.id, f]));
  const threaded = new Set((part.inventor_threads ?? []).filter((t) => t.state === "disagrees").map((t) => t.hole));
  const out: Finding[] = [];
  for (const hf of part.inventor_holes ?? []) {
    const label = hf.name || `Hole feature ${hf.id}`;
    for (const h of hf.holes) {
      if (h.state !== "disagrees" || !byId.has(h.hole!) || threaded.has(h.hole)) continue;
      out.push({ rule: ID, severity: "medium",
        title: `${label} hole on ${h.hole}: ${gapsText(h.gaps)}. Possible cause: ${CAUSE}`,
        measured: worstIn(h.gaps), limit: round(mmToIn(PAIR_TOL_MM), 6), unit: "in", faces: byId.get(h.hole!)!.faces,
        feature: h.hole, threshold_source: SOURCE, suggestion: SUGGESTION, hole_feature: hf.id, ipt_hole: h.id });
    }
  }
  return out;
}
