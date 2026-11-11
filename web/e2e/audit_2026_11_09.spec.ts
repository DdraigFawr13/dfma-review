// The 2026-11-09 UX audit's fixes in the browser (docs/audit/2026-11-09-ux.md, D-053). Each test is named after the
// finding it closes and asserts the behaviour that finding names; each failed before its fix.
// Ported from tests/e2e/test_audit_2026_11_09.py (S8b).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { PARTS, STEPS, load, openStep } from "./helpers";

const SAMPLE = resolve(PARTS, "report_sample.step");
const INTERNAL = /D-0\d\d|config\/|\(spec\b/g; // decision ids, file names and spec refs (F1)
const BRITISH = /analys(?:e|ed|es|ing)\b|neighbour|millimetre|colour|centre/gi; // F12: American spelling

/** 412 px wide, as the audit's narrow screenshots; `bigText`: 200% text, as a reader's browser setting. */
async function narrow(page: Page, bigText = false): Promise<void> {
  await page.setViewportSize({ width: 412, height: 915 });
  if (bigText) {
    await page.addInitScript(
      "document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; })",
    );
  }
}

async function openCornerRow(page: Page): Promise<void> {
  await openStep(page, "features");
  await page.getByTestId("row-F4").click();
  await expect(page.getByTestId("row-detail")).toBeVisible();
}

async function bodyText(page: Page): Promise<string> {
  return page.evaluate("document.body.innerText") as Promise<string>;
}

/** The text of each page of a jsPDF file (local helper: the repo has no PDF reader for Node; jsPDF writes plain,
 *  uncompressed content streams with one `(text) Tj` per line, in page order, in the Latin-1 standard fonts). */
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

async function exportPdf(page: Page, testInfo: TestInfo): Promise<string[]> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-pdf").click()]);
  const path = testInfo.outputPath("report.pdf");
  await download.saveAs(path);
  return pdfPageTexts(path);
}

// --- wording ---

test("test_f1_f12_no_internal_ids_and_american_spelling_on_screen_or_in_the_pdf", async ({ page }, testInfo) => {
  // F1: no "D-0" or "config/" text anywhere a user reads it; F12: American spelling throughout.
  await page.goto("/");
  const texts = [await bodyText(page)];
  await load(page, SAMPLE);
  for (const name of STEPS) {
    await openStep(page, name);
    if (name === "features") {
      for (const row of await page.locator("#rows .srow").all()) {
        await row.click();
        texts.push(await bodyText(page));
      }
    }
    if (name === "machining") {
      for (const i of [1, 2]) {
        await page.getByTestId(`plan-setup-${i}`).click();
        texts.push(await bodyText(page));
      }
    }
    if (name === "report") {
      await page.getByTestId("report-assumptions").locator("summary").click();
    }
    texts.push(await bodyText(page));
  }
  texts.push(...(await exportPdf(page, testInfo)));
  // A turned part with an inside groove: its setup's reasons (findings.ts named D-026 there)
  await openStep(page, "part");
  await page.getByTestId("upload-process").selectOption("turn");
  await load(page, resolve(PARTS, "shaft_with_groove_and_bore.step"));
  await openStep(page, "machining");
  await page.getByTestId("plan-setup-1").click();
  texts.push(await bodyText(page));
  for (const t of texts) {
    expect(t.match(INTERNAL) ?? []).toEqual([]);
    expect(t.match(BRITISH) ?? []).toEqual([]);
  }
});

test("test_f2_f6_f7_f34_pdf_words_match_the_screen", async ({ page }, testInfo) => {
  // F2: a finding page is headed with its row's short title and check name; F6: "Tool loads" as on screen;
  // F7: "Checks run"; F34: "What to do".
  await load(page, SAMPLE);
  const pages = await exportPdf(page, testInfo);
  expect(pages[0]).toContain("Tool loads: 4 (the first in each setup counts)");
  expect(pages[0]).not.toContain("Tool changes");
  expect(pages[0]).toContain("Checks run: Hole depth check");
  const f1 = pages.slice(1).find((p) => p.startsWith("F1 "))!;
  expect(f1.slice(0, 80), f1.slice(0, 80)).toMatch(/^F1 · REVIEW · Deep hole · Hole depth check/);
  const f4 = pages.slice(1).find((p) => p.startsWith("F4 "))!;
  expect(f4.slice(0, 80), f4.slice(0, 80)).toMatch(/^F4 · FIX · Sharp corner · Corner radius check/);
  expect(f4).toContain("What to do:");
});

