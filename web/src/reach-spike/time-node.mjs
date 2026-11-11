// Reach spike: time all six directions and the 11 inch end mills on one part in one Node worker thread.
// node src/reach-spike/time-node.mjs <part.f32> <rule> ...   rule: "one:<cell mm>" (every tool on one grid) or
// "tool:<k>:<cap Mcells>" (each tool on cell D/k, never finer than the cell that keeps the largest map under the cap)
import { readFileSync } from "node:fs";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

import { TOOLS_IN, cellRule } from "./rules.mjs";

if (isMainThread) {
  const [file, ...rules] = process.argv.slice(2);
  for (const rule of rules) {
    const t0 = performance.now();
    const res = await new Promise((ok, bad) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { file, rule } });
      w.once("message", ok); w.once("error", bad);
    });
    console.log(JSON.stringify({ file: file.split("/").pop(), rule, wall_ms: Math.round(performance.now() - t0), ...res }));
  }
} else {
  const { reachOneDir } = await import("./heightmap.ts");
  const soup = new Float32Array(readFileSync(workerData.file).buffer.slice(0));
  const cellFor = cellRule(workerData.rule, soup);
  const t0 = performance.now();
  const dirs = [];
  for (let k = 0; k < 6; k++) dirs.push(reachOneDir(soup, k, TOOLS_IN.map((d) => d * 25.4), cellFor));
  const r = (x) => Math.round(x);
  const sum = (f) => r(dirs.reduce((s, d) => s + f(d), 0));
  parentPort.postMessage({
    compute_ms: r(performance.now() - t0),
    raster_ms: sum((d) => d.raster_ms), holder_ms: sum((d) => d.holder_ms), tools_ms: sum((d) => d.tools.reduce((a, t) => a + t.ms, 0)),
    cells_largest_map: Math.max(...dirs.flatMap((d) => d.tools.map((t) => t.cells))),
    cell_mm: [...new Set(dirs[4].tools.map((t) => +t.cell_mm.toFixed(3)))],
    slowest_tool_ms: r(Math.max(...dirs.flatMap((d) => d.tools.map((t) => t.ms)))),
    leftover_mm3_plusZ: dirs[4].tools.map((t) => r(t.leftover_mm3)),
    rss_mb: r(process.memoryUsage().rss / 2 ** 20),
  });
}
