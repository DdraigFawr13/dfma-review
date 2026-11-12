// Port of the pure functions of tests/grading/grade.py and tests/grading/summary.py: our hole and pocket recognition
// scored against labelled parts. No engine calls here; analyse.ts makes each file's result, run.ts runs the files.
// The scoring rules are Python's, unchanged. Counter keys are (label, prediction), kept as {lab, pred, n} entries.
import { round } from "../engine/units.ts";
import { baselineFor } from "./baseline.ts";

export const MARK = "@@grade-result@@"; // the result line a child prints (child.ts)

export const HOLE_CLASSES: Record<number, string> = { 1: "through", 12: "blind" };
export const POCKET_CLASSES: Record<number, string> = { 13: "triangular", 14: "rectangular", 15: "6-sided", 16: "circular end" };
/** Steps and slots spec (D-079): steps are scored from S1, slots from S2. */
export const STEP_CLASSES: Record<number, string> = { 8: "rectangular through", 9: "2-sided through", 10: "slanted through",
  20: "triangular blind", 21: "circular blind", 22: "rectangular blind" };
export const SLOT_CLASSES: Record<number, string> = { 6: "rectangular through", 17: "rectangular blind", 18: "vertical circular end blind",
  19: "horizontal circular end blind" };
/** Labels the hole and pocket baseline left out (blind slots and steps): kept out of the hole and pocket precision so
 *  those stay comparable with it (D-079, "counted on the labels the baseline scored"). */
export const NEW_LABELS = new Set([17, 18, 19, 20, 21, 22]);
/** V-groove (5) and round-bottom (7) through slots: no floor, outside the target until their own work (D-079). */
export const FLOORLESS = [5, 7];
export const EXCLUDED = new Set([11, 17, 18, 19, 23, 24]); // O-ring, blind slots (scored from S2), round, stock: not scored
const HOLE_IDS = Object.keys(HOLE_CLASSES).map(Number);
const POCKET_IDS = Object.keys(POCKET_CLASSES).map(Number);
const STEP_IDS = Object.keys(STEP_CLASSES).map(Number);

export type Pred = string | null; // "through", "blind", "hole", "pocket", "step", "slot" or null
export type Label = number | null;
type Lab = number | "unlabelled" | "excluded" | "held";

export interface FaceRec { kind: string; kind2: string | null; name: string | null; file_pos: number | null; shape_id: number | null }
export interface FeatureRec {
  kind: string; faces: number[]; open_ends: number | null; chain?: number; short_walls?: [number, number[]][];
}
/** One file's child result (child.ts), or a status with no analysis. */
export interface ChildResult {
  status: string; faces: FaceRec[]; features: FeatureRec[]; ignored_solids: number; error?: string | null;
  held_steps?: [string, number[]][];
  returncode?: number; stderr?: string;
}

