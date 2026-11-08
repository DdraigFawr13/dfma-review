import { describe, expect, it } from "vitest";
import { toolName } from "./findings";

describe("toolName (S5 plan panel)", () => {
  it("names each tool kind with its size", () => {
    expect(toolName({ id: "em-0.250", kind: "end_mill", diameter_in: 0.25, undersized: false })).toBe("1/4 in end mill");
    expect(toolName({ id: "dr-0.2500", kind: "drill", diameter_in: 0.25, undersized: false })).toBe("0.250 in (1/4) drill");
    expect(toolName({ id: "dr-6.5mm", kind: "drill", diameter_in: 0.255906, undersized: false })).toBe("6.5 mm drill");
    expect(toolName({ id: "cs-82", kind: "countersink", diameter_in: null, undersized: false })).toBe("82° countersink");
    expect(toolName({ id: "em-0.031", kind: "end_mill", diameter_in: 0.03125, undersized: true })).toBe("1/32 in end mill (smallest; nothing fits)");
    expect(toolName({ id: "turn", kind: "turn", diameter_in: null, undersized: false })).toBe("Turning tool");
    expect(toolName({ id: "bore", kind: "bore", diameter_in: null, undersized: false })).toBe("Boring bar");
    expect(toolName({ id: "groove-0.125", kind: "groove", diameter_in: null, width_in: 0.125, undersized: false })).toBe("1/8 in grooving tool");
  });
});
