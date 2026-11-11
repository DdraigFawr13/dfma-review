// Pin lag on a production build: frame gaps while the model is dragged and wheeled (CTC 02).
// node pinlag.cjs <baseURL> <stepfile> [runs]
const { chromium } = require('playwright');
(async () => {
  const [url, file, runs = 3] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url);
  await page.locator('input[type=file]').first().setInputFiles(file);
  await page.waitForSelector('.flag', { state: 'attached', timeout: 300000 });
  await page.waitForTimeout(3000);
  const pins = await page.locator('.flag:not([hidden])').count();
  const box = await page.locator('canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const out = [];
  for (let r = 0; r < Number(runs); r++) {
    for (const mode of ['drag', 'wheel']) {
      await page.evaluate(() => { const w = window; w.__g = []; let last = performance.now();
        const f = () => { const n = performance.now(); w.__g.push(n - last); last = n; w.__raf = requestAnimationFrame(f); }; w.__raf = requestAnimationFrame(f); });
      const t0 = Date.now();
      if (mode === 'drag') { await page.mouse.move(cx, cy); await page.mouse.down();
        for (let i = 0; i < 40; i++) await page.mouse.move(cx + i * 6, cy + Math.sin(i / 5) * 30);
        await page.mouse.up(); }
      else { await page.mouse.move(cx, cy); for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i % 2 ? 60 : -60); }
      const wall = Date.now() - t0;
      await page.waitForTimeout(500);
      const g = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__g.slice(1); });
      g.sort((a, b) => a - b);
      const q = (p) => g[Math.min(g.length - 1, Math.floor(p * g.length))].toFixed(1);
      out.push(`${mode} run ${r + 1}: input ${wall} ms, frames ${g.length}, gap median ${q(0.5)} ms, p90 ${q(0.9)} ms, max ${g[g.length - 1].toFixed(1)} ms`);
    }
  }
  console.log(`pins shown ${pins}`); console.log(out.join('\n'));
  await browser.close();
})();
