// Ported from tests/e2e/test_steps.py (S8b): the five steps, the Part step's start form and overview, Cost with its
// total, the Report step, the empty states, Features rows, Show OK, Change file, and Machining.
import { resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { load, openStep, PARTS, STEPS } from "./helpers";

const SAMPLE = resolve(PARTS, "report_sample.step");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = any;

const results = new Map<string, Promise<Result>>();
/** Local helper (the Python tests called dfma.analyze): the browser engine's result for a part, read back from the
 *  page's own test hook in a throwaway page (`window.__dfma.analysis()`). */
function analysisOf(browser: Browser, file: string, process = "mill", material = "al6061"): Promise<Result> {
  const key = `${file}|${process}|${material}`;
  let p = results.get(key);
  if (!p) {
    p = (async () => {
      const context = await browser.newContext({ baseURL: "http://127.0.0.1:8766" });
      try {
        const page = await context.newPage();
        await page.goto("/");
        await page.getByTestId("upload-process").selectOption(process);
        await page.getByTestId("upload-material").selectOption(material);
        await page.getByTestId("upload-file").setInputFiles(file);
        await expect(page.getByTestId("overview")).toBeVisible({ timeout: 60_000 });
        return await page.evaluate("window.__dfma.analysis()");
      } finally {
        await context.close();
      }
    })();
    results.set(key, p);
  }
  return p;
}

const sampleOf = (browser: Browser) => analysisOf(browser, SAMPLE);

/** The data-testid of the section holding the focused element, if the focus is on an h2. */
function focusedHeading(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const a = document.activeElement;
    return a && a.tagName === "H2" ? ((a.closest('section[data-testid^="page-"]') as HTMLElement | null)?.dataset.testid ?? null) : null;
  });
}

const fulfilling = (result: Result) => (r: import("@playwright/test").Route) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });

test("test_part_step", async ({ page, browser }) => {
  // J1: the start form, "Analyzing …" over the model, then the overview with its four cards and Fix first.
  const sample = await sampleOf(browser);
  await page.addInitScript("window.__dfmaFakeService = true");
  await page.goto("/");
  const form = page.getByTestId("start-form");
  await expect(form).toContainText("Start a review");
  await expect(page.getByTestId("viewer-note")).toHaveText("The part shows here once it's read.");
  await expect(page.getByTestId("overview")).toBeHidden();
  await expect(page.getByTestId("export-pdf")).toBeHidden();
  for (const name of STEPS.slice(1)) { // only Part is enabled before a part is read
    await expect(page.getByTestId(`step-${name}`)).toBeDisabled();
  }
  await expect(page.getByTestId("step-part")).toHaveAttribute("aria-current", "step");

  const held: import("@playwright/test").Route[] = [];
  await page.route("**/api/analyze", async (r) => { held.push(r); });
  await page.getByTestId("upload-file").setInputFiles(SAMPLE);
  await expect(page.getByTestId("viewer-note")).toHaveText("Analyzing report_sample.step…");
  await page.waitForTimeout(100); // let the held request register
  expect(held.length, "the analysis request was not sent").toBeTruthy();
  await held[0].fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sample) });

  const overview = page.getByTestId("overview");
  await expect(overview).toBeVisible({ timeout: 30_000 });
  await expect(form).toBeHidden();
  await expect(page.getByTestId("viewer-note")).toBeHidden();
  await expect(overview).toContainText("report_sample.step");
  await expect(page.getByTestId("part-size")).toHaveText("4.000 × 2.500 × 2.000 in");
  await expect(page.getByTestId("face-count")).toHaveText("14 faces");
  await expect(page.getByTestId("part-units")).toHaveText("inch");
  await expect(page.getByTestId("upload-process")).toHaveValue("mill");
  await expect(page.getByTestId("upload-material")).toHaveValue("al6061");
  await expect(page.getByTestId("change-file")).toBeVisible();
  await expect(page.getByTestId("top-file")).toHaveText("report_sample.step");
  await expect(page.getByTestId("export-pdf")).toBeEnabled();

  const feats = page.getByTestId("overview-features");
  for (const text of ["2 · Features", "Fix 4", "Review 4", "OK 9", "2 holes, 1 pocket, 4 corners and 9 walls checked"]) {
    await expect(feats).toContainText(text);
  }
  const mach = page.getByTestId("overview-machining");
  for (const text of ["3 · Machining", "3-axis mill", "2 setups", "4 tool loads"]) await expect(mach).toContainText(text);
  const cost = page.getByTestId("overview-cost");
  await expect(cost).toContainText("7 cost drivers");
  await expect(cost).toContainText("Biggest: distinct tools and sharp or small inside corners, tied at 4.0 points (weights are estimates)");
  await expect(page.getByTestId("overview-report")).toContainText("PDF of all of the above");
  for (const [k, name] of STEPS.slice(1).entries()) { // the card heading is the link (audit F24)
    await expect(page.getByTestId(`open-${name}`)).toHaveText(`${k + 2} · ${name.charAt(0).toUpperCase() + name.slice(1)} ›`);
  }

  const first = page.getByTestId("fix-first"); // S2: the first Fix row, its short title, ids and first sentence
  await expect(first).toContainText("Fix first");
  await expect(first).toContainText("Fix Sharp corner ×4 F4–F7 Inside corners have no radius.");

  await page.getByTestId("open-cost").click();
  await expect(page.getByTestId("page-cost")).toBeVisible();
  expect(page.url().endsWith("#cost")).toBe(true);
});

