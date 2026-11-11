// Reach spike: check the tool-tip map T (heightmap.ts) against OpenCAMLib's drop cutter at the same grid points (D-085:
// "checked against OpenCAMLib tool-tip heights at the same grid points, part rotated per direction").
// node src/reach-spike/ocl-check.mjs <ocl.node> <part.f32> <tool mm> <row step> [dirs, default 0-5]
// ocl.node: built from upstream source (README "OpenCAMLib"); test-time only, never in the app.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { DIRS, dilateDisk, heightMap } from "./heightmap.ts";

const [oclPath, file, toolArg, stepArg, dirsArg] = process.argv.slice(2);
const ocl = createRequire(import.meta.url)(oclPath);
const D = Number(toolArg), step = Number(stepArg), cell = D / 8, r = 4; // the disk is exactly 4 cells = R
const AX = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 0, 2, 1], [1, 0, 2, -1], [2, 0, 1, 1], [2, 0, 1, -1]]; // as heightmap.ts
const raw = new Float32Array(readFileSync(file).buffer.slice(0));
for (const k of (dirsArg ?? "0,1,2,3,4,5").split(",").map(Number)) {
  const [ah, au, av, s] = AX[k];
  const soup = new Float32Array(raw.length); // rotated: the tool comes from +Z
  for (let i = 0; i < raw.length; i += 3) { soup[i] = raw[i + au]; soup[i + 1] = raw[i + av]; soup[i + 2] = s * raw[i + ah]; }
  let u0 = Infinity, v0 = Infinity;
  for (let i = 0; i < soup.length; i += 3) { u0 = Math.min(u0, soup[i]); v0 = Math.min(v0, soup[i + 1]); }
  const g = heightMap(soup, 4, cell), T = dilateDisk(g.h, g.nu, g.nv, r), T1 = dilateDisk(g.h, g.nu, g.nv, r + 1); // r + 1: one cell wider, never lower than the true tip (to test)
  const surf = new ocl.STLSurf();
  const P = (i) => new ocl.Point(soup[i], soup[i + 1], soup[i + 2]);
  for (let t = 0; t < soup.length; t += 9) surf.addTriangle(new ocl.Triangle(P(t), P(t + 3), P(t + 6)));
  const cutter = new ocl.CylCutter(D, 4 * D); // the binding keeps raw pointers to the cutter and the surface: hold both
  const t0 = performance.now();
  const diffs = [], wide = [];
  for (let j = 0; j < g.nv; j += step) {
    const y = v0 + j * cell, path = new ocl.Path();
    path.append(new ocl.Line(new ocl.Point(u0, y, g.floor), new ocl.Point(u0 + (g.nu - 1) * cell, y, g.floor)));
    const pdc = new ocl.PathDropCutter();
    // OCL takes floor(L / s + 1) steps along a line: this sampling gives nu - 1 steps, so its points are our cell centres
    pdc.setSTL(surf); pdc.setCylCutter(cutter); pdc.setZ(g.floor); pdc.setSampling((g.nu - 1) * cell / (g.nu - 1.5)); pdc.setPath(path); pdc.run();
    for (const [x, , z] of pdc.getCLPoints()) {
      const i = Math.round((x - u0) / cell);
      if (Math.abs(x - (u0 + i * cell)) > 1e-6 * Math.max(1, Math.abs(x)) || i < 0 || i >= g.nu) continue; // grid points only
      diffs.push(T[j * g.nu + i] - z); wide.push(T1[j * g.nu + i] - z);
    }
  }
  globalThis.keep = [surf, cutter];
  const ms = performance.now() - t0, n = diffs.length, abs = diffs.map(Math.abs);
  const share = (lim) => +(abs.filter((a) => a <= lim).length / n * 100).toFixed(2);
  console.log(JSON.stringify({ dir: DIRS[k], tool_mm: D, cell_mm: +cell.toFixed(4), points: n, within_0_01mm_pct: share(0.01), within_0_1mm_pct: share(0.1),
    within_1mm_pct: share(1), ours_lower_pct: +(diffs.filter((d) => d < -0.01).length / n * 100).toFixed(2),
    ours_higher_pct: +(diffs.filter((d) => d > 0.01).length / n * 100).toFixed(2), worst_mm: +Math.max(...abs).toFixed(3),
    wide_lower_pct: +(wide.filter((d) => d < -0.01).length / n * 100).toFixed(2), wide_worst_lower_mm: +Math.max(0, ...wide.map((d) => -d)).toFixed(3),
    wide_higher_pct: +(wide.filter((d) => d > 0.01).length / n * 100).toFixed(2), ocl_ms: Math.round(ms) }));
}
