import { describe, expect, it } from "vitest";
import type { Analysis } from "./api";
import { holeCopies, holeNamesSeen } from "./findings";
import { ascii, holeFeatureLine, reportName, threadLine, valueText, verdictText } from "./report";

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

describe("thread lines (I1 S2, D-036)", () => {
  const base = { id: "thread-2", designation: "M3x0.5", class: "6H", standard: null, pitch_mm: 0.5, depth_mm: 6, tap_drill_mm: 2.5,
    minor_mm: null, major_mm: null, start: null, end: null, axis: null, feature_name: null };
  const result = { findings: [{ id: "F26", rule: "thread_mismatch", thread: "thread-1" }] } as unknown as Analysis;
  it("writes the hole, callout, sizes and state", () => {
    expect(threadLine({ ...base, state: "matched", hole: "hole-36", gaps: [], reason: null }, result))
      .toBe("hole-36  M3x0.5 - 6H  0.236 in [6 mm] deep  tap drill 0.098 in [2.5 mm]  matched");
    expect(threadLine({ ...base, id: "thread-1", state: "disagrees", hole: "hole-38", reason: null,
      gaps: [{ what: "axis", mm: 0.1, text: "0.10 mm off the hole's axis" }] }, result))
      .toBe("hole-38  M3x0.5 - 6H  0.236 in [6 mm] deep  tap drill 0.098 in [2.5 mm]  disagrees: 0.004 in [0.10 mm] off the hole's axis; see F26");
  });
  it("starts a not-mapped line with the thread id", () => {
    expect(threadLine({ ...base, state: "not_mapped", hole: null, gaps: [], reason: "external thread: not on a hole" }, result))
      .toBe("thread-2  M3x0.5 - 6H  0.236 in [6 mm] deep  tap drill 0.098 in [2.5 mm]  not mapped: external thread: not on a hole (our limit, not a finding)");
  });
});

describe("names and copies (I2 S2)", () => {
  const hole = (copied_by: number[]) => ({ id: "hf-1.1", start: [0, 0, 0], axis: [0, 0, 1], copied_by, state: "matched" as const,
    hole: "hole-1", gaps: [], reason: null });
  const feat = { id: "hf-1", feature_id: 1997, name: "Hole1" as string | null, type: "simple" as const, diameter_mm: 6, depth_mm: null,
    length_mm: 10, through: true, point_deg: null, cbore_diameter_mm: null, cbore_depth_mm: null, csink_diameter_mm: null,
    csink_deg: null, holes: [hole([]), hole([2187]), hole([2202]), hole([2202, 2187])], state: "matched" as const, reason: null };
  const result = { findings: [] } as unknown as Analysis;
  it("counts drawn and copied holes and the copying features", () => {
    expect(holeCopies(feat)).toBe("4 holes: 1 drawn, 3 copied by 2 pattern or mirror features");
    expect(holeCopies({ ...feat, holes: [hole([]), hole([8867])] })).toBe("2 holes: 1 drawn, 1 copied by 1 pattern or mirror feature");
    expect(holeCopies({ ...feat, holes: [hole([])] })).toBe("");
  });
  it("puts the name after the title, and leaves it out when there is none", () => {
    expect(holeFeatureLine(feat, result)).toBe("hf-1 Simple hole · 4 holes · Hole1: Ø0.236 in [6 mm] through. 4 matched, 0 disagree, 0 not mapped; 4 holes: 1 drawn, 3 copied by 2 pattern or mirror features.");
    expect(holeFeatureLine({ ...feat, name: null, holes: [hole([])] }, result)).toBe("hf-1 Simple hole · 1 hole: Ø0.236 in [6 mm] through. 1 matched, 0 disagree, 0 not mapped.");
  });
  it("says when the browser has more Hole features than were read", () => {
    expect(holeNamesSeen(11, 9)).toBe("11 Hole features in the browser, 9 read");
    expect(holeNamesSeen(9, 9)).toBe("");
    expect(holeNamesSeen(undefined, 9)).toBe("");
  });
  it("adds a thread's feature name after its callout", () => {
    const t = { id: "thread-1", designation: "M12x1.75", class: "6H", standard: null, pitch_mm: 1.75, depth_mm: 24, tap_drill_mm: 10.2,
      minor_mm: null, major_mm: null, start: null, end: null, axis: null, feature_name: "Hole8", state: "matched" as const,
      hole: "hole-36", gaps: [], reason: null };
    expect(threadLine(t, result)).toBe("hole-36  M12x1.75 - 6H  Hole8  0.945 in [24 mm] deep  tap drill 0.402 in [10.2 mm]  matched");
  });
});