test("test_refused_in_form", async ({ page }) => {
  // J1: a refused file says why inside the start form, with "Error:" before it; the overview stays hidden.
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "not_step.step"));
  const error = page.getByTestId("start-form").getByTestId("error-message");
  await expect(error).toHaveText("This is not a STEP file this tool can read. Export it again as .step or .stp from your CAD.", { timeout: 30_000 });
  expect(await error.evaluate((e) => getComputedStyle(e, "::before").content)).toBe('"Error: "');
  await expect(page.locator("#error-next")).toBeHidden(); // a refused file: trying again can't help (audit F3)
  await expect(page.getByTestId("viewer-note")).toHaveText("No part loaded.");
  await expect(page.getByTestId("overview")).toBeHidden();
  await expect(page.getByTestId("step-features")).toBeDisabled();
});

for (const width of [1280, 900]) {
  test(`test_walk[${width}]`, async ({ page, browser }) => {
    // J2: tabs, Open ›, Next and Back, and the browser's Back and Forward walk the steps; the address names the
    // step; focus goes to the step's heading; at 200% text the tabs wrap and stay on the screen.
    const sample = await sampleOf(browser);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript("window.__dfmaFakeService = true");
    await page.goto("/#cost"); // a hash for another step shows Part before a part is read
    await expect(page.getByTestId("page-part")).toBeVisible();
    await expect(page.getByTestId("page-cost")).toBeHidden();
    await page.route("**/api/analyze", fulfilling(sample));
    await page.getByTestId("upload-file").setInputFiles(SAMPLE);
    await expect(page.getByTestId("overview")).toBeVisible({ timeout: 30_000 });

    const tab = page.getByTestId("step-features");
    await expect(tab).toContainText("2Features");
    await expect(tab).toContainText("▲ 4");
    await expect(tab).toContainText("◆ 4");
    await expect(page.getByTestId("step-back")).toBeHidden();
    await expect(page.getByTestId("step-next")).toHaveText("Features ›");

    const at = async (name: string) => {
      await expect(page.getByTestId(`page-${name}`)).toBeVisible();
      for (const other of STEPS) {
        if (other !== name) {
          await expect(page.getByTestId(`page-${other}`)).toBeHidden();
          await expect(page.getByTestId(`step-${other}`)).not.toHaveAttribute("aria-current", "step");
        }
      }
      await expect(page.getByTestId(`step-${name}`)).toHaveAttribute("aria-current", "step");
      expect(page.url().endsWith(`#${name}`)).toBe(true);
      expect(await focusedHeading(page)).toBe(`page-${name}`);
    };

    await page.getByTestId("step-next").click();
    await at("features");
    await expect(page.getByTestId("step-back")).toHaveText("‹ Part");
    await page.getByTestId("step-next").click();
    await at("machining");
    await page.getByTestId("step-back").click();
    await at("features");
    await page.getByTestId("step-report").click();
    await at("report");
    await expect(page.getByTestId("step-next")).toBeHidden();
    await expect(page.getByTestId("step-back")).toHaveText("‹ Cost");
    await page.goBack();
    await at("features");
    await page.goForward();
    await at("report");
    await page.getByTestId("step-part").click();
    await at("part");
    await page.getByTestId("open-machining").click();
    await at("machining");

    // 200% text: the five tabs wrap onto at most two lines and nothing runs off the screen
    await page.evaluate("document.documentElement.style.fontSize = '200%'");
    const boxes = [];
    for (const n of STEPS) boxes.push((await page.getByTestId(`step-${n}`).boundingBox())!);
    expect(new Set(boxes.map((b) => Math.round(b.y))).size, JSON.stringify(boxes)).toBeLessThanOrEqual(2);
    expect(boxes.every((b) => b.x >= 0 && b.x + b.width <= width), JSON.stringify(boxes)).toBe(true);
    expect(await page.evaluate("document.documentElement.scrollWidth") as number).toBeLessThanOrEqual(width);
  });
}

