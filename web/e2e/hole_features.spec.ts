// I2 S1 J1 in the browser: the Hole features panel (D-040, mockups/hole-features-panel.html), answered with the
// CTC 04 and STC 10 fixtures through page.route (lined up by the test harness; the app refuses NIST pairs).
// Ported from tests/e2e/test_hole_features.py.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PARTS, openStep } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */
const FIXTURES = resolve(PARTS, "..", "inventor", "fixtures");
const CTC04: [string, string] = ["nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt"];
const STC10: [string, string] = ["nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt"];

const fixture = (name: string): any => JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), "utf8"));

/** Fake the service's /api/analyze (the test build's flag, as the Python conftest set it), then open the page. */
async function fakeAnalyze(page: Page, result: any): Promise<void> {
  await page.addInitScript("window.__dfmaFakeService = true");
  await page.route("**/api/analyze", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) }));
}

async function openPair(page: Page, result: any, names: [string, string]): Promise<void> {
  await fakeAnalyze(page, result);
  await page.goto("/");
  const file = (name: string) => ({ name, mimeType: "application/octet-stream", buffer: Buffer.from("placeholder") });
  await page.getByTestId("upload-file").setInputFiles([file(names[0]), file(names[1])]); // the one picker (UI fixes B2)
  await expect(page.locator("#status")).toHaveText(`Showing ${result.part.name} with ${names[1]}.`);
  await openStep(page, "features"); // the .ipt panels are groups in the Features step (review-steps J6)
}

test("test_panel", async ({ page }) => {
  const result = fixture("ctc_04");
  await openPair(page, result, CTC04);
  const panel = page.getByTestId("hole-features-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("open", ""); // opens: holes disagree (D-040)
  await expect(page.locator("#hole-features-count")).toHaveText("9");
  // The counts sit on the group's row (D-049)
  await expect(page.locator("#hole-features-tally")).toHaveText("9 Hole features, 54 holes: disagree 13 · not mapped 1 · matched 40");
  const rows = page.getByTestId("hole-feature-row");
  await expect(rows).toHaveCount(9);
  const big = rows.nth(6);
  await expect(big).toContainText("disagrees");
  await expect(big).toContainText("Countersink · 30 holes");
  await expect(big).toContainText("Ø0.551 in [14 mm] through · countersink Ø0.787 in [20 mm] × 90° (as designed in the .ipt)");
  await expect(big).toContainText("26 matched, 4 disagree, 0 not mapped");
  await expect(page.getByTestId("hole-feature-hole")).toHaveCount(0); // folded until tapped
  // Tapping a feature selects all its mapped holes and unfolds its disagreeing ones
  const feat = result.inventor.hole_features.find((f: any) => f.id === "hf-7");
  const byId = Object.fromEntries(result.features.map((f: any) => [f.id, f]));
  const faces = [...new Set<number>(feat.holes.filter((h: any) => h.hole).flatMap((h: any) => byId[h.hole].faces))].sort((a, b) => a - b);
  await big.click();
  await expect(big).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual(faces);
  const holes = page.getByTestId("hole-feature-hole");
  await expect(holes).toHaveCount(4);
  const first = feat.holes.find((h: any) => h.state === "disagrees");
  expect(first.gaps[0].text.endsWith("mm] off the hole's axis")).toBeTruthy(); // 0.25-0.26 mm: NIST's two files differ
  await expect(holes.first()).toContainText(`${first.gaps[0].text} · finding F35`);
  // Tapping a hole selects it alone
  const one = feat.holes.find((h: any) => h.state === "disagrees");
  await holes.first().click();
  await expect(holes.first()).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual([...byId[one.hole].faces].sort((a: number, b: number) => a - b));
  // A feature with no mapped hole still unfolds, to show its hole's reason as plain text (never a finding)
  await expect(rows.nth(7)).toContainText("not mapped");
  await rows.nth(7).click();
  const lone = page.getByTestId("hole-feature-hole");
  await expect(lone).toHaveCount(1);
  expect(await lone.first().evaluate((e) => e.tagName)).toBe("DIV");
  await expect(lone.first()).toContainText("Not mapped: no hole on this axis. Our limit, not a finding.");
});

test("test_panel_hidden_without_ipt", async ({ page }) => {
  const result = fixture("ctc_04");
  delete result.inventor;
  await fakeAnalyze(page, result);
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles({ name: CTC04[0], mimeType: "application/octet-stream", buffer: Buffer.from("placeholder") });
  await expect(page.locator("#status")).toHaveText(`Showing ${result.part.name}.`);
  await openStep(page, "features");
  await expect(page.getByTestId("hole-features-panel")).toBeHidden();
});

test("test_names", async ({ page }) => {
  // I2 S2: CTC 04's Hole features and threads show their Inventor names in small print (rank rule).
  const result = fixture("ctc_04");
  await openPair(page, result, CTC04);
  const rows = page.getByTestId("hole-feature-row");
  const names = ["Hole8", "Hole10", "Hole11", "Hole12", "Hole13", "Hole19", "Hole20", "Hole21", "Hole22"];
  for (const [i, n] of names.entries()) await expect(rows.nth(i).locator(".fname")).toHaveText(n);
  await expect(page.getByTestId("hole-features-panel")).not.toContainText("in the browser");
  const threads = page.getByTestId("thread-row");
  await expect(threads.first().locator(".fname")).toHaveText("Hole8");
});

test("test_no_names_and_copies", async ({ page }) => {
  // I2 S2: STC 10 has 11 Hole names for 9 features read, so no names; its first feature has 2 copied holes.
  const result = fixture("stc_10");
  await openPair(page, result, STC10);
  const panel = page.getByTestId("hole-features-panel");
  await expect(panel).toContainText("11 Hole features in the browser, 9 read.");
  await expect(panel.locator(".fname")).toHaveCount(0);
  await expect(page.getByTestId("threads-panel").locator(".fname")).toHaveCount(0);
  await expect(page.getByTestId("hole-feature-row").first()).toContainText("4 holes: 2 drawn, 2 copied by 1 pattern or mirror feature");
});
