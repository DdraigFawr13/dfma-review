// Screenshot each 1280 x 800 frame of a frames page at 2x (D-024).
//   node mockups/ui-direction/shoot.js <frames.html> <out dir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [src, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1320, height: 900 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.resolve(src));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  for (const f of await p.$$('.frame')) {
    const id = await f.getAttribute('id');
    await f.screenshot({ path: path.join(out, id + '.png') });
    console.log('wrote', id);
  }
  await b.close();
})();