test("test_cost_total", async ({ page }) => {
  // J5: each driver's count × weight = score, its findings or "from the machine plan", and the total.
  await load(page, SAMPLE);
  await openStep(page, "cost");
  const corners = page.getByTestId("driver-small_corners");
  for (const text of ["Sharp or small inside corners", "4 × 1.0", "4.0", "F4–F7"]) await expect(corners).toContainText(text);
  await expect(page.getByTestId("driver-deep_holes")).toContainText("F1 F2");
  await expect(page.getByTestId("driver-odd_holes")).toContainText("F3");
  await expect(page.getByTestId("driver-distinct_tools")).toContainText("from the machine plan");
  await expect(page.getByTestId("driver-extra_setups")).toContainText("from the machine plan");
  const total = page.getByTestId("cost-total");
  await expect(total).toContainText("Total score");
  await expect(total).toHaveText("Total score14.0 points"); // no "(partial)" in the Python app (D-061)
  await expect(page.getByTestId("page-cost")).toContainText(
    "Score is count × weight. Every weight is an estimate. No time or dollars yet.");
  expect(await page.getByTestId("page-cost").locator("[data-testid^='driver-']").count()).toBe(7);
});

test("test_report_step", async ({ page, browser }) => {
  // J5: what the PDF holds, the checks run by name, the assumptions folded, and Export PDF.
  const sample = await sampleOf(browser);
  await load(page, SAMPLE);
  await openStep(page, "report");
  const report = page.getByTestId("page-report");
  await expect(report).toContainText("The PDF holds");
  await expect(page.getByTestId("report-rules").locator("li")).toHaveText([ // each with its finding count (audit F23)
    "Hole depth check: 2 findings", "Hole size check: 1 finding", "Corner radius check: 4 findings",
    "Pocket depth check: 1 finding", "Undercut check: none", "Thin wall check: none", "Access check: none",
    "Process check: none"]);
  const folded = page.getByTestId("report-assumptions");
  await expect(folded.locator("summary")).toHaveText(`Assumptions (${sample.assumptions.length})`);
  await expect(folded).not.toHaveAttribute("open", "");
  await folded.locator("summary").click();
  await expect(folded).toContainText(sample.assumptions[0]);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("report-export-pdf").click()]);
  expect(download.suggestedFilename()).toBe("report_sample-dfma-review.pdf");
});

async function routed(page: Page, result: Result): Promise<void> {
  await page.route("**/api/analyze", fulfilling(result));
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(SAMPLE);
  await expect(page.getByTestId("overview")).toBeVisible({ timeout: 30_000 });
}

test("test_empty_states", async ({ page, browser }) => {
  // J7: no findings, no Fix findings, no cost drivers and no machine plan, each answered through page.route.
  const sample = await sampleOf(browser);
  await page.addInitScript("window.__dfmaFakeService = true");
  const clean = structuredClone(sample);
  clean.findings = []; clean.rows = [];
  await routed(page, clean);
  await expect(page.getByTestId("fix-first")).toBeHidden();
  await expect(page.getByTestId("overview-features")).toContainText("No findings. Every feature checked passed its rules.");
  await page.unroute("**/api/analyze");

  const shuffled = structuredClone(sample); // Fix first ties: the lowest F id, whatever the order the rows come in
  shuffled.rows = [...sample.rows].reverse();
  await routed(page, shuffled);
  await expect(page.getByTestId("fix-first")).toContainText("Fix Sharp corner ×4 F4–F7");
  await page.unroute("**/api/analyze");

  const review = structuredClone(sample);
  review.findings = sample.findings.filter((f: Result) => f.severity === "medium");
  review.rows = sample.rows.filter((r: Result) => r.severity === "medium");
  await routed(page, review);
  await expect(page.getByTestId("fix-first")).toContainText("Review first");
  await expect(page.getByTestId("fix-first")).toContainText("Review Deep hole ×2 F1 F2 9.6× and 7.2× the diameter deep.");
  await page.unroute("**/api/analyze");

  const bare = structuredClone(sample);
  bare.cost_drivers = []; bare.cost_total = null;
  bare.machine = null; bare.setups = []; bare.operations = []; bare.tools = []; bare.tool_changes = 0;
  await routed(page, bare);
  await expect(page.getByTestId("overview-machining")).toContainText("No machine plan for this part.");
  await expect(page.getByTestId("overview-cost")).toContainText("None: one setup and no tools to load.");
  await openStep(page, "cost");
  await expect(page.getByTestId("page-cost")).toContainText("None: one setup and no tools to load.");
  await expect(page.getByTestId("cost-total")).toBeHidden();
});

