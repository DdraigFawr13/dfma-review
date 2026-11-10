// Port of service/dfma/rules/thread_mismatch.py: a thread in the .ipt that disagrees with the STEP hole it sits on
// (D-032). One medium finding per `disagrees` thread; runs only when an .ipt was read (analyze NEEDS_IPT).
import { PAIR_TOL_MM } from "../settings";
import { mmToIn, round } from "../units";
import type { Feature, Finding, Limits, PartSummary } from "./types";

export const ID = "thread_mismatch";
export const PROCESSES = ["mill", "turn"] as const;
export const SOURCE = "D-032: the .ipt and STEP must agree";
export const SUGGESTION = "Export the STEP again from this .ipt, or check this thread in Inventor.";
export const CAUSE = "the part or an old STEP export differs from the .ipt";

type Gap = { mm: number; text: string };
export const gapsText = (gaps: Gap[]) => gaps.map((g) => g.text).join("; ");
export const worstIn = (gaps: Gap[]) => round(mmToIn(Math.max(...gaps.map((g) => g.mm))), 6);

export function check(features: Feature[], part: PartSummary, _limits: Limits): Finding[] {
  const byId = new Map(features.map((f) => [f.id, f]));
  const out: Finding[] = [];
  for (const t of part.inventor_threads ?? []) {
    if (t.state !== "disagrees" || !byId.has(t.hole!)) continue;
    out.push({ rule: ID, severity: "medium",
      title: `${t.designation ?? "None"} thread on ${t.hole}: ${gapsText(t.gaps)}. Possible cause: ${CAUSE}`,
      measured: worstIn(t.gaps), limit: round(mmToIn(PAIR_TOL_MM), 6), unit: "in", faces: byId.get(t.hole!)!.faces,
      feature: t.hole, threshold_source: SOURCE, suggestion: SUGGESTION, thread: t.id });
  }
  return out;
}
