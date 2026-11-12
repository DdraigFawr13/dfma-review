// Port of tests/service/test_passed.py. D-023 (proposed): every feature a rule judges is either in a finding or in
// `passed`, never both, with the math; the Passed list uses the same numbers and limits as the findings.
import { describe, expect, test } from "vitest";
import type { Material, Process } from "../../api";
import * as undercut from "../rules/undercut";
import { expectedParts, run, type Result } from "./groupa_common";

const JUDGES: Record<string, string[]> = {
  hole_depth: ["hole"], bore_depth: ["bore"], hole_size: ["hole"], corner_radius: ["corner"], pocket_depth: ["pocket"],
  step_depth: ["step"], // steps and slots S1
  undercut: ["pocket"], thin_wall: ["wall"], access: ["hole", "pocket", "step"],
  // S6: turn_axis judges the part (no feature when it fires) and passes the profile it found
  turn_axis: ["profile"], looks_turned: [], turn_slender: ["profile"], turn_offaxis: ["hole", "pocket", "bore"],
};
const OPEN_ONLY = ["access", "turn_offaxis"]; // a void sealed inside the part is not judged

describe("every judged feature is flagged or passed", () => {
  for (const entry of expectedParts()) {
    const process = (entry.process ?? "mill") as Process;
    const material = (entry.material ?? "al6061") as Material;
    test(`${entry.name}-${process}-${material}`, async () => {
      const r = await run(entry.name, process, material);
      for (const rule of r.rules_run as string[]) {
        const flagged = new Set<string>(r.findings.filter((f: Result) => f.rule === rule && f.feature != null).map((f: Result) => f.feature));
        const passed: string[] = r.passed.filter((p: Result) => p.rule === rule).map((p: Result) => p.feature);
        expect(passed.length, `${rule}: a feature passed twice`).toBe(new Set(passed).size);
        expect(passed.filter((p) => flagged.has(p)), `${rule}: flagged and passed`).toEqual([]);
        const judged = r.features.filter((f: Result) => JUDGES[rule].includes(f.kind)
          && !(OPEN_ONLY.includes(rule) && !f.open_vectors.length)).map((f: Result) => f.id);
        expect([...new Set([...flagged, ...passed])].sort(), rule).toEqual([...judged].sort());
      }
      for (const p of r.passed) {
        expect(p.title).toBeTruthy();
        expect(p.math).toBeTruthy();
        expect(p.threshold_source).toBeTruthy();
      }
    });
  }
});

test("passed math uses the rule numbers", async () => {
  const r = await run("clean_one_setup");
  const rows = new Map<string, Result>(r.passed.map((p: Result) => [`${p.feature}|${p.rule}`, p]));
  expect(rows.get("hole-2|hole_depth")!.math).toBe("0.500 in deep ÷ 0.250 in diameter = 2.00× ≤ 6.0×");
  expect(rows.get("hole-1|hole_size")!.math).toBe("|0.2500 − 0.2500| = 0.0000 in ≤ 0.0005 in");
  expect(rows.get("pocket-1|pocket_depth")!.math).toBe(
    "end mill radius 0.125 in ≤ corner 0.125 in, 0.250 in ≤ narrowest gap 1.000 in; "
    + "0.250 in deep ÷ 0.250 in = 1.00× ≤ 3.0×");
  expect(rows.get("hole-1|access")!.title).toBe("Opens along −Z and +Z: a 3-axis mill reaches it");
});

test("an angled hole is not passed by access", async () => {
  const r = await run("angled_hole");
  expect(r.passed.filter((p: Result) => p.rule === "access")).toEqual([]);
});

test("an undercut within its limit is passed", () => {
  // Fresh-check finding: with max_in over 0, an undercut under the limit is passed, not dropped.
  const f = { kind: "pocket", id: "pocket-1", faces: [1], dims_mm: { undercut_mm: 2.0 } };
  const part = {} as never;
  const table = { undercut: { max_in: 0.1, source: "test" } };
  expect(undercut.check([f], part, table)).toEqual([]);
  const got = undercut.passes([f], part, table);
  expect(got.length).toBe(1);
  expect(got[0].math).toBe("0.079 in ≤ 0.100 in");
  expect(undercut.passes([f], part, { undercut: { max_in: 0.0, source: "D-021" } })).toEqual([]);
});
