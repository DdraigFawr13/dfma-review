// Port of tests/service/test_cut_pockets.py (D-018 round 1): a pocket stays a pocket when another feature cuts into its
// outline, and nothing that opens to the outside, or runs out along a through slot, becomes one. Each part is built with
// OpenCascade (the engine's wrapper), written to STEP and analysed end to end. Sizes in inches, modelled in mm.
import { beforeAll, expect, test } from "vitest";
import type { OC } from "../oc";
import { loadNodeOc } from "../node";
import { analyse, approx, IN, shapes, type Shapes } from "./groupc-kit";

let oc: OC;
let s: Shapes;
beforeAll(async () => { oc = await loadNodeOc(); s = shapes(oc); });

const box = (x: number, y: number, z: number, l: number, w: number, h: number) => s.box(x * IN, y * IN, z * IN, l * IN, w * IN, h * IN);
const cyl = (x: number, y: number, z: number, r: number, h: number) => s.cyl(x * IN, y * IN, z * IN, r * IN, h * IN);
const BLOCK = () => box(0, 0, 0, 3, 2, 1);
const POCKET = () => box(0.5, 0.5, 0.5, 2, 1, 1); // 2 x 1 in, 0.5 in deep, open to +Z

async function pocketsOf(shape: unknown) {
  const r = await analyse(oc, s.step(shape), "part.step");
  return r.features.filter((f: { kind: string }) => f.kind === "pocket");
}

test("plain pocket is found", async () => {
  expect(await pocketsOf(s.cut(BLOCK(), POCKET()))).toHaveLength(1);
});

for (const [name, passage] of [
  ["a square passage through the +X wall of the pocket", () => box(2.3, 0.8, -0.5, 0.4, 0.4, 2)],
  ["a through hole on the -Y wall", () => cyl(1.5, 0.5, -0.5, 0.2, 2)],
] as const) {
  test(`pocket cut by a through feature is still a pocket: ${name}`, async () => {
    const found = await pocketsOf(s.cut(BLOCK(), POCKET(), passage()));
    expect(found).toHaveLength(1);
    approx(found[0].dims_mm.depth, 0.5 * IN, 0.01);
  });
}

test("blind slot open to the outside is not a pocket", async () => {
  const slot = box(-0.5, 0.75, 0.75, 2.0, 0.5, 1); // from the -X face, 1.5 in long, 0.25 in deep
  expect(await pocketsOf(s.cut(BLOCK(), slot))).toEqual([]);
});

test("slot ending in a through slot is not a pocket", async () => {
  const through = box(2.0, -0.5, 0.5, 0.5, 3, 1); // along Y, open at both ends and the top
  const slot = box(0.5, 0.75, 0.75, 1.75, 0.5, 1); // from inside the block into the through slot
  expect(await pocketsOf(s.cut(BLOCK(), through, slot))).toEqual([]);
});

test("groove cut by a passage is not a pocket", async () => {
  const groove = s.cut(cyl(1.5, 1.0, 0.75, 0.6, 1), cyl(1.5, 1.0, 0.75, 0.4, 1)); // a ring 0.25 in deep
  const passage = box(1.95, 0.85, -0.5, 0.3, 0.3, 2); // through the ring's +X side
  expect(await pocketsOf(s.cut(BLOCK(), groove, passage))).toEqual([]);
});
