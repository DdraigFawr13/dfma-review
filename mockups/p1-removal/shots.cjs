// Screenshots for the P1 mock-up (throwaway; not app code). node shots.cjs <scale>
// The prototype build (proto.diff: ghost stock box, PDF lines) serves on :4611. The plan-list lines, the Stock
// chip and the "Your stock" fields are DOM injections for the picture; their numbers come from numbers.json
// (the spec's formula run on these parts by web/src/removal-proto/mockup.run.ts).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
const PARTS = '/home/user/dfma-review/tests/parts/';
const NIST = '/home/user/dfma-review/tests/nist/.cache/NIST-PMI-STEP-Files/';
const scale = +(process.argv[2] || 2);
const N = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(HERE, 'numbers.json'), 'utf8')).map((p) => [p.name, p]));
const IN3 = 16387.064;
const in3 = (mm3) => (mm3 / IN3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mm3 = (v) => Math.round(v).toLocaleString('en-US');
const vol = (v) => `${in3(v)} in³ (${mm3(v)} mm³)`;
const size = (s) => `${s.map((x) => x.toFixed(3)).join(' × ')} in block`;

function lines(p, typed) {
  const out = [];
  if (!typed) out.push(['Removal', `${vol(p.total_mm3)}: the stock block minus the part`, 'plan-removal']);
  else {
    const tv = typed.reduce((a, b) => a * b, 1) * 25.4 ** 3;
    out.push(['Removal', `${vol(tv - p.part_mm3)}: your ${size(typed)} minus the part`, 'plan-removal']);
  }
  out.push(['Not explained', `${vol(p.unexplained_mm3)}, ${p.unexplained_pct.toFixed(2)} % of the ${typed ? 'part-size ' : ''}removal: no found hole or pocket accounts for it, such as an outside profile`, 'plan-unexplained']);
  return out;
}
// Typed sizes paired largest to largest with the part's; facing in the order Z, X, Y of the part frame.
function facing(bbox, typedSorted) {
  const order = [0, 1, 2].sort((a, b) => bbox[b] - bbox[a]);
  const t = [0, 0, 0]; order.forEach((k, i) => { t[k] = typedSorted[i]; });
  const [px, py, pz] = bbox, [tx, ty, tz] = t;
  return { typed: t, rows: [
    ['Facing Z', `${((tz - pz) / 2).toFixed(4)} in per side, ${((tz - pz) * tx * ty).toFixed(2)} in³ in the two layers`],
    ['Facing X', `${((tx - px) / 2).toFixed(4)} in per side, ${((tx - px) * ty * pz).toFixed(2)} in³ in the two layers`],
    ['Facing Y', `${((ty - py) / 2).toFixed(4)} in per side, ${((ty - py) * px * pz).toFixed(2)} in³ in the two layers`],
  ] };
}

async function open(b) {
  const p = await b.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: scale, acceptDownloads: true });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto('http://localhost:4611/');
  return p;
}
async function load(p, file) {
  await p.getByTestId('upload-process').selectOption('mill');
  await p.getByTestId('upload-file').setInputFiles(file);
  await p.getByTestId('overview').waitFor({ timeout: 180000 });
}
async function machining(p) { await p.getByTestId('step-machining').click(); await p.waitForTimeout(500); }
async function inject(p, rows, opts = {}) {
  await p.addStyleTag({ content: `
    .mk-new{background:color-mix(in srgb, var(--accent) 8%, var(--panel))}
    .mk-stock{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .mk-stock input{width:72px;min-height:32px;font:500 .875rem var(--mono);padding:2px 6px;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);color:var(--ink)}
    .mk-stock button{min-height:32px;font:600 .875rem var(--sans);padding:4px 12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);color:var(--ink)}
    .mk-err{color:var(--high);font-size:.875rem;width:100%}
    .views .chip[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}
  ` });
  await p.evaluate(({ rows, opts }) => {
    const stock = document.querySelector('[data-testid=plan-stock]');
    let after = stock;
    const add = (t, v, cls) => {
      const dt = document.createElement('dt'); dt.textContent = t; dt.className = cls || '';
      const dd = document.createElement('dd'); dd.className = cls || '';
      if (typeof v === 'string') dd.textContent = v; else dd.append(v);
      after.after(dt, dd); after = dd;
    };
    if (opts.fields) {
      const box = document.createElement('div'); box.className = 'mk-stock';
      for (const v of opts.fields) { const i = document.createElement('input'); i.value = v; i.setAttribute('aria-label', 'size in inches'); box.append(i, document.createTextNode(i === null ? '' : '')); }
      const ins = [...box.querySelectorAll('input')];
      ins[0].after(document.createTextNode('×')); ins[1].after(document.createTextNode('×')); ins[2].after(document.createTextNode('in'));
      const b = document.createElement('button'); b.textContent = 'Apply'; box.append(b);
      if (opts.error) { const e = document.createElement('span'); e.className = 'mk-err'; e.textContent = opts.error; box.append(e); }
      add('Your stock', box, 'mk-new');
    }
    for (const [t, v] of rows) add(t, v, 'mk-new');
    const views = document.getElementById('views');
    if (views && !document.getElementById('mk-stockchip')) {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.id = 'mk-stockchip';
      c.textContent = 'Stock'; c.setAttribute('aria-pressed', String(opts.ghost !== false)); views.prepend(c);
    }
  }, { rows, opts });
}

