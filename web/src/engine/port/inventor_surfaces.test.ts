// Port of tests/service/test_inventor_surfaces.py: the surface under each .ipt face, on CTC 04, which holds every kind
// (spec Builder defaults; measured 2026-11-09: 165 cylinders, 88 planes, 66 cones, 27 tori, 22 spheres).
import { describe, expect, test } from "vitest";
import { surface } from "../inventor/surfaces";
import { mainModel } from "./inventor_common";

const CTC04 = "INV_nist_ctc_04_asme1_2021.ipt";

test("kinds", async () => {
  const recs = await mainModel(CTC04);
  const kinds: Record<string, number> = {};
  recs.forEach((r, i) => {
    if (r.name !== "face") return;
    const k = surface(recs, i).kind;
    kinds[k] = (kinds[k] ?? 0) + 1;
  });
  expect(kinds).toEqual({ cyl: 165, plane: 88, cone: 66, torus: 27, sphere: 22 });
});

describe("examples", () => {
  type Ex = [number, string, number[], number[] | null, number | null, number | null, number | null];
  const cases: Ex[] = [
    [4, "sphere", [-92.702, 295.0, 10.811], null, 5.0, null, null],
    [6, "cyl", [-92.702, 295.0, 0.0], [0.0, 0.0, 1.0], 5.0, null, null],
    [101, "plane", [-367.3554, 250.0, 0.0], [0.0, 0.0, 1.0], null, null, null],
    [325, "torus", [-493.3268, 370.0, 10.811], [0.0, 0.0, 1.0], 10.0, 5.0, null],
    [505, "cone", [-755.0, 400.0, 1.5], [0.0, 0.0, -1.0], 8.5, null, 45.0],
  ];
  test.each(cases)("face %i %s", async (face, kind, origin, axis, radius, minor, half) => {
    const s = surface(await mainModel(CTC04), face);
    expect(s.kind).toBe(kind);
    origin.forEach((v, k) => expect(Math.abs(s.origin![k] - v)).toBeLessThanOrEqual(1e-3));
    if (axis === null) expect(s.axis).toBeNull();
    else axis.forEach((v, k) => expect(Math.abs(s.axis![k] - v)).toBeLessThanOrEqual(1e-9));
    for (const [got, want] of [[s.radius, radius], [s.minor, minor], [s.halfAngleDeg, half]] as [number | null, number | null][]) {
      if (want === null) expect(got).toBeNull();
      else expect(Math.abs(got! - want)).toBeLessThanOrEqual(1e-9);
    }
  });
});