test("test_f7_f8_f22_f23_report_and_cost_words", async ({ page }) => {
  // F7 "Checks run"; F8 "Cost drivers" on the heading and the card; F22 points and "tied"; F23 the PDF list split,
  // with Fillets and chamfers, and each check's finding count.
  await load(page, SAMPLE);
  const cost = page.getByTestId("overview-cost");
  await expect(cost).toContainText("7 cost drivers");
  await expect(cost).toContainText("Biggest: distinct tools and sharp or small inside corners, tied at 4.0 points");
  await openStep(page, "cost");
  await expect(page.locator("#cost-title")).toHaveText("Cost drivers");
  await openStep(page, "report");
  const report = page.getByTestId("page-report");
  await expect(report).toContainText("Checks run");
  await expect(report).not.toContainText("Rules run");
  await expect(report).toContainText(/fillets and chamfers/i);
  expect(await report.locator(".block", { hasText: "The PDF holds" }).locator("li").count()).toBeGreaterThanOrEqual(5); // the one-line bullet, split
  const rules = page.getByTestId("report-rules");
  for (const text of ["Corner radius check: 4 findings", "Hole depth check: 2 findings", "Hole size check: 1 finding", "Undercut check: none"]) {
    await expect(rules).toContainText(text);
  }
});

test("test_f34_advice_is_what_to_do_on_both_severities", async ({ page }) => {
  await load(page, SAMPLE);
  await openStep(page, "features");
  for (const row of ["row-F4", "row-F1"]) { // a Fix row, then a Review row
    await page.getByTestId(row).click();
    await expect(page.getByTestId("row-detail").locator("dt").nth(2)).toHaveText("What to do");
  }
});

test("test_f3_error_says_how_to_fix_it_beside_the_file_field", async ({ page }) => {
  // F3: the refused file's message says what to do, sits under the STEP file field and describes it; "try again"
  // shows only when trying again can help (a network error).
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "not_step.step"));
  const error = page.getByTestId("error-message");
  await expect(error).toHaveText("This is not a STEP file this tool can read. Export it again as .step or .stp from your CAD.", { timeout: 30_000 });
  await expect(page.locator("#error-next")).toBeHidden();
  expect(await page.getByTestId("upload-file").getAttribute("aria-describedby")).toBe("error");
  // right under the STEP file field: after it, before the examples and the settings
  expect(
    await page.evaluate(() => { const e = document.getElementById("error")!;
      const step = document.getElementById("start-open")!.closest(".field"), next = document.getElementById("example-field")!;
      return e.previousElementSibling === step && !!(e.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING); }),
  ).toBeTruthy();
  await page.addInitScript("window.__dfmaFakeService = true");
  await page.evaluate("window.__dfmaFakeService = true"); // the page is already open
  await page.route("**/api/analyze", (r) => r.abort());
  await page.getByTestId("upload-file").setInputFiles(SAMPLE);
  await expect(error).not.toContainText("python -m");
  await expect(page.locator("#error-next")).toBeVisible();
  await expect(page.locator("#error-next")).toContainText("try again");
});

// --- layout at narrow widths and 200% text ---

test("test_f4_open_row_detail_fits_at_200_percent_text", async ({ page }) => {
  await narrow(page, true);
  await load(page, SAMPLE);
  await openCornerRow(page);
  const detail = page.getByTestId("row-detail");
  for (const dt of await detail.locator("dt").all()) { // each label fits its text and ends before its value
    expect(await dt.evaluate((e: any) => e.scrollWidth <= e.clientWidth + 1), await dt.innerText()).toBeTruthy();
    expect(await dt.evaluate((e: any) => e.getBoundingClientRect().right <= e.nextElementSibling.getBoundingClientRect().left + 1)).toBeTruthy();
  }
  const prev = (await page.getByTestId("row-prev").boundingBox())!, nxt = (await page.getByTestId("row-next").boundingBox())!;
  expect(Math.abs(prev.y - nxt.y), JSON.stringify([prev, nxt])).toBeLessThan(2); // ‹ and › stay together on one line
});

test("test_f5_cost_labels_keep_their_width_at_200_percent_text", async ({ page }) => {
  await narrow(page, true);
  await load(page, SAMPLE);
  await openStep(page, "cost");
  for (const row of await page.locator(".driver:not(.total)").all()) {
    const label = row.locator("b"), count = row.locator(".num.muted");
    expect((await label.boundingBox())!.width, await label.innerText()).toBeGreaterThanOrEqual(0.8 * (await row.boundingBox())!.width - 30);
    const line = Number(await count.evaluate((e: any) => parseFloat(getComputedStyle(e).lineHeight)));
    expect((await count.boundingBox())!.height, await count.innerText()).toBeLessThan(1.5 * line); // "1 × 1.0" on one line
  }
});

