// Port of service/dfma/rules/turn_offaxis.py: a hole or pocket whose axis is not coaxial with the turning axis (within
// 0.5 deg, offset 0.001 in or less) is medium: "needs a milling operation or live tooling". The angle and offset come
// from the features (off_axis_deg, off_axis_mm, set by analyze for turned parts). A sealed void is not judged.
import { COAX_DEG, COAX_OFFSET_MM } from "../features/turned";
import { MM_PER_IN, pyFixed, round } from "../units";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export const ID = "turn_offaxis";
export const PROCESSES = ["turn"] as const;
const KINDS = ["hole", "pocket"];

export function offAxis(f: Feature): boolean {
  return f.off_axis_deg > COAX_DEG || f.off_axis_mm > COAX_OFFSET_MM;
}

export function check(features: Feature[], _part: PartSummary, _limits: Limits): Finding[] {
  const out: Finding[] = [];
  for (const f of features) {
    if (!KINDS.includes(f.kind) || !("off_axis_deg" in f) || !f.open_vectors?.length || !offAxis(f)) continue;
    const what = f.kind === "hole" ? "Hole" : "Pocket";
    const [angle, off] = [f.off_axis_deg as number, (f.off_axis_mm as number) / MM_PER_IN];
    const tilted = angle > COAX_DEG;
    out.push({ rule: ID, severity: "medium",
      title: `${what} not on the turning axis: needs a milling operation or live tooling`,
      measured: round(tilted ? angle : off, 4), limit: tilted ? COAX_DEG : 0.001,
      unit: tilted ? "deg" : "in",
      faces: f.faces, feature: f.id, threshold_source: "spec",
      suggestion: (tilted ? `${pyFixed(angle, 1)}° to the turning axis` : `${pyFixed(off, 4)} in off the turning axis`) +
        ". Cut it with live tooling " +
        "on the lathe or in a second setup on a mill, or move it onto the axis if the " +
        "design allows." });
  }
  return out;
}

export function passes(features: Feature[], _part: PartSummary, _limits: Limits): Pass[] {
  const out: Pass[] = [];
  for (const f of features) {
    if (![...KINDS, "bore"].includes(f.kind) || !("off_axis_deg" in f) || offAxis(f)) continue;
    out.push({ rule: ID, feature: f.id, faces: f.faces, threshold_source: "spec",
      title: "On the turning axis: cut on the lathe",
      math: `${pyFixed(f.off_axis_deg, 2)}° ≤ ${COAX_DEG}° and ` +
        `${pyFixed(f.off_axis_mm / MM_PER_IN, 4)} in ≤ 0.001 in off the axis` });
  }
  return out;
}
