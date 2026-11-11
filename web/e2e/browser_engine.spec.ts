// Port S1 in the browser engine's test build (port spec J1, J3, J4, J5, J6, J6b; screens as the approved mock-up, D-057).
// Ported from tests/e2e/test_browser_engine.py (S8b). test_peak_memory (J4, marked per_slice, D-059) is dropped.
// The Python key comes from the frozen key (tests/parity/key/*.json.gz, S8a), the same answers `analyze` gave.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { PARTS, expected } from "./helpers";
import { compare } from "../src/engine/compare.ts";
import { checksRun } from "../src/engine/rows.ts";

const ROOT = resolve(PARTS, "../..");
const NIST = resolve(ROOT, "tests/nist/.cache/NIST-PMI-STEP-Files");
const KEY_DIR = resolve(ROOT, "tests/parity/key"); // S8a: the frozen key, committed (python tests/parity/key.py --freeze)

// Local helpers (e2e/helpers.ts stays as it is).

/** A string or number constant of src/engine/settings.ts, read as text: that file imports config/*.toml with Vite's
 *  `?raw`, which Node cannot load, so the spec reads the constant from the one source instead of copying it. */
function setting(name: string): string | number {
  const src = readFileSync(resolve(ROOT, "web/src/engine/settings.ts"), "utf8");
  const m = src.match(new RegExp(`export const ${name} = (.*);\\n`));
  if (!m) throw new Error(`no ${name} in settings.ts`);
  return JSON.parse(m[1]);
}

function nist(name: string): string {
  const path = resolve(NIST, name);
  if (!existsSync(path)) throw new Error(`${path} is missing: run npm run nist`);
  return path;
}

/** The frozen key of a file given by its path relative to the repo ("tests/parts/x.step"). */
function frozenKey(rel: string): any {
  const file = resolve(KEY_DIR, rel.replaceAll("/", "__") + ".json.gz");
  if (!existsSync(file)) throw new Error(`${file} is missing from the frozen key: the frozen key is committed in tests/parity/key/`);
  return JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
}
const analyze = (name: string): any => frozenKey(`tests/parts/${name}.step`);

// The mean, variance and fingerprint of the canvas pixels (tests/e2e/test_view.py CANVAS_STATS).
async function canvas(page: Page): Promise<{ variance: number; pixels: number[] }> {
  return page.evaluate(() => {
    const src = document.querySelector('[data-testid="viewer-canvas"]') as HTMLCanvasElement;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(src, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data;
    const lum: number[] = [];
    for (let i = 0; i < d.length; i += 4) lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    const variance = lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length;
    return { variance, pixels: lum.map((v) => Math.round(v)) };
  });
}

function changed(a: { pixels: number[] }, b: { pixels: number[] }): number {
  return a.pixels.filter((x, i) => Math.abs(x - b.pixels[i]) > 8).length;
}

/** The text of each page of a jsPDF file (the repo has no PDF reader for Node; jsPDF writes plain, uncompressed
 *  content streams with one `(text) Tj` per line, in page order, in the Latin-1 standard fonts). */
function pdfPageTexts(file: string): string[] {
  const raw = readFileSync(file).toString("latin1");
  const pages: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const body = m[1];
    if (!/\bBT\b/.test(body.slice(0, 2000)) && !/\bTj\b/.test(body)) continue;
    const lines: string[] = [];
    for (const t of body.matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/g)) {
      lines.push(
        t[1].replace(/\\([0-7]{1,3}|[\s\S])/g, (_, c: string) =>
          /^[0-7]+$/.test(c) ? String.fromCharCode(parseInt(c, 8)) : ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[c] ?? c,
        ),
      );
    }
    pages.push(lines.join(" ").replace(/\n/g, " "));
  }
  return pages;
}

