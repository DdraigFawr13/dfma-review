// Port of tests/service/test_hole_exit_walls.py (HANDOFF 3a, stress-test gap "an invented thin wall where a hole enters a
// sloped face"): the material between a hole and the face it opens onto thins to nothing at their shared edge by its
// shape, so a ray that hits that face measures no wall. Before the fix a d6 hole into a 70 deg slope got a 0.075 mm wall
// and a high thin_wall finding.
import { beforeAll, expect, test } from "vitest";
import type { OC } from "../oc";
import { loadNodeOc } from "../node";
import { analyse, approx, shapes, type Result, type Shapes } from "./groupc-kit";

let oc: OC;
let s: Shapes;
beforeAll(async () => { oc = await loadNodeOc(); s = shapes(oc); });

/** A 100 x 60 x 30 mm block whose top is cut by a plane through y = 0, z = 30, tilted slopeDeg about X, and a d6 hole
 *  down through it at x = 50, y = holeY. */
function part(slopeDeg: number, holeY: number): Uint8Array {
  const block = s.box(0, 0, 0, 100, 60, 30);
  const big = s.box(-50, 0, 30, 200, 200, 200);
  let p = s.cut(block, s.rotate(big, [0, 0, 30], [1, 0, 0], slopeDeg));
  p = s.cut(p, s.cyl(50, holeY, -5, 3, 60));
  return s.step(p);
}

async function holeWalls(bytes: Uint8Array): Promise<[number[], Result[]]> {
  const r = await analyse(oc, bytes, "part.step");
  return [r.features.filter((f: Result) => f.kind === "wall" && f.hole).map((f: Result) => f.dims_mm.thickness as number),
    r.findings.filter((f: Result) => f.rule === "thin_wall")];
}

test("hole into a steep slope has no invented wall", async () => {
  const [walls, findings] = await holeWalls(part(-70, 8));
  expect(walls.every((t) => t > 1.0), JSON.stringify(walls)).toBe(true); // only the real 5 mm to the y = 0 side
  expect(findings).toEqual([]);
});

test("a hole near a side it does not open onto keeps its wall", async () => {
  const [walls, findings] = await holeWalls(part(0, 3.5)); // flat top; the hole is 0.5 mm from the y = 0 side
  expect(walls).toHaveLength(1);
  approx(walls[0], 0.5, 1e-3);
  expect(findings).toHaveLength(1);
});
