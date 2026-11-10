// The parity compare (port spec Parity): the browser engine's result against the Python key, on the keys ported so
// far. Shared by parity.test.ts (Node) and compare-cli.ts (J6b, the real worker in Chromium). No imports, so plain
// Node runs it (Node 22 strips the types); its one import, ./slice.ts, has none either.
//
// Rules: exact for strings, ids, kinds, counts and booleans; numbers equal to 6 significant figures, or within 1e-9
// absolute (values near zero); faces[].positions as a sorted list of points, each coordinate within 1.5e-5 mm (both
// sides round to 1e-5 mm, and Python's and JavaScript's rounding can differ at a tie); faces[].indices by length
// only (the mesh difference, spike README). A key Python refused ({"error"}) needs the same message; a key Python
// crashed on ({"crash"}) needs a result or MSG_FAILED and is counted as "Python crashed".

import { SLICE } from "./slice.ts"; // the last slice merged; each slice raises it and adds its keys below

export { SLICE };

/** Keys compared at this slice (S1: the part summary, the faces, the assumptions and the rule lists; S2: holes and
 *  the findings, rows and passed checks of the hole rules; S3: the machine plan and the cost drivers; S4: no new key,
 *  but pockets, corners and their rules in the keys above, and part.not_analysed_faces on milled files). */
export const PORTED_KEYS: Record<number, string[]> = {
  1: ["part", "faces", "assumptions", "rules_run", "checks_run"],
  2: ["features", "findings", "rows", "passed", "passed_rows"],
  3: ["machine", "stock", "setups", "operations", "tools", "tool_changes", "cost_drivers", "cost_total"],
  4: [], // S4 adds kinds and rules to the keys above, and part.not_analysed_faces on milled files
};
/** Rules ported by slice, with their check names (rows.py CHECKS); rules_run and checks_run compare on these only. */
export const PORTED_RULES: Record<number, Record<string, string>> = {
  1: {},
  2: { hole_depth: "Hole depth check", hole_size: "Hole size check", access: "Access check" },
  3: {},
  4: { corner_radius: "Corner radius check", pocket_depth: "Pocket depth check", undercut: "Undercut check" },
};
/** Feature kinds ported by slice: a list key compares only its items on these kinds (port spec Parity). */
export const PORTED_KINDS: Record<number, string[]> = {
  1: [],
  2: ["hole"],
  3: [],
  4: ["pocket", "corner"],
};
/** The plan and cost keys (S3) compare only on files whose key has no feature of these kinds while they are not
 *  ported, and no finding from a rule not ported: the plan reads holes and pockets and the findings on them
 *  (plan.py), and every finding can feed a cost driver (drivers.toml). */
const PLAN_KINDS = ["pocket", "corner"]; // both ported from S4, so this filters only at S3 and below
/** Until S6 a turned file (its key ran turn_axis) compares the S1 keys only: holes on a turned part are split into
 *  holes and bores there (analyze.py split_bores), and the browser copy runs no hole rule on it yet. */
const TURN_SLICE = 6;
/** part.not_analysed_faces leaves out pocket faces: compared from S4 on milled files, and on turned files from S6
 *  (Python finds a turned part's pockets; the browser copy does not until S6). */
const POCKET_FACES_SLICE = 4;

export const MSG_FAILED = "The analysis failed on this file. Try again, or try another file.";

export interface Outcome {
  status: "same" | "different" | "python_crashed";
  diffs: string[];
  leftOut: string[]; // the ported keys this file left out (a turned file before S6; a row with an unported finding)
}

type Json = unknown;

const REL = 1e-6;
const ABS = 1e-9;
const POINT_TOL = 1.5e-5;

export function sameNumber(a: number, b: number): boolean {
  if (a === b) return true;
  const d = Math.abs(a - b);
  return d <= ABS || d <= REL * Math.max(Math.abs(a), Math.abs(b));
}

function same(path: string, a: Json, b: Json, diffs: string[]): void {
  if (diffs.length > 20) return;
  if (typeof a === "number" && typeof b === "number") {
    if (!sameNumber(a, b)) diffs.push(`${path}: ${a} ≠ ${b}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { diffs.push(`${path}: length ${a.length} ≠ ${b.length}`); return; }
    a.forEach((v, i) => same(`${path}[${i}]`, v, b[i], diffs));
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.join() !== kb.join()) { diffs.push(`${path}: keys ${ka.join(",")} ≠ ${kb.join(",")}`); return; }
    for (const k of ka) same(`${path}.${k}`, (a as Record<string, Json>)[k], (b as Record<string, Json>)[k], diffs);
    return;
  }
  if (a !== b) diffs.push(`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}

function points(flat: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]);
  return out.sort((p, q) => p[0] - q[0]);
}