test("test_f17_mark_sits_on_the_title_first_line", async ({ page }) => {
  await narrow(page, true);
  await load(page, SAMPLE);
  await openStep(page, "features");
  for (const row of await page.locator("#rows .srow").all()) {
    const gap = (await row.evaluate((b: any) => { const m = b.querySelector(".mk").getBoundingClientRect();
      const r = document.createRange(); r.selectNodeContents(b.querySelector(".t"));
      const first = r.getClientRects()[0]; return Math.abs((m.top + m.bottom) / 2 - (first.top + first.bottom) / 2); }));
    const line = Number(await row.evaluate((b: any) => parseFloat(getComputedStyle(b.querySelector(".t")).lineHeight)));
    expect(gap, JSON.stringify([await row.getAttribute("data-testid"), gap, line])).toBeLessThan(line / 4);
  }
});

test("test_f18_show_ok_sits_under_the_chips_below_900px", async ({ page }) => {
  await load(page, SAMPLE);
  await openStep(page, "features");
  expect(await page.evaluate("document.querySelector('.viewer').contains(document.getElementById('show-ok'))")).toBeTruthy();
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForFunction(`() => { const s = document.getElementById('show-ok'), c = document.getElementById('row-chips');
    return document.getElementById('page-features').contains(s) && c.nextElementSibling === s; }`); // on the resize event
  await expect(page.getByTestId("show-ok")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 }); // and back beside the model when wide again
  await page.waitForFunction("document.querySelector('.viewer').contains(document.getElementById('show-ok'))");
});

test("test_f20_steps_stay_in_one_row_at_200_percent_text", async ({ page }) => {
  await narrow(page, true);
  await load(page, SAMPLE);
  const tops = await page.locator(".steps .step").evaluateAll((els: any[]) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size, JSON.stringify(tops)).toBe(1);
  expect(await page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")).toBeTruthy();
});

test("test_f21_fix_first_follows_the_cards_with_no_gap", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await load(page, SAMPLE);
  const gap = await page.evaluate(() => { const cards = document.getElementById("overview-cards")!;
    return document.getElementById("fix-first")!.getBoundingClientRect().top - cards.getBoundingClientRect().bottom; });
  expect(Math.abs(gap), String(gap)).toBeLessThan(2);
});

test("test_f16_small_targets_are_44px_below_900px", async ({ page }) => {
  await narrow(page);
  await load(page, SAMPLE);
  await openCornerRow(page);
  for (const sel of ['[data-testid="row-prev"]', '[data-testid="row-next"]', ".chip"]) {
    const hs = await page.locator(sel).evaluateAll((els: any[]) => els.filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().height));
    for (const h of hs) expect(h, JSON.stringify([sel, h])).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId("chip-passed").click();
  await page.locator("#rows .srow").first().click();
  const hs = await page.locator(".pfeat").evaluateAll((els: any[]) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of hs) expect(h, String(h)).toBeGreaterThanOrEqual(44);
});

test("test_f14_passed_feature_states_its_measurement_once", async ({ page }) => {
  await load(page, SAMPLE);
  await openStep(page, "features");
  await page.getByTestId("chip-passed").click();
  await page.getByTestId("row-pass-wall-thin_wall").click();
  const text = await page.getByTestId("passed-wall-1").innerText();
  expect(text.split("4.000 in thick").length - 1, text).toBe(1);
  expect(text, text).not.toContain("4.0000"); // the math in the same decimals as its line
});

// --- ARIA and keyboard ---

test("test_f15_rows_announce_one_state_and_point_at_their_detail", async ({ page }) => {
  await load(page, SAMPLE);
  await openStep(page, "features");
  const row = page.getByTestId("row-F4");
  expect(await row.getAttribute("aria-pressed")).toBeNull();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  const target = await row.getAttribute("aria-controls");
  expect(target && (await page.locator(`#${target}`).getAttribute("data-testid")) === "row-detail").toBeTruthy();
});

test("test_f19_disabled_steps_say_why_and_take_focus", async ({ page }) => {
  await page.goto("/");
  const tab = page.getByTestId("step-features");
  await expect(tab).toHaveAttribute("aria-disabled", "true");
  expect(await tab.getAttribute("disabled")).toBeNull(); // reachable by Tab, so its reason can be read
  await expect(tab).toHaveAccessibleDescription(/Read a STEP file to open steps 2 to 5/);
  await tab.focus(); // Tab reaches it; a click (Playwright won't click an aria-disabled element) does nothing
  await tab.dispatchEvent("click");
  await expect(page.getByTestId("page-part")).toBeVisible();
  await expect(page.getByTestId("page-features")).toBeHidden();
  await load(page, SAMPLE);
  expect([null, "false"]).toContain(await tab.getAttribute("aria-disabled"));
});

test("test_f24_card_heading_is_the_link", async ({ page }) => {
  await load(page, SAMPLE);
  await expect(page.getByTestId("overview")).not.toContainText("Open ›");
  const link = page.getByTestId("overview-machining").locator("h3 button");
  await expect(link).toHaveAttribute("data-testid", "open-machining");
  await expect(link).toHaveAccessibleName(/3 · Machining/);
  await link.click();
  await expect(page.getByTestId("page-machining")).toBeVisible();
});

