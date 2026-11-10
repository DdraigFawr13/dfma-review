// The rule order of service/dfma/rules/__init__.py RULES, with each rule's PROCESSES. A slice that ports a rule adds
// its module here and the processes it is ported for; checks_not_run names every rule not ported yet for the process
// (port spec Design). S2's hole rules are ported for Milling only: on a turned part Python splits the holes into
// holes and bores first (split_bores, S6), so the browser copy runs no hole rule there until S6. S4's pocket rules
// (corner_radius, pocket_depth, undercut) run on Milling only, as in Python.
import type { Process } from "../../api";
import * as access from "./access";
import * as cornerRadius from "./corner_radius";
import * as pocketDepth from "./pocket_depth";
import * as undercut from "./undercut";
import * as holeDepth from "./hole_depth";
import * as holeSize from "./hole_size";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export interface RuleModule {
  check: (features: Feature[], part: PartSummary, limits: Limits) => Finding[];
  passes?: (features: Feature[], part: PartSummary, limits: Limits) => Pass[];
}
export interface RuleEntry { ID: string; PROCESSES: readonly Process[]; ported: readonly Process[]; module?: RuleModule }

export const RULES: RuleEntry[] = [
  { ID: "hole_depth", PROCESSES: ["mill", "turn"], ported: ["mill"], module: holeDepth },
  { ID: "hole_size", PROCESSES: ["mill", "turn"], ported: ["mill"], module: holeSize },
  { ID: "corner_radius", PROCESSES: ["mill"], ported: ["mill"], module: cornerRadius },
  { ID: "pocket_depth", PROCESSES: ["mill"], ported: ["mill"], module: pocketDepth },
  { ID: "undercut", PROCESSES: ["mill"], ported: ["mill"], module: undercut },
  { ID: "thin_wall", PROCESSES: ["mill", "turn"], ported: [] },
  { ID: "access", PROCESSES: ["mill"], ported: ["mill"], module: access },
  { ID: "looks_turned", PROCESSES: ["mill"], ported: [] },
  { ID: "turn_axis", PROCESSES: ["turn"], ported: [] },
  { ID: "turn_slender", PROCESSES: ["turn"], ported: [] },
  { ID: "turn_offaxis", PROCESSES: ["turn"], ported: [] },
  { ID: "bore_depth", PROCESSES: ["turn"], ported: [] },
  { ID: "thread_mismatch", PROCESSES: ["mill", "turn"], ported: [] },
  { ID: "hole_mismatch", PROCESSES: ["mill", "turn"], ported: [] },
  { ID: "blend_mismatch", PROCESSES: ["mill", "turn"], ported: [] },
];
