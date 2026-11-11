// Port of tests/service/test_turning.py: S6 turning (spec J5, Features "Turned profile", "Groove", "Bore", Rules
// "turn_slender" and "turn_offaxis", Design "Turning").
import { expect, test } from "vitest";
import type { Material, Process } from "../../api";
import * as boreDepth from "../rules/bore_depth";
import * as turnOffaxis from "../rules/turn_offaxis";
import * as turnSlender from "../rules/turn_slender";
import type { Feature, PartSummary } from "../rules/types";
import { thresholds } from "../settings";
import { grooveTool } from "../turning";
import { checkPlan, expected, IN, partBytes, run as runPart, type Feat, type Result } from "./groupb_common";

const approx = (v: number, want: number, abs: number) => expect(Math.abs(v - want)).toBeLessThanOrEqual(abs);
const run = (name: string, process: Process = "turn", material: Material = "al6061") => runPart(name, process, material);
const one = (r: Result, rule: string): Feat => {
  const found = r.findings.filter((f: Feat) => f.rule === rule);
  expect(found.length).toBe(1);
  return found[0];
};
const part = {} as PartSummary;

test("slender shaft", async () => {
  // J5: 0.500 x 4.500 in in 1018 for turning: the axis and "lathe", the length finding (high) and the cross hole.
  const r = await run("slender_shaft", "turn", "steel1018");
  expect(r.turn_axis).not.toBeNull();
  expect(Math.abs(Math.abs(r.turn_axis[2]) - 1)).toBeLessThan(1e-9); // along the shaft (file Z)
  expect(r.machine).toBe("lathe with live tooling");
  const slender = one(r, "turn_slender");
  expect([slender.severity, slender.title]).toEqual(["high", "Length 9.0× diameter (limit 8.0×)"]);
  const off = one(r, "turn_offaxis");
  expect(off.severity).toBe("medium");
  expect(off.title).toBe("Hole not on the turning axis: needs a milling operation or live tooling");
  expect(r.findings.map((f: Feat) => f.rule)).toEqual(["turn_slender", "turn_offaxis"]);
  const profiles = r.features.filter((f: Feat) => f.kind === "profile");
  expect(profiles.length).toBe(1);
  approx(profiles[0].dims_mm.diameter, 0.5 * IN, 0.01);
  approx(profiles[0].dims_mm.length, 4.5 * IN, 0.01);
  await checkPlan(partBytes("slender_shaft"), expected("slender_shaft"), r);
});

test("slender shaft for milling has no turning rules", async () => {
  // Morgan's comparison: the same part for milling plans the cross hole on a 3-axis mill, with no lathe checks.
  const r = await run("slender_shaft", "mill", "steel1018");
  expect(r.machine).toBe("3-axis mill");
  expect(r.turn_axis).toBeNull();
  expect(["turn_axis", "turn_slender", "turn_offaxis", "bore_depth"].filter((x) => r.rules_run.includes(x))).toEqual([]);
  // D-028: but it warns that the part looks turned
  expect(r.findings.length).toBe(1);
  const f = r.findings[0];
  expect([f.rule, f.severity, f.title, f.unit, f.limit, f.feature]).toEqual(
    ["looks_turned", "high", "This part looks turned; review it for Turning", "%", 40.0, null]);
  expect(f.measured).toBeGreaterThan(90);
  expect(r.features.filter((x: Feat) => ["profile", "bore", "groove"].includes(x.kind))).toEqual([]);
});

test("block for milling does not look turned", async () => {
  // D-028 runs on Milling only, and a block's round faces are well under 40%.
  const r = await run("box_through_hole", "mill");
  expect(r.rules_run).toContain("looks_turned");
  expect(r.findings.filter((f: Feat) => f.rule === "looks_turned")).toEqual([]);
});