test("test_f28_canvas_is_labelled_and_the_hint_names_the_keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("viewer-canvas")).toHaveAttribute("aria-label", /3D model/);
  await expect(page.locator(".viewfoot .hint")).toContainText("Tab to the model for keys."); // the words of UI fixes A8
});

// --- Machining and the pins ---

test("test_f26_every_pin_carries_its_mark", async ({ page }) => {
  await load(page, SAMPLE);
  await openStep(page, "features");
  await page.waitForFunction("window.__dfma.flagBoxes().length >= 1", undefined, { timeout: 30_000 });
  for (const pin of await page.locator(".viewer .flag:not([hidden])").all()) {
    const sev = await pin.getAttribute("data-sev");
    const mark = pin.locator(".mk");
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText(sev === "high" ? "▲" : "◆");
  }
});

test("test_f27_pins_clear_each_others_stems_and_issues_open_their_row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await load(page, SAMPLE);
  await openStep(page, "machining");
  await page.waitForFunction("window.__dfma.flagBoxes().length >= 1", undefined, { timeout: 30_000 });
  // the camera settles after a step change: wait until the pins stop moving, then read both in one frame
  await page.waitForFunction(
    `() => { const now = JSON.stringify(window.__dfma.flagBoxes());
      const same = now === window.__lastPins; window.__lastPins = now; return same; }`,
    undefined,
    { polling: 250, timeout: 10_000 },
  );
  type Box = { id: string; x: number; y: number; w: number; h: number };
  const [feet, boxes] = (await page.evaluate("[window.__dfma.pinFootprints(), window.__dfma.flagBoxes()]")) as [Box[], Box[]]; // pins with stems and dots
  const hit: [string, string][] = [];
  for (const f of feet) {
    for (const b of boxes) {
      if (f.id !== b.id && f.x < b.x + b.w && b.x < f.x + f.w && f.y < b.y + b.h && b.y < f.y + f.h) hit.push([f.id, b.id]);
    }
  }
  expect(hit, JSON.stringify([feet, boxes])).toEqual([]);
  const line = page.getByTestId("issues-setup-2").getByRole("button", { name: /Sharp corner/ });
  await line.click();
  await expect(page.getByTestId("page-features")).toBeVisible();
  await expect(page.getByTestId("row-F4")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("row-F4")).toBeFocused(); // the keyboard lands on the opened row
});

test("test_f29_f31_f32_machining_lines_at_200_percent_text", async ({ page }) => {
  await narrow(page, true);
  await load(page, SAMPLE);
  await openStep(page, "machining");
  await expect(page.getByTestId("plan-stock")).toHaveText("2.500 × 4.000 × 2.000 in block (part size, no allowance)");
  const why = page.getByTestId("plan-why");
  await expect(why.locator("b")).toHaveText("Why 2 setups:");
  expect(await why.evaluate((w: any) => w.querySelector("b").getBoundingClientRect().bottom <= w.querySelector(".wtext").getBoundingClientRect().top + 1)).toBeTruthy();
  const issues = page.getByTestId("issues-setup-2");
  const tops = await issues.locator(".placed").evaluateAll((els: any[]) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size, JSON.stringify(tops)).toBe(tops.length); // each issue on its own line
  const rng = issues.locator(".placed .num", { hasText: "F4–F7" });
  expect(await rng.evaluate((e: any) => e.getClientRects().length)).toBe(1);
  const line = Number(await rng.evaluate((e: any) => parseFloat(getComputedStyle(e).lineHeight)));
  expect((await rng.boundingBox())!.height).toBeLessThan(1.5 * line); // "F4–F7" never breaks after its dash
});

test("test_f30_operation_names_get_the_line", async ({ page }) => {
  await narrow(page, true);
  await load(page, SAMPLE);
  await openStep(page, "machining");
  for (const op of await page.locator(".plan .op").all()) { // a name that wraps has the whole line, not a column beside the ids
    const name = op.locator("span").first();
    const line = Number(await name.evaluate((e: any) => parseFloat(getComputedStyle(e).lineHeight)));
    const box = (await name.boundingBox())!;
    const oneLine = box.height < 1.5 * line;
    expect(oneLine || box.width >= 0.95 * (await op.boundingBox())!.width, await name.innerText()).toBeTruthy();
  }
});

test("test_f33_setup_chips_sit_above_the_model_below_900px", async ({ page }) => {
  await narrow(page);
  await load(page, SAMPLE);
  await openStep(page, "machining");
  const chips = (await page.getByTestId("setup-chips").boundingBox())!, canvas = (await page.getByTestId("viewer-canvas").boundingBox())!;
  expect(chips.y + chips.height, JSON.stringify([chips, canvas])).toBeLessThanOrEqual(canvas.y + 1);
});
