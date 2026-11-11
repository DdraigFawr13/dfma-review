// Port of tests/service/test_inventor_threads.py: threads read from the NIST .ipt files and mapped onto their STEP holes,
// lined up by the test harness (the app refuses every NIST pair, J2). The harness's transform per pair comes from the
// frozen parity key (inventor_common.ts); the Python make_fixture.PAIRS table is repeated below.
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { FILES, INV, ipt, json, registered } from "./inventor_common";

const SHEET_METAL = new Set(["INV_nist_ctc_03_asme1_2021.ipt", "INV_nist_ftc_09_asme1_2021.ipt", "INV_nist_ftc_09_asme1_2024.ipt"]);
const WITH_THREADS = new Set(["INV_nist_ctc_04_asme1_2021.ipt", "INV_nist_ftc_10_asme1_2021.ipt", "INV_nist_ftc_10_asme1_2024.ipt"]);
const PAIRS: Record<string, [string, string]> = {
  ctc_04: ["nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt"],
  stc_10: ["nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt"],
};

const states = (result: any): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const t of result.inventor.threads) out[t.state] = (out[t.state] ?? 0) + 1;
  return out;
};

describe("NIST threads", () => {
  const cases: [string, string, string, number, number, Record<string, number>][] = [
    ["nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt", "M12x1.75", 25.0, 10.25, { matched: 4 }],
    ["nist_ftc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2021.ipt", "M3x0.5", 6.0, 2.5, { matched: 6 }],
    ["nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt", "M3x0.5", 6.0, 2.5, { matched: 5, disagrees: 1 }],
  ];
  test.each(cases)("%s + %s", async (step, name, callout, depth, tap, want) => {
    const result = await registered(step, name);
    expect(states(result)).toEqual(want);
    const holes = new Map<string, any>(result.features.filter((f: any) => f.kind === "hole").map((f: any) => [f.id, f]));
    for (const t of result.inventor.threads) {
      expect([t.designation, t.class, t.depth_mm, t.tap_drill_mm]).toEqual([callout, "6H", depth, tap]);
      expect(holes.has(t.hole)).toBe(true);
      expect(holes.get(t.hole).thread).toContain(t.id);
      if (t.state === "disagrees") { // STC 10: a measured difference between NIST's two files
        expect(t.gaps).toHaveLength(1);
        expect(t.gaps[0].what).toBe("axis");
        expect(Math.abs(t.gaps[0].mm - 0.10)).toBeLessThanOrEqual(0.01);
      }
    }
    expect(new Set(result.inventor.threads.map((t: any) => t.hole)).size).toBe(Object.values(want).reduce((a, b) => a + b, 0)); // one hole each
    const found = result.findings.filter((f: any) => f.rule === "thread_mismatch");
    expect(found).toHaveLength(want.disagrees ?? 0);
  }, 120_000);
});

test("thread records: CTC 04's record as stored (spec \"Thread records\"; measured)", async () => {
  const [t] = (await ipt("INV_nist_ctc_04_asme1_2021.ipt")).threads;
  expect([t.id, t.designation, t.cls, t.standard, t.pitch_mm, t.face]).toEqual(
    ["thread-1", "M12x1.75", "6H", "ANSI Metric M Profile", 1.75, "hole"]);
  expect(t.major_mm).toEqual([12.0, 12.453]);
  expect(t.minor_mm).toEqual([10.106, 10.441]);
  expect(t.tap_drill_mm).toBe(10.25);
  expect(Math.abs(t.depth_mm! - 25.0)).toBeLessThanOrEqual(1e-4);
  expect(t.reason).toBeNull();
});

describe("plain files have no threads", () => {
  const names = readdirSync(FILES).filter((n) => n.endsWith(".ipt") && !SHEET_METAL.has(n) && !WITH_THREADS.has(n)).sort();
  test.each(names)("%s", async (name) => {
    expect((await ipt(name)).threads).toEqual([]);
  });
});

describe("the committed fixtures the browser tests use match a fresh run, so they can't drift from the response", () => {
  test.each(Object.keys(PAIRS))("%s", async (name) => {
    const [step, file] = PAIRS[name];
    const fresh = await registered(step, file);
    const kept = json(resolve(INV, "fixtures", `${name}.json`));
    const plain = (x: unknown) => JSON.parse(JSON.stringify(x)); // Python's == takes -0.0 as 0.0; the kept JSON holds a "-0.0"
    expect(plain(kept.inventor)).toEqual(plain(fresh.inventor));
    expect(Object.fromEntries(kept.features.map((f: any) => [f.id, f.thread]))).toEqual(
      Object.fromEntries(fresh.features.map((f: any) => [f.id, f.thread])));
    expect(kept.findings.map((f: any) => f.id)).toEqual(fresh.findings.map((f: any) => f.id));
  }, 120_000);
});
