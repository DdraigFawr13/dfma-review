import { describe, expect, it } from "vitest";
import type { Analysis } from "./api";
import { placeRows } from "./steps";

// review-steps S3 (spec Builder defaults "Machining placement", D-049): each row's findings placed in a setup, the
// whole part or no setup, counted once per place.
const feature = (id: string, kind: string, pocket?: string) => ({ id, kind, faces: [], axis: null, open_dirs: [], open_vectors: [], dims_mm: {}, pocket });
const finding = (id: string, feat: string | null) => ({ id, feature: feat, rule: "corner_radius", severity: "high", faces: [] });

describe("placeRows", () => {
  it("splits a row across setups by each corner's pocket, and sends walls and no-feature findings to the whole part", () => {
    const result = {
      features: [feature("pocket-1", "pocket"), feature("pocket-2", "pocket"), feature("corner-1", "corner", "pocket-1"),
        feature("corner-2", "corner", "pocket-2"), feature("corner-3", "corner", "pocket-2"), feature("wall-1", "wall"),
        feature("hole-1", "hole")],
      findings: [finding("F1", "corner-1"), finding("F2", "corner-2"), finding("F3", "corner-3"), finding("F4", "wall-1"),
        finding("F5", null), finding("F6", "hole-1")],
      setups: [{ direction: "+Z", features: ["pocket-1"] }, { direction: "-Z", features: ["pocket-2"] }],
      rows: [
        { id: "row:F1", findings: ["F1", "F2", "F3"], short: "Sharp corner" },
        { id: "row:F4", findings: ["F4"], short: "Thin wall" },
        { id: "row:F5", findings: ["F5"], short: "Looks turned" },
        { id: "row:F6", findings: ["F6"], short: "Angled feature" },
      ],
    } as unknown as Analysis;
    const placed = placeRows(result);
    expect(placed.get(0)!.map((p) => [p.row.id, p.ids])).toEqual([["row:F1", ["F1"]]]);
    expect(placed.get(1)!.map((p) => [p.row.id, p.ids])).toEqual([["row:F1", ["F2", "F3"]]]);
    expect(placed.get("whole")!.map((p) => p.row.id)).toEqual(["row:F4", "row:F5"]);
    expect(placed.get("none")!.map((p) => p.row.id)).toEqual(["row:F6"]); // its hole is in no setup
  });
});