test("test_turning_overview", async ({ page, browser }) => {
  // J7: a turned part's Machining card names the plan's machine, its one setup and its tool loads.
  const shaft = resolve(PARTS, "slender_shaft.step");
  const r = await analysisOf(browser, shaft, "turn", "steel1018");
  await page.goto("/");
  await page.getByTestId("upload-process").selectOption("turn");
  await page.getByTestId("upload-material").selectOption("steel1018");
  await page.getByTestId("upload-file").setInputFiles(shaft);
  const mach = page.getByTestId("overview-machining");
  await expect(mach).toContainText("Lathe with live tooling", { timeout: 60_000 });
  await expect(mach).toContainText("1 setup");
  await expect(mach).toContainText(`${r.tool_changes} tool loads`);
  // Process and material sit in the overview's head once a part is read, keeping the values chosen
  await expect(page.getByTestId("overview").getByTestId("upload-process")).toHaveValue("turn");
  await expect(page.getByTestId("overview").getByTestId("upload-material")).toHaveValue("steel1018");
});

// --- S2: Features rows (J3) ---

async function features(page: Page): Promise<void> {
  await load(page, SAMPLE);
  await openStep(page, "features");
}

test("test_feature_rows", async ({ page, browser }) => {
  // J3 (frame r3-features): chips, 4 rows Fix first, a row's detail stepping through its findings, Passed rows.
  const sample = await sampleOf(browser);
  await features(page);
  await expect(page.getByTestId("chip-issues")).toHaveText("Issues 8");
  await expect(page.getByTestId("chip-passed")).toHaveText("Passed 9");
  await expect(page.getByTestId("chip-all")).toHaveText("All");
  await expect(page.getByTestId("chip-issues")).toHaveAttribute("aria-pressed", "true");
  const rows = page.locator("#rows .srow");
  await expect(rows).toHaveCount(4);
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push(await rows.nth(i).getAttribute("data-testid"));
  expect(ids).toEqual(["row-F4", "row-F1", "row-F3", "row-F8"]);
  const row = page.getByTestId("row-F4");
  for (const text of ["Fix", "Sharp corner ×4", "F4–F7", "Inside corners have no radius. Needs 0.031 in (1/32) or more, or EDM (spark erosion).",
    "Corner radius check · limit is an estimate"]) {
    await expect(row).toContainText(text);
  }
  await expect(page.getByTestId("row-F1")).toContainText("Review");
  await expect(page.getByTestId("row-F1")).toContainText("F1 F2");
  await expect(page.getByTestId("row-F3")).not.toContainText("×"); // one finding: no "×1"
  await expect(page.getByTestId("legend")).toHaveCount(0); // the 7-entry legend is gone (D-014 amended)

  const f4 = sample.findings.find((f: Result) => f.id === "F4");
  const faces = [...new Set<number>(sample.findings.filter((f: Result) => f.rule === "corner_radius").flatMap((f: Result) => f.faces as number[]))].sort((a: number, b: number) => a - b);
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  const detail = page.getByTestId("row-detail");
  await expect(detail).toContainText("F4 · corner-1 · 1 of 4");
  await expect(detail).toContainText("radius 0.000 in, pocket 0.250 in deep");
  await expect(detail).toContainText(`What to do${f4.suggestion}`);
  expect(sortNum(await page.evaluate("window.__dfma.highlightedFaces()") as number[])).toEqual(faces); // all its findings' faces
  await expect(page.locator(".viewer .flag.chosen")).toHaveAttribute("data-id", "F4");
  await page.getByTestId("row-next").click();
  await expect(detail).toContainText("F5 · corner-2 · 2 of 4");
  await expect(page.locator(".viewer .flag.chosen")).toHaveAttribute("data-id", "F5");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate("document.activeElement.dataset.testid")).toBe("row-next"); // focus survives the redraw (APP-02)
  await page.getByTestId("row-prev").click();
  await expect(detail).toContainText("F4 · corner-1 · 1 of 4");
  await expect(page.getByTestId("row-prev")).toBeDisabled();
  // A setup's selection replaces the open row (review finding): back on Features no row is open
  await openStep(page, "machining");
  await page.getByTestId("setup-chip-1").click();
  await openStep(page, "features");
  await expect(page.getByTestId("row-detail")).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.click();
  await page.getByTestId("row-F1").click(); // a Review row labels its advice "What to do" too (D-053)
  await expect(page.getByTestId("row-detail")).toContainText("What to do");

  // A material change keeps the open row and the shown finding
  await page.getByTestId("row-next").click();
  await openStep(page, "part");
  await page.getByTestId("upload-material").selectOption("plastic");
  await expect(page.locator("#status")).toHaveText("Showing report_sample.step.", { timeout: 30_000 });
  await openStep(page, "features");
  await expect(page.getByTestId("row-detail")).toContainText("F2 · hole-2 · 2 of 2");
  await page.getByTestId("row-F1").click(); // tapping the open row again closes it
  await expect(page.getByTestId("row-detail")).toHaveCount(0);
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual([]);

  await page.getByTestId("row-F1").click();
  await page.getByTestId("chip-passed").click(); // the open row is hidden: nothing stays selected unseen
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual([]);
  const walls = page.getByTestId("row-pass-wall-thin_wall");
  await expect(walls).toContainText("OK");
  await expect(walls).toContainText("Walls ×9");
  await expect(walls).toContainText("Thin wall check");
  await walls.click();
  const plastic = await analysisOf(browser, SAMPLE, "mill", "plastic"); // the material changed above
  const wall = plastic.passed.find((p: Result) => p.rule === "thin_wall");
  await expect(page.getByTestId("row-detail")).toContainText(wall.math); // D-023: the math stays
  await expect(page.getByTestId("row-detail").locator("[data-testid^=passed-]")).toHaveCount(9);
  await page.getByTestId(`passed-${wall.feature}`).click(); // one feature alone
  const feature = sample.features.find((f: Result) => f.id === wall.feature);
  expect(sortNum(await page.evaluate("window.__dfma.highlightedFaces()") as number[])).toEqual(sortNum(feature.faces));
  await page.getByTestId("chip-all").click();
  await expect(page.locator("#rows .srow")).toHaveCount(plastic.rows.length + plastic.passed_rows.length);
});