const LABEL = /ADVANCED_FACE\s*\(\s*'(\d+)'/g;

/** The MFCAD++ label of every ADVANCED_FACE, in file order. */
export function fileLabels(step: Uint8Array | string): number[] {
  const text = typeof step === "string" ? step : Buffer.from(step).toString("latin1");
  return [...text.matchAll(LABEL)].map((m) => Number(m[1]));
}

export interface Checks { same_count: boolean; file_order: boolean; names_agree: boolean; kinds_agree: boolean }

/** Our faces' labels, joined through each face's STEP entity, with the order checks (grade.face_labels). */
export function faceLabels(result: { faces: FaceRec[] }, inFile: number[]): [Label[], Checks] {
  const faces = result.faces;
  const labels: Label[] = faces.map((f) => (f.name !== null && f.name !== undefined && /^\d+$/.test(f.name) ? Number(f.name) : null));
  const pos = faces.map((f) => f.file_pos);
  const checks: Checks = {
    same_count: faces.length === inFile.length,
    file_order: pos.length === faces.length && pos.every((p, i) => p === i),
    names_agree: faces.every((_, i) => pos[i] !== null && pos[i]! < inFile.length && inFile[pos[i]!] === labels[i]),
    kinds_agree: faces.every((f) => f.kind2 === null || f.kind2 === undefined || f.kind2 === f.kind),
  };
  return [labels, checks];
}

/** Our label for each face: "through" or "blind" (a hole with 2+ or 1 open end), "hole" (open_ends null), "pocket",
 *  "step", "slot", or null. A face in a hole counts as the hole's, then a pocket's, then a step's or slot's. */
export function predicted(result: { faces: unknown[]; features: FeatureRec[] }): Pred[] {
  const out: Pred[] = result.faces.map(() => null);
  for (const f of result.features) if (f.kind === "pocket") for (const i of f.faces) out[i] = out[i] || "pocket";
  for (const f of result.features) if (f.kind === "step" || f.kind === "slot") for (const i of f.faces) out[i] = out[i] || f.kind;
  for (const f of result.features) {
    if (f.kind === "hole") for (const i of f.faces) out[i] = f.open_ends === null ? "hole" : f.open_ends >= 2 ? "through" : "blind";
  }
  return out;
}

export class Tally {
  readonly cells = new Map<string, { lab: Lab | null; pred: Pred; n: number }>();
  add(lab: Lab | null, pred: Pred, n = 1): void {
    const key = `${lab}|${pred}`;
    const cell = this.cells.get(key);
    if (cell) cell.n += n;
    else this.cells.set(key, { lab, pred, n });
  }
  get(lab: Lab | null, pred: Pred): number {
    return this.cells.get(`${lab}|${pred}`)?.n ?? 0;
  }
  merge(other: Tally): void {
    for (const c of other.cells.values()) this.add(c.lab, c.pred, c.n);
  }
  [Symbol.iterator]() {
    return this.cells.values();
  }
}

/** Counts for one part, keyed (label, prediction); excluded labels are dropped, and so are faces whose label could not
 *  be read. Excluded faces we claimed are counted under ("excluded", pred). */
export function tally(labels: Label[], preds: Pred[], held: Set<number> = new Set()): Tally {
  const c = new Tally();
  labels.forEach((lab, i) => {
    const p = preds[i];
    if (lab === null) c.add("unlabelled", p);
    else if (held.has(i) && lab in STEP_CLASSES && p !== "step") c.add("held", p); // D-093: not a step, on its own line
    else if (EXCLUDED.has(lab)) {
      if (p) c.add("excluded", p);
    } else c.add(lab, p);
  });
  return c;
}

export interface Ratio { n: number; of: number; pct: number | null }
export const ratio = (n: number, d: number): Ratio => ({ n, of: d, pct: d ? round((100 * n) / d, 1) : null });

export interface Scores {
  recall: Record<string, Ratio>; type_recall: Record<string, Ratio>; precision: Record<string, Ratio>;
  false_by_label: Record<string, Record<string, number>>; claimed_on_excluded: Record<string, number>;
}

/** Face recall per MFCAD++ class, precision per hole type and per kind (grade.scores). */
export function scores(total: Tally): Scores {
  const out: Scores = { recall: {}, type_recall: {}, precision: {}, false_by_label: {}, claimed_on_excluded: {} };
  const sum = (f: (c: { lab: Lab | null; pred: Pred; n: number }) => boolean) => [...total].filter(f).reduce((a, c) => a + c.n, 0);
  for (const cls of HOLE_IDS) {
    const of = sum((c) => c.lab === cls);
    out.recall[cls] = ratio(sum((c) => c.lab === cls && (c.pred === "through" || c.pred === "blind" || c.pred === "hole")), of);
    out.type_recall[cls] = ratio(total.get(cls, HOLE_CLASSES[cls]), of);
  }
  for (const cls of POCKET_IDS) out.recall[cls] = ratio(total.get(cls, "pocket"), sum((c) => c.lab === cls));
  for (const cls of STEP_IDS) out.recall[cls] = ratio(total.get(cls, "step"), sum((c) => c.lab === cls));
  const all = [...total].filter((c) => typeof c.lab === "number") as { lab: number; pred: Pred; n: number }[];
  const scored = all.filter((c) => !NEW_LABELS.has(c.lab)); // holes and pockets: on the baseline's labels
  const groups: [string, Set<number>, Set<string>][] = [
    ["through", new Set([1]), new Set(["through"])], ["blind", new Set([12]), new Set(["blind"])],
    ["hole", new Set(HOLE_IDS), new Set(["through", "blind", "hole"])], ["pocket", new Set(POCKET_IDS), new Set(["pocket"])],
  ];
  for (const [name, cls, preds] of groups) {
    const claimed = scored.filter((c) => c.pred !== null && preds.has(c.pred)).reduce((a, c) => a + c.n, 0);
    const right = scored.filter((c) => c.pred !== null && preds.has(c.pred) && cls.has(c.lab)).reduce((a, c) => a + c.n, 0);
    out.precision[name] = ratio(right, claimed);
  }
  const step: [string, Set<number>, Set<string>] = ["step", new Set(STEP_IDS), new Set(["step"])];
  {
    const claimed = all.filter((c) => c.pred === "step").reduce((a, c) => a + c.n, 0);
    out.precision.step = ratio(all.filter((c) => c.pred === "step" && step[1].has(c.lab)).reduce((a, c) => a + c.n, 0), claimed);
  }
  for (const [kind, cls, preds] of [groups[2], groups[3], step]) {
    const wrong = new Map<number, number>();
    for (const c of kind === "step" ? all : scored) if (c.pred !== null && preds.has(c.pred) && !cls.has(c.lab)) wrong.set(c.lab, (wrong.get(c.lab) ?? 0) + c.n);
    // most_common: by count, ties in first-seen order (Python's Counter); a JS object puts integer keys in ascending order
    out.false_by_label[kind] = Object.fromEntries([...wrong].sort((a, b) => b[1] - a[1]));
  }
  for (const c of total) if (c.lab === "excluded") out.claimed_on_excluded[c.pred as string] = c.n;
  return out;
}

export interface Miss { part: string; class: number; faces: number[]; called: Pred[] }

/** One record per part and class with the faces we missed (0-based ids) and what we called them. */
export function misses(name: string, labels: Label[], preds: Pred[], held: Set<number> = new Set()): Miss[] {
  const out: Miss[] = [];
  for (const cls of [...HOLE_IDS, ...POCKET_IDS, ...STEP_IDS]) {
    const want = cls in POCKET_CLASSES ? ["pocket"] : cls in STEP_CLASSES ? ["step"] : ["through", "blind", "hole"];
    const missed = labels.flatMap((lab, i) => (lab === cls && !(preds[i] !== null && want.includes(preds[i]!))
      && !(cls in STEP_CLASSES && held.has(i)) ? [i] : []));
    if (missed.length) out.push({ part: name, class: cls, faces: missed, called: missed.map((i) => preds[i]) });
  }
  return out;
}

/** Each hole's faces: a hole feature's own, or the union of the segments that share a `chain`. */
export function holeGroups(features: FeatureRec[]): Set<number>[] {
  const chains = new Map<number, Set<number>>();
  const out: Set<number>[] = [];
  for (const f of features) {
    if (f.kind !== "hole") continue;
    if (f.chain === undefined || f.chain === null) out.push(new Set(f.faces));
    else {
      if (!chains.has(f.chain)) chains.set(f.chain, new Set());
      for (const i of f.faces) chains.get(f.chain)!.add(i);
    }
  }
  return [...out, ...chains.values()];
}

export interface Whole { whole: number; of: number; split: number; merged: number }

/** Labelled holes (or, with `kind`, steps or slots) found whole (grade.instance_score). */
export function instanceScore(features: FeatureRec[], instances: number[][], kind = "hole"): Whole {
  const groups = kind === "hole" ? holeGroups(features) : features.filter((f) => f.kind === kind).map((f) => new Set(f.faces));
  const owner = new Map<number, number>();
  instances.forEach((inst, k) => inst.forEach((i) => owner.set(i, k)));
  let [whole, split, merged] = [0, 0, 0];
  instances.forEach((inst, k) => {
    const have = new Set(inst);
    const holding = groups.filter((g) => [...g].some((i) => have.has(i)));
    const full = holding.filter((g) => inst.every((i) => g.has(i)));
    if (full.length && ![...full[0]].some((i) => (owner.get(i) ?? k) !== k)) whole++;
    else if (full.length) merged++;
    else if (holding.length > 1) split++;
  });
  return { whole, of: instances.length, split, merged };
}

export interface SitusCase { datafile?: string; refFids?: number[]; radius?: number; maxSize?: number; maxVolume?: number }

/** datafile, refFids (1-based ids), and the limit variables of one Analysis Situs test case. */
export function parseSitusCase(text: string): SitusCase {
  const out: SitusCase = {};
  let m = /^[ \t]*set\s+datafile\s+(\S+)/m.exec(text);
  if (m) out.datafile = m[1];
  m = /^[ \t]*set\s+refFids\s*\{([^}]*)\}/m.exec(text);
  if (m) out.refFids = m[1].split(/\s+/).filter(Boolean).map(Number);
  for (const v of ["radius", "maxSize", "maxVolume"] as const) {
    m = new RegExp(`^[ \\t]*set\\s+${v}\\s+(\\S+)`, "m").exec(text);
    if (m) out[v] = Number(m[1]);
  }
  return out;
}

