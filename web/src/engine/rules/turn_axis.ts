// Port of service/dfma/rules/turn_axis.py: uploaded for turning, but the axis carrying the most cylinder and cone area
// holds under 40% of the part's face area (assumption): "No turning axis found; check the process", high. Then only
// the shared rules run (analyze drops turn_slender, turn_offaxis and bore_depth).
import { TURN_SHARE_MIN_PCT } from "../features/turned";
import { pyFixed, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "turn_axis";
export const PROCESSES = ["turn"] as const;

export function check(_features: Feature[], part: PartSummary, _limits: Limits): Finding[] {
  const turn = part.turn;
  if (turn === undefined || turn.share_pct + 1e-9 >= TURN_SHARE_MIN_PCT) return [];
  const share = turn.share_pct;
  return [{ rule: ID, severity: "high",
    title: "No turning axis found; check the process",
    measured: round(share, 4), limit: TURN_SHARE_MIN_PCT, unit: "%",
    faces: turn.faces.length ? turn.faces : Array.from({ length: part.face_count }, (_, i) => i), feature: null,
    threshold_source: "assumption",
    suggestion: `Round faces on one axis are ${pyFixed(share, 1)}% of this part's surface (a turned part needs ` +
      `${pyFixed(TURN_SHARE_MIN_PCT, 0)}% or more). Review it for milling instead.` }];
}

export function passes(features: Feature[], _part: PartSummary, _limits: Limits): Pass[] {
  const out: Pass[] = [];
  for (const f of features) {
    if (f.kind !== "profile") continue;
    const share = f.dims_mm.share_pct;
    out.push({ rule: ID, feature: f.id, faces: f.faces, threshold_source: "assumption",
      title: "Round faces on one axis: a lathe part",
      math: `${pyFixed(share, 1)}% of the surface is round on this axis ≥ ${pyFixed(TURN_SHARE_MIN_PCT, 0)}%` });
  }
  return out;
}