// The rules the browser copy has ported, by process (web/src/engine/rules/index.ts `ported`): every rule from S7, so the
// Not-checked-yet line never shows (S2: holes; S4: pockets, corners, undercuts; S5: walls; S6: turned parts and
// looks_turned; S7: the .ipt checks). RULES is read from that file's text: importing it would pull in settings.ts.
const RULES: { ID: string; PROCESSES: string[]; ported: string[] }[] = [
  ...readFileSync(resolve(ROOT, "web/src/engine/rules/index.ts"), "utf8").matchAll(
    /\{ ID: "(\w+)", PROCESSES: \[([^\]]*)\], ported: \[([^\]]*)\]/g,
  ),
].map((m) => ({ ID: m[1], PROCESSES: [...m[2].matchAll(/"(\w+)"/g)].map((x) => x[1]), ported: [...m[3].matchAll(/"(\w+)"/g)].map((x) => x[1]) }));
const PORTED: Record<string, Set<string>> = {};
for (const p of ["mill", "turn"]) PORTED[p] = new Set(RULES.filter((r) => r.PROCESSES.includes(p) && r.ported.includes(p)).map((r) => r.ID));

function notChecked(process = "mill"): string | null {
  const names = checksRun(RULES.filter((r) => r.PROCESSES.includes(process) && !PORTED[process].has(r.ID)).map((r) => r.ID));
  return names.length ? `Not checked yet in this copy: ${names.join(", ")}.` : null;
}

/** Pick a STEP file and wait for the overview; return the analysis on screen. */
async function read(page: Page, path: string, timeoutMs = 120_000): Promise<any> {
  await page.getByTestId("upload-file").setInputFiles(path);
  await expect(page.getByTestId("overview")).toBeVisible({ timeout: timeoutMs });
  return page.evaluate("window.__dfma.analysis()");
}

const faceUnion = (findings: any[], ids: string[]): number[] =>
  [...new Set(findings.filter((f) => ids.includes(f.id)).flatMap((f) => f.faces as number[]))].sort((a, b) => a - b);

