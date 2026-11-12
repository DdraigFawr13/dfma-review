// The re-freeze guard (refreeze-mask.ts) on hand-made keys: an allowed step change passes, and each change the slice may
// not make is refused (audit 2026-11-12 F6, D-092). Each refusal case is a planted bug on top of the allowed change.
import { describe, expect, test } from "vitest";
import { refused, type Obj } from "./refreeze-mask";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const OLD: Obj = {
  part: { name: "p.step", not_analysed_faces: [7] },
  features: [{ id: "hole-1", kind: "hole", faces: [1], dims_mm: { diameter: 5 } },
    { id: "pocket-1", kind: "pocket", faces: [2, 3], dims_mm: { depth: 4 } }],
  findings: [{ id: "F1", rule: "hole_depth", feature: "hole-1" }],
  passed: [{ rule: "pocket_depth", feature: "pocket-1" }],
  rules_run: ["hole_depth", "pocket_depth"], checks_run: ["Hole depth check", "Pocket depth check"],
  setups: [{ direction: "+Z", features: ["hole-1", "pocket-1"] }],
  operations: [{ setup: 0, tool: "dr-0.2", features: ["hole-1"], faces: [1] }, { setup: 0, tool: "em-0.250", features: ["pocket-1"], faces: [2, 3] }],
  tools: [{ id: "dr-0.2" }, { id: "em-0.250" }], tool_changes: 2, cost_drivers: [], cost_total: null, rows: [], passed_rows: [],
};
/** OLD plus what S2 may add: a slot, its finding first (renumbering F1 to F2), its setup, tool and plan keys. */
function withStep(): Obj {
  const r = clone(OLD) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  r.part.not_analysed_faces = [];
  r.features.push({ id: "slot-1", kind: "slot", faces: [7, 8], dims_mm: { depth: 10 } }, { id: "corner-1", kind: "corner", faces: [8], pocket: "slot-1", dims_mm: {} });
  r.findings = [{ id: "F1", rule: "slot_depth", feature: "slot-1" }, { id: "F2", rule: "hole_depth", feature: "hole-1" }];
  r.passed.push({ rule: "corner_radius", feature: "corner-1" });
  r.rules_run = ["hole_depth", "pocket_depth", "slot_depth"];
  r.checks_run = ["Hole depth check", "Pocket depth check", "Slot depth check"];
  r.setups = [{ direction: "+Z", features: ["hole-1", "pocket-1", "slot-1"] }];
  r.operations.unshift({ setup: 0, tool: "em-1.000", features: ["slot-1"], faces: [7, 8] });
  r.tools.unshift({ id: "em-1.000" });
  r.tool_changes = 3;
  r.cost_drivers = [{ driver: "deep_steps_slots", count: 1 }];
  r.cost_total = 1;
  r.rows = [{ ids: ["F1"] }];
  return r;
}

describe("re-freeze guard", () => {
  test("an allowed step change passes", () => expect(refused(withStep(), OLD)).toEqual([]));
  test("a new rule in rules_run on a file with no step passes", () => {
    const r = clone(OLD) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    r.rules_run = [...r.rules_run, "slot_depth"]; r.checks_run = [...r.checks_run, "Slot depth check"];
    expect(refused(r, OLD)).toEqual([]);
  });
  const planted: [string, (r: Record<string, any>) => void][] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a changed hole", (r) => { r.features[0].dims_mm.diameter = 6; }],
    ["a pocket that lost its faces", (r) => { r.features[1].faces = [2]; }],
    ["a hole that lost its tool", (r) => { r.operations[1].tool = "dr-0.3"; }],
    ["a changed hole finding", (r) => { r.findings[1].rule = "hole_size"; }],
    ["a pocket's passed check gone", (r) => { r.passed = r.passed.filter((p: Obj) => p.feature !== "pocket-1"); }],
    ["an extra rule that is not new", (r) => { r.rules_run.push("thin_wall"); }],
    ["a face that joined not_analysed_faces", (r) => { r.part.not_analysed_faces = [9]; }],
    ["the part's name", (r) => { r.part.name = "q.step"; }],
  ];
  for (const [what, plant] of planted) {
    test(`refuses ${what}`, () => {
      const r = withStep() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      plant(r);
      expect(refused(r, OLD).length, what).toBeGreaterThan(0);
    });
  }
  test("refuses a changed finding on a file with no step", () => {
    const r = clone(OLD) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    r.findings[0].id = "F2";
    expect(refused(r, OLD).length).toBeGreaterThan(0);
  });
  test("refuses plan changes on a file with no step", () => {
    const r = clone(OLD) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    r.setups = [{ direction: "-Z", features: ["hole-1", "pocket-1"] }];
    expect(refused(r, OLD).length).toBeGreaterThan(0);
  });
});
