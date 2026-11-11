// I3 S3 J5 in the browser: the Fillets and chamfers panel (D-043, mockups/blends-panel.html), answered with the
// CTC 04 and STC 10 fixtures through page.route (lined up by the test harness; the app refuses NIST pairs).
// Ported from tests/e2e/test_blends.py.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PARTS, openStep } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */
const FIXTURES = resolve(PARTS, "..", "inventor", "fixtures");
const CTC04: [string, string] = ["nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt"];
const STC10: [string, string] = ["nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt"];

const fixture = (name: string): any => JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), "utf8"));
const placeholder = (name: string) => ({ name, mimeType: "application/octet-stream", buffer: Buffer.from("placeholder") });

/** Fake the service's /api/analyze (the test build's flag, as conftest set it), then open the page. */
async function fakeAnalyze(page: Page, result: any): Promise<void> {
  await page.addInitScript("window.__dfmaFakeService = true");
  await page.route("**/api/analyze", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) }));
}

async function openPair(page: Page, result: any, names: [string, string]): Promise<void> {
  await fakeAnalyze(page, result);
  await page.goto("/");
  await page.getByTestId("upload-ipt").setInputFiles(placeholder(names[1]));
  await page.getByTestId("upload-file").setInputFiles(placeholder(names[0]));
  await expect(page.locator("#status")).toHaveText(`Showing ${result.part.name} with ${names[1]}.`);
  await openStep(page, "features"); // the .ipt panels are groups in the Features step (review-steps J6)
}

test("test_panel", async ({ page }) => {
  // CTC 04: 7 fillets and 1 chamfer, all matched, so the panel starts folded; tapping a row selects its faces.
  const result = fixture("ctc_04");
  await openPair(page, result, CTC04);
  const panel = page.getByTestId("blends-panel");
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute("open", ""); // all matched (D-043)
  await expect(page.locator("#blends-count")).toHaveText("8");
  await page.locator("#blends-panel > summary").click();
  // The counts sit on the group's row (D-049); the panel keeps what the row can't hold
  await expect(page.locator("#blends-tally")).toHaveText("7 fillets, 1 chamfer: matched 8");
  await expect(panel).toContainText("Sizes as designed in the .ipt. Tap one to show its faces.");
  const rows = page.getByTestId("blend-row");
  await expect(rows).toHaveCount(8);
  await expect(rows.nth(1)).toContainText("Chamfer · 0.197 in [5 mm] × 0.197 in [5 mm], 90°");
  await expect(rows.nth(1)).toContainText("12 of 24 faces found in the STEP");
  const last = rows.nth(7);
  await expect(last).toContainText("Fillet · R0.197 in [5 mm]");
  await expect(last).toContainText("32 of 36 faces found in the STEP · copied by 1 pattern or mirror feature");
  const blend = result.inventor.blends[7];
  await last.click();
  await expect(last).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual([...blend.step_faces].sort((a: number, b: number) => a - b));
  await last.click(); // tapping again clears it
  await expect(last).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual([]);
});

test("test_panel_opens_for_not_mapped", async ({ page }) => {
  // STC 10: the 0.15 mm fillet has no STEP face at its place: the panel opens by itself and says why, as plain
  // text (never a finding); the row can't be tapped.
  const result = fixture("stc_10");
  await openPair(page, result, STC10);
  const panel = page.getByTestId("blends-panel");
  await expect(panel).toHaveAttribute("open", "");
  const rows = page.getByTestId("blend-row");
  await expect(rows).toHaveCount(4);
  const lone = rows.nth(2);
  await expect(lone).toContainText("not mapped");
  await expect(lone).toContainText("Not mapped: no STEP face of its shape at its place. Our limit, not a finding.");
  expect(await lone.evaluate((e) => e.tagName)).toBe("DIV");
  expect(result.findings.filter((f: any) => f.rule === "blend_mismatch")).toEqual([]);
});

test("test_panel_hidden_without_ipt", async ({ page }) => {
  const result = fixture("ctc_04");
  delete result.inventor;
  await fakeAnalyze(page, result);
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(placeholder(CTC04[0]));
  await expect(page.locator("#status")).toHaveText(`Showing ${result.part.name}.`);
  await openStep(page, "features");
  await expect(page.getByTestId("blends-panel")).toBeHidden();
});