test("test_view_part", async ({ page }) => {
  // J1: the start form, the copy mark, the Part step as Python gives it, and the model rotates.
  await page.goto("/");
  await expect(page.getByTestId("copy-tag")).toHaveText("Test copy");
  await expect(page.locator(".privacy")).toHaveText("Your file stays on this computer. Nothing is uploaded.");
  await expect(page.locator("#ipt-field")).toBeVisible(); // S7: back, as in the service copy
  await expect(page.locator("#status")).toHaveText("Choose a STEP file to start. Add its .ipt too, if you have one.");
  const before = await canvas(page);
  await read(page, resolve(PARTS, "report_sample.step"));
  const part = expected("report_sample");
  await expect(page.getByTestId("part-size")).toHaveText("4.000 × 2.500 × 2.000 in");
  await expect(page.getByTestId("face-count")).toHaveText(`${part.face_count} faces`);
  await expect(page.getByTestId("part-units")).toHaveText(part.units as string);
  await page.waitForTimeout(300);
  const shown = await canvas(page);
  expect(changed(before, shown), "the canvas did not change after reading the part").toBeGreaterThan(50);
  const box = (await page.getByTestId("viewer-canvas").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(changed(shown, await canvas(page)), "dragging did not rotate the part").toBeGreaterThan(50);
});

test("test_not_checked_notice", async ({ page }) => {
  // J1 and D-057: the Not-checked-yet line on the Features card and step and on Report, naming only the checks not
  // ported. From S2 the hole checks run on a milled part, so its chips, Show OK and "Checks run" show; from S3 its
  // Machining and Cost show the plan and the drivers. From S6 a turned part runs its checks too and Machining and Cost
  // are worked out: report_sample has no turning axis, so no machine is planned. From S7 every check is ported, so
  // the line shows nowhere, and the Report step lists the .ipt line of "The PDF holds" again.
  await page.goto("/");
  await read(page, resolve(PARTS, "report_sample.step"));
  expect(notChecked() === null && notChecked("turn") === null).toBeTruthy();
  const later = "Not worked out yet in this copy.";
  await expect(page.getByTestId("overview-features")).not.toContainText("Not checked yet");
  await expect(page.getByTestId("overview-machining")).toContainText("3-axis mill");
  await expect(page.getByTestId("overview-cost")).not.toContainText(later);
  await page.getByTestId("step-features").click();
  await expect(page.getByTestId("features-notrun")).toBeHidden();
  await expect(page.locator("#row-chips button").first()).toBeVisible();
  await expect(page.getByTestId("show-ok")).toBeVisible();
  await page.getByTestId("step-machining").click();
  await expect(page.getByTestId("plan-notrun")).toBeHidden(); // S4: the plan holds pockets too, so no pocket line (D-061)
  await expect(page.getByTestId("plan-machine")).toHaveText("3-axis mill");
  await expect(page.locator("#plan-none")).toBeHidden();
  await page.getByTestId("step-cost").click();
  await expect(page.getByTestId("cost-total")).toBeVisible();
  await expect(page.locator("#cost")).not.toContainText(later);
  await page.getByTestId("step-report").click();
  await expect(page.getByTestId("report-notrun")).toBeHidden();
  await expect(page.locator("#report-checks")).toBeVisible();
  for (const name of ["Hole depth check", "Hole size check", "Access check"]) {
    await expect(page.locator("#report-checks")).toContainText(name);
  }
  await expect(page.locator("#page-report [data-pdf]:visible")).toHaveCount(3); // the findings, the plan and the .ipt line
  for (const what of ["findings", "plan", "ipt"]) {
    await expect(page.locator(`#page-report [data-pdf="${what}"]`)).toBeVisible();
  }
  // S6: a turned part runs the turning checks and is worked out on Machining and Cost; S7: no line names a check
  await page.getByTestId("step-part").click();
  await page.getByTestId("upload-process").selectOption("turn");
  await page.getByTestId("step-report").click();
  await expect(page.locator("#report-checks")).toContainText("Turning axis check", { timeout: 60_000 });
  await expect(page.getByTestId("report-notrun")).toBeHidden();
  await page.getByTestId("step-features").click();
  await expect(page.locator("#row-chips button").first()).toBeVisible();
  await page.getByTestId("step-machining").click();
  await expect(page.getByTestId("plan-notrun")).toBeHidden();
  await expect(page.locator("#plan-none")).toBeVisible(); // no turning axis: no machine, as Python
  await page.getByTestId("step-cost").click();
  await expect(page.locator("#cost")).not.toContainText(later);
});

test("test_ui_responsive", { tag: "@timed" }, async ({ page }) => {
  // J3: while the slowest NIST file is analysed, "Analyzing" shows, the page's main thread never stalls for 200 ms
  // (a 10 ms heartbeat records its longest gap from the upload to the worker's reply), and a tap on the Part tab,
  // timed from the test's side, is handled within 200 ms. The drawing of the result after the reply is printed, not
  // limited: it is the shared 3D viewer (the service app: 1,144 and 1,387 ms on this file, 2026-11-10).
  await page.goto("/");
  await page.waitForFunction("window.__dfmaEngineReady === true", undefined, { timeout: 120_000 }); // compiled while idle
  // Start timing once the page has finished loading: Chromium tears down a load-time compositor about 1 s after the
  // page opens, a 90-300 ms pause that belongs to loading, not to the analysis (traced 2026-11-11: WidgetBase::Shutdown,
  // LayerTreeHost::~LayerTreeHost). Quiet means 1 s of 10 ms heartbeats with no gap over 50 ms; the limits below are unchanged.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = performance.now(), quietSince = last;
        const t = setInterval(() => {
          const now = performance.now();
          if (now - last > 50) quietSince = now;
          last = now;
          if (now - quietSince >= 1000) {
            clearInterval(t);
            resolve();
          }
        }, 10);
      }),
  );
  await page.evaluate(() => {
    const w = window as any;
    const beat = (w.__beat = { last: performance.now(), worst: 0, beats: 0, replied: false, draw: 0 });
    w.__beatTimer = setInterval(() => {
      const now = performance.now(), gap = now - beat.last;
      if (beat.replied) beat.draw = Math.max(beat.draw, gap);
      else beat.worst = Math.max(beat.worst, gap);
      beat.last = now;
      beat.beats++;
    }, 10);
    const W = w.Worker; // note the worker's reply, so gaps after it count as drawing
    w.Worker = function (...a: any[]) {
      const worker = new W(...a);
      worker.addEventListener("message", (e: any) => {
        if (e.data && e.data.type !== "ready") beat.replied = true;
      });
      return worker;
    };
  });
  await page.getByTestId("upload-file").setInputFiles(nist("nist_ctc_02_asme1_ap242-e2.stp"));
  await expect(page.locator("#status")).toContainText("Analyzing");
  const taps: number[] = [];
  while (!(await page.evaluate("window.__beat.replied"))) {
    const start = performance.now();
    await page.evaluate(() => (document.querySelector('[data-testid="step-part"]') as HTMLElement).click());
    if (!(await page.evaluate("window.__beat.replied"))) { // a tap that overlapped the reply is drawing time
      taps.push(performance.now() - start);
    }
    if (taps.length > 5000) break;
  }
  await expect(page.getByTestId("overview")).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(1000);
  const beat = await page.evaluate(() => {
    const w = window as any;
    clearInterval(w.__beatTimer);
    return w.__beat;
  });
  console.log(
    `during the analysis: heartbeats ${beat.beats}, longest gap ${beat.worst.toFixed(1)} ms; taps ${taps.length}, ` +
      `slowest ${Math.max(0, ...taps).toFixed(1)} ms; drawing the result: longest gap ${beat.draw.toFixed(1)} ms`,
  );
  expect(taps.length, "the analysis finished before a tap could be timed").toBeGreaterThan(0);
  expect(beat.worst, "the page's main thread stalled during the analysis").toBeLessThan(200);
  expect(Math.max(...taps)).toBeLessThan(200);
});