function sortNum(a: number[]): number[] {
  return [...a].sort((x, y) => x - y);
}

test("test_rows_in_view", async ({ page }) => {
  // Goal: on report_sample all 4 rows are in view at 1280 × 900.
  await page.setViewportSize({ width: 1280, height: 900 });
  await features(page);
  const rows = page.locator("#rows .srow");
  await expect(rows).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const box = (await rows.nth(i).boundingBox())!;
    expect(box.y >= 0 && box.y + box.height <= 900, JSON.stringify([i, box])).toBe(true);
  }
});

test("test_show_ok", async ({ page, browser }) => {
  // J3: the Show OK switches sit at the foot of the model on Features only; OK tints only while Features shows.
  const clean = resolve(PARTS, "clean_holes.step");
  await load(page, clean);
  const switches = page.getByTestId("show-ok");
  await expect(switches).toBeHidden();
  expect(await page.evaluate("window.__dfma.checkedFaces()")).toEqual([]);
  await openStep(page, "features");
  await expect(switches).toBeVisible();
  for (const label of ["Holes", "Pockets", "Corners", "Walls"]) await expect(switches).toContainText(label);
  await expect(page.getByTestId("show-checked")).toBeChecked(); // defaults as before: walls off (D-016)
  await expect(page.getByTestId("show-checked-walls")).not.toBeChecked();
  const holes = await analysisOf(browser, clean);
  const holeFaces = sortNum(holes.features.filter((h: Result) => h.kind === "hole").flatMap((h: Result) => h.faces));
  expect(await page.evaluate("window.__dfma.checkedFaces()")).toEqual(holeFaces);
  await openStep(page, "machining");
  await expect(switches).toBeHidden();
  expect(await page.evaluate("window.__dfma.checkedFaces()")).toEqual([]);
});