test("stock size", async () => {
  // Morgan, 2026-11-08: the plan shows the stock, the part's own size with no allowance.
  expect((await run("slender_shaft", "turn", "steel1018")).stock).toEqual({ shape: "bar", diameter_in: 0.5, length_in: 4.5 });
  const block = (await run("two_sided_block", "mill")).stock;
  expect(block.shape).toBe("block");
  expect([...block.size_in].sort((a: number, b: number) => a - b)).toEqual([1.5, 2.0, 3.0]);
});

test("stout shaft is medium", async () => {
  const f = one(await run("stout_shaft"), "turn_slender");
  expect([f.severity, f.measured, f.limit, f.unit]).toEqual(["medium", 5.0, 4.0, "ratio"]);
  expect(f.title).toBe("Length 5.0× diameter (limit 4.0×)");
});

test("slender limits come from thresholds", () => {
  // D-025: medium over 3.0x for the steels, over 4.0x for aluminium and plastic; high over 8.0x for all.
  for (const m of ["steel1018", "ss304"]) expect(thresholds(m).turn_slender).toEqual({ medium: 3.0, high: 8.0, source: "D-025" });
  for (const m of ["al6061", "plastic"]) expect(thresholds(m).turn_slender).toEqual({ medium: 4.0, high: 8.0, source: "estimate" });
});

for (const [material, flagged] of [["steel1018", true], ["ss304", true], ["al6061", false], ["plastic", false]] as const) {
  test(`slender limit by material (${material})`, () => {
    // D-025: a 3.5x shaft is medium in the steels and clean in aluminium and plastic.
    const f: Feature = { kind: "profile", id: "profile-1", faces: [0], dims_mm: { diameter: 10.0, length: 35.0 } };
    const got = turnSlender.check([f], part, thresholds(material));
    expect(got.map((g) => [g.severity, g.limit])).toEqual(flagged ? [["medium", 3.0]] : []);
  });
}

test("groove and bore", async () => {
  const r = await run("shaft_with_groove_and_bore", "turn", "steel1018");
  expect(r.findings).toEqual([]);
  expect(r.machine).toBe("lathe");
  const bores = r.features.filter((f: Feat) => f.kind === "bore");
  expect(bores.length).toBe(1);
  approx(bores[0].dims_mm.diameter, 0.75 * IN, 1e-3);
  approx(bores[0].dims_mm.depth, 1.0 * IN, 1e-3);
  expect(r.features.filter((f: Feat) => f.kind === "hole")).toEqual([]); // a bore or a hole, never both
  const grooves = r.features.filter((f: Feat) => f.kind === "groove");
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  expect(grooves.map((g: Feat) => [g.outside, r4(g.dims_mm.width / IN), r4(g.dims_mm.depth / IN)])).toEqual([[true, 0.125, 0.1], [false, 0.125, 0.0625]]);
  expect(r.operations.map((o: Feat) => [o.tool, o.features])).toEqual([
    ["turn-rough", ["profile-1"]], ["turn-finish", ["profile-1"]], ["bore-rough", ["bore-1"]],
    ["bore-finish", ["bore-1"]], ["groove-0.125", ["groove-1", "groove-2"]]]); // D-029: rough, then finish
  // D-026: bore_depth judges the bore (1.33x, a steel bar reaches); hole_depth judges holes only
  expect(r.passed.filter((p: Feat) => p.rule === "bore_depth").map((p: Feat) => p.feature)).toEqual(["bore-1"]);
  expect(r.passed.filter((p: Feat) => p.rule === "hole_depth")).toEqual([]);
});

test("block as turn", async () => {
  // The 2 x 1 x 0.5 in block for turning: no turning axis, only the shared rules, nothing planned.
  const r = await run("block_as_turn");
  const f = one(r, "turn_axis");
  expect([f.severity, f.title, f.unit, f.limit]).toEqual(["high", "No turning axis found; check the process", "%", 40.0]);
  expect(r.rules_run).toEqual(["hole_depth", "hole_size", "thin_wall", "turn_axis"]);
  expect(r.machine).toBeNull();
  expect(r.turn_axis).toBeNull();
  expect(r.setups).toEqual([]);
  expect(r.tool_changes).toBe(0);
});

