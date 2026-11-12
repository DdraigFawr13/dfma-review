// Steps S1 audit F7 (D-092): a floor's runs of walls must not depend on the edge its wire starts at.
import { describe, expect, test } from "vitest";
import { runs } from "./pockets";

const w = (...walls: number[]) => ({ kind: "wall", walls });
const cut = { kind: "cut", walls: [] as number[] };
const open = { kind: "open", walls: [] as number[] };
const rotations = <T>(xs: T[]) => xs.map((_, i) => [...xs.slice(i), ...xs.slice(0, i)]);
const sorted = (rs: number[][]) => rs.map((r) => [...r].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0] || a.length - b.length);

describe("runs", () => {
  test("a cut between two pieces of one wall joins them, from every start edge", () => {
    const same = (a: number, b: number) => [a, b].sort().join() === "1,2";
    for (const t of rotations([w(1), cut, w(2), open])) expect(sorted(runs(t, same)), JSON.stringify(t)).toEqual([[1, 2]]);
  });
  test("a cut between two different walls splits them, from every start edge", () => {
    for (const t of rotations([w(1), cut, w(2), open])) expect(sorted(runs(t)), JSON.stringify(t)).toEqual([[1], [2]]);
  });
  test("an L of walls with open edges is one run; open edges on both sides give two", () => {
    for (const t of rotations([w(1), w(2), open, open])) expect(sorted(runs(t))).toEqual([[1, 2]]);
    for (const t of rotations([w(1), open, w(2), open])) expect(sorted(runs(t))).toEqual([[1], [2]]);
  });
  test("the same wall met on two stretches of the outline counts in each run", () => {
    for (const t of rotations([w(5), open, w(23, 5), open])) expect(sorted(runs(t))).toEqual([[5], [5, 23]]);
  });
});
