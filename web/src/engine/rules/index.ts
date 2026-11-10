// The rule order of service/dfma/rules/__init__.py RULES, with each rule's PROCESSES. A slice that ports a rule adds
// its module here and the processes it is ported for; checks_not_run names every rule not ported yet for the process
// (port spec Design). From S7 every rule is ported for every process it runs on.
import type { Process } from "../../api";
import * as access from "./access";
import * as cornerRadius from "./corner_radius";
import * as pocketDepth from "./pocket_depth";
import * as undercut from "./undercut";
import * as thinWall from "./thin_wall";
import * as holeDepth from "./hole_depth";
import * as holeSize from "./hole_size";
import * as looksTurned from "./looks_turned";
import * as turnAxis from "./turn_axis";
import * as turnSlender from "./turn_slender";
import * as turnOffaxis from "./turn_offaxis";
import * as boreDepth from "./bore_depth";
import * as threadMismatch from "./thread_mismatch";
import * as holeMismatch from "./hole_mismatch";
import * as blendMismatch from "./blend_mismatch";
import type { Feature, Finding, Limits, PartSummary, Pass } from "./types";

export interface RuleModule {
  check: (features: Feature[], part: PartSummary, limits: Limits) => Finding[];
  passes?: (features: Feature[], part: PartSummary, limits: Limits) => Pass[];
}
export interface RuleEntry { ID: string; PROCESSES: readonly Process[]; ported: readonly Process[]; module?: RuleModule }

export const RULES: RuleEntry[] = [
  { ID: "hole_depth", PROCESSES: ["mill", "turn"], ported: ["mill", "turn"], module: holeDepth },
  { ID: "hole_size", PROCESSES: ["mill", "turn"], ported: ["mill", "turn"], module: holeSize },
  { ID: "corner_radius", PROCESSES: ["mill"], ported: ["mill"], module: cornerRadius },
  { ID: "pocket_depth", PROCESSES: ["mill"], ported: ["mill"], module: pocketDepth },
  { ID: "undercut", PROCESSES: ["mill"], ported: ["mill"], module: undercut },
  { ID: "thin_wall", PROCESSES: ["mill", "turn"], ported: ["mill", "turn"], module: thinWall },
  { ID: "access", PROCESSES: ["mill"], ported: ["mill"], module: access },
  { ID: "looks_turned", PROCESSES: ["mill"], ported: ["mill"], module: looksTurned },
  { ID: "turn_axis", PROCESSES: ["turn"], ported: ["turn"], module: turnAxis },
  { ID: "turn_slender", PROCESSES: ["turn"], ported: ["turn"], module: turnSlender },
  { ID: "turn_offaxis", PROCESSES: ["turn"], ported: ["turn"], module: turnOffaxis },
  { ID: "bore_depth", PROCESSES: ["turn"], ported: ["turn"], module: boreDepth },
  { ID: "thread_mismatch", PROCESSES: ["mill", "turn"], ported: ["mill", "turn"], module: threadMismatch },
  { ID: "hole_mismatch", PROCESSES: ["mill", "turn"], ported: ["mill", "turn"], module: holeMismatch },
  { ID: "blend_mismatch", PROCESSES: ["mill", "turn"], ported: ["mill", "turn"], module: blendMismatch },
];
