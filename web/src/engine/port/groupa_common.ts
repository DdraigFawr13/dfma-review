// Shared by the ported service tests (tests/service/*.py): the repo paths, one engine per test file, and analyze() on
// a committed STEP file as the Python tests called it (analyze(path, name, process, material)).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import type { Material, Process } from "../../api";
import { analyze } from "../analyze";
import { loadNodeOc } from "../node";
import type { OC } from "../oc";

export const ROOT = resolve(__dirname, "../../../..");
export const PARTS = resolve(ROOT, "tests/parts");

let engine: Promise<OC> | null = null;
/** One engine per test file (a test file runs in its own module scope). */
export function oc(): Promise<OC> {
  return (engine ??= loadNodeOc());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Result = Record<string, any>;

/** analyze() on STEP bytes, returning the full response. */
export async function analyzeBytes(bytes: Uint8Array, name: string, process: Process = "mill", material: Material = "al6061"): Promise<Result> {
  return analyze(await oc(), bytes, name, process, material) as unknown as Result;
}

/** analyze() on a STEP file by absolute path. */
export async function analyzePath(path: string, name?: string, process: Process = "mill", material: Material = "al6061"): Promise<Result> {
  return analyzeBytes(new Uint8Array(readFileSync(path)), name ?? path.split("/").pop()!, process, material);
}

/** analyze() on tests/parts/<name>.step. */
export function run(name: string, process: Process = "mill", material: Material = "al6061"): Promise<Result> {
  return analyzePath(resolve(PARTS, `${name}.step`), `${name}.step`, process, material);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Expected = { name: string; units: string; face_count: number; process?: string; material?: string; [k: string]: any };

/** tests/parts/expected.toml's [[part]] tables (tests/helpers.py expected_parts). */
export function expectedParts(): Expected[] {
  return ((parse(readFileSync(resolve(PARTS, "expected.toml"), "utf8")) as { part?: Expected[] }).part) ?? [];
}

export function expected(name: string): Expected {
  const found = expectedParts().find((p) => p.name === name);
  if (!found) throw new Error(`no expected part ${name}`);
  return found;
}
