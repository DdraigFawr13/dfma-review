// P1 S1 (machining spec J1, D-088): the removal block on the 17 NIST AP242 files. Feature volumes never add up to more
// than the removal (0.1 % slack), and the FTC/STC twins (the same shape) agree on the share not explained. Reads the
// NIST files, so it runs in the timed lane (vite.config.ts exclude, vitest.timed.config.ts include); no wall-clock limit.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, expect, test } from "vitest";
import { analyzeOrRefuse, loadNodeOc } from "../node";
import type { OC } from "../oc";

const DIR = resolve(__dirname, "../../../../tests/nist/.cache/NIST-PMI-STEP-Files");
const FILES = ["ctc_01_asme1_ap242-e1", "ctc_02_asme1_ap242-e2", "ctc_03_asme1_ap242-e2", "ctc_04_asme1_ap242-e1",
  "ctc_05_asme1_ap242-e1", "ftc_06_asme1_ap242-e2", "ftc_07_asme1_ap242-e2", "ftc_08_asme1_ap242-e1-tg", "ftc_08_asme1_ap242-e2",
  "ftc_09_asme1_ap242-e1", "ftc_10_asme1_ap242-e2", "ftc_11_asme1_ap242-e2", "stc_06_asme1_ap242-e3", "stc_07_asme1_ap242-e3",
  "stc_08_asme1_ap242-e3", "stc_09_asme1_ap242-e3", "stc_10_asme1_ap242-e2"].map((n) => `nist_${n}.stp`);
const TWINS = [["ftc_06_asme1_ap242-e2", "stc_06_asme1_ap242-e3"], ["ftc_07_asme1_ap242-e2", "stc_07_asme1_ap242-e3"],
  ["ftc_08_asme1_ap242-e2", "stc_08_asme1_ap242-e3"], ["ftc_09_asme1_ap242-e1", "stc_09_asme1_ap242-e3"],
  ["ftc_10_asme1_ap242-e2", "stc_10_asme1_ap242-e2"]].map((p) => p.map((n) => `nist_${n}.stp`));

type Removal = { total_mm3: number; features_sum_mm3: number; unexplained_pct: number };
let oc: OC;
const removals = new Map<string, Removal>();
beforeAll(async () => { oc = await loadNodeOc(); });

async function removalOf(name: string): Promise<Removal> {
  if (!removals.has(name)) {
    const r = await analyzeOrRefuse(oc, new Uint8Array(readFileSync(join(DIR, name))), name, "mill", "al6061") as { removal: Removal };
    removals.set(name, r.removal);
  }
  return removals.get(name)!;
}

test("feature volumes stay within the removal on every NIST file", async () => {
  for (const name of FILES) {
    const m = await removalOf(name);
    expect(m, name).toBeTruthy();
    expect(m.features_sum_mm3, name).toBeLessThanOrEqual(m.total_mm3 * 1.001);
  }
}, 600_000);

test("FTC and STC twins agree on the share not explained", async () => {
  for (const [a, b] of TWINS) {
    const [ma, mb] = [await removalOf(a), await removalOf(b)];
    expect(Math.abs(ma.unexplained_pct - mb.unexplained_pct), `${a} ${ma.unexplained_pct} vs ${b} ${mb.unexplained_pct}`).toBeLessThanOrEqual(0.5);
  }
}, 600_000);