test("test_refused", async ({ page }, testInfo) => {
  // J5: refusals show the same messages as today, with "try again" only where it can help (audit F3).
  await page.goto("/");
  const big = testInfo.outputPath("too_big.step");
  writeFileSync(big, Buffer.alloc((setting("MAX_UPLOAD_BYTES") as number) + 1, "0"));
  const ipt = resolve(ROOT, "tests/inventor/files", readdirSync(resolve(ROOT, "tests/inventor/files")).filter((f) => f.endsWith(".ipt")).sort()[0]);
  const cases: [string, string][] = [
    [resolve(PARTS, "not_step.step"), setting("MSG_NOT_STEP") as string],
    [resolve(PARTS, "no_solid.step"), setting("MSG_NO_SOLID") as string],
    [big, setting("MSG_TOO_LARGE") as string],
    [ipt, setting("MSG_IPT_NEEDS_STEP") as string],
  ];
  for (const [path, message] of cases) {
    await page.getByTestId("upload-file").setInputFiles(path);
    await expect(page.getByTestId("error-message")).toContainText(message, { timeout: 60_000 });
    await expect(page.locator("#error-next")).toBeHidden();
  }
});

test("test_timeout", async ({ page }) => {
  // J5: past the time limit (the test build's ?time_limit_s=), MSG_TOO_LONG with "try again".
  await page.goto("/?time_limit_s=0.05");
  await page.getByTestId("upload-file").setInputFiles(nist("nist_ctc_02_asme1_ap242-e2.stp"));
  await expect(page.getByTestId("error-message")).toContainText(setting("MSG_TOO_LONG") as string, { timeout: 120_000 });
  await expect(page.locator("#error-next")).toBeVisible();
});

