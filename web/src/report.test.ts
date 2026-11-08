import { describe, expect, it } from "vitest";
import type { Analysis } from "./api";
import { ascii, reportName, valueText, verdictText } from "./report";

const withFindings = (severities: string[]) => ({ findings: severities.map((severity) => ({ severity })) }) as unknown as Analysis;

describe("report text (S7)", () => {
  it("swaps the characters the PDF's fonts cannot draw and keeps Latin-1", () => {
    expect(ascii("−0.5 ≤ 2 × 3 · 4° …")).toBe("-0.5 <= 2 × 3 · 4° ...");
    expect(ascii("日本")).toBe("??");
  });

  it("opens with the answer in plain words", () => {
    expect(verdictText(withFindings([]))).toBe("No findings. Every feature checked passed its rules.");
    expect(verdictText(withFindings(["high", "medium", "medium"]))).toBe("3 findings: 1 high, 2 medium.");
    expect(verdictText(withFindings(["high"]))).toBe("1 finding: 1 high.");
  });

  it("names the download after the part", () => {
    expect(reportName("report_sample.step")).toBe("report_sample-dfma-review.pdf");
    expect(reportName("My Part (rev B).STP")).toBe("My_Part_rev_B_-dfma-review.pdf");
  });

  it("shows measured values and limits in the screen's units", () => {
    expect(valueText(0.02, "in", 0.03125)).toBe("0.020 in");
    expect(valueText(0.03125, "in", 0.02)).toBe("0.031 in");
    expect(valueText(7.2, "ratio", 6)).toBe("7.2×");
    expect(valueText(6.04, "ratio", 6)).toBe("6.04×"); // 0.1 would read 6.0×, the same as the limit
    expect(valueText(6, "ratio", 6.04)).toBe("6.00×");
    expect(valueText(30, "deg", 0.5)).toBe("30.0°");
  });
});
