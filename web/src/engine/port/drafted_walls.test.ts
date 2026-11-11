// Port of tests/service/test_drafted_walls.py (D-020, HANDOFF 3a, stress-test gap "drafted thin walls are missed"): a wall's
// faces may be up to 15 deg from parallel, and its thickness is the thinnest place. Before, a 0.4 mm wall beside a pocket
// with even 0.01 deg of draft gave no wall and no finding. Faces that meet at a knife edge are no wall.
// The pocket tool is bullnose_draft/make.py tool_box(0.4, 15, 18, 50, 30, deg=deg): a box from z = 18 up to TOP + 5, drafted.
import { beforeAll, expect, test } from "vitest";
import type { OC } from "../oc";
import { loadNodeOc } from "../node";
import { analyse, approx, shapes, type Result, type Shapes } from "./groupc-kit";

let oc: OC;
let s: Shapes;
beforeAll(async () => { oc = await loadNodeOc(); s = shapes(oc); });

const TOP = 30;
const block = () => s.box(0, 0, 0, 100, 60, 30);
const walls = (r: Result): number[] =>
  r.features.filter((f: Result) => f.kind === "wall" && !f.hole).map((f: Result) => f.dims_mm.thickness as number).sort((a: number, b: number) => a - b);

for (const deg of [0.01, 0.2, 1, 3, 10]) {
  test(`a drafted thin wall beside a pocket is found: ${deg} deg`, async () => {
    // a 50 x 30 x 12 pocket whose -X wall is 0.4 mm from the block's side at the top; draft opens it upward
    const tool = s.draft(s.box(0.4, 15, 18, 50, 30, TOP + 5 - 18), deg, TOP);
    const r = await analyse(oc, s.step(s.cut(block(), tool)), `draft_${deg}.step`);
    approx(walls(r)[0], 0.4, 1e-3);
    expect(r.findings.filter((f: Result) => f.rule === "thin_wall").map((f: Result) => f.title)).toEqual(["Wall 0.016 in thick (limit 0.030 in)"]);
  });
}

test("faces that meet at a knife edge are no wall", async () => {
  // the block's top cut by a plane 10 deg from its -Y side: they meet at a 10 deg knife edge along X
  const big = s.box(-50, 0, -100, 200, 200, 300);
  const r = await analyse(oc, s.step(s.cut(block(), s.rotate(big, [0, 0, 30], [1, 0, 0], 10))), "knife.step");
  expect(walls(r).every((w) => w > 1.0), JSON.stringify(walls(r))).toBe(true);
  expect(r.findings.filter((f: Result) => f.rule === "thin_wall")).toEqual([]);
});
