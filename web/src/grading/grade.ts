// Score our hole and pocket recognition against labelled parts, on the browser engine (the browser engine's
// tests/grading/grade.py; the Python scorer stays until S8b). Launch with web/scripts/grading.mjs:
//   node scripts/grading.mjs grade mfcadpp <folder of .step> [--limit N] [--skip N] [--jobs N] [--out result.json]
//   node scripts/grading.mjs grade situs <AnalysisSitus checkout> [--jobs N] [--out result.json]
// Answer keys: MFCAD++ (CC BY): each face's class is the name of its ADVANCED_FACE; a set folder with INSTANCES.json
// (our own sets) also scores whole holes. Analysis Situs (BSD-3): a datafile and the expected face ids per test case.
// Each file runs in its own process (run.ts), so a crash is a result.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pool, runChild } from "./run.ts";
import {
  compareIds, fileLabels, instanceScore, parseSitusCase, scorePart, scores, select, situsPredicted, Tally,
  type ChildResult, type GradeResult, type Miss, type PartRec,
} from "./score.ts";

/** grade.mfcadpp: score every file; a set folder with INSTANCES.json also scores whole holes. */
export async function mfcadpp(folder: string, limit: number | undefined, jobs: number, skip = 0): Promise<GradeResult> {
  const names = readdirSync(folder).filter((n) => n.endsWith(".step")).map((n) => join(folder, n));
  const paths = select(names, skip, limit);
  const results = await pool(paths, jobs, async (p, n) => {
    const r = await runChild("grade", p);
    console.error(`grade [${n + 1}/${paths.length}] ${r.status}: ${basename(p)}`);
    return r;
  });
  const instFile = join(folder, "INSTANCES.json");
  // A plain list is a part's holes (the older sets); an object holds {"holes", "steps", "slots"} (steps and slots spec)
  type Inst = number[][] | { holes?: number[][]; steps?: number[][]; slots?: number[][] };
  const instances: Record<string, Inst> | null = existsSync(instFile) ? JSON.parse(readFileSync(instFile, "utf8")) : null;
  const total = new Tally();
  const holesWhole: Record<string, number> = {};
  const stepsWhole: Record<string, number> = {};
  const slotsWhole: Record<string, number> = {};
  const parts: PartRec[] = [];
  const allMisses: Miss[] = [];
  paths.forEach((p, k) => {
    const [rec, counts, partMisses] = scorePart(basename(p), results[k] as ChildResult, fileLabels(readFileSync(p)));
    total.merge(counts);
    allMisses.push(...partMisses);
    if (instances) {
      const inst = instances[basename(p).replace(/\.[^.]*$/, "")] ?? [];
      const holes = Array.isArray(inst) ? inst : inst.holes ?? [];
      rec.holes_whole = instanceScore(rec.features ?? [], holes);
      for (const [key, v] of Object.entries(rec.holes_whole)) holesWhole[key] = (holesWhole[key] ?? 0) + v;
      if (!Array.isArray(inst)) {
        rec.steps_whole = instanceScore(rec.features ?? [], inst.steps ?? [], "step");
        for (const [key, v] of Object.entries(rec.steps_whole)) stepsWhole[key] = (stepsWhole[key] ?? 0) + v;
        rec.slots_whole = instanceScore(rec.features ?? [], inst.slots ?? [], "slot");
        for (const [key, v] of Object.entries(rec.slots_whole)) slotsWhole[key] = (slotsWhole[key] ?? 0) + v;
      }
    }
    parts.push(rec);
  });
  const count = (f: (p: PartRec) => string) => parts.reduce<Record<string, number>>((a, p) => ({ ...a, [f(p)]: (a[f(p)] ?? 0) + 1 }), {});
  const checks = Object.fromEntries((["same_count", "file_order", "names_agree", "kinds_agree"] as const)
    .map((k) => [k, parts.filter((p) => p.checks?.[k]).length]));
  const out: GradeResult = { set: folder, parts: parts.length, status: count((p) => p.status), checks_true: checks,
    scores: scores(total), misses: allMisses, per_part: parts };
  if (instances) out.holes_whole = holesWhole;
  if (Object.keys(stepsWhole).length) out.steps_whole = stepsWhole;
  if (Object.keys(slotsWhole).length) out.slots_whole = slotsWhole;
  return out;
}

/** grade.situs: each case's datafile through the engine, our faces against the expected ids. */
export async function situs(root: string, jobs: number) {
  const cases: Record<string, unknown>[] = [];
  for (const [grid, kinds] of [["recognize-holes", ["hole"]], ["recognize-cavities", ["pocket"]]] as const) {
    const dir = join(root, "tests", "feature-recognition", grid);
    for (const f of readdirSync(dir).filter((n) => /^[A-Z][0-9][0-9]$/.test(n)).sort()) {
      cases.push({ grid, case: f, kinds, ...parseSitusCase(readFileSync(join(dir, f), "utf8")) });
    }
  }
  const files = [...new Set(cases.map((c) => join(root, "data", c.datafile as string)))].sort();
  const done = new Map(files.map((f, i) => [f, i]));
  const results = await pool(files, jobs, (p) => runChild("grade", p));
  for (const c of cases) {
    const r = results[done.get(join(root, "data", c.datafile as string))!] as ChildResult;
    c.status = r.status;
    if (r.status === "ok") {
      c.faces = r.faces.length;
      c.ignored_solids = r.ignored_solids;
      const ref = c.refFids as number[];
      c.result = compareIds(situsPredicted(r, c.kinds as string[]), ref);
      if (c.grid === "recognize-holes") c.result_cylinders = compareIds(situsPredicted(r, ["hole"], ["cylinder"]), ref);
      if (c.grid === "recognize-cavities") c.result_with_holes = compareIds(situsPredicted(r, ["hole", "pocket"]), ref);
    } else c.error = r.error ?? r.stderr ?? r.status;
  }
  return { root, cases };
}

async function main(): Promise<number> {
  const { positionals, values: a } = parseArgs({ allowPositionals: true, options: {
    limit: { type: "string" }, skip: { type: "string", default: "0" }, jobs: { type: "string", default: "4" }, out: { type: "string" },
  } });
  const [set, path] = positionals;
  if ((set !== "mfcadpp" && set !== "situs") || !path) {
    console.error("usage: grade <mfcadpp|situs> <path> [--limit N] [--skip N] [--jobs N] [--out result.json]");
    return 2;
  }
  const jobs = Number(a.jobs);
  const out = set === "mfcadpp" ? await mfcadpp(resolve(path), a.limit ? Number(a.limit) : undefined, jobs, Number(a.skip)) : await situs(resolve(path), jobs);
  if (a.out) writeFileSync(a.out, JSON.stringify(out, null, 1));
  const summary: Record<string, unknown> = Object.fromEntries(Object.entries(out).filter(([k]) => !["misses", "per_part", "cases"].includes(k)));
  if (set === "situs") {
    const cases = (out as { cases: Record<string, any>[] }).cases; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const grid of ["recognize-holes", "recognize-cavities"]) {
      const cs = cases.filter((c) => c.grid === grid);
      const exact = (k: string) => cs.filter((c) => c[k]?.exact).length;
      const status: Record<string, number> = {};
      for (const c of cs) status[c.status] = (status[c.status] ?? 0) + 1;
      summary[grid] = { result: exact("result"), result_cylinders: exact("result_cylinders"), result_with_holes: exact("result_with_holes"), cases: cs.length, status };
    }
  }
  console.log(JSON.stringify(summary, null, 1));
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) process.exit(await main());
