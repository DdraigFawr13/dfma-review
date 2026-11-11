// P1 S1 status page screenshots: the built app (web/dist-pages from npm run check), served on :4612. node shots.cjs
const { chromium } = require('playwright');
const path = require('path');
const PARTS = '/home/user/dfma-review/tests/parts/', NIST = '/home/user/dfma-review/tests/nist/.cache/NIST-PMI-STEP-Files/';
(async () => {
  const b = await chromium.launch();
  for (const [file, name] of [[PARTS + 'clean_pocket.step', '01-clean-pocket.png'], [NIST + 'nist_ctc_01_asme1_ap242-e1.stp', '02-ctc01.png']]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, acceptDownloads: true });
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    await p.goto('http://localhost:4612/');
    await p.getByTestId('upload-file').setInputFiles(file);
    await p.getByTestId('overview').waitFor({ timeout: 180000 });
    await p.getByTestId('step-machining').click();
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(__dirname, name) });
    console.log(name, await p.getByTestId('plan-removal').textContent(), '|', await p.getByTestId('plan-unexplained').textContent());
    if (name.startsWith('02')) {
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByTestId('export-pdf').click()]);
      await dl.saveAs(path.join(__dirname, 'ctc01.pdf'));
    }
    await p.close();
  }
  await b.close();
})();
