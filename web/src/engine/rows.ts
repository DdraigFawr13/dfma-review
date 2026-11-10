// Port of service/dfma/rows.py. S1 ports check_name and checks_run; the rest of the rows come with S2.

/** Check names by rule (rows.py CHECKS). */
export const CHECKS: Record<string, string> = {
  corner_radius: "Corner radius check",
  hole_depth: "Hole depth check",
  hole_size: "Hole size check",
  pocket_depth: "Pocket depth check",
  thin_wall: "Thin wall check",
  undercut: "Undercut check",
  access: "Access check",
  looks_turned: "Process check",
  turn_axis: "Turning axis check",
  turn_slender: "Length to diameter check",
  turn_offaxis: "Turning axis check",
  bore_depth: "Bore depth check",
  thread_mismatch: ".ipt check",
  hole_mismatch: ".ipt check",
  blend_mismatch: ".ipt check",
};

/** "Hole depth check" for "hole_depth"; a rule missing from CHECKS is a build error. */
export function checkName(rule: string): string {
  const name = CHECKS[rule];
  if (name === undefined) throw new Error(`no check name for rule ${rule}`);
  return name;
}

/** The check names of the rules run, in run order, each once (two rules can share a check). */
export function checksRun(rulesRun: string[]): string[] {
  return [...new Set(rulesRun.map(checkName))];
}
