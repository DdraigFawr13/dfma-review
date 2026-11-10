// The rule order of service/dfma/rules/__init__.py RULES, with each rule's PROCESSES. A slice that ports a rule
// adds its module here and marks it ported; checks_not_run names every rule not ported yet (port spec Design).
export interface RuleEntry { ID: string; PROCESSES: readonly ("mill" | "turn")[]; ported: boolean }

export const RULES: RuleEntry[] = [
  { ID: "hole_depth", PROCESSES: ["mill", "turn"], ported: false },
  { ID: "hole_size", PROCESSES: ["mill", "turn"], ported: false },
  { ID: "corner_radius", PROCESSES: ["mill"], ported: false },
  { ID: "pocket_depth", PROCESSES: ["mill"], ported: false },
  { ID: "undercut", PROCESSES: ["mill"], ported: false },
  { ID: "thin_wall", PROCESSES: ["mill", "turn"], ported: false },
  { ID: "access", PROCESSES: ["mill"], ported: false },
  { ID: "looks_turned", PROCESSES: ["mill"], ported: false },
  { ID: "turn_axis", PROCESSES: ["turn"], ported: false },
  { ID: "turn_slender", PROCESSES: ["turn"], ported: false },
  { ID: "turn_offaxis", PROCESSES: ["turn"], ported: false },
  { ID: "bore_depth", PROCESSES: ["turn"], ported: false },
  { ID: "thread_mismatch", PROCESSES: ["mill", "turn"], ported: false },
  { ID: "hole_mismatch", PROCESSES: ["mill", "turn"], ported: false },
  { ID: "blend_mismatch", PROCESSES: ["mill", "turn"], ported: false },
];
