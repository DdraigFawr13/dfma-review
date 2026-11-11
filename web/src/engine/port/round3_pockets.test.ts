// Port of tests/service/test_round3_pockets.py (D-018 round 3): pockets whose floor is cut by a very shallow or very thin
// cut, and chamfers at a pocket's floor or corners. Each part is built with OpenCascade (the engine's wrapper), written to
// STEP and analysed end to end. Sizes in inches, modelled in mm.
import { expect, test } from "vitest";
import { BLOCK, chamfer, cut, edgeAtMid, IN, box, oc, pocketsOf, POCKET, prism } from "./groupb_common";

const close = (a: number, b: number, abs: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(abs);

test("pocket cut by a pocket a hair deeper is still a pocket", async () => {
  const o = await oc();
  // The second pocket reaches 0.03 mm below the first one's floor: less than the old 0.05 mm probe.
  const deeper = box(o, 2.2, 0.75, 0.5 - 0.03 / IN, 0.5, 0.5, 1);
  const found = await pocketsOf(cut(o, box(o, ...BLOCK), box(o, ...POCKET), deeper));
  const floorsAt = found.map((f) => Math.round(f.dims_mm.depth * 100) / 100).sort((a, b) => a - b);
  expect(floorsAt).toEqual([Math.round(0.5 * IN * 100) / 100, Math.round((0.5 * IN + 0.03) * 100) / 100]);
}, 60_000);

test("pocket with a floor sliver under 0.05 mm is still a pocket", async () => {
  const o = await oc();
  // A square passage through the +X end leaves a strip of floor 0.03 mm wide beside the -Y wall.
  const passage = box(o, 2.2, 0.5 + 0.03 / IN, -0.5, 0.5, 0.4, 2);
  const found = await pocketsOf(cut(o, box(o, ...BLOCK), box(o, ...POCKET), passage));
  expect(found.length).toBe(1);
  close(found[0].dims_mm.depth, 0.5 * IN, 0.01);
}, 60_000);

test("chamfer between floor and wall is kept out of the pocket", async () => {
  const o = await oc();
  const base = cut(o, box(o, ...BLOCK), box(o, ...POCKET));
  const part = chamfer(o, base, [edgeAtMid(o, base, [0.5, 1.0, 0.5])], 0.05 * IN); // floor to -X wall
  const found = await pocketsOf(part);
  expect(found.length).toBe(1);
  expect(found[0].faces.length).toBe(5); // floor and 4 walls, not the chamfer
}, 60_000);

test("chamfer on a pocket corner is kept out of the pocket", async () => {
  const o = await oc();
  const base = cut(o, box(o, ...BLOCK), box(o, ...POCKET));
  const part = chamfer(o, base, [edgeAtMid(o, base, [0.5, 0.5, 0.75])], 0.05 * IN); // the -X -Y corner
  const found = await pocketsOf(part);
  expect(found.length).toBe(1);
  expect(found[0].faces.length).toBe(5);
}, 60_000);

test("hexagon pocket keeps all six walls", async () => {
  const o = await oc();
  const pts = [0, 1, 2, 3, 4, 5].map((k) => [1.5 + 0.5 * Math.cos((60 * k * Math.PI) / 180), 1.0 + 0.5 * Math.sin((60 * k * Math.PI) / 180)]);
  const found = await pocketsOf(cut(o, box(o, ...BLOCK), prism(o, pts, 0.5, 1)));
  expect(found.length).toBe(1);
  expect(found[0].faces.length).toBe(7);
}, 60_000);
