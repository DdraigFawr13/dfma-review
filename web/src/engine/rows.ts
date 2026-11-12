// Port of service/dfma/rows.py (whole, S2): plain words for the review screen (review-steps spec "Rows", D-045).
import { fmtIn, pastLimit, pyFixed, pyG, pySum, round } from "./units";

/** Check names by rule (rows.py CHECKS). */
export const CHECKS: Record<string, string> = {
  corner_radius: "Corner radius check",
  hole_depth: "Hole depth check",
  hole_size: "Hole size check",
  pocket_depth: "Pocket depth check",
  step_depth: "Step depth check",
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

/** Where a limit comes from, in the reader's words (spec "Limit source"). */
export const LIMITS: Record<string, string> = {
  estimate: "limit is an estimate",
  assumption: "limit is an assumption",
  spec: "limit from the spec",
  "drill list in config/tools.toml": "drill list, within 0.0005 in",
  "D-032: the .ipt and STEP must agree": "the .ipt and STEP must agree within 0.01 mm",
  "D-021": "limit Morgan approved",
  "D-025": "limit Morgan approved",
  "D-026 (Sandvik)": "limit from Sandvik's tables",
};

/** "limit is an estimate" for "estimate"; a source LIMITS lacks shows as given ("limit: shop table"). */
export function limitText(source: string): string {
  return LIMITS[source] ?? `limit: ${source}`;
}

/** The sum of the drivers' scores to one decimal, or null when there are no drivers. */
export function costTotal(drivers: { score: number }[]): number | null {
  return drivers.length ? round(pySum(drivers.map((d) => d.score)), 1) : null;
}

// --- the Features step's rows (spec Design "Rows") ---

/** Short titles by rule and case ("rule|severity" for a rule with one per severity). */
export const SHORTS: Record<string, string> = {
  "corner_radius|high": "Sharp corner",
  "corner_radius|medium": "Small corner radius",
  hole_depth: "Deep hole",
  hole_size: "Drill size",
  pocket_depth: "Deep pocket",
  step_depth: "Deep step",
  thin_wall: "Thin wall",
  undercut: "Undercut",
  access: "Angled feature",
  looks_turned: "Looks turned",
  turn_axis: "No turning axis",
  turn_slender: "Slender part",
  turn_offaxis: "Off the turning axis",
  bore_depth: "Deep bore",
  thread_mismatch: "Thread vs hole",
  hole_mismatch: "Hole feature vs hole",
  blend_mismatch: "Fillet vs face",
};

/** Sentences for the four rule cases that have their own: one finding, several findings. */
export const SENTENCES: Record<string, [string, string]> = {
  "corner_radius|high": ["Inside corner has no radius. Needs {limit} or more, or EDM (spark erosion).",
    "Inside corners have no radius. Needs {limit} or more, or EDM (spark erosion)."],
  hole_depth: ["{measured} the diameter deep. Over {limit} needs peck drilling (drilling in short steps to clear chips).",
    "{values} the diameter deep. Over {limit} needs peck drilling (drilling in short steps to clear chips)."],
  hole_size: ["{measured} isn't a standard drill. Nearest is {limit}.", "{values} aren't standard drills. Nearest is {limit}."],
  pocket_depth: ["Depth is {measured} the end mill that fits. Over {limit} needs a long tool.",
    "Depths are {values} the end mill that fits. Over {limit} needs a long tool."],
  step_depth: ["Step depth is {measured} the end mill that fits. Over {limit} needs a long tool.",
    "Step depths are {values} the end mill that fits. Over {limit} needs a long tool."],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type F = Record<string, any>;

/** A finding's rule case: its severity, and for corner_radius medium also its unit. */
function caseOf(f: F): string {
  return f.rule === "corner_radius" && f.severity === "medium" ? `${f.severity}|${f.unit ?? null}` : f.severity;
}

function lookup<T>(table: Record<string, T>, rule: string, severity: string): T | undefined {
  return table[`${rule}|${severity}`] ?? table[rule];
}

/** A measured value or limit in words: "0.031 in (1/32)", "9.6×", "22.0°", else the number and unit as given. */
export function valueText(value: number, unit: string | null | undefined, other?: number | null): string {
  if (unit === "in") return fmtIn(value, true);
  if (unit === "ratio") return `${other != null ? pastLimit(value, other, 1) : pyFixed(value, 1)}×`;
  if (unit === "deg") return `${pyFixed(value, 1)}°`;
  return unit ? `${pyG(value)} ${unit}` : pyG(value);
}

/** "a and b", "a, b and c", "from a to z" (4 or more). */
export function joinValues(values: string[]): string {
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  if (values.length === 3) return `${values[0]}, ${values[1]} and ${values[2]}`;
  return `from ${values[0]} to ${values[values.length - 1]}`;
}

/** "F4–F7" for a run of three or more ids without a gap, else the ids with spaces (D-047). */
export function idRange(ids: string[]): string {
  const nums = ids.map((i) => Number(i.replace(/^F+/, "")));
  const run = ids.length >= 3 && nums.every((n, k) => k === 0 || n === nums[k - 1] + 1);
  return run ? `${ids[0]}–${ids[ids.length - 1]}` : ids.join(" ");
}

/** " Cut in 8 passes of 0.031 in (1/32)." for deep pockets that all take the same passes (D-052), else "". */
function passesText(group: F[]): string {
  const found = new Set(group.map((f) => JSON.stringify([f.passes ?? null, round(f.pass_in || 0, 4)])));
  if (found.size !== 1 || group[0].passes == null) return "";
  const [n, step] = JSON.parse([...found][0]) as [number, number];
  return ` Cut in ${n} ${n === 1 ? "pass" : "passes"} of ${fmtIn(step, true)}.`;
}

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k]);

