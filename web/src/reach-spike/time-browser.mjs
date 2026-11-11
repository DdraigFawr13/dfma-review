// Reach spike: the same heightmap.ts in Chromium Web Workers (module workers), served from a fake origin by Playwright.
// node src/reach-spike/time-browser.mjs <part.f32> <workers> <rule> ...   (rules as in time-node.mjs)
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { chromium } from "playwright";
import { TOOLS_IN } from "./rules.mjs";

const [file, workers, ...rules] = process.argv.slice(2);
const here = new URL(".", import.meta.url);
const js = stripTypeScriptTypes(readFileSync(new URL("heightmap.ts", here), "utf8"));
const cellRuleSrc = readFileSync(new URL("rules.mjs", here), "utf8").match(/export function cellRule[\s\S]*?\n}\n/)[0];
const worker = `import { reachOneDir } from "./heightmap.js";
${cellRuleSrc}
onmessage = async (e) => {
  const { rule, dirs } = e.data;
  const soup = new Float32Array(await (await fetch("./part.f32")).arrayBuffer());
  const cellFor = cellRule(rule, soup);
  const t0 = performance.now();
  const out = dirs.map((k) => reachOneDir(soup, k, ${JSON.stringify(TOOLS_IN)}.map((d) => d * 25.4), cellFor));
  postMessage({ ms: performance.now() - t0, out: out.map((d) => ({ dir: d.dir, raster_ms: d.raster_ms })) });
};`;
const files = { "/": ["text/html", "<!doctype html><title>spike</title>"], "/heightmap.js": ["text/javascript", js], "/worker.js": ["text/javascript", worker] };
const browser = await chromium.launch({ executablePath: process.env.DFMA_CHROMIUM || undefined });
const page = await browser.newPage();
await page.route("http://spike.test/**", (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/part.f32") return route.fulfill({ contentType: "application/octet-stream", body: readFileSync(file) });
  const f = files[path];
  return f ? route.fulfill({ contentType: f[0], body: f[1] }) : route.fulfill({ status: 404 });
});
await page.goto("http://spike.test/");
const cores = await page.evaluate(() => navigator.hardwareConcurrency);
for (const rule of rules) {
  const res = await page.evaluate(async ({ rule, n }) => {
    const groups = Array.from({ length: n }, () => []);
    [4, 5, 0, 1, 2, 3].forEach((k, i) => groups[i % n].push(k)); // the two big maps (±Z) first, spread over the workers
    const t0 = performance.now();
    const each = await Promise.all(groups.map((dirs) => new Promise((ok, bad) => {
      const w = new Worker("./worker.js", { type: "module" });
      w.onmessage = (e) => { ok(e.data.ms); w.terminate(); };
      w.onerror = (e) => bad(String(e.message));
      w.postMessage({ rule, dirs });
    })));
    return { wall_ms: Math.round(performance.now() - t0), worker_ms: each.map(Math.round) };
  }, { rule, n: Number(workers) });
  console.log(JSON.stringify({ file: file.split("/").pop(), browser: browser.version(), cores, workers: Number(workers), rule, ...res }));
}
await browser.close();
