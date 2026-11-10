// The Python semantics holes.ts copies where order decides a tie (port spec S2; the S2 build review).
import { expect, test } from "vitest";
import { pySum } from "../units";
import { number, pySetOrder, wholeDegree } from "./holes";

test("pySetOrder iterates as CPython 3.12 iterates a set built by add()", () => {
  // [added in this order, Python's list(s)], printed by the dfma environment's Python 3.12.16, 2026-11-10
  const cases: [number[], number[]][] = [
    [[9, 1], [9, 1]], [[1, 9], [1, 9]], [[2, 10, 18], [18, 2, 10]], [[241, 333, 194, 107], [241, 194, 107, 333]],
    [[311, 390, 392, 1], [392, 1, 390, 311]], [[283, 119, 176, 118], [176, 283, 118, 119]], [[61, 380, 170], [170, 380, 61]],
  ];
  for (const [added, want] of cases) expect(pySetOrder(added), JSON.stringify(added)).toEqual(want);
});

test("pySum is Python's compensated sum()", () => {
  expect(pySum([1e16, 1.0, -1e16])).toBe(1.0); // Python 3.12: 1.0; a plain left fold gives 0
  expect(pySum([])).toBe(0);
});

test("number() orders by lowest face, then by the sorted faces, keeping the input order on a full tie", () => {
  const out = number([{ faces: [5, 2], n: "a" }, { faces: [2, 9], n: "b" }, { faces: [2, 5], n: "c" }, { faces: [1], n: "d" }], "wall");
  expect(out.map((f) => [f.id, f.n])).toEqual([["wall-1", "d"], ["wall-2", "a"], ["wall-3", "c"], ["wall-4", "b"]]);
});

test("wholeDegree snaps a seam's 1-ulp atan2 noise into the same bin as Python (D-063)", () => {
  // NIST linkage_arm_42 face 0 at u = 2 pi: V8 gives atan2 -1.5707963267948972, glibc -1.570796326794897
  const v8 = Math.atan2(-0.12850000000000006, -5.551115123125783e-17) * (180 / Math.PI);
  expect(((v8 % 360) + 360) % 360).toBe(269.99999999999994); // the bin the old rule took: 269
  expect(wholeDegree(((v8 % 360) + 360) % 360)).toBe(270);
  expect(wholeDegree(269.99999999999997)).toBe(270); // Python's value
  expect(wholeDegree(360 - 1e-13)).toBe(0);
  expect(wholeDegree(89.9999999)).toBe(89); // a real 89.9999999 deg stays in 89
});
