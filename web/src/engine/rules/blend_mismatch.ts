// Port of service/dfma/rules/blend_mismatch.py: a fillet whose radius disagrees with the STEP face at its place
// (D-039). One medium finding per `disagrees` blend; runs only when an .ipt was read, last in RULES.
import { PAIR_TOL_MM } from "../settings";
import { mmToIn, round } from "../units";
import { CAUSE, gapsText, SOURCE, worstIn } from "./thread_mismatch";
import type { Feature, Finding, Limits, PartSummary } from "./types";

export const ID = "blend_mismatch";
export const PROCESSES = ["mill", "turn"] as const;
export const SUGGESTION = "Export the STEP again from this .ipt, or check this fillet in Inventor.";

export function check(_features: Feature[], part: PartSummary, _limits: Limits): Finding[] {
  return (part.inventor_blends ?? []).filter((b) => b.state === "disagrees").map((b) => ({ rule: ID, severity: "medium",
    title: `Fillet ${b.id}: ${gapsText(b.gaps)}. Possible cause: ${CAUSE}`,
    measured: worstIn(b.gaps), limit: round(mmToIn(PAIR_TOL_MM), 6), unit: "in", faces: [...b.step_faces],
    feature: b.id, threshold_source: SOURCE, suggestion: SUGGESTION, blend: b.id }));
}
