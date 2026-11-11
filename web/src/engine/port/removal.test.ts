// P1 S1 (machining spec J1, D-088): the removal block on built parts. Sizes in mm; the parts are built with the
// engine's own OpenCascade wrapper, written to STEP and analysed end to end.
import { expect, test } from "vitest";
import { removal } from "../removal";
import { analyzeShape, boxMm, cut, oc, run, type Result } from "./groupb_common";

const KEYS = ["stock_mm3", "part_mm3", "total_mm3", "features", "features_sum_mm3", "explained_mm3", "unexplained_mm3", "unexplained_pct"];
const within = (actual: number, want: number, rel: number, label: string) =>
  expect(Math.abs(actual - want) / want, `${label}: ${actual} vs ${want}`).toBeLessThanOrEqual(rel);

/** A 100 x 60 x 30 mm block, a 10 mm through hole along Z and a 40 x 20 x 8 mm sharp-cornered pocket from +Z;
 *  `island`: a 10 x 10 mm island 4 mm high in the pocket's middle. */
async function block(island = false) {
  const o = await oc();
  const hole = new o.BRepPrimAPI_MakeCylinder(new o.gp_Ax2(new o.gp_Pnt(20, 30, -1), new o.gp_Dir(0, 0, 1)), 5, 32).Shape();
  let pocket = boxMm(o, 50, 20, 22, 40, 20, 9);
  if (island) pocket = cut(o, pocket, boxMm(o, 65, 25, 21, 10, 10, 5)); // island top at 26 mm, 4 mm above the floor
  return analyzeShape(cut(o, boxMm(o, 0, 0, 0, 100, 60, 30), hole, pocket));
}

const stockAgrees = (r: Result) =>
  within(r.removal.stock_mm3, r.stock.size_in.reduce((p: number, v: number) => p * v * 25.4, 1), 1e-4, "stock_mm3 against stock.size_in");

test("block with a hole and a pocket", async () => {
  const r = await block();
  const m = r.removal;
  expect(Object.keys(m)).toEqual(KEYS);
  within(m.stock_mm3, 180_000, 1e-4, "stock");
  expect(Math.abs(m.total_mm3 - (m.stock_mm3 - m.part_mm3))).toBeLessThanOrEqual(0.001);
  expect(m.part_mm3).toBe(Math.round(r.part.volume_mm3 * 1000) / 1000);
  const ids = r.features.filter((f: { kind: string }) => f.kind === "hole" || f.kind === "pocket").map((f: { id: string }) => f.id);
  expect(m.features.map((f: { feature: string }) => f.feature)).toEqual(ids);
  expect(ids.filter((id: string) => id.startsWith("hole"))).toHaveLength(1);
  expect(ids.filter((id: string) => id.startsWith("pocket"))).toHaveLength(1);
  const vol = (prefix: string) => m.features.find((f: { feature: string }) => f.feature.startsWith(prefix)).volume_mm3;
  within(vol("hole"), Math.PI * 25 * 30, 0.005, "hole");
  within(vol("pocket"), 6_400, 0.005, "pocket");
  expect(m.unexplained_mm3).toBeLessThan(0.01 * m.total_mm3);
  expect(m.explained_mm3).toBe(Math.min(m.features_sum_mm3, m.total_mm3));
  stockAgrees(r);
});

test("pocket with an island", async () => {
  const r = await block(true);
  const pocket = r.removal.features.find((f: { feature: string }) => f.feature.startsWith("pocket"));
  within(pocket.volume_mm3, (800 - 100) * 8, 0.005, "pocket floor area x depth, island top left out");
  stockAgrees(r);
});

test("stock agrees on a test part", async () => {
  stockAgrees(await run("clean_pocket"));
});

test("turned part has no removal", async () => {
  const r = await run("clean_shaft", "turn");
  expect(r.removal).toBeNull();
});

// The floor rule on its own (Design "Feature volumes"), on hand-built meshes: the pocket finder never put an island top
// in a pocket on the built parts above, so these pin the height filter and the floor fillet directly.
const square = (z: number, x0: number, x1: number) => ({ kind: "plane", indices: [0, 1, 2, 0, 2, 3],
  positions: [x0, 0, z, x1, 0, z, x1, 10, z, x0, 10, z] }); // faces +Z, area (x1 - x0) x 10
test("floor area: only the lowest level, plus a non-planar face that reaches it", () => {
  const ramp = { kind: "other", indices: [0, 1, 2], positions: [20, 0, 0, 30, 0, 2, 20, 10, 0] }; // faces up, touches z = 0
  const high = { kind: "other", indices: [0, 1, 2], positions: [40, 0, 1, 50, 0, 3, 40, 10, 1] }; // faces up, never reaches it
  const faces = [square(0, 0, 10), square(4, 10, 20), ramp, high];
  const pocket = { id: "pocket-1", kind: "pocket", faces: [0, 1, 2, 3], axis: [0, 0, 1], dims_mm: { depth: 2 } };
  const r = removal([pocket], faces, [100, 10, 10], 9_000);
  expect(r.features).toEqual([{ feature: "pocket-1", volume_mm3: (100 + 50) * 2 }]); // floor 100 + ramp 50; plateau and high left out
  expect(r.total_mm3).toBe(1_000);
  expect(r.unexplained_pct).toBe(70);
});
