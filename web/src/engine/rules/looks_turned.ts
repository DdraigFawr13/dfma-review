// Port of service/dfma/rules/looks_turned.py (D-028, mill only): the mirror of turn_axis. Reviewed for milling, but round
// faces on one axis are 40% or more of the part's surface: "This part looks turned; review it for Turning", high.
import { TURN_SHARE_MIN_PCT } from "../features/turned";
import { pyFixed, round } from "../units";
import type { Feature, Finding, Limits, PartSummary } from "./types";

export const ID = "looks_turned";
export const PROCESSES = ["mill"] as const;

export function check(_features: Feature[], part: PartSummary, _limits: Limits): Finding[] {
  const turn = part.turn;
  if (turn === undefined || turn.share_pct + 1e-9 < TURN_SHARE_MIN_PCT) return [];
  const share = turn.share_pct;
  return [{ rule: ID, severity: "high",
    title: "This part looks turned; review it for Turning",
    measured: round(share, 4), limit: TURN_SHARE_MIN_PCT, unit: "%",
    faces: turn.faces, feature: null, threshold_source: "assumption",
    suggestion: `Round faces on one axis are ${pyFixed(share, 1)}% of this part's surface (${pyFixed(TURN_SHARE_MIN_PCT, 0)}% ` +
      "or more reads as a lathe part). The milling plan leaves out its outside, grooves and " +
      "bores; pick Turning to plan them." }];
}