/** The first point of `a` with no partner in `b` within POINT_TOL on every coordinate, or null (each partner used once). */
function unmatched(a: number[][], b: number[][]): number[] | null {
  const used = new Uint8Array(b.length);
  let start = 0;
  for (const p of a) {
    while (start < b.length && b[start][0] < p[0] - POINT_TOL) start++;
    let found = false;
    for (let j = start; j < b.length && b[j][0] <= p[0] + POINT_TOL; j++) {
      if (!used[j] && Math.abs(b[j][1] - p[1]) <= POINT_TOL && Math.abs(b[j][2] - p[2]) <= POINT_TOL) {
        used[j] = 1;
        found = true;
        break;
      }
    }
    if (!found) return p;
  }
  return null;
}

function sameFaces(a: Json, b: Json, diffs: string[]): void {
  const fa = a as { id: number; kind: string; positions: number[]; indices: number[] }[];
  const fb = b as typeof fa;
  if (!Array.isArray(fa) || !Array.isArray(fb) || fa.length !== fb.length) {
    diffs.push(`faces: count ${fa?.length} ≠ ${fb?.length}`);
    return;
  }
  for (let i = 0; i < fa.length && diffs.length <= 20; i++) {
    const [x, y] = [fa[i], fb[i]];
    if (x.id !== y.id || x.kind !== y.kind) diffs.push(`faces[${i}]: ${x.id} ${x.kind} ≠ ${y.id} ${y.kind}`);
    if (x.indices.length !== y.indices.length) diffs.push(`faces[${i}].indices: length ${x.indices.length} ≠ ${y.indices.length}`);
    const [px, py] = [points(x.positions), points(y.positions)];
    if (px.length !== py.length) { diffs.push(`faces[${i}].positions: ${px.length} ≠ ${py.length} points`); continue; }
    const lost = unmatched(px, py);
    if (lost) diffs.push(`faces[${i}].positions: point ${lost} has no partner in the key`);
  }
}

