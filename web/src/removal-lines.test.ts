// P1 S1 (machining spec J1, Design "P1: page"): the Machining step's removal lines, worded as the approved P1 mock-up
// (mockups/p1-removal.html, D-089). Pure functions on a result.
import { expect, test } from "vitest";
import type { Analysis } from "./api";
import { removalLines, typedStock, volumeText } from "./removal";

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

// P1 S2 (machining spec J2): your own stock. The spec's part: 100 × 60 × 30 mm (3.937 × 2.362 × 1.181 in), frame order.
const PART = { part: { bbox_in: [3.937008, 2.362205, 1.181102] }, removal: CLEAN } as unknown as Analysis;

test("facing per side", () => {
  // typed in any order; paired largest to largest with the part's sides
  const s = typedStock(PART, ["1.25", "4", "2.5"]);
  expect(s).toEqual({ typed: [4, 2.5, 1.25] });
  const lines = removalLines(PART, (s as { typed: [number, number, number] }).typed);
  const typedMm3 = 4 * 2.5 * 1.25 * 25.4 ** 3;
  expect(lines).toEqual([
    ["Removal", `${volumeText(typedMm3 - CLEAN.part_mm3)}: your 4.000 × 2.500 × 1.250 in block minus the part`],
    ["Not explained", "0.00 in³ (4 mm³), 0.03 % of the part-size removal: no found hole or pocket accounts for it, such as an outside profile"],
    // Z, X, Y, on the part's sides as the Stock line shows them (to 0.001 in), so corners count once
    ["Facing Z", "0.0345 in per side, 0.69 in³ in the two layers"], // 0.069 × 4 × 2.5
    ["Facing X", "0.0315 in per side, 0.19 in³ in the two layers"], // 0.063 × 2.5 × 1.181
    ["Facing Y", "0.0690 in per side, 0.64 in³ in the two layers"], // 0.138 × 3.937 × 1.181
  ]);
});

test("a typed size equal to the part's is 0 facing", () => {
  const s = typedStock(PART, ["3.937", "2.362", "1.181"]);
  expect(s).toEqual({ typed: [3.937, 2.362, 1.181] });
  const lines = removalLines(PART, [3.937, 2.362, 1.181]);
  expect(lines.slice(2).map(([, v]) => v)).toEqual([
    "0.0000 in per side, 0.00 in³ in the two layers",
    "0.0000 in per side, 0.00 in³ in the two layers",
    "0.0000 in per side, 0.00 in³ in the two layers",
  ]);
});

test("stock too small", () => {
  expect(typedStock(PART, ["4", "2.5", "1.0"])).toEqual({ error: "Your 1.000 in is smaller than the part's 1.181 in." });
  // each size too small gets its own sentence, largest first
  expect(typedStock(PART, ["3.5", "2", "1.25"])).toEqual({
    error: "Your 3.500 in is smaller than the part's 3.937 in. Your 2.000 in is smaller than the part's 2.362 in.",
  });
});

test("bad stock size", () => {
  const bad = { error: "Type three sizes over 0 in." };
  for (const raw of [["0x10", "2.5", "1.25"], ["4", "1e1", "1.25"], ["", "2.5", "1.25"], ["4", "x", "1.25"], ["4", "2.5", "0"], ["4", "-2.5", "1.25"], ["4", "2.5", " "], ["4", "Infinity", "1"]]) {
    expect(typedStock(PART, raw)).toEqual(bad);
  }
});

test("pairing follows the part frame, not the typed order", () => {
  // the same part with its sides along y, z, x: typed sizes land on the frame axes of the matching part sides
  const turned = { part: { bbox_in: [1.181102, 3.937008, 2.362205] }, removal: CLEAN } as unknown as Analysis;
  expect(typedStock(turned, ["4", "2.5", "1.25"])).toEqual({ typed: [1.25, 4, 2.5] });
  expect(removalLines(turned, [1.25, 4, 2.5]).slice(2)).toEqual([
    ["Facing Z", "0.0690 in per side, 0.69 in³ in the two layers"], // 0.138 × 1.25 × 4
    ["Facing X", "0.0345 in per side, 0.65 in³ in the two layers"], // 0.069 × 4 × 2.362
    ["Facing Y", "0.0315 in per side, 0.18 in³ in the two layers"], // 0.063 × 1.181 × 2.362
  ]);
});
