// Port of tests/inventor/local_pairs.py: run the app path on Morgan's work pairs (I1 spec "Test files"; the files never
// enter git, D-006, D-032). Each folder of the pairs directory holds one .ipt and one .stp or .step. Per pair it prints
// the counts and `pair check: pass` or `pair check: FAIL - <reason>`, then the thread counts per state, the Hole
// features and their holes per state, and compares with local_pairs.toml when it has the pair. The lines equal the
// Python script's, character for character.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { parse } from "smol-toml";
import { analyze } from "../engine/analyze";
import { checkPair, checkPartType } from "../engine/inventor/pair";
import { readIpt } from "../engine/inventor/part";
import type { OC } from "../engine/oc";
import { ReadError, readStep } from "../engine/read";
import { pyFixed } from "../engine/units";
import { pyFloat, pyStr } from "./pyRepr";

const STEP_IN = "/harness-local.step";
const STATES = ["matched", "disagrees", "not_mapped"] as const;

type Row = { id: string; state: string; hole: string | null; reason: string | null };
type Thread = Row & { designation: string | null; class: string | null };
type Feature = { id: string; type: string; diameter_mm: number | null; state: string; holes: Row[] };

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const orText = (a: string | null, b: string | null) => pyStr(a || b); // Python's `a or b`
const share = (n: number, d: number) => `${pyFixed((100 * n) / d, 1)}%`; // d > 0

/** Runs the check on every folder of `pairsDir` against the toml text; `out` takes each line. Returns the exit code. */
export async function localPairs(oc: OC, pairsDir: string, tomlText: string, out: (line: string) => void): Promise<number> {
  const expected = new Map<string, Record<string, unknown>>();
  for (const p of ((parse(tomlText) as { pair?: Record<string, unknown>[] }).pair ?? [])) expected.set(p.name as string, p);
  const folders = existsSync(pairsDir) && statSync(pairsDir).isDirectory()
    ? readdirSync(pairsDir).sort().filter((n) => statSync(join(pairsDir, n)).isDirectory()) : [];
  if (!folders.length) {
    out(`no pairs in tests/inventor/.local/ (one folder per pair: an .ipt and its .stp or .step)`);
    return 1;
  }
  let bad = 0;
  for (const name of folders) {
    const d = join(pairsDir, name);
    const files = readdirSync(d).map((n) => join(d, n));
    const ipts = files.filter((p) => extname(p) === ".ipt" || extname(p) === ".IPT");
    const steps = files.filter((p) => [".stp", ".step"].includes(extname(p).toLowerCase()));
    if (ipts.length !== 1 || steps.length !== 1) {
      out(`${name}: needs exactly one .ipt and one STEP`);
      bad++;
      continue;
    }
    const iptBytes = new Uint8Array(readFileSync(ipts[0]));
    const stepBytes = new Uint8Array(readFileSync(steps[0]));
    const iptRead = await readIpt(iptBytes);
    if (iptRead.error) throw iptRead.error; // outside the try in Python too: a file that is no .ipt stops the run
    const ipt = iptRead.part;
    oc.FS.writeFile(STEP_IN, stepBytes);
    let step;
    try { step = readStep(oc, STEP_IN); } finally { oc.FS.unlink(STEP_IN); }
    out(`${name}: saved with ${ipt.saved_with}, ACIS ${ipt.acis_version}`);
    let checks, n: Record<string, number>, h: Record<string, number>, feats: Feature[];
    try {
      checkPartType(ipt, step);
      checks = checkPair(oc, ipt, step);
      out(`  faces [${checks.faces.join(", ")}], corners [${checks.corners.join(", ")}], worst gap ${pyFloat(checks.worst_corner_gap_mm)} mm`);
      out("  pair check: pass");
      // S2: the app path itself (analyze with the .ipt, no transform), for the thread counts
      const result = analyze(oc, stepBytes, steps[0].split("/").pop()!, "mill", "al6061", { read: iptRead, name: ipts[0].split("/").pop()! }) as unknown as
        { inventor: { threads: Thread[]; hole_features: Feature[] } };
      const threads = result.inventor.threads;
      n = Object.fromEntries(STATES.map((s) => [s, threads.filter((t) => t.state === s).length]));
      out(`  threads: ${n.matched} matched, ${n.disagrees} disagree, ${n.not_mapped} not mapped`);
      for (const t of threads) out(`    ${t.id} ${pyStr(t.designation)} ${pyStr(t.class)} ${t.state} ${orText(t.hole, t.reason)}`);
      // I2 S1: Hole features and their holes per state; D-032's 95% is read per hole
      feats = result.inventor.hole_features;
      const rows = feats.flatMap((f) => f.holes);
      h = Object.fromEntries(STATES.map((s) => [s, rows.filter((r) => r.state === s).length]));
      out(`  hole features: ${feats.length}, holes: ${h.matched} matched, ${h.disagrees} disagree, ${h.not_mapped} not mapped `
        + `(${rows.length ? share(h.matched, rows.length) : "n/a"} matched; D-032 asks 95%)`);
      for (const f of feats) {
        out(`    ${f.id} ${f.type} ${pyFloat(f.diameter_mm)} mm ${f.state}: `
          + f.holes.map((r) => `${r.id} ${r.state} ${orText(r.hole, r.reason)}`).join(", "));
      }
    } catch (e) {
      if (!(e instanceof ReadError)) throw e;
      out(`  pair check: FAIL - ${e.message}`);
      bad++;
      continue;
    }
    const want = expected.get(name);
    if (want) {
      const got: Record<string, unknown> = {
        ipt_sha256: sha(iptBytes), step_sha256: sha(stepBytes), faces: checks.faces[0], corners: checks.corners[0],
        threads_matched: n.matched, threads_disagrees: n.disagrees, threads_not_mapped: n.not_mapped, hole_features: feats.length,
        holes_matched: h.matched, holes_disagrees: h.disagrees, holes_not_mapped: h.not_mapped,
      };
      for (const [k, v] of Object.entries(got)) {
        if (want[k] !== v && !(typeof want[k] === "bigint" && Number(want[k]) === v)) {
          out(`  ${k}: expected ${pyStr(want[k])}, got ${pyStr(v)}`);
          bad++;
        }
      }
    }
  }
  return bad ? 1 : 0;
}