test("clean shaft", async () => {
  const r = await run("clean_shaft");
  expect(r.findings).toEqual([]);
  expect(r.machine).toBe("lathe");
  const holes = r.features.filter((f: Feat) => f.kind === "hole");
  expect(holes.length).toBe(1);
  expect(holes[0].off_axis_deg).toBeLessThanOrEqual(0.5);
  expect(holes[0].off_axis_mm).toBeLessThanOrEqual(0.0254);
  expect(r.operations.map((o: Feat) => o.tool)).toEqual(["turn-rough", "turn-finish", "dr-0.1875"]);
  const passed = new Set(r.passed.map((p: Feat) => `${p.rule}|${p.feature}`));
  for (const want of ["turn_slender|profile-1", "turn_offaxis|hole-1", "turn_axis|profile-1"]) expect(passed.has(want), want).toBe(true);
  const profiles = r.features.filter((f: Feat) => f.kind === "profile");
  expect(profiles.length).toBe(1);
  approx(profiles[0].dims_mm.min_diameter, 0.75 * IN, 1e-3); // D-026: the 0.750 in end
  const rows = r.passed.filter((p: Feat) => p.rule === "turn_slender");
  expect(rows.length).toBe(1);
  expect(rows[0].title).toBe("Length 4.0× its smallest diameter, 0.750 in, at most 4.0×");
});

test("clean shaft in steel is slender by its smallest diameter", async () => {
  // D-025 and D-026: 3.000 in long over the 0.750 in end is 4.0x, past the steels' 3.0x.
  const f = one(await run("clean_shaft", "turn", "steel1018"), "turn_slender");
  expect([f.severity, f.limit]).toEqual(["medium", 3.0]);
  expect(f.title).toBe("Length 4.0× its smallest diameter (0.750 in) (limit 3.0×)");
  expect(f.suggestion.startsWith("Support the free end with a tailstock center")).toBe(true);
});

for (const [ratio, words] of [[2.5, "A chuck alone"], [5.0, "tailstock center"], [9.0, "a tailstock and a steady rest"],
  [15.0, "a tailstock and 3 steady rests (5 holding points)"]] as const) {
  test(`support named by ratio (${ratio})`, () => {
    // D-026, CADEM tiers: chuck under 3x, tailstock 3-6x, steady rest 6-12x, one holding point per 3x.
    expect(turnSlender.support(ratio)).toContain(words);
  });
}

for (const [depthD, severity] of [[4.0, null], [5.0, "medium"], [7.0, "high"]] as const) {
  test(`bore depth (${depthD}x)`, () => {
    // D-026 (Sandvik): over 4x a carbide bar (medium), over 6x a damped bar (high).
    const f: Feature = { kind: "bore", id: "bore-1", faces: [2], dims_mm: { diameter: 20.0, depth: 20.0 * depthD } };
    const got = boreDepth.check([f], part, thresholds("steel1018"));
    expect(got.map((g) => g.severity)).toEqual(severity ? [severity] : []);
  });
}

test("offset hole is off axis", () => {
  // Coaxial means within 0.5 deg and 0.001 in (spec): a parallel hole 0.002 in off the axis is off-axis.
  const f: Feature = { kind: "hole", id: "hole-1", faces: [3], dims_mm: {}, open_vectors: [[0, 0, 1]], off_axis_deg: 0.0, off_axis_mm: 0.002 * IN };
  const got = turnOffaxis.check([f], part, {});
  expect(got.length).toBe(1);
  expect([got[0].unit, got[0].limit, got[0].measured]).toEqual(["in", 0.001, 0.002]);
  expect(turnOffaxis.check([{ ...f, off_axis_mm: 0.001 * IN }], part, {})).toEqual([]);
});

test("groove tool widths", () => {
  expect(grooveTool(0.125 * IN).id).toBe("groove-0.125");
  expect(grooveTool(0.25 * IN).undersized).toBe(false);
  const narrow = grooveTool(0.06 * IN);
  expect([narrow.id, narrow.undersized]).toEqual(["groove-0.125", true]);
});