/** Our faces in features of the given kinds, as 1-based whole-shape ids (sorted). */
export function situsPredicted(result: { faces: FaceRec[]; features: FeatureRec[] }, kinds: string[], faceKinds?: string[]): number[] {
  const ids = new Set<number>();
  for (const f of result.features) {
    if (!kinds.includes(f.kind)) continue;
    for (const i of f.faces) {
      const face = result.faces[i];
      if (faceKinds && !faceKinds.includes(face.kind)) continue;
      if (face.shape_id !== null) ids.add(face.shape_id);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

export function compareIds(pred: number[], ref: number[]) {
  const [p, r] = [new Set(pred), new Set(ref)];
  const tp = [...p].filter((i) => r.has(i)).length;
  const sub = (a: Set<number>, b: Set<number>) => [...a].filter((i) => !b.has(i)).sort((x, y) => x - y);
  return {
    exact: p.size === r.size && sub(p, r).length === 0, tp, fp: sub(p, r), fn: sub(r, p),
    precision: ratio(tp, p.size), recall: ratio(tp, r.size),
  };
}

/** Files in lexical order of their ids, from `skip`, at most `limit` of them (grade.select). */
export function select(paths: string[], skip = 0, limit?: number): string[] {
  const stem = (p: string) => p.slice(p.lastIndexOf("/") + 1).replace(/\.[^.]*$/, "");
  const sorted = [...paths].sort((a, b) => (stem(a) < stem(b) ? -1 : stem(a) > stem(b) ? 1 : 0)).slice(skip);
  return limit ? sorted.slice(0, limit) : sorted;
}

export interface PartRec {
  part: string; status: string; checks?: Checks; faces?: number; ignored_solids?: number; features?: FeatureRec[];
  labels?: Label[]; holes_whole?: Whole; steps_whole?: Whole; slots_whole?: Whole;
  /** D-093: labelled step faces of shapes that are not steps, by shape ("tilted", "side", "u-slot"). */
  held?: Record<string, number>;
}

/** One part's record, counts and misses. A part that failed to read, crashed, timed out or could not be joined to its
 *  labels still counts: every labelled face in the file is a miss. */
export function scorePart(name: string, r: ChildResult, inFile: number[]): [PartRec, Tally, Miss[]] {
  const rec: PartRec = { part: name, status: r.status };
  if (r.status === "ok") {
    const [labels, checks] = faceLabels(r, inFile);
    const preds = predicted(r);
    rec.checks = checks;
    rec.faces = labels.length;
    rec.ignored_solids = r.ignored_solids;
    if (checks.kinds_agree && !labels.includes(null)) {
      rec.features = r.features;
      rec.labels = labels;
      // D-093: a labelled step face in a shape the engine leaves out of steps on purpose, and not called a step
      const held = new Set<number>();
      const byShape: Record<string, number> = {};
      for (const [shape, faces] of r.held_steps ?? []) for (const i of faces) {
        if (labels[i] === null || !(labels[i]! in STEP_CLASSES) || preds[i] === "step" || held.has(i)) continue;
        held.add(i);
        byShape[shape] = (byShape[shape] ?? 0) + 1;
      }
      if (held.size) rec.held = byShape;
      return [rec, tally(labels, preds, held), misses(name, labels, preds, held)];
    }
    rec.status = "join_failed";
  }
  const none: Pred[] = inFile.map(() => null);
  return [rec, tally(inFile, none), misses(name, inFile, none)];
}

// --- summary.py ---

const HOLE = [1, 12], POCKET = [13, 14, 15, 16];
const inRange = (lab: number | null | undefined, a: number, b: number) => lab !== null && lab !== undefined && lab >= a && lab < b;

/** D-019: a pocket on a blind slot (17-19) whose end is closed by one wall shorter than the rest, past which lies a
 *  blind step's floor (20-22): counted as a right pocket call, on its own line. */
export function pocketShapedSlot(feature: FeatureRec, labels: Label[]): boolean {
  const short = feature.short_walls ?? [];
  return feature.kind === "pocket" && feature.faces.some((i) => inRange(labels[i], 17, 20))
    && short.length === 1 && short[0][1].some((k) => inRange(labels[k], 20, 23));
}

export function excludedCalls(perPart: PartRec[]): Record<string, number> {
  const out: Record<string, number> = { "o-ring-as-hole": 0, "o-ring-as-pocket": 0, "slot-step-as-pocket": 0, "slot-shaped-as-pocket": 0, "other-excluded": 0 };
  for (const part of perPart) {
    const labels = part.labels;
    if (!labels) continue;
    const kind = new Map<number, string>();
    const shaped = new Set<number>();
    for (const f of part.features ?? []) {
      for (const i of f.faces) if (f.kind === "hole" || kind.get(i) !== "hole") kind.set(i, f.kind);
      if (pocketShapedSlot(f, labels)) for (const i of f.faces) shaped.add(i);
    }
    for (const [i, k] of kind) {
      const lab = labels[i];
      if (lab === 11) out[`o-ring-as-${k}`] = (out[`o-ring-as-${k}`] ?? 0) + 1;
      else if (inRange(lab, 17, 20) && k === "pocket" && shaped.has(i)) out["slot-shaped-as-pocket"]++;
      else if (inRange(lab, 17, 23) && k === "pocket") out["slot-step-as-pocket"]++;
      else if (lab === 23 || lab === 24 || (inRange(lab, 17, 23) && k === "hole")) out["other-excluded"]++;
    }
  }
  return out;
}

export interface GradeResult {
  set: string; parts: number; status: Record<string, number>; checks_true: Record<string, number>; scores: Scores;
  misses: Miss[]; per_part: PartRec[]; holes_whole?: Record<string, number>; steps_whole?: Record<string, number>;
  slots_whole?: Record<string, number>;
}

/** One line per result (summary.line); `name` is the result file's name. */
export function summaryLine(name: string, d: GradeResult): string {
  const s = d.scores;
  const total = (ids: number[], x: "n" | "of") => ids.reduce((a, k) => a + s.recall[k][x], 0);
  const [hn, ho, pn, po] = [total(HOLE, "n"), total(HOLE, "of"), total(POCKET, "n"), total(POCKET, "of")];
  const [ph, pp] = [s.precision.hole, s.precision.pocket];
  const ex = Object.entries(excludedCalls(d.per_part)).map(([k, v]) => `${k} ${v}`).join(" ");
  const typed = HOLE.reduce((a, k) => a + s.type_recall[k].n, 0);
  const hw = d.holes_whole;
  const whole = hw ? ` whole holes ${hw.whole}/${hw.of} (split ${hw.split}, merged ${hw.merged})` : "";
  // Python prints the status dict with its repr: {'ok': 31}
  const status = `{${Object.entries(d.status).map(([k, v]) => `'${k}': ${v}`).join(", ")}}`;
  const line = `${name}: ${status} holes ${hn}/${ho} (miss ${ho - hn}, wrong ${ph.of - ph.n}, through/blind right ${typed})${whole} `
    + `pockets ${pn}/${po} (miss ${po - pn}, wrong ${pp.of - pp.n}) ${ex}`;
  return s.recall[STEP_IDS[0]] === undefined ? line : `${line}\n${stepLines(d)}`; // a result from before steps: one line
}

/** What the floorless classes (5, 7) were called, face by face: {class: {call: faces}}. */
export function floorless(perPart: PartRec[]): Record<number, Record<string, number>> {
  const out: Record<number, Record<string, number>> = Object.fromEntries(FLOORLESS.map((c) => [c, {}]));
  for (const part of perPart) {
    if (!part.labels) continue;
    const preds = predicted({ faces: part.labels, features: part.features ?? [] });
    part.labels.forEach((lab, i) => {
      if (lab === null || !FLOORLESS.includes(lab)) return;
      const k = preds[i] ?? "none";
      out[lab][k] = (out[lab][k] ?? 0) + 1;
    });
  }
  return out;
}

/** The step line and the D-079 target rule (steps half, S1) under the summary line. */
function stepLines(d: GradeResult): string {
  const s = d.scores;
  const total = (ids: number[], x: "n" | "of") => ids.reduce((a, k) => a + s.recall[k][x], 0);
  const [sn, so, hn, ho, pn, po] = [total(STEP_IDS, "n"), total(STEP_IDS, "of"), total(HOLE, "n"), total(HOLE, "of"), total(POCKET, "n"), total(POCKET, "of")];
  const ps = s.precision.step;
  const wrong = ps.of - ps.n + (s.claimed_on_excluded.step ?? 0);
  const byClass = STEP_IDS.map((k) => `${k} ${s.recall[k].n}/${s.recall[k].of}`).join(", ");
  const sw = d.steps_whole;
  const whole = sw ? ` whole steps ${sw.whole}/${sw.of} (split ${sw.split}, merged ${sw.merged})` : "";
  const fl = Object.entries(floorless(d.per_part)).map(([c, calls]) => `class ${c} ${JSON.stringify(calls)}`).join(", ");
  const held: Record<string, number> = {};
  for (const p of d.per_part) for (const [k, v] of Object.entries(p.held ?? {})) held[k] = (held[k] ?? 0) + v;
  const heldText = Object.keys(held).length ? Object.entries(held).map(([k, v]) => `${k} ${v}`).join(", ") : "none";
  const lines = [`  steps ${sn}/${so} (miss ${so - sn}, wrong ${wrong}: ${ps.of - ps.n} on scored labels, ${s.claimed_on_excluded.step ?? 0} on excluded; by class ${byClass})${whole}; floorless ${fl}; not steps (D-093) ${heldText}`];
  const pct = (n: number, of: number) => (of ? (100 * n) / of : 0);
  const base = baselineFor(ho, po);
  if (base) {
    const [ph, pp] = [s.precision.hole, s.precision.pocket];
    const checks: [string, boolean][] = [
      [`step recall ${pct(sn, so).toFixed(1)}% >= pocket recall ${pct(pn, po).toFixed(1)}%`, pct(sn, so) >= pct(pn, po)],
      [`wrong step calls ${wrong} = 0`, wrong === 0],
      [`holes ${hn}/${ho} wrong ${ph.of - ph.n} vs ${base.name} ${base.holes[0]}/${base.holes[1]} wrong ${base.holes[2]}`, hn >= base.holes[0] && ph.of - ph.n <= base.holes[2]],
      [`pockets ${pn}/${po} wrong ${pp.of - pp.n} vs ${base.name} ${base.pockets[0]}/${base.pockets[1]} wrong ${base.pockets[2]}`, pn >= base.pockets[0] && pp.of - pp.n <= base.pockets[2]],
    ];
    const pass = checks.every(([, ok]) => ok);
    lines.push(`  target (D-079, steps): ${pass ? "PASS" : "FAIL"}: ${checks.map(([t, ok]) => `${ok ? "ok" : "FAIL"} ${t}`).join("; ")}`);
  } else lines.push("  target (D-079): no baseline for this set");
  return lines.join("\n");
}
