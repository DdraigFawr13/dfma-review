import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire("/home/user/dfma-review/web/")("playwright");
const browser = await chromium.launch({ executablePath: process.env.DFMA_CHROMIUM });
const rows = [];
for (let run = 0; run < 5; run++) {
  const ctx = await browser.newContext(); // fresh context: no HTTP or code cache
  const page = await ctx.newPage();
  await page.route("http://probe.test/**", (r) => {
    const p = new URL(r.request().url()).pathname, f = "dist" + (p === "/" ? "/index.html" : p);
    const type = f.endsWith(".wasm") ? "application/wasm" : f.endsWith(".js") ? "text/javascript" : "text/html";
    return r.fulfill({ contentType: type, body: readFileSync(f) });
  });
  await page.goto("http://probe.test/");
  await page.waitForFunction(() => typeof window.loadManifold === "function");
  rows.push(await page.evaluate(() => window.loadManifold()));
  await ctx.close();
}
console.log(browser.version(), JSON.stringify(rows.map((r) => ({ import: Math.round(r.import_ms), inst: Math.round(r.instantiate_ms), total: Math.round(r.total_ms), vol: r.cube_volume }))));
await browser.close();