test("test_licences", async ({ page }) => {
  // J6: the footer's Licenses link opens the page with the engine, its license texts and every runtime package.
  await page.goto("/");
  await page.getByTestId("licenses-link").click();
  await expect(page.locator("h1")).toHaveText("DFMA Review · Licenses");
  await expect(page.locator("body")).toContainText("LGPL-2.1-only with the Open CASCADE exception 1.0");
  const deps = JSON.parse(readFileSync(resolve(ROOT, "web/package.json"), "utf8")).dependencies as Record<string, string>;
  for (const [name, version] of Object.entries(deps)) {
    await expect(page.locator("body")).toContainText(name);
    await expect(page.locator("body")).toContainText(version);
  }
  for (const link of ["licences/opencascade-LICENSE.txt", "licences/opencascade-OCCT-exception.txt", "fonts/OFL.txt"]) {
    expect((await page.request.get(`/${link}`)).ok(), link).toBeTruthy();
  }
});

for (const path of [
  "tests/parts/report_sample.step",
  "tests/parts/countersunk_hole.step",
  "tests/parts/clean_holes.step",
  "tests/nist/.cache/NIST-PMI-STEP-Files/nist_ctc_01_asme1_ap242-e1.stp",
  "tests/nist/.cache/NIST-PMI-STEP-Files/nist_ftc_09_asme1_ap242-e1.stp",
]) {
  test(`test_worker_parity[${path}]`, async ({ page }) => {
    // J6b: the real worker in Chromium gives the key's answer, by the same compare rules as the Node parity
    // (compare() of web/src/engine/compare.ts, called here directly; it was `npm run compare` from Python).
    nist("nist_ctc_01_asme1_ap242-e1.stp");
    const key = frozenKey(path); // the frozen key is gzipped (S8a)
    await page.goto("/");
    const result = await read(page, resolve(ROOT, path));
    const outcome = compare(JSON.parse(JSON.stringify(result)), key);
    expect(outcome.status, `${outcome.status}:\n  ${outcome.diffs.join("\n  ")}`).not.toBe("different");
  });
}

/** The rows, by their first finding's F-number, are Python's, word for word; a row's tap lights its faces. */
async function checkRows(page: Page, rows: any[], ids: Record<string, string>): Promise<void> {
  for (const r of rows) {
    const row = page.getByTestId(`row-${ids[r.findings[0]]}`);
    await expect(row).toContainText(r.short);
    await expect(row).toContainText(r.sentence);
  }
}

for (const name of ["report_sample", "countersunk_hole", "deep_hole", "clean_holes"]) {
  test(`test_hole_rows[${name}]`, async ({ page }) => {
    // S2 ("Morgan tries"): the hole rows on the Features step are Python's, word for word; a row's tap lights its
    // faces; a part with no hole finding says so above the Not-checked-yet line.
    const file = resolve(PARTS, `${name}.step`);
    const key = analyze(name);
    const holes = key.features.filter((f: any) => f.kind === "hole");
    const ported = PORTED.mill;
    const onHoles = new Set<string>(holes.map((f: any) => f.id));
    const kinds: Record<string, string> = Object.fromEntries(key.features.map((f: any) => [f.id, f.kind]));
    // the browser copy numbers its findings over every ported rule and kind (holes, pockets, corners from S4)
    const findings = key.findings.filter((f: any) => ported.has(f.rule) && ["hole", "pocket", "corner"].includes(kinds[f.feature]));
    const kept = new Set<string>(findings.filter((f: any) => onHoles.has(f.feature)).map((f: any) => f.id));
    const rows = key.rows.filter((r: any) => ported.has(r.rule) && r.findings.every((x: string) => kept.has(x))); // the rows on holes only
    expect(holes.length, `${name} has no hole`).toBeGreaterThan(0);
    await page.goto("/");
    const result = await read(page, file);
    expect(result.features.filter((f: any) => f.kind === "hole").length).toBe(holes.length);
    const card = page.getByTestId("overview-features");
    await expect(card).toContainText(`${holes.length} hole${holes.length !== 1 ? "s" : ""}`); // S4: "…, 1 pocket and 4 corners checked"
    await expect(card).not.toContainText("Not checked yet"); // S7: every check runs
    await page.getByTestId("step-features").click();
    if (!rows.length) {
      await expect(card).toContainText("No findings. Every feature checked passed its rules.");
      return;
    }
    // Python numbers the findings across every rule; the browser copy across the ported ones (port spec Parity)
    const ids: Record<string, string> = Object.fromEntries(findings.map((f: any, n: number) => [f.id, `F${n + 1}`]));
    await checkRows(page, rows, ids);
    const first = rows[0];
    const faces = faceUnion(findings, first.findings.slice(0, 1)); // the row lights the finding it shows (UI fixes A5, D-076)
    await page.getByTestId(`row-${ids[first.findings[0]]}`).click();
    expect(((await page.evaluate("window.__dfma.highlightedFaces()")) as number[]).sort((a, b) => a - b)).toEqual(faces);
  });
}