test("test_change_file_then_back", async ({ page }) => {
  // S1 review: Change file, then the browser's Back, leaves the start form showing and no part on screen.
  await load(page, SAMPLE);
  await openStep(page, "features");
  await openStep(page, "part");
  await page.getByTestId("change-file").click();
  await expect(page.getByTestId("start-form")).toBeVisible();
  await page.goBack();
  await page.waitForTimeout(300);
  await expect(page.getByTestId("start-form")).toBeVisible();
  await expect(page.getByTestId("overview")).toBeHidden();
  await expect(page.getByTestId("page-part")).toBeVisible();
  await expect(page.getByTestId("step-features")).toBeDisabled();
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual([]);
  await page.getByTestId("upload-file").setInputFiles(SAMPLE); // and a part still reads after it
  await expect(page.getByTestId("overview")).toBeVisible({ timeout: 30_000 });
});

// --- S3: Machining (J4, frame r3-mach) ---

test("test_machining", async ({ page, browser }) => {
  // J4: facts, "Why 2", each setup's operations and "Issues here", setup chips over the model.
  const sample = await sampleOf(browser);
  await load(page, SAMPLE);
  const chips = page.getByTestId("setup-chips");
  await expect(chips).toBeHidden();
  await openStep(page, "machining");
  const plan = page.getByTestId("page-machining");
  await expect(plan).toContainText("3-axis mill");
  await expect(plan).toContainText("(the first in each setup counts)");
  await expect(page.getByTestId("plan-why")).toContainText("Why 2 setups:");
  const s2 = page.getByTestId("plan-setup-2");
  await expect(page.getByTestId("plan-setup-1")).toContainText("Setup 1 · from +X");
  const issues1 = page.getByTestId("issues-setup-1"), issues2 = page.getByTestId("issues-setup-2");
  await expect(issues1).toContainText("Review Deep hole ×2 F1 F2");
  await expect(issues1).toContainText("Review Drill size F3");
  await expect(issues2).toContainText("Fix Sharp corner ×4 F4–F7"); // corners sit with their pocket (D-049)
  await expect(issues2).toContainText("Review Deep pocket F8");
  await expect(page.getByTestId("issues-whole-part")).toHaveCount(0);
  await expect(page.getByTestId("issues-no-setup")).toHaveCount(0);
  await expect(plan).not.toContainText("em-0.250"); // no tool codes on screen (D-042)

  await expect(chips).toBeVisible();
  const chip = page.getByTestId("setup-chip-2");
  await expect(chip).toHaveText("Setup 2 · from −X");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(s2).toHaveAttribute("aria-pressed", "true");
  const faces = sortNum([...new Set<number>(sample.operations.filter((o: Result) => o.setup === 1).flatMap((o: Result) => o.faces))]);
  expect(sortNum(await page.evaluate("window.__dfma.highlightedFaces()") as number[])).toEqual(faces);
  await openStep(page, "cost");
  await expect(chips).toBeHidden();
});

test("test_machining_whole_part_and_no_setup", async ({ page }) => {
  // J4: a thin wall sits under "Whole part" (D-049); an angled hole's row under "In no setup".
  await page.goto("/");
  await page.getByTestId("upload-material").selectOption("plastic");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "thin_rib.step"));
  await expect(page.getByTestId("overview")).toBeVisible({ timeout: 30_000 });
  await openStep(page, "machining");
  const whole = page.getByTestId("issues-whole-part");
  await expect(whole).toContainText("Thin wall");
  expect(await whole.evaluate((e) => !!(e.compareDocumentPosition(document.querySelector("[data-testid=plan-setup-1]")!)
    & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true); // "Whole part" comes before the setups
  await openStep(page, "part");
  await page.getByTestId("change-file").click();
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "angled_hole.step"));
  await expect(page.getByTestId("overview")).toBeVisible({ timeout: 30_000 });
  await openStep(page, "machining");
  const none = page.getByTestId("issues-no-setup");
  await expect(none).toContainText("In no setup");
  await expect(none).toContainText("Angled feature");
});
