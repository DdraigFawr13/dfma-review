// Screenshots for the UI fixes S1 status page, at 2×, of the production build (web/dist-pages) on real test parts.
//   node web/scripts/build-pages.mjs && node mockups/ui-fixes-a/shots.mjs
// Writes PNGs next to this file. DFMA_CHROMIUM may name a preinstalled Chromium.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const require = createRequire(path.join(ROOT, "web/package.json"));
const { chromium } = require("@playwright/test");
const { preview } = await import(require.resolve("vite"));
const PART = (n) => path.join(ROOT, "tests/parts", n);
const PORT = 8794;

const server = await preview({ root: path.join(ROOT, "web"), preview: { port: PORT, strictPort: true, host: "127.0.0.1" }, build: { outDir: "dist-pages" } });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], executablePath: process.env.DFMA_CHROMIUM || undefined });
const rest = (page) => page.waitForFunction(() => !document.querySelector(".stage")?.classList.contains("moving")).then(() => page.waitForTimeout(400));
async function open(width, height, file, step = "features") {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.locator('[data-testid="upload-file"]').setInputFiles(PART(file));
  await page.locator('[data-testid="overview"]').waitFor({ timeout: 60_000 });
  if (step) await page.locator(`[data-testid="step-${step}"]`).click();
  await page.waitForTimeout(600);
  return page;
}
try {
  { // J5: one corner of four lit, the rest grey
    const page = await open(1280, 800, "report_sample.step");
    await page.locator('[data-testid="row-F4"]').click();
    await page.locator('[data-testid="row-next"]').click();
    await rest(page);
    await page.screenshot({ path: path.join(HERE, "one-feature.png") });
    await page.locator('[data-testid="row-F1"]').click(); // Deep hole ×2: one hole
    await rest(page);
    await page.screenshot({ path: path.join(HERE, "one-hole.png") });
    await page.close();
  }
  { // J2, J3: view buttons and the triad, Front and Top; nothing selected
    const page = await open(1280, 800, "report_sample.step");
    for (const v of ["front", "top", "iso"]) {
      await page.locator(`[data-testid="view-${v}"]`).click();
      await rest(page);
      await page.locator(".viewer").screenshot({ path: path.join(HERE, `view-${v}.png`) });
    }
    // J6: the focus ring on the model
    await page.locator('[data-testid="viewer-canvas"]').focus();
    await page.keyboard.press("ArrowRight"); // keyboard focus shows the ring
    await page.keyboard.press("ArrowLeft");
    await rest(page);
    await page.locator(".viewer").screenshot({ path: path.join(HERE, "focus.png") });
    await page.close();
  }
  { // A12: 360 px wide, the views under the model
    const page = await open(360, 780, "report_sample.step", null);
    await page.locator(".viewer").screenshot({ path: path.join(HERE, "narrow.png") });
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
console.log("shots written to", HERE);