(async () => {
  const b = await chromium.launch();
  const shot = async (p, name) => { await p.waitForTimeout(900); await p.screenshot({ path: path.join(HERE, name) }); console.log(name); };

  // 1. S1: clean_pocket, the two lines (no ghost; S2 adds it)
  let p = await open(b);
  await load(p, PARTS + 'clean_pocket.step');
  await machining(p);
  await inject(p, lines(N['clean_pocket.step']), { ghost: false });
  await p.evaluate(() => document.getElementById('mk-stockchip').remove());
  await shot(p, '01-s1-lines.png');

  // 2. S1: CTC 01, most of the removal not explained
  await p.reload(); await load(p, NIST + 'nist_ctc_01_asme1_ap242-e1.stp');
  await machining(p);
  await inject(p, lines(N['nist_ctc_01_asme1_ap242-e1.stp']), { ghost: false });
  await p.evaluate(() => document.getElementById('mk-stockchip').remove());
  await shot(p, '02-s1-ctc01.png');
  // PDF of CTC 01 with the two lines
  const pdfLines = lines(N['nist_ctc_01_asme1_ap242-e1.stp']).map(([t, v]) => `${t === 'Not explained' ? 'Not explained by a found feature' : t}: ${v.replace(/: the stock block minus the part$/, ', the stock block minus the part').replace(/: no found hole.*$/, '')}`);
  await p.evaluate((l) => { window.__protoPdf = l; }, pdfLines);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByTestId('export-pdf').click()]);
  await dl.saveAs(path.join(HERE, 'ctc01.pdf'));
  await p.close();

  // 3. S2: ghost stock on clean_pocket
  p = await open(b);
  await load(p, PARTS + 'clean_pocket.step');
  await machining(p);
  await p.evaluate(() => window.__proto.stock([0, 0, 0], true));
  await inject(p, lines(N['clean_pocket.step']), { fields: ['', '', ''] });
  await shot(p, '03-s2-ghost.png');

  // 4. S2: typed stock 3.25 × 2.25 × 1.125 in
  const cp = N['clean_pocket.step'];
  const f = facing(cp.bbox_in, [3.25, 2.25, 1.125]);
  await p.reload(); await load(p, PARTS + 'clean_pocket.step'); await machining(p);
  const pad = f.typed.map((t, k) => (t - cp.bbox_in[k]) / 2 * 25.4);
  await p.evaluate((pad) => window.__proto.stock(pad, true), pad);
  await inject(p, [...lines(cp, f.typed), ...f.rows], { fields: ['3.25', '2.25', '1.125'] });
  await shot(p, '04-s2-typed.png');

  // 5. S2: too small, and a bad size
  await p.reload(); await load(p, PARTS + 'clean_pocket.step'); await machining(p);
  await p.evaluate(() => window.__proto.stock([0, 0, 0], true));
  await inject(p, lines(cp), { fields: ['3.25', '2.25', '0.9'], error: 'Your 0.900 in is smaller than the part\'s 1.000 in.' });
  await p.locator('.mk-stock').screenshot({ path: path.join(HERE, '05a-too-small.png') });
  await p.evaluate(() => { document.querySelector('.mk-err').textContent = 'Type three sizes over 0 in.'; const i = document.querySelectorAll('.mk-stock input'); i[2].value = '0'; });
  await p.locator('.mk-stock').screenshot({ path: path.join(HERE, '05b-bad.png') });
  // the ghost toggled off
  await p.evaluate(() => { window.__proto.stock([0, 0, 0], false); document.getElementById('mk-stockchip').setAttribute('aria-pressed', 'false'); });
  await shot(p, '06-s2-off.png');
  await b.close();
})();