const POCKETS_LATER = "Pockets are not in this plan yet in this copy, so it may need more setups and tools."; // gone in S4

for (const name of ["clean_pocket", "pocket_sharp", "pocket_deep", "pocket_island", "report_sample"]) {
  test(`test_pocket_rows[${name}]`, async ({ page }) => {
    // S4: the pocket and corner rows on the Features step are Python's, word for word, and a row's tap lights its
    // faces; the pockets and corners are Python's, ids and faces (the parity compare checks every number).
    const file = resolve(PARTS, `${name}.step`);
    const key = analyze(name);
    const kinds = ["pocket", "corner"];
    const mine = key.features.filter((f: any) => kinds.includes(f.kind));
    expect(mine.some((f: any) => f.kind === "pocket"), `${name} has no pocket`).toBeTruthy();
    await page.goto("/");
    const result = await read(page, file);
    const shown = result.features.filter((f: any) => kinds.includes(f.kind)).map((f: any) => [f.id, f.faces]);
    expect(shown).toEqual(mine.map((f: any) => [f.id, f.faces]));
    const ported = PORTED.mill;
    const kindOf: Record<string, string> = Object.fromEntries(key.features.map((f: any) => [f.id, f.kind]));
    const findings = key.findings.filter((f: any) => ported.has(f.rule) && ["hole", ...kinds].includes(kindOf[f.feature]));
    const on = new Set<string>(findings.filter((f: any) => kinds.includes(kindOf[f.feature])).map((f: any) => f.id));
    const rows = key.rows.filter((r: any) => ported.has(r.rule) && r.findings.some((x: string) => on.has(x)));
    await page.getByTestId("step-features").click();
    const ids: Record<string, string> = Object.fromEntries(findings.map((f: any, n: number) => [f.id, `F${n + 1}`])); // renumbered over the ported rules (port spec Parity)
    await checkRows(page, rows, ids);
    if (rows.length) {
      const first = rows[0];
      const faces = faceUnion(findings, first.findings.slice(0, 1)); // the row lights the finding it shows (UI fixes A5, D-076)
      await page.getByTestId(`row-${ids[first.findings[0]]}`).click();
      expect(((await page.evaluate("window.__dfma.highlightedFaces()")) as number[]).sort((a, b) => a - b)).toEqual(faces);
    }
  });
}

