// Run the fork in Chromium on every NIST file and write the same JSON as fingerprint.mjs.
// node browser_run.mjs <out.json>   (serves this folder on a free port; Chromium from Playwright)
import { createServer } from 'node:http';
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.stp': 'application/octet-stream' };
const server = createServer((req, res) => {
  const p = join(HERE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(HERE) || !statSync(p, { throwIfNoEntry: false })?.isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${server.address().port}/browser.html`);
await page.waitForFunction(() => window.ready);
const names = readdirSync(join(HERE, '.cache/nist')).filter((n) => n.endsWith('.stp')).sort();
const { init_s, out, mem } = await page.evaluate((n) => window.run(n), names);
console.log('page load + init', ((Date.now() - t0) / 1000).toFixed(2), 's; init alone', init_s.toFixed(2), 's');
for (const n of names) console.log(n, out[n].faces?.length ?? out[n].error, 'faces', (out[n].read_s ?? 0).toFixed(2), 's, wasm memory', (mem[n] / 2 ** 20).toFixed(0), 'MB');
writeFileSync(process.argv[2], JSON.stringify(out));
await browser.close();
server.close();
