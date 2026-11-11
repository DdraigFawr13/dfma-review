// Port of tests/service/test_inventor_holes.py: Hole features read from the NIST .ipt files, checked against the answer
// key, and mapped onto their STEP holes through the test harness (the app refuses every NIST pair).
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { holePairs, INV, ipt, near, registered, toml } from "./inventor_common";

const COUNTS = toml(resolve(INV, "hole_counts.toml"));
const TYPES: Record<string, string> = { None: "simple", Counterbore: "counterbore", Countersink: "countersink" };

describe("counts", () => {
  test.each(Object.keys(COUNTS.file).sort())("%s", async (name) => {
    const want = COUNTS.file[name];
    const feats = (await ipt(name)).hole_features;
    expect([feats.length, feats.reduce((n, f) => n + f.holes.length, 0)]).toEqual([want.features, want.holes]);
    expect(feats.map((f) => f.feature_id)).toEqual(feats.map((f) => f.feature_id).sort((a, b) => a - b));
  });
});

test("against key: type and diameter equal the key's on every key Hole that pairs with one feature (spec: 73, 0 misses); depth equals the key's where the hole ends inside the part", async () => {
  const pairs = await holePairs();
  expect(pairs).toHaveLength(85); // by position (spec: 73 by rank, in the 8 files where the counts match)
  for (const [name, k, f] of pairs) {
    const at = `${name} ${k.name}`;
    expect(f.type, at).toBe(TYPES[k.HoleCutType]);
    expect(near(f.diameter_mm, k.Diameter, 0.01), at).toBe(true);
    if (!f.through && k.DepthType !== "ThroughAll") expect(near(f.depth_mm, k.Depth, 0.01), at).toBe(true);
    if (f.type === "counterbore") {
      expect(near(f.cbore_diameter_mm, k.HoleCutDiameter, 0.01), at).toBe(true);
      expect(near(f.cbore_depth_mm, k.HoleCutDepth, 0.01), at).toBe(true);
    }
    if (f.type === "countersink") {
      expect(near(f.csink_deg, k.HoleCutCountersinkAngle, 0.01), at).toBe(true);
      expect(near(f.csink_diameter_mm, k.HoleCutDiameter, 0.01), at).toBe(true);
    }
    if (!f.through && k.DrillPoint === "Angled") expect(near(f.point_deg, k.DrillPointAngle, 0.01), at).toBe(true);
  }
});

test("copies: FTC 08 2021: one Hole feature, 4 holes: 1 drawn, 3 copied by ids 2187 and 2202 (spec J2)", async () => {
  const feats = (await ipt("INV_nist_ftc_08_asme1_2021.ipt")).hole_features;
  expect(feats).toHaveLength(1);
  const [f] = feats;
  expect(f.feature_id).toBe(1997);
  expect(f.holes).toHaveLength(4);
  expect(f.holes.map((h) => [...h.copied_by].sort((a, b) => a - b)).sort()).toEqual([[], [2187], [2187, 2202], [2202]].sort());
});

// CTC 02's pair takes 25 s alone (the whole file would pass 60 s): it is covered by the parity lane instead, where
// parity.test.ts compares this pair's inventor.hole_features and its findings (hole_mismatch) with the Python key
// tests__nist__.cache__NIST-PMI-STEP-Files__nist_ctc_02_asme1_ap242-e2.stp+INV_nist_ctc_02_asme1_2021.ipt+harness.json.gz
const IN_PARITY = ["INV_nist_ctc_02_asme1_2021.ipt"];

describe("mapping: holes per state and hole_mismatch findings on each NIST pair, as measured (J3)", () => {
  test.each(Object.keys(COUNTS.pair).sort().filter((n) => !IN_PARITY.includes(n)))("%s", async (name) => {
    const want = COUNTS.pair[name];
    const result = await registered(want.step, name);
    const rows = result.inventor.hole_features.flatMap((f: any) => f.holes);
    const got = Object.fromEntries(["matched", "disagrees", "not_mapped"].map((s) => [s, rows.filter((h: any) => h.state === s).length]));
    expect(got).toEqual({ matched: want.matched, disagrees: want.disagrees, not_mapped: want.not_mapped });
    expect(result.findings.filter((f: any) => f.rule === "hole_mismatch")).toHaveLength(want.findings);
    const holes = new Map<string, any>(result.features.filter((f: any) => f.kind === "hole" || f.kind === "bore").map((f: any) => [f.id, f]));
    for (const f of result.inventor.hole_features) {
      for (const h of f.holes) {
        expect(h.hole === null).toBe(h.state === "not_mapped");
        expect(h.gaps.length > 0).toBe(h.state === "disagrees");
        if (h.hole !== null) expect("hole_feature" in holes.get(h.hole)).toBe(true);
      }
    }
  }, 120_000);
});

test("CTC 04 mapping: the 30 countersunk Ø14 holes are one feature; 4 of them lie 0.25 mm off (NIST's two files differ), Hole22's one is 3.23 mm off, and one is not mapped (8.13 mm off, past the STEP hole's radius)", async () => {
  const result = await registered("nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt");
  const feats = result.inventor.hole_features;
  expect(feats.map((f: any) => f.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `hf-${n}`));
  const big = feats[6];
  expect([big.type, big.diameter_mm, big.csink_deg, big.through, big.holes.length]).toEqual(["countersink", 14.0, 90.0, true, 30]);
  const axisOff: number[] = big.holes.flatMap((h: any) => h.gaps.filter((g: any) => g.what === "axis").map((g: any) => g.mm)).sort((a: number, b: number) => a - b);
  expect(axisOff).toHaveLength(4);
  for (const mm of axisOff) expect(near(mm, 0.25, 0.01)).toBe(true);
  const lone = feats.flatMap((f: any) => f.holes).filter((h: any) => h.state === "not_mapped");
  expect(lone).toHaveLength(1);
  expect(lone[0].reason).toBe("no hole on this axis");
  expect(near(feats[8].holes[0].gaps[0].mm, 3.23, 0.01)).toBe(true);
}, 120_000);
