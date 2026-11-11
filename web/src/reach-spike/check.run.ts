// Reach spike: the rasteriser and the disk dilation checked against brute force before any timing counts.
import { expect, test } from "vitest";
import { dilateDisk, heightMap } from "./heightmap";

test("disk dilation equals brute force", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (const [nu, nv, r] of [[37, 23, 0], [37, 23, 1], [40, 31, 5], [13, 50, 9], [64, 64, 20]]) {
    const src = Float32Array.from({ length: nu * nv }, () => rnd() * 100);
    const got = dilateDisk(src, nu, nv, r);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      let m = -Infinity;
      for (let y = Math.max(0, j - r); y <= Math.min(nv - 1, j + r); y++) for (let x = Math.max(0, i - r); x <= Math.min(nu - 1, i + r); x++)
        if ((x - i) ** 2 + (y - j) ** 2 <= r * r) m = Math.max(m, src[y * nu + x]);
      expect(got[j * nu + i]).toBe(m);
    }
  }
});

// A 10 x 10 x 5 mm block with a 4 x 4 mm square pocket 3 mm deep in its top face (as triangles).
function quad(a: number[], b: number[], c: number[], d: number[]) { return [...a, ...b, ...c, ...a, ...c, ...d]; }
test("height map of a pocketed block from +Z and -Z", () => {
  const t: number[] = [];
  // top face around the pocket (four quads), pocket floor, bottom face; walls are edge-on from Z
  t.push(...quad([0, 0, 5], [10, 0, 5], [10, 3, 5], [0, 3, 5]), ...quad([0, 7, 5], [10, 7, 5], [10, 10, 5], [0, 10, 5]));
  t.push(...quad([0, 3, 5], [3, 3, 5], [3, 7, 5], [0, 7, 5]), ...quad([7, 3, 5], [10, 3, 5], [10, 7, 5], [7, 7, 5]));
  t.push(...quad([3, 3, 2], [7, 3, 2], [7, 7, 2], [3, 7, 2]), ...quad([0, 0, 0], [0, 10, 0], [10, 10, 0], [10, 0, 0]));
  const soup = new Float32Array(t);
  const top = heightMap(soup, 4, 0.5);
  expect([top.nu, top.nv]).toEqual([21, 21]);
  expect(top.h[10 * 21 + 10]).toBeCloseTo(2); // pocket floor at the centre
  expect(top.h[0]).toBeCloseTo(5);
  const bottom = heightMap(soup, 5, 0.5);
  expect(bottom.h[10 * 21 + 10]).toBeCloseTo(0); // -Z sees the bottom face (height -z = 0)
  // a 2 mm flat end mill (r = 2 cells) reaches the pocket centre; a 6 mm one does not (pocket is 4 mm wide)
  expect(dilateDisk(top.h, 21, 21, 2)[10 * 21 + 10]).toBeCloseTo(2);
  expect(dilateDisk(top.h, 21, 21, 6)[10 * 21 + 10]).toBeCloseTo(5);
});

test("opening: a flat end mill clears the open top but leaves the pocket it cannot enter", async () => {
  const { reachOneDir } = await import("./heightmap");
  const t: number[] = [];
  t.push(...quad([0, 0, 5], [10, 0, 5], [10, 3, 5], [0, 3, 5]), ...quad([0, 7, 5], [10, 7, 5], [10, 10, 5], [0, 10, 5]));
  t.push(...quad([0, 3, 5], [3, 3, 5], [3, 7, 5], [0, 7, 5]), ...quad([7, 3, 5], [10, 3, 5], [10, 7, 5], [7, 7, 5]));
  t.push(...quad([3, 3, 2], [7, 3, 2], [7, 7, 2], [3, 7, 2]), ...quad([0, 0, 0], [0, 10, 0], [10, 10, 0], [10, 0, 0]));
  const soup = new Float32Array(t);
  const [small, big] = reachOneDir(soup, 4, [2, 6], () => 0.5, 1).tools; // holder radius 1 mm: never in the way here
  expect(small.leftover_cells).toBeLessThan(30); // corner cells of the 4 x 4 pocket only (a round tool leaves corners)
  expect(small.leftover_cells).toBeGreaterThan(0);
  // the whole pocket is left: 48 mm3 true, 7 x 7 interior cells x 0.25 mm2 x 3 mm = 36.75 mm3 on cell centres (cells on
  // the pocket's edge lines take the top face: half a cell lost per wall)
  expect(big.leftover_mm3).toBeCloseTo(36.75, 5);
});
