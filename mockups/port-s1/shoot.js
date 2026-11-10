// Screenshots of the real app (python -m dfma start, port 8765) with the S1 browser copy's changes injected.
// The /api/analyze reply is Python's own, reshaped to what S1's browser engine returns (spec Parity "S1"):
// part, faces, assumptions kept; every other key Python's empty value; checks_not_run added.
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2];
// argv[3]: Python's reply for report_sample.step, from
//   curl -s -F file=@tests/parts/report_sample.step -F process=mill -F material=al6061 http://127.0.0.1:8765/api/analyze
const REPLY = require(path.resolve(process.argv[3]));
const ROOT = '/home/user/dfma-review';
const NOT_RUN = ['Hole depth check', 'Hole size check', 'Corner radius check', 'Pocket depth check', 'Undercut check',
  'Thin wall check', 'Access check', 'Process check', '.ipt check']; // rows.checks_run of RULES with "mill" (python, this session)

function s1(r) {
  return { ...r, features: [], findings: [], rules_run: [], checks_run: [], passed: [], rows: [], passed_rows: [],
    machine: null, turn_axis: null, setups: [], operations: [], tools: [], tool_changes: 0, cost_drivers: [], cost_total: null,
    checks_not_run: NOT_RUN };
}

const CSS = `
.copytag { font-weight: 600; font-size: 0.875rem; border: 1px solid var(--ink);
  border-radius: var(--radius); padding: 2px var(--space-2); white-space: nowrap; }
.notrun { margin: 0 0 var(--space-3); padding: var(--space-2) var(--space-3); background: var(--bg); border-left: 3px solid var(--muted);
  font-size: 0.875rem; color: var(--ink); }
#rows .notrun, #cost .notrun { margin: var(--space-3); }
.card .notrun { margin: var(--space-1) 0 0; }
.foot { display: flex; padding: 0 var(--space-4); border-top: 1px solid var(--line); background: var(--panel); }
.foot a { display: inline-flex; align-items: center; min-height: 32px; color: var(--accent); font-size: 0.875rem; }
`;

async function chrome(page) {
  await page.evaluate((css) => {
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const tag = document.createElement('span'); tag.className = 'copytag'; tag.textContent = 'Test copy';
    document.querySelector('.top h1').after(tag);
    document.querySelector('.privacy').textContent = 'Your file stays on this computer. Nothing is uploaded.';
    document.getElementById('ipt-field').hidden = true;
    document.getElementById('status').textContent = 'Choose a STEP file to start.';
    const foot = document.createElement('footer'); foot.className = 'foot';
    foot.innerHTML = '<a href="licences.html">Licenses</a>';
    document.body.append(foot);
  }, CSS);
}

async function notices(page, names) {
  await page.evaluate((names) => {
    const line = (t) => { const p = document.createElement('p'); p.className = 'notrun'; p.textContent = t; return p; };
    const NOT = `Not checked yet in this copy: ${names.join(', ')}.`;
    const LATER = 'Not worked out yet in this copy.';
    document.querySelectorAll('.notrun').forEach((n) => n.remove());
    // Overview cards
    const f = document.querySelector('[data-testid=overview-features]');
    if (f) { f.querySelectorAll('.sub').forEach((s) => s.remove()); f.append(line(NOT)); }
    for (const k of ['machining', 'cost']) {
      const c = document.querySelector(`[data-testid=overview-${k}]`);
      if (c) { c.querySelectorAll('.sub').forEach((s) => s.remove()); c.append(line(LATER)); }
    }
    // Features step: the line; no chips and no "No findings" while no check has run
    const chips = document.getElementById('row-chips'); chips.hidden = true;
    const ok = document.getElementById('show-ok'); ok.hidden = true; ok.style.display = 'none';
    const rows = document.getElementById('rows'); rows.replaceChildren(line(NOT));
    // Machining and Cost: the later line, no plan, no total
    document.getElementById('plan-none').hidden = true;
    document.getElementById('plan').replaceChildren();
    document.getElementById('plan-title').after(line(LATER));
    document.getElementById('cost').replaceChildren(line(LATER));
    // Report: the line under the heading; the empty Checks run block goes; no .ipt line in what the PDF holds
    document.getElementById('report-title').after(line(NOT));
    const rr = document.getElementById('report-rules'); rr.closest('.block').hidden = true;
    // "The PDF holds": only what this copy's PDF has (no plan, no finding pages, no .ipt groups)
    for (const li of [...document.querySelectorAll('#page-report li')]) {
      if (!/^(Page 1|Last)/.test(li.textContent)) li.remove();
    }
  }, names);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shot = async (page, name) => page.screenshot({ path: path.join(OUT, name), fullPage: true });
  let delay = 0;
  async function open(width, scale = 1) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.route('**/api/analyze', async (route) => {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      const body = route.request().postDataBuffer().toString('latin1');
      if (!body.includes('filename="report_sample.step"')) return route.continue();
      return route.fulfill({ json: s1(REPLY) });
    });
    await page.goto('http://127.0.0.1:8765/');
    if (scale !== 1) await page.evaluate((s) => { document.documentElement.style.fontSize = s; }, '200%');
    await chrome(page);
    return page;
  }
  const pick = (page, f) => page.setInputFiles('[data-testid=upload-file]', path.join(ROOT, 'tests/parts', f));
  const ready = (page) => page.waitForSelector('[data-testid=overview]:not([hidden])', { timeout: 60000 });

  // 1280: start form, refusal, loading, then each step
  let p = await open(1280);
  await shot(p, '01-start-1280.png');
  await pick(p, 'not_step.step');
  await p.waitForSelector('[data-testid=error-message]:not([hidden])');
  await shot(p, '02-refused-1280.png');
  await p.close();

  p = await open(1280); delay = 4000;
  await pick(p, 'report_sample.step');
  await p.waitForTimeout(1500);
  await shot(p, '03-loading-1280.png');
  await ready(p); delay = 0;
  await p.waitForTimeout(800);
  await notices(p, NOT_RUN);
  await shot(p, '04-part-1280.png');
  for (const [step, n] of [['features', '05'], ['machining', '06'], ['cost', '07'], ['report', '08']]) {
    await p.click(`[data-testid=step-${step}]`);
    await p.waitForTimeout(400);
    await notices(p, NOT_RUN);
    await shot(p, `${n}-${step}-1280.png`);
  }
  await p.close();

  // 900 px and 1280 px with 200% text: the Part step
  p = await open(900); await pick(p, 'report_sample.step'); await ready(p); await p.waitForTimeout(800);
  await notices(p, NOT_RUN); await shot(p, '09-part-900.png'); await p.close();
  p = await open(1280, 2); await pick(p, 'report_sample.step'); await ready(p); await p.waitForTimeout(800);
  await notices(p, NOT_RUN); await shot(p, '10-part-1280-200.png'); await p.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
