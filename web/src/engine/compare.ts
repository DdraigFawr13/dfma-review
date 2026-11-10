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

/** Keys compared at this slice (S1: the part summary, the faces, the assumptions and the empty rule lists). */
export const PORTED_KEYS: Record<number, string[]> = {
  1: ["part", "faces", "assumptions", "rules_run", "checks_run"],
};
/** Rules ported by slice, with their check names (rows.py CHECKS); rules_run and checks_run compare on these only. */
export const PORTED_RULES: Record<number, Record<string, string>> = {
  1: {},
};
const SKIP_PART_FIELDS = ["not_analysed_faces"]; // leaves out pocket faces: S4

export const MSG_FAILED = "The analysis failed on this file. Try again, or try another file.";

export interface Outcome { status: "same" | "different" | "python_crashed"; diffs: string[] }

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
    return { status: "python_crashed", diffs: ok ? [] : [`Python crashed; the browser engine refused with ${JSON.stringify(r.error)}`] };
  }
  if ("error" in k || "error" in r) {
    if (k.error !== r.error) diffs.push(`error: ${JSON.stringify(r.error)} ≠ ${JSON.stringify(k.error)}`);
    return { status: diffs.length ? "different" : "same", diffs };
  }
  const keys = Object.entries(PORTED_KEYS).filter(([s]) => Number(s) <= slice).flatMap(([, ks]) => ks);
  for (const name of keys) {
    if (name === "faces") sameFaces(r.faces, k.faces, diffs);
    else if (name === "part") {
      const strip = (p: Json) => Object.fromEntries(Object.entries(p as object).filter(([f]) => !SKIP_PART_FIELDS.includes(f)));
      same("part", strip(r.part), strip(k.part), diffs);
    } else if (name === "rules_run" || name === "checks_run") {
      const rules = Object.assign({}, ...Object.entries(PORTED_RULES).filter(([s]) => Number(s) <= slice).map(([, m]) => m)) as Record<string, string>;
      const ran = (k.rules_run as string[]).filter((id) => id in rules);
      const want = name === "rules_run" ? ran : [...new Set(ran.map((id) => rules[id]))];
      same(name, r[name], want, diffs);
    } else same(name, r[name], k[name], diffs);
  }
  return { status: diffs.length ? "different" : "same", diffs };
}