for (const name of ["thin_rib", "thin_floor", "clean_walls", "thin_drill_point", "hole_near_edge"]) {
  test(`test_wall_rows[${name}]`, async ({ page }) => {
    // S5: the walls are Python's, ids, faces, hole and place, and the thin-wall rows on the Features step are
    // Python's, word for word, and a row's tap lights its faces (the parity compare checks every number).
    const file = resolve(PARTS, `${name}.step`);
    const key = analyze(name);
    const walls = key.features.filter((f: any) => f.kind === "wall");
    expect(walls.length, `${name} has no wall`).toBeGreaterThan(0);
    await page.goto("/");
    const result = await read(page, file);
    const pick = (fs: any[]) => fs.filter((f) => f.kind === "wall").map((f) => [f.id, f.faces, f.hole ?? null, f.at ?? null]);
    expect(pick(result.features)).toEqual(pick(walls));
    const ported = PORTED.mill;
    const findings = key.findings.filter((f: any) => ported.has(f.rule)); // every mill rule is ported from S6
    const rows = key.rows.filter((r: any) => r.rule === "thin_wall");
    if (["thin_floor", "thin_drill_point"].includes(name)) { // expected.toml: each has a thin_wall finding in aluminium
      expect(rows.length, `${name} has no thin-wall row`).toBeGreaterThan(0);
    }
    const ids: Record<string, string> = Object.fromEntries(findings.map((f: any, n: number) => [f.id, `F${n + 1}`])); // renumbered over the ported rules (port spec Parity)
    await page.getByTestId("step-features").click();
    await checkRows(page, rows, ids);
    if (rows.length) {
      const first = rows[0];
      const faces = faceUnion(findings, first.findings.slice(0, 1)); // the row lights the finding it shows (UI fixes A5, D-076)
      await page.getByTestId(`row-${ids[first.findings[0]]}`).click();
      expect(((await page.evaluate("window.__dfma.highlightedFaces()")) as number[]).sort((a, b) => a - b)).toEqual(faces);
    }
  });
}

test("test_plan_and_cost", async ({ page }, testInfo: TestInfo) => {
  // S3 (D-061): clean_holes.step's plan and drivers as Python gives them; no pocket line on Machining or in the PDF
  // from S4; the setup card says what a tap does and that it is done. From S5 every check that feeds a driver runs on
  // Milling, so the total, the Cost card and the PDF carry no "(partial)" and the Cost step no not-checked line
  // (the Features step and the PDF summary still name looks_turned and the .ipt checks).
  const key = analyze("clean_holes");
  await page.goto("/");
  const shown = await read(page, resolve(PARTS, "clean_holes.step"));
  for (const name of ["machine", "setups", "operations", "tools", "tool_changes", "cost_drivers", "cost_total"]) {
    expect(shown[name], name).toEqual(key[name]);
  }
  expect(shown.cost_partial).toBe(false);
  const total = `${(key.cost_total as number).toFixed(1)} points`;
  await expect(page.getByTestId("overview-cost")).toContainText("1 cost driver");
  await expect(page.getByTestId("overview-cost")).not.toContainText("(partial)");
  await page.getByTestId("step-machining").click();
  await expect(page.getByTestId("plan-notrun")).toBeHidden(); // S4: no pocket line
  const setup = page.getByTestId("plan-setup-1");
  await expect(setup).toContainText("Setup 1 · from +Z");
  await expect(setup.locator(".shint")).toHaveText("Show on model ›");
  await setup.click();
  await expect(setup).toHaveAttribute("aria-pressed", "true");
  await expect(setup.locator(".shint")).toHaveText("Shown on model");
  await page.getByTestId("step-cost").click();
  await expect(page.getByTestId("cost-total")).toContainText(total);
  await expect(page.getByTestId("cost-total")).not.toContainText("(partial)");
  await expect(page.locator("#cost .notrun")).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-pdf").click()]);
  const path = testInfo.outputPath("report.pdf");
  await download.saveAs(path);
  const first = pdfPageTexts(path)[0];
  for (const text of ["Machine: 3-axis mill", `Total score: ${total}`]) {
    expect(first.includes(text), `${JSON.stringify(text)} is not on page 1`).toBeTruthy();
  }
  expect(first).not.toContain("Not checked yet"); // S7: every check runs
  expect(first).not.toContain("(partial)");
  expect(first).not.toContain(POCKETS_LATER); // S4: the plan holds pockets
});
