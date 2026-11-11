// Port of tests/service/test_drivers.py. S7: cost drivers (spec "Cost drivers"): count x weight, shown above 0 only,
// ranked by score then key.
import { expect, test } from "vitest";
import { costDrivers } from "../drivers";
import { driversConfig } from "../settings";
import { run, type Result } from "./groupa_common";

const table = (r: Result): [string, number, number][] => r.cost_drivers.map((d: Result) => [d.driver, d.count, d.score]);

test("report_sample drivers", async () => {
  // Counted by hand from the part: 2 setups (1 extra); tools em-0.250 (the 0.260 in hole, no drill matches),
  // dr-0.2500, em-0.750 (roughs the pocket) and em-0.031 (finishes its sharp corners, undersized): 4 tools, 1
  // undersized; findings: 4 sharp corners, 2 deep holes (7.2 and 9.6), 1 odd hole and 1 deep pocket (D-030). Ties
  // on score sort by key (A to Z).
  const r = await run("report_sample");
  expect(table(r)).toEqual([["distinct_tools", 4, 4.0], ["small_corners", 4, 4.0], ["deep_holes", 2, 2.0],
    ["deep_pockets", 1, 1.0], ["extra_setups", 1, 1.0], ["odd_holes", 1, 1.0], ["small_tools", 1, 1.0]]);
  expect(r.cost_drivers[0]).toEqual({ driver: "distinct_tools", label: "Distinct tools", count: 4, weight: 1.0,
    score: 4.0, weight_source: "estimate", findings: [] });
  expect(r.setups.length).toBe(2);
  expect(r.tools.length).toBe(4);
});

test("only drivers above zero", async () => {
  // A clean part with one drill has one driver; the others (count 0) are left out.
  expect(table(await run("box_through_hole"))).toEqual([["distinct_tools", 1, 1.0]]);
});

test("a turned part's roughing and finishing count as separate tools", async () => {
  // D-029: turn-rough and turn-finish are two tools, and a lathe has one setup, so no extra setup.
  const r = await run("shaft_with_groove_and_bore", "turn", "steel1018");
  expect(r.tools.map((t: Result) => t.id)).toEqual(["turn-rough", "turn-finish", "bore-rough", "bore-finish", "groove-0.125"]);
  expect(table(r)).toEqual([["distinct_tools", 5, 5.0]]);
});

test("off axis and multi axis", async () => {
  // turn_offaxis feeds off_axis; access (a feature needing 4/5-axis) feeds multi_axis.
  expect(table(await run("slender_shaft", "turn", "steel1018"))).toEqual([["distinct_tools", 3, 3.0], ["off_axis", 1, 1.0],
    ["slender_parts", 1, 1.0]]);
  expect(table(await run("angled_hole"))).toEqual([["multi_axis", 1, 1.0]]);
});

test("rules to drivers", () => {
  // A deep bore (bore_depth, D-026) is a deep hole for cost; deep pockets, undercuts and slender turned parts have
  // their own drivers (D-030); the two process warnings feed none.
  const rules = ["bore_depth", "hole_depth", "turn_slender", "pocket_depth", "undercut", "looks_turned", "turn_axis"];
  const findings = rules.map((rule, n) => ({ id: `F${n + 1}`, rule }));
  const got = costDrivers(findings, [{}], []);
  expect(got.map((d) => [d.driver, d.count])).toEqual([["deep_holes", 2], ["deep_pockets", 1], ["slender_parts", 1], ["undercuts", 1]]);
});

test("small tools: undersized or under an eighth", async () => {
  // Spec: undersized or sub-1/8 in tools. pocket_small_radius's 1/32 in end mill fits its 0.020 in corners (not
  // undersized) but is under 1/8 in, so it counts; a 1/8 in tool and a tool with no diameter do not.
  const r = await run("pocket_small_radius");
  expect(r.tools.map((t: Result) => [t.id, t.undersized])).toEqual([["em-0.750", false], ["em-0.031", false]]);
  expect(table(r)).toContainEqual(["small_tools", 1, 1.0]);
  const tools = [{ diameter_in: 0.125, undersized: false }, { diameter_in: null, undersized: false },
    { diameter_in: 0.5, undersized: true }, { diameter_in: 0.0625, undersized: false }];
  const got = Object.fromEntries(costDrivers([], [{}], tools).map((d) => [d.driver, d.count]));
  expect(got.small_tools).toBe(2);
});

test("the weight scales the score and the order", () => {
  // Score is count x weight, read from drivers.toml: a weight of 3 on odd_holes lifts a count of 1 to the top.
  const config = driversConfig() as Record<string, { weight: number }>;
  const was = config.odd_holes.weight;
  config.odd_holes.weight = 3.0; // the config is cached; restore it after (Python monkeypatched drivers_config)
  try {
    const got = costDrivers([{ id: "F1", rule: "hole_size" }, { id: "F2", rule: "hole_size" }], [{}], []);
    expect(got).toEqual([{ driver: "odd_holes", label: "Non-standard holes", count: 2, weight: 3.0, score: 6.0,
      weight_source: "estimate", findings: ["F1", "F2"] }]);
  } finally {
    config.odd_holes.weight = was;
  }
});

test("the config lists the drivers, each labelled", () => {
  // Spec: the nine driver names in drivers.toml, plus D-030's three; every starting weight 1.0 and labelled
  // `estimate` (REP-01).
  const config = driversConfig() as Record<string, { weight: number; source: string; label: string }>;
  expect(Object.keys(config)).toEqual(["extra_setups", "distinct_tools", "small_tools", "deep_holes", "odd_holes", "thin_walls",
    "small_corners", "off_axis", "multi_axis", "deep_pockets", "undercuts", "slender_parts"]);
  for (const d of Object.values(config)) {
    expect(d.weight).toBe(1.0);
    expect(d.source).toBe("estimate");
    expect(d.label).toBeTruthy();
  }
});