function one(f: F): string {
  const templates = lookup(SENTENCES, f.rule, f.severity);
  if (templates === undefined) return `${f.title}.`;
  const unit = f.unit;
  return fill(templates[0], { measured: valueText(f.measured, unit, f.limit), limit: valueText(f.limit, unit) }) + passesText([f]);
}

/** One finding: its sentence. Several: the `many` template with the distinct values high to low; a case with no
 *  template: the shared title, else the worst finding's title and "Worst of n.". */
function sentence(group: F[]): string {
  const first = group[0];
  const templates = lookup(SENTENCES, first.rule, first.severity);
  if (group.length === 1) return one(first);
  if (templates === undefined) {
    const titles = new Set(group.map((f) => f.title));
    if (titles.size === 1) return `${[...titles][0]}.`;
    const worst = group.reduce((a, b) => (b.measured > a.measured ? b : a)); // Python's max keeps the first
    return `${worst.title}. Worst of ${group.length}.`;
  }
  const unit = first.unit;
  const ordered = [...new Set(group.map((f) => f.measured as number))].sort((a, b) => b - a);
  const values = [...new Set(ordered.map((v) => valueText(v, unit, first.limit)))];
  return fill(templates[1], { values: joinValues(values), limit: valueText(first.limit, unit) }) + passesText(group);
}

/** Findings grouped into rows: the same rule, case, severity and limit form one row, in F-id order; rows in order of
 *  their first F id, Fix rows first. */
export function findingRows(findings: F[]): F[] {
  const groups = new Map<string, F[]>();
  for (const f of [...findings].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))) {
    const key = JSON.stringify([f.rule, caseOf(f), f.severity, f.limit ?? null]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }
  const out: F[] = [];
  for (const group of groups.values()) {
    const { rule, severity } = group[0];
    const ids = group.map((f) => f.id as string);
    out.push({
      id: `row:${ids[0]}`,
      rule,
      severity,
      short: lookup(SHORTS, rule, severity),
      count: group.length,
      findings: ids,
      range: idRange(ids),
      sentence: sentence(group),
      check: checkName(rule),
      limit: limitText(group[0].threshold_source),
      features: [...new Set(group.filter((f) => f.feature).map((f) => f.feature))],
    });
  }
  const first = (r: F) => Number(r.findings[0].slice(1));
  return out.sort((a, b) => Number(a.severity !== "high") - Number(b.severity !== "high") || first(a) - first(b));
}

/** Features with no finding that passed a check, grouped by kind and rule ("Walls ×9", Thin wall check). */
export function passedRows(features: F[], findings: F[], passed: F[]): F[] {
  const flagged = new Set(findings.map((f) => f.feature));
  const kinds = new Map(features.map((x) => [x.id, x.kind]));
  const groups = new Map<string, F[]>();
  for (const p of passed) {
    if (flagged.has(p.feature) || !kinds.has(p.feature)) continue;
    const key = JSON.stringify([kinds.get(p.feature), p.rule]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const out: F[] = [];
  for (const [key, group] of groups) {
    const [kind, rule] = JSON.parse(key) as [string, string];
    const feats = [...new Set(group.map((p) => p.feature))];
    out.push({
      id: `row:pass-${kind}-${rule}`,
      rule,
      severity: "ok",
      kind,
      short: `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`,
      count: feats.length,
      findings: [],
      range: "",
      sentence: group[0].title,
      check: checkName(rule),
      limit: limitText(group[0].threshold_source),
      features: feats,
    });
  }
  return out;
}
