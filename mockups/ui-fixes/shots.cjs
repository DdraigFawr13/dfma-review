// Screenshots for the UI fixes mock-up (throwaway; not app code). node shots.cjs <scale>
// Base build (main) on :4602, prototype build (scratch worktree) on :4601. Everything drawn into the page here
// (top bar buttons, examples, view buttons, Part / Machine switch, labels) is a DOM injection for the picture.
const { chromium } = require('playwright');
const PARTS = '/home/user/dfma-review/tests/parts/';
const scale = +(process.argv[2] || 2);
const BASE = 'http://localhost:4602/', PROTO = 'http://localhost:4601/';

async function open(b, url) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: scale });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(url);
  return p;
}
async function load(p, file, process = 'mill') {
  await p.getByTestId('upload-process').selectOption(process);
  await p.getByTestId('upload-file').setInputFiles(PARTS + file);
  await p.getByTestId('overview').waitFor({ timeout: 180000 });
}
const settle = (p) => p.waitForTimeout(900);

// --- injections, styled from the app's own tokens and classes ---
async function css(p) {
  await p.addStyleTag({ content: `
    .mk-menu{position:absolute;right:16px;top:52px;z-index:50;background:var(--panel);border:1px solid var(--line);box-shadow:0 6px 18px rgba(0,0,0,.15);min-width:360px}
    .mk-menu button{display:grid;grid-template-columns:1fr;gap:2px;text-align:left;width:100%;border:0;border-bottom:1px solid var(--line);background:none;padding:10px 14px;font:inherit;cursor:pointer;min-height:44px}
    .mk-menu button:first-child{outline:3px solid var(--accent);outline-offset:-3px}
    .mk-menu b{font-family:var(--mono);font-size:.875rem}.mk-menu span,.mk-ex span{font-size:.875rem;color:var(--muted)}
    .mk-views{position:absolute;left:12px;bottom:44px;display:flex;gap:6px;z-index:5}
    .mk-views button,.mk-sw button{font:600 .875rem var(--sans);min-height:32px;padding:4px 10px;background:var(--panel);border:1px solid var(--line);color:var(--ink);border-radius:var(--radius)}
    .mk-sw{position:absolute;right:12px;top:12px;display:flex;z-index:6}
    .mk-sw button[aria-pressed=true]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
    .mk-label{position:absolute;left:50%;transform:translateX(-50%);top:58px;background:var(--panel);border:1px solid var(--line);padding:4px 10px;font:600 .875rem var(--sans);z-index:5}
    .mk-ex{display:grid;gap:6px;margin-top:4px}
    .mk-ex button{display:grid;text-align:left;gap:2px;border:1px solid var(--line);background:var(--panel);padding:8px 12px;font:inherit;cursor:pointer;min-height:44px;border-radius:var(--radius)}
    .mk-ex b{font-family:var(--mono);font-size:.875rem;color:var(--accent)}
    .mk-on{outline:3px solid var(--accent);outline-offset:-1px;background:var(--bg)}
  ` });
}
const EXAMPLES = [
  ['report_sample.step', 'Mill part: sharp corners, deep holes, a deep pocket'],
  ['angled_hole_in_pocket.step', 'An angled hole in a pocket: needs a 4/5-axis mill'],
  ['slender_shaft.step', 'Lathe shaft: long for its diameter'],
  ['clean_one_setup.step', 'Passes: one setup, no issues'],
];
async function topbar(p, loaded) {
  await p.evaluate(({ loaded }) => {
    const pdf = document.getElementById('export-pdf');
    const mk = (t, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = t; b.style.marginRight = '8px'; return b; };
    pdf.before(mk('Open…', 'ghostbtn'), mk('Examples ▾', 'ghostbtn'));
    if (!loaded) { pdf.hidden = true; }
    document.getElementById('top-file').style.display = 'none'; // the name stays in the line under the bar
  }, { loaded });
}
async function startForm(p) {
  await p.evaluate((EX) => {
    document.getElementById('ipt-field').remove();
    const f = document.querySelector('#start .field');
    f.querySelector('.flabel').textContent = 'STEP file, and its .ipt if you have one';
    f.querySelector('label.filebtn').textContent = 'Open…';
    const box = document.createElement('div'); box.className = 'field';
    box.innerHTML = '<span class="flabel">Or try an example</span><div class="mk-ex"></div>';
    for (const [n, t] of EX) { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<b>${n}</b><span>${t}</span>`; box.querySelector('.mk-ex').append(b); }
    document.getElementById('settings').before(box);
    document.getElementById('status').textContent = 'Open a STEP file (and its .ipt), or try an example.';
  }, EXAMPLES);
}
async function views(p) {
  await p.evaluate(() => {
    const v = document.querySelector('section.viewer');
    const d = document.createElement('div'); d.className = 'mk-views'; d.setAttribute('role', 'group');
    for (const t of ['Home', 'Front', 'Top', 'Right', 'Iso']) { const b = document.createElement('button'); b.textContent = t; d.append(b); }
    v.append(d);
    const c = document.getElementById('viewer'); d.style.bottom = 'auto'; d.style.top = (c.offsetTop + c.offsetHeight - 48) + 'px';
    document.querySelector('.viewfoot .hint').textContent = 'Drag: rotate · Middle- or right-drag, or Shift + drag: move · Wheel: zoom to the mouse · Keys: arrows, + −, H';
  });
}
async function machineSwitch(p, label) {
  await p.evaluate((label) => {
    const v = document.querySelector('section.viewer');
    const s = document.createElement('div'); s.className = 'mk-sw'; s.setAttribute('role', 'group');
    s.innerHTML = '<button aria-pressed="false">Part</button><button aria-pressed="true">Machine</button>';
    v.append(s); v.classList.add('has-sw');
    const l = document.createElement('div'); l.className = 'mk-label'; l.textContent = label; v.append(l);
  }, label);
}
function basis(a, dir) { // the frame axis for "+X" etc. in file coordinates, and two axes square to it
  const ax = { X: a.part.frame.x, Y: a.part.frame.y, Z: a.part.frame.z };
  const sgn = dir[0] === '-' ? -1 : 1, k = dir[1];
  const d = ax[k].map((c) => c * sgn);
  const others = ['X', 'Y', 'Z'].filter((x) => x !== k).map((x) => ax[x]);
  return { d, a1: others[0], a2: others[1] };
}
const comb = (...terms) => terms.reduce((s, [w, v]) => s.map((c, i) => c + w * v[i]), [0, 0, 0]);
async function highlightOp(p, text) {
  await p.evaluate((text) => {
    const all = [...document.querySelectorAll('#plan *')].filter((e) => e.textContent.includes(text) && e.textContent.trim().length < 50);
    const el = all.sort((x, y) => y.textContent.length - x.textContent.length)[0];
    if (el) el.classList.add('mk-on');
  }, text);
}

(async () => {
  const b = await chromium.launch();

  // 1 start form with examples, one picker and the new top bar
  let p = await open(b, PROTO); await css(p); await topbar(p, false); await startForm(p);
  await p.screenshot({ path: '01-start.png' }); await p.close();

  // 2 before: a folded row lights all four corners (main)
  p = await open(b, BASE); await load(p, 'report_sample.step');
  await p.getByTestId('step-features').click(); await p.getByTestId('row-F1').click(); await settle(p);
  await p.screenshot({ path: '02-row-before.png' }); await p.close();

  // 3 after: one corner lit, the rest grey; view buttons; top bar
  p = await open(b, PROTO); await load(p, 'report_sample.step'); await css(p); await topbar(p, true);
  await p.getByTestId('step-features').click(); await settle(p); await views(p);
  const hide = await p.addStyleTag({ content: '.flag, svg.leaders, .leaders { visibility: hidden !important; }' });
  await p.screenshot({ path: '04-moving.png' });
  await hide.evaluate((n) => n.remove());
  await p.getByTestId('row-F1').click(); await settle(p);
  await p.screenshot({ path: '03-row-after.png' });
  await p.getByTestId('row-next').click(); await settle(p);
  await p.screenshot({ path: '03b-row-after-next.png' });

  // 5 machine view, mill: setup 2 from -X, the 3/4 in end mill's faces lit
  await p.evaluate(() => document.querySelector('.mk-views')?.remove());
  await p.getByTestId('step-machining').click(); await settle(p);
  const a = await p.evaluate(() => window.__dfma.analysis());
  const s2 = a.setups[1].direction; const { d, a1, a2 } = basis(a, s2.replace('−', '-'));
  const op = a.operations.find((o) => o.setup === 1 && o.tool === 'em-0.750');
  await p.getByTestId('setup-chip-2').click(); await settle(p);
  await p.evaluate(({ v, up, faces }) => { window.__proto.look(v, up); window.__proto.select('op', faces); }, { v: comb([0.55, d], [0.8, a1], [0.6, a2]), up: d, faces: op.faces });
  await p.evaluate(() => document.querySelector('.mk-views')?.remove()); await machineSwitch(p, `Spindle ↓ · Setup 2 from ${s2.replace('-', '−')}`); await views(p); await views(p); await highlightOp(p, '3/4 in end mill'); await settle(p);
  await p.screenshot({ path: '05-machine-mill.png' }); await p.close();

  // 6 machine view, lathe: slender_shaft, the turning axis across the screen
  p = await open(b, PROTO); await load(p, 'slender_shaft.step', 'turn'); await css(p); await topbar(p, true);
  await p.getByTestId('step-machining').click(); await settle(p);
  const t = await p.evaluate(() => window.__dfma.analysis());
  console.log('slender', t.machine, JSON.stringify(t.turn_axis), t.findings.map((f) => f.rule + ':' + f.severity).join(' '));
  const ax = t.turn_axis; const frame = [t.part.frame.x, t.part.frame.y, t.part.frame.z];
  const dot = (u, v) => u.reduce((s, c, i) => s + c * v[i], 0);
  const perp = frame.filter((f) => Math.abs(dot(f, ax)) < 0.5);
  await p.evaluate(({ v, up }) => window.__proto.look(v, up), { v: comb([1, perp[0]], [0.35, perp[1]]), up: perp[1] });
  await machineSwitch(p, 'Lathe · turning axis across the screen'); await views(p); await settle(p);
  await p.screenshot({ path: '06-machine-lathe.png' }); await p.close();

  // 7 Examples menu open over a loaded part
  p = await open(b, PROTO); await load(p, 'angled_hole_in_pocket.step'); await css(p); await topbar(p, true);
  const ah = await p.evaluate(() => window.__dfma.analysis());
  console.log('angled', ah.machine, ah.findings.map((f) => f.rule + ':' + f.severity).join(' '));
  await p.evaluate((EX) => { const m = document.createElement('div'); m.className = 'mk-menu'; m.setAttribute('role', 'menu');
    for (const [n, t] of EX) { const b = document.createElement('button'); b.setAttribute('role', 'menuitem'); b.innerHTML = `<b>${n}</b><span>${t}</span>`; m.append(b); }
    document.body.append(m); }, EXAMPLES);
  await p.screenshot({ path: '07-examples-menu.png' }); await p.close();

  p = await open(b, PROTO); await load(p, 'clean_one_setup.step');
  const c = await p.evaluate(() => window.__dfma.analysis());
  console.log('clean', c.machine, c.setups.length, 'findings', c.findings.length); await p.close();
  await b.close();
})();
