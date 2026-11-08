import { describe, expect, it } from "vitest";
import type { Analysis } from "./api";
import { ascii, reportName, verdictText } from "./report";

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
});
