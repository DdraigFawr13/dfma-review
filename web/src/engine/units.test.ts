// round() equals Python's round(x, n) (mesh positions to 5 decimals, bbox_in to 6; port spec Parity).
import { expect, test } from "vitest";
import { round } from "./units";

test("round matches Python's round on ties, near-ties and signs", () => {
  // Expected values printed by Python 3.12, 2026-11-10.
  const cases: [number, number, number][] = [
    [0.15, 1, 0.1], [0.25, 1, 0.2], [0.35, 1, 0.3], [2.675, 2, 2.67], [0.125, 2, 0.12], [0.375, 2, 0.38],
    [-0.125, 2, -0.12], [1.5, 0, 2], [2.5, 0, 2], [-2.5, 0, -2], [17.999995, 5, 17.99999], [1e-7, 5, 0],
    [-1e-7, 5, 0], // Python: -0.0, equal as a number
    [101.6000000000001, 6, 101.6], [0.0000049999, 5, 0.0],
  ];
  for (const [x, n, want] of cases) expect(round(x, n), `round(${x}, ${n})`).toBe(want);
});

test("the Python number formats: f-string decimals, fmt_in, past_limit, :g and fractions", async () => {
  // Expected values printed by the dfma environment's Python (service/dfma/units.py, rows.py), 2026-11-10.
  const { fmtIn, fraction, pastLimit, pyFixed, pyG } = await import("./units");
  const { idRange, valueText } = await import("./rows");
  const fixed: [number, number, string][] = [[0.0625, 3, "0.062"], [0.1875, 3, "0.188"], [8.25, 1, "8.2"], [0.125, 2, "0.12"],
    [-0.0004, 3, "-0.000"], [2.675, 2, "2.67"], [0.15, 1, "0.1"]];
  for (const [x, n, want] of fixed) expect(pyFixed(x, n), `${x}:.${n}f`).toBe(want);
  expect([0.0625, 0.25, 1.5, 0.2656, -0.0001, 0.0].map((x) => fmtIn(x, true)))
    .toEqual(["0.062 in (1/16)", "0.250 in (1/4)", "1.500 in (1 1/2)", "0.266 in (17/64)", "0.000 in", "0.000 in"]);
  expect([pastLimit(6.03, 6.0, 1), pastLimit(8.25, 10, 1), pastLimit(10.04, 10, 1)]).toEqual(["6.03", "8.2", "10.04"]);
  expect([6.5, 13.0, 0.1, 25.0, 1e-5, 1234567.0].map(pyG)).toEqual(["6.5", "13", "0.1", "25", "1e-05", "1.23457e+06"]);
  expect([idRange(["F4", "F5", "F6"]), idRange(["F1", "F3"]), idRange(["F1", "F2"])]).toEqual(["F4–F6", "F1 F3", "F1 F2"]);
  expect([valueText(9.62, "ratio", 6.0), valueText(6.02, "ratio", 6.0), valueText(22.04, "deg"), valueText(0.03125, "in")])
    .toEqual(["9.6×", "6.02×", "22.0°", "0.031 in (1/32)"]);
  expect([fraction(0.5), fraction(1.5), fraction(0.0002), fraction(0.3)]).toEqual(["1/2", "1 1/2", null, null]);
});
