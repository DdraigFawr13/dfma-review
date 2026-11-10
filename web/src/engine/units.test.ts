// round() equals Python's round(x, n) (mesh positions to 5 decimals, bbox_in to 6; port spec Parity).
import { expect, test } from "vitest";
import { round } from "./units";

test("round matches Python's round on ties, near-ties and signs", () => {
  // Expected values printed by Python 3.12, 2026-11-10.
  const cases: [number, number, number][] = [
    [0.15, 1, 0.1], [0.25, 1, 0.2], [0.35, 1, 0.3], [2.675, 2, 2.67], [0.125, 2, 0.12], [0.375, 2, 0.38],
    [-0.125, 2, -0.12], [1.5, 0, 2], [2.5, 0, 2], [-2.5, 0, -2], [17.999995, 5, 17.99999], [1e-7, 5, 0],
    [-1e-7, 5, 0], // Python: -0.0, equal as a number [101.6000000000001, 6, 101.6], [0.0000049999, 5, 0.0],
  ];
  for (const [x, n, want] of cases) expect(round(x, n), `round(${x}, ${n})`).toBe(want);
});
