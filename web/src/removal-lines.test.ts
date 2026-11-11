// P1 S1 (machining spec J1, Design "P1: page"): the Machining step's removal lines, worded as the approved P1 mock-up
// (mockups/p1-removal.html, D-089). Pure functions on a result.
import { expect, test } from "vitest";
import type { Analysis } from "./api";
import { removalLines } from "./removal";

const withRemoval = (removal: unknown) => ({ removal }) as unknown as Analysis;
// clean_pocket.step's numbers (mockups/p1-removal/numbers.json, the spec's formula)
const CLEAN = { stock_mm3: 98322.384, part_mm3: 85339.334, total_mm3: 12983.05, features: [{ feature: "pocket-1", volume_mm3: 12979.172 }],
  features_sum_mm3: 12979.172, explained_mm3: 12979.172, unexplained_mm3: 3.878, unexplained_pct: 0.03 };

test("removal lines on screen", () => {
  expect(removalLines(withRemoval(CLEAN))).toEqual([
    ["Removal", "0.79 in³ (12,983 mm³): the stock block minus the part"],
    ["Not explained", "0.00 in³ (4 mm³), 0.03 % of the removal: no found hole or pocket accounts for it, such as an outside profile"],
  ]);
});

test("large volumes take thousands commas in in³ too", () => {
  const big = { ...CLEAN, total_mm3: 39355177.116, unexplained_mm3: 38843883.2, unexplained_pct: 98.7 };
  expect(removalLines(withRemoval(big))[0][1]).toBe("2,401.60 in³ (39,355,177 mm³): the stock block minus the part");
  expect(removalLines(withRemoval(big))[1][1]).toMatch(/^2,370\.40 in³ \(38,843,883 mm³\), 98\.70 % of the removal:/);
});

test("no removal, no lines", () => {
  expect(removalLines(withRemoval(null))).toEqual([]);
  expect(removalLines({} as Analysis)).toEqual([]);
});