/** Compare a browser result with its Python key on the keys ported at `slice`. */
export function compare(result: Json, key: Json, slice: number = SLICE): Outcome {
  const r = result as Record<string, Json>;
  const k = key as Record<string, Json>;
  const diffs: string[] = [];
  if ("crash" in k) {
    const ok = !("error" in r) || r.error === MSG_FAILED;
    return { status: "python_crashed", diffs: ok ? [] : [`Python crashed; the browser engine refused with ${JSON.stringify(r.error)}`], leftOut: [] };
  }
  if ("error" in k || "error" in r) {
    if (k.error !== r.error) diffs.push(`error: ${JSON.stringify(r.error)} ≠ ${JSON.stringify(k.error)}`);
    return { status: diffs.length ? "different" : "same", diffs, leftOut: [] };
  }
  const leftOut: string[] = [];
  const turned = (k.rules_run as string[]).includes("turn_axis");
  const upTo = turned && slice < TURN_SLICE ? 1 : slice;
  if (upTo < slice) leftOut.push(...Object.entries(PORTED_KEYS).filter(([s]) => Number(s) > upTo && Number(s) <= slice).flatMap(([, ks]) => ks));
  const keys = Object.entries(PORTED_KEYS).filter(([s]) => Number(s) <= upTo).flatMap(([, ks]) => ks);
  const rules = Object.assign({}, ...Object.entries(PORTED_RULES).filter(([s]) => Number(s) <= upTo).map(([, m]) => m)) as Record<string, string>;
  const kinds = Object.entries(PORTED_KINDS).filter(([s]) => Number(s) <= upTo).flatMap(([, ks]) => ks);
  const [pr, pk] = [ported(r, rules, kinds), ported(k, rules, kinds)];
  const planKeys = PORTED_KEYS[3];
  const keyFeatures = (k.features as { kind: string }[]) ?? [];
  const planOk = !keyFeatures.some((f) => PLAN_KINDS.includes(f.kind) && !kinds.includes(f.kind))
    && !((k.findings as { rule: string }[]) ?? []).some((f) => !(f.rule in rules));
  if (!planOk && keys.some((name) => planKeys.includes(name))) leftOut.push("plan and cost");
  for (const name of keys) {
    if (planKeys.includes(name) && !planOk) continue;
    if (name === "cost_drivers") {
      const drivers = (side: Record<string, Json>, p: Ported) => ((side.cost_drivers as { findings: string[] }[]) ?? [])
        .map((d) => ({ ...d, findings: d.findings.map((id) => p.ids.get(id) ?? `${id} (not ported)`) }));
      same("cost_drivers", drivers(r, pr), drivers(k, pk), diffs);
    } else if (name === "faces") sameFaces(r.faces, k.faces, diffs);
    else if (name === "part") {
      const skip = upTo < POCKET_FACES_SLICE ? ["not_analysed_faces"] : [];
      const strip = (p: Json) => Object.fromEntries(Object.entries(p as object).filter(([f]) => !skip.includes(f)));
      same("part", strip(r.part), strip(k.part), diffs);
    } else if (name === "rules_run" || name === "checks_run") {
      const ran = (k.rules_run as string[]).filter((id) => id in rules);
      const want = name === "rules_run" ? ran : [...new Set(ran.map((id) => rules[id]))];
      same(name, r[name], want, diffs);
    } else if (name === "rows") {
      // A row groups one rule's findings; a key row holding a finding not ported yet (access on a pocket before S4) can't
      // be built by the browser engine, so that row is left out on both sides: on the browser's side, the row that
      // holds its ported findings.
      const mixed = (k.rows as Row[]).filter((row) => row.rule in rules && row.findings.some((id) => !pk.ids.has(id)));
      if (mixed.length) leftOut.push(...[...new Set(mixed.map((row) => `rows (${row.rule})`))]);
      const mixedIds = new Set(mixed.flatMap((row) => row.findings.filter((id) => pk.ids.has(id)).map((id) => pk.ids.get(id)!)));
      const keep = (rows: Row[], side: Ported, isKey: boolean) => rows
        .filter((row) => row.rule in rules && !(isKey ? mixed.includes(row) : row.findings.some((id) => mixedIds.has(side.ids.get(id) ?? id))))
        .map((row) => side.row(row));
      same("rows", keep(r.rows as Row[], pr, false), keep(k.rows as Row[], pk, true), diffs);
    } else if (name in pk.keys) same(name, pr.keys[name], pk.keys[name], diffs);
    else same(name, r[name], k[name], diffs);
  }
  return { status: diffs.length ? "different" : "same", diffs, leftOut };
}

interface Row { rule: string; findings: string[]; range: string; [k: string]: Json }
interface Ported { ids: Map<string, string>; keys: Record<string, Json>; row: (row: Row) => Row }

/** One side's items on ported rules and kinds, with its findings renumbered F1, F2… in order and every finding id in
 *  them mapped the same way (port spec Parity "Finding ids": analyze.py numbers findings across all rules). */
function ported(side: Record<string, Json>, rules: Record<string, string>, kinds: string[]): Ported {
  const features = (side.features as { id: string; kind: string }[]) ?? [];
  const kindOf = new Map(features.map((f) => [f.id, f.kind]));
  const onKind = (feature: unknown) => feature == null || kinds.includes(kindOf.get(feature as string) ?? "");
  const findings = ((side.findings as { id: string; rule: string; feature?: string | null }[]) ?? [])
    .filter((f) => f.rule in rules && onKind(f.feature));
  const ids = new Map(findings.map((f, n) => [f.id, `F${n + 1}`]));
  const mapId = (id: string) => ids.get(id) ?? `${id} (not ported)`;
  return {
    ids,
    keys: {
      features: features.filter((f) => kinds.includes(f.kind)),
      findings: findings.map((f) => ({ ...f, id: mapId(f.id) })),
      passed: ((side.passed as { rule: string; feature: string }[]) ?? []).filter((p) => p.rule in rules && onKind(p.feature)),
      passed_rows: ((side.passed_rows as { rule: string; kind: string }[]) ?? []).filter((p) => p.rule in rules && kinds.includes(p.kind)),
    },
    row: (row) => ({
      ...row,
      id: row.id === `row:${row.findings[0]}` ? `row:${mapId(row.findings[0])}` : row.id,
      findings: row.findings.map(mapId),
      range: row.range.replace(/F\d+/g, (id) => mapId(id)),
    }),
  };
}
