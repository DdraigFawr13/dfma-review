// The guarded re-freeze's allow list and masking (steps-slots spec, Design "Parity re-freeze"), apart from the run so
// they can be tested with planted bugs (refreeze-mask.test.ts; audit 2026-11-12 F6, D-092). parity-refreeze.test.ts
// uses them: compare(masked(result, old), baseMasked(old, result)) must show no diff, and lostTools(old, result) none.
import { compare } from "./compare";

/** What this slice may change. Steps and slots S1 (spec Design "Parity re-freeze"; D-079, D-081): on every file the
 *  new rule in `rules_run` and its check in `checks_run`; on a file that gained a step, the step features and their
 *  corners with their findings and passed checks, renumbered finding ids, faces leaving `part.not_analysed_faces`, and
 *  the plan and cost keys below, `removal` (the step's volume, P1, which came after the spec) and the rows built from
 *  the findings; every hole and pocket keeps its own tools. Nothing else. */
export const NEW_KINDS = ["step", "slot"];
export const NEW_RULES = ["step_depth"];
export const NEW_CHECKS = ["Step depth check"];
export const PLAN_KEYS = ["setups", "operations", "tools", "tool_changes", "cost_drivers", "cost_total", "removal", "rows", "passed_rows"];

export type Obj = Record<string, unknown>;
type Feat = { id: string; kind: string; pocket?: unknown } & Obj;
type Op = { setup: number; tool: string; features: string[] };

/** Each planned feature's set of tools, as the operations name it. */
export function toolsOf(side: Obj): Map<string, string> {
  const out = new Map<string, Set<string>>();
  for (const op of (side.operations as Op[]) ?? []) for (const f of op.features) (out.get(f) ?? out.set(f, new Set()).get(f)!).add(op.tool);
  return new Map([...out].map(([f, t]) => [f, [...t].sort().join(",")]));
}

/** The ids of the features this slice adds: steps and slots, and the corners linked to them. */
export function newIds(side: Obj): Set<string> {
  const feats = (side.features as Feat[]) ?? [];
  const open = new Set(feats.filter((f) => NEW_KINDS.includes(f.kind)).map((f) => f.id));
  return new Set([...open, ...feats.filter((f) => f.kind === "corner" && open.has(f.pocket as string)).map((f) => f.id)]);
}

/** `side` with what this slice may change set back to `base`'s, so compare() sees only the changes it may not make. */
export function masked(side: Obj, base: Obj): Obj {
  const out: Obj = { ...side };
  const without = (list: unknown, extra: string[]) => (list as string[]).filter((x) => !extra.includes(x));
  if (JSON.stringify(without(side.rules_run, NEW_RULES)) === JSON.stringify(base.rules_run)) out.rules_run = base.rules_run;
  if (JSON.stringify(without(side.checks_run, NEW_CHECKS)) === JSON.stringify(base.checks_run)) out.checks_run = base.checks_run;
  const added = newIds(side);
  if (!added.size) return out;
  out.features = (side.features as Feat[]).filter((f) => !added.has(f.id));
  const noId = (list: unknown) => ((list as Obj[]) ?? []).map(({ id: _id, ...rest }) => rest);
  out.findings = noId(((side.findings as Obj[]) ?? []).filter((f) => !added.has(f.feature as string)));
  out.passed = ((side.passed as Obj[]) ?? []).filter((f) => !added.has(f.feature as string));
  const [part, was] = [side.part as Obj, base.part as Obj];
  const faces = part.not_analysed_faces as number[], before = was.not_analysed_faces as number[];
  out.part = faces.every((i) => before.includes(i)) ? { ...part, not_analysed_faces: before } : part;
  for (const key of PLAN_KEYS) if (key in base) out[key] = base[key]; else delete out[key];
  return out;
}

/** The old key's findings with their ids taken out, to compare with masked(): finding ids are renumbered. */
export function baseMasked(old: Obj, result: Obj): Obj {
  if (!newIds(result).size) return old;
  return { ...old, findings: ((old.findings as Obj[]) ?? []).map(({ id: _id, ...rest }) => rest) };
}

/** The changes this slice may not make: compare() diffs after masking, then each old feature whose tools changed. */
export function refused(result: Obj, old: Obj): string[] {
  const others = compare(masked(result, old), baseMasked(old, result)).diffs;
  const [ta, tb] = [toolsOf(old), toolsOf(result)];
  return [...others, ...[...ta.keys()].filter((f) => ta.get(f) !== tb.get(f)).map((f) => `${f}: tools ${ta.get(f)} -> ${tb.get(f) ?? "none"}`)];
}
