import { describe, expect, it } from "vitest";
import { formatIn, formatInWithFraction, formatRatio, formatSize, mmToIn, toFraction } from "./format";

describe("inches", () => {
  it("shows three decimals", () => {
    expect(formatIn(0.25)).toBe("0.250 in");
    expect(formatIn(mmToIn(6.35))).toBe("0.250 in");
    expect(formatIn(-0.0001)).toBe("0.000 in");
  });

  it("adds a fraction only near a 1/64 in multiple", () => {
    expect(formatInWithFraction(0.25)).toBe("0.250 in (1/4)");
    expect(formatInWithFraction(0.2504)).toBe("0.250 in (1/4)");
    expect(formatInWithFraction(0.26)).toBe("0.260 in");
    expect(formatInWithFraction(1.5)).toBe("1.500 in (1 1/2)");
    expect(formatInWithFraction(0.015625)).toBe("0.016 in (1/64)");
  });

  it("reduces fractions", () => {
    expect(toFraction(0.5)).toBe("1/2");
    expect(toFraction(0.375)).toBe("3/8");
    expect(toFraction(2)).toBe("2");
    expect(toFraction(0.2506)).toBeNull();
    expect(toFraction(0)).toBeNull();
  });
});

describe("part size", () => {
  it("is largest first, decimals only", () => {
    expect(formatSize([1.0, 2.0, 0.5])).toBe("2.000 × 1.000 × 0.500 in");
    expect(formatSize([0.5, 0.9999996, 2.0000004])).toBe("2.000 × 1.000 × 0.500 in");
  });
});

describe("ratios", () => {
  it("show to 0.1", () => {
    expect(formatRatio(8)).toBe("8.0×");
    expect(formatRatio(6.04)).toBe("6.0×");
  });
});
