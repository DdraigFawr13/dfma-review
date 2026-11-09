// The 2026-11-09 UX audit's fixes in the words (docs/audit/2026-11-09-ux.md, D-053).
import { describe, expect, it } from "vitest";
import type { Analysis, Blend, IptHole, Thread } from "./api";
import { blendCounts, holeCounts, stockText, threadCounts } from "./findings";
import { biggestDrivers } from "./steps";

const states = <T>(...s: string[]) => s.map((state) => ({ state })) as unknown as T[];

describe("F10: counts agree with their number", () => {
  it("says 1 disagrees and 7 disagree", () => {
    expect(threadCounts(states<Thread>("disagrees", "matched"))).toBe("1 matched, 1 disagrees, 0 not mapped");
    expect(threadCounts(states<Thread>(...Array(7).fill("disagrees")))).toBe("0 matched, 7 disagree, 0 not mapped");
    expect(holeCounts(states<IptHole>("disagrees"))).toBe("0 matched, 1 disagrees, 0 not mapped");
    expect(blendCounts(states<Blend>("disagrees", "disagrees"))).toBe("0 matched, 2 disagree, 0 not mapped");
  });
});

describe("F22: the biggest cost drivers in points, ties said", () => {
  const drivers = (...d: [string, number][]) => ({ cost_drivers: d.map(([label, score]) => ({ label, score, weight_source: "estimate" })) }) as unknown as Analysis;
  it("names a tie once", () => {
    expect(biggestDrivers(drivers(["Distinct tools", 4], ["Sharp or small inside corners", 4], ["Deep pockets", 1])))
      .toBe("distinct tools and sharp or small inside corners, tied at 4.0 points (weights are estimates)");
  });
  it("gives each score its unit", () => {
    expect(biggestDrivers(drivers(["Distinct tools", 4], ["Deep pockets", 1])))
      .toBe("distinct tools 4.0 points, deep pockets 1.0 points (weights are estimates)");
    expect(biggestDrivers(drivers(["Distinct tools", 1]))).toBe("distinct tools 1.0 points (weights are estimates)");
  });
});

describe("F32: the stock line's caveat is short", () => {
  it("says part size, no allowance", () => {
    expect(stockText({ shape: "block", size_in: [2, 3, 1.5] })).toBe("2.000 × 3.000 × 1.500 in block (part size, no allowance)");
    expect(stockText({ shape: "bar", diameter_in: 0.5, length_in: 4.5 })).toBe("0.500 in round bar, 4.500 in long (part size, no allowance)");
  });
});
