// node web/scripts/pin-lag.mjs [runs]  (UI fixes spec A11; port of docs/specs/ui-fixes-pin-lag.cjs)
// Pin lag on a production build: the gaps between animation frames while the model is dragged and wheeled, on
// NIST CTC 02 (635 faces, 42 findings). Build first (`node web/scripts/build-pages.mjs`) and unpack NIST
// (`npm run nist`). Prints to the console only; not part of `npm run check`. Each line also gives the page's own
// script and main-thread task time over the input (Chrome's Performance metrics): with software WebGL the frame gaps
// also hold the drawing, which runs outside the page's main thread.
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { preview } from "vite";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NIST = resolve(WEB, "../tests/nist/.cache/NIST-PMI-STEP-Files");
const NAME = "nist_ctc_02_asme1_ap242-e2.stp";
const PORT = 8790;
const runs = Number(process.argv[2] ?? 3);

function find(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      const hit = find(path);
      if (hit) return hit;
    } else if (entry === NAME) return path;
  }
  return null;
}

let file = null;
try { file = find(NIST); } catch { /* not unpacked */ }
if (!file) {
  console.error(`${NAME} not found under ${NIST}: run \`npm run nist\` first`);
  process.exit(2);
}

const server = await preview({ root: WEB, preview: { port: PORT, strictPort: true, host: "127.0.0.1" }, build: { outDir: "dist-pages" } });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], // software WebGL, as e2e/playwright.config.ts
  executablePath: process.env.DFMA_CHROMIUM || undefined,
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.locator("input[type=file]").first().setInputFiles(file);
  await page.waitForSelector(".flag", { state: "attached", timeout: 300_000 });
  await page.waitForTimeout(3000);
  const pins = await page.locator(".flag:not([hidden])").count();
  const box = await page.locator("canvas").first().boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const out = [];
  for (let r = 0; r < runs; r++) {
    for (const mode of ["drag", "wheel"]) {
      await page.evaluate(() => {
        const w = window;
        w.__g = [];
        let last = performance.now();
        const f = () => { const n = performance.now(); w.__g.push(n - last); last = n; w.__raf = requestAnimationFrame(f); };
        w.__raf = requestAnimationFrame(f);
      });
      const m0 = await metrics();
      const t0 = Date.now();
      if (mode === "drag") { // 40 moves of 6 px right with a ±30 px sine, from the centre
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        for (let i = 0; i < 40; i++) await page.mouse.move(cx + i * 6, cy + Math.sin(i / 5) * 30);
        await page.mouse.up();
      } else { // 20 notches, alternating in and out
        await page.mouse.move(cx, cy);
        for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i % 2 ? 60 : -60);
      }
      const wall = Date.now() - t0;
      const m1 = await metrics();
      const busy = (k) => ((m1[k] - m0[k]) * 1000).toFixed(0);
      await page.waitForTimeout(500);
      const g = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__g.slice(1); });
      g.sort((a, b) => a - b);
      const q = (p) => g[Math.min(g.length - 1, Math.floor(p * g.length))].toFixed(1);
      out.push(`${mode} run ${r + 1}: input ${wall} ms, frames ${g.length}, gap median ${q(0.5)} ms, p90 ${q(0.9)} ms, max ${g[g.length - 1].toFixed(1)} ms, script ${busy("ScriptDuration")} ms, main-thread tasks ${busy("TaskDuration")} ms`);
    }
  }
  console.log(`pins shown ${pins}`);
  console.log(out.join("\n"));
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
