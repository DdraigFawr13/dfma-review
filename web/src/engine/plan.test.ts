// The pocket tools (D-029), which the S3 parity can't reach: its compare leaves out every file with a pocket until
// S4. Expected values from Python's own plan.pocket_tools on the same dicts (2026-11-10, S3 review).
import { expect, test } from "vitest";
import { cover, pocketTools } from "./plan";

const f = (dims: Record<string, number>) => ({ id: "pocket-1", kind: "pocket", faces: [1], dims_mm: dims });

test("a pocket's roughing then finishing tools, as Python's pocket_tools", () => {
  expect(pocketTools(f({ narrowest_width: 25.4, end_mill_mm: 6.35 })).map((t) => [t.id, t.diameter_in, t.undersized]))
    .toEqual([["em-0.750", 0.75, false], ["em-0.250", 0.25, false]]);
  expect(pocketTools(f({ narrowest_width: 6.0, end_mill_mm: 3.175 })).map((t) => t.id)).toEqual(["em-0.125"]);
  expect(pocketTools(f({ end_mill_mm: 0.79375, undersized: 1 })).map((t) => [t.id, t.diameter_in, t.undersized]))
    .toEqual([["em-0.031", 0.03125, true]]);
  expect(pocketTools(f({ narrowest_width: 10.0, end_mill_mm: 6.35 })).map((t) => t.id)).toEqual(["em-0.250"]); // one tool does both
});

test("setups: the fewest directions, the first in +Z -Z +X -X +Y -Y order on a tie", () => {
  expect(cover([])).toEqual(["+Z"]);
  expect(cover([new Set(["-X", "+Y"]), new Set(["+Y"])])).toEqual(["+Y"]);
  expect(cover([new Set(["+X", "-Z"]), new Set(["-Y"])])).toEqual(["-Z", "-Y"]);
});
