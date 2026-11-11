// Port of tests/service/test_round5.py (D-018 round 5, the adversarial review of 2026-11-07): an O-ring groove that a
// passage cuts is not a pocket, and pockets with many sides or chamfered corners keep their walls. Parts are built with
// OpenCascade (the engine's wrapper), written to STEP and analysed end to end. Sizes in inches, modelled in mm.
import { expect, test } from "vitest";
import { BLOCK, box, cut, cyl, IN, oc, ax2, pocketsOf, prism } from "./groupb_common";

const close = (a: number, b: number, abs: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(abs);

test("O-ring groove cut by a passage is not a pocket", async () => {
  // A passage through the ring joins the floor's two loops into one outline, so the convex core became a pocket wall
  // (MFCAD++ 10020 faces 29, 50, 51; 64 faces on the first 500 parts).
  const o = await oc();
  const ring = cut(o, cyl(o, 1.5, 1.0, 0.8, 0.5, 1), cyl(o, 1.5, 1.0, 0.8, 0.3, 1));
  const passage = box(o, 1.7, 0.925, -0.5, 0.4, 0.15, 2); // cuts the outer wall and the core
  expect(await pocketsOf(cut(o, box(o, ...BLOCK), ring, passage))).toEqual([]);
});

for (const sides of [8, 12]) {
  test(`many-sided pocket keeps its walls (${sides} sides)`, async () => {
    const o = await oc();
    const r = 0.5;
    const pts = Array.from({ length: sides }, (_, k) => [1.5 + r * Math.cos((2 * Math.PI * k) / sides), 1.0 + r * Math.sin((2 * Math.PI * k) / sides)]);
    const found = await pocketsOf(cut(o, box(o, ...BLOCK), prism(o, pts, 0.5, 1)));
    expect(found.length).toBe(1);
    expect(found[0].faces.length).toBe(sides + 1);
    close(found[0].dims_mm.depth, 0.5 * IN, 1e-3);
  });
}

test("four chamfered corners drop the chamfers only", async () => {
  const o = await oc();
  const c = 0.2;
  const pts = [[0.5 + c, 0.5], [2.5 - c, 0.5], [2.5, 0.5 + c], [2.5, 1.5 - c], [2.5 - c, 1.5], [0.5 + c, 1.5], [0.5, 1.5 - c], [0.5, 0.5 + c]];
  const found = await pocketsOf(cut(o, box(o, ...BLOCK), prism(o, pts, 0.5, 1)));
  expect(found.length).toBe(1);
  expect(found[0].faces.length).toBe(1 + 4); // floor and the 4 long walls; the chamfers are not walls
  close(found[0].dims_mm.narrowest_width, 1.0 * IN, 1e-3);
});

test("two adjacent chamfered corners keep the wall between", async () => {
  // The 2 in wall between two chamfered corners turned the same angle to both and was dropped, which doubled the
  // narrowest width to 50.8 mm.
  const o = await oc();
  const c = 0.2;
  const pts = [[0.5, 0.5], [2.5, 0.5], [2.5, 1.5 - c], [2.5 - c, 1.5], [0.5 + c, 1.5], [0.5, 1.5 - c]];
  const found = await pocketsOf(cut(o, box(o, ...BLOCK), prism(o, pts, 0.5, 1)));
  expect(found.length).toBe(1);
  close(found[0].dims_mm.narrowest_width, 1.0 * IN, 1e-3);
});

test("chamfer longer than a neighbour wall is still a chamfer", async () => {
  // Guard: a first try (a chamfer is shorter than both neighbours) kept 4 MFCAD++ corner chamfers as walls (10131, 12161,
  // 14320, 15226: e.g. a 2.72 mm chamfer beside a 1.96 mm wall).
  const o = await oc();
  const c = 0.2;
  const pts = [[0.5, 0.5], [2.5, 0.5], [2.5, 0.8 - c], [2.5 - c, 0.8], [0.5, 0.8]]; // 2 x 0.3 in, 0.1 in left of the end wall
  const found = await pocketsOf(cut(o, box(o, ...BLOCK), prism(o, pts, 0.5, 1)));
  expect(found.length).toBe(1);
  expect(found[0].faces.length).toBe(1 + 4);
});

test("slot worn to a knife edge is not a pocket", async () => {
  // D-018 round 6: a round step cut beside a blind slot leaves its end wall 0 thick at the top (MFCAD++ 1149, 12029), so
  // the slot is open there. The same slot with real material is a pocket.
  const o = await oc();
  const slot = box(o, 1.0, 0.8, 0.5, 1.0, 0.4, 1); // x 1..2, 0.5 in deep from the top (z = 1)
  const r = 0.4; // round step along Y, tangent to the slot's end wall x = 1 at the top
  const step = new o.BRepPrimAPI_MakeCylinder(ax2(o, [(1.0 - r) * IN, -0.5 * IN, 1.0 * IN], [0, 1, 0]), r * IN, 3 * IN).Shape();
  expect(await pocketsOf(cut(o, box(o, ...BLOCK), slot, step))).toEqual([]);
  const away = new o.BRepPrimAPI_MakeCylinder(ax2(o, [(0.9 - r) * IN, -0.5 * IN, 1.0 * IN], [0, 1, 0]), r * IN, 3 * IN).Shape();
  expect((await pocketsOf(cut(o, box(o, ...BLOCK), slot, away))).length).toBe(1);
});
