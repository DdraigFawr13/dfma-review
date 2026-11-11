// D-023 in the browser, moved to the Features rows (review-steps S2, frame r3-passed): the Passed chip groups the
// features with no finding by kind and check; an open passed row shows each feature's math and a feature selects its
// faces. A setup in the Machining step selects its features and shows why. Ported from tests/e2e/test_passed_and_setups.py.
// The Python test read a feature's faces from dfma.analyze; here the page's own result (window.__dfma.analysis(),
// the same engine) is read once the part is shown.
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PARTS, openStep, reanalysis, shown } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
const highlighted = (page: Page) => page.evaluate("window.__dfma.highlightedFaces()");

/** The feature of `kind` (or id) in the result on screen. */
async function featureOf(page: Page, match: { id?: string; kind?: string }): Promise<any> {
  const result: any = await page.evaluate("window.__dfma.analysis()");
  return result.features.find((f: any) => (match.id ? f.id === match.id : f.kind === match.kind));
}

test("test_passed_list", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "clean_one_setup.step"));
  await shown(page, "clean_one_setup.step");
  const hole = await featureOf(page, { id: "hole-2" });
  await expect(page.getByTestId("chip-passed")).toHaveText("Passed 16"); // 16 features, as before
  await expect(page.getByTestId("chip-issues")).toHaveAttribute("aria-pressed", "true"); // issues first
  await expect(page.getByTestId("passed-hole-2")).toHaveCount(0); // passed rows wait behind their chip
  await page.getByTestId("chip-passed").click();
  const holes = page.getByTestId("row-pass-hole-hole_depth");
  await expect(holes).toContainText("Holes ×");
  await expect(holes).toContainText("Hole depth check");
  await holes.click();
  const row = page.getByTestId("passed-hole-2");
  await expect(row).toContainText("hole-2 · 0.250 in (1/4) diameter, 0.500 in deep"); // what the feature is (D-023)
  await expect(row).toContainText("✓ Depth 2.0× diameter, at most 6.0×");
  await expect(row.locator(".pmath")).toContainText("0.500 in deep ÷ 0.250 in diameter = 2.00× ≤ 6.0× · limit is an estimate");
  await row.click();
  await expect(page.getByTestId("passed-hole-2")).toHaveAttribute("aria-pressed", "true");
  expect(await highlighted(page)).toEqual(sorted(hole.faces));
  // A material change re-analyses the same file: the chip, the open row and the selection are kept.
  await openStep(page, "part"); // process and material sit in the overview once a part is read
  const worker = reanalysis(page);
  await page.selectOption("#material", "plastic");
  await worker;
  await expect(page.locator("#status")).toHaveText("Showing clean_one_setup.step.", { timeout: 30_000 });
  await openStep(page, "features");
  await expect(page.getByTestId("chip-passed")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("passed-hole-2")).toHaveAttribute("aria-pressed", "true");
  expect(await highlighted(page)).toEqual(sorted(hole.faces));
  await page.getByTestId("passed-hole-2").click(); // again: back to the whole row
  await expect(page.getByTestId("passed-hole-2")).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("row-pass-hole-hole_depth").click(); // the open row again: closes it, clears the selection
  expect(await highlighted(page)).toEqual([]);
  await expect(page.getByTestId("passed-hole-2")).toHaveCount(0);
  // A new file starts on its issues again, no row open (D-023: passed detail folded by default).
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "two_sided_block.step"));
  await expect(page.getByTestId("chip-passed")).toHaveText("Passed 25", { timeout: 30_000 });
  await expect(page.getByTestId("chip-issues")).toHaveAttribute("aria-pressed", "true");
});

test("test_passed_open_at_200_percent_text_has_no_sideways_scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "clean_one_setup.step"));
  await shown(page, "clean_one_setup.step");
  await page.getByTestId("chip-passed").click();
  await page.getByTestId("row-pass-hole-hole_depth").click();
  await page.getByTestId("passed-hole-2").click();
  expect(await page.evaluate("document.documentElement.scrollWidth") as number).toBeLessThanOrEqual(1280);
  await openStep(page, "machining");
  await page.getByTestId("plan-setup-1").click();
  expect(await page.evaluate("document.documentElement.scrollWidth") as number).toBeLessThanOrEqual(1280);
});

test("test_setup_select_shows_why", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "two_sided_block.step"));
  await shown(page, "two_sided_block.step", "machining");
  const hole = await featureOf(page, { kind: "hole" });
  await expect(page.getByTestId("plan-why")).toContainText("The fewest directions that reach them all: +Z, −Z, −X.");
  await page.getByTestId("plan-setup-3").click();
  await expect(page.getByTestId("plan-setup-why-3")).toContainText("hole-1 opens −X. 0.250 in (1/4) drill: matches its 0.250 in diameter.");
  expect(await highlighted(page)).toEqual(sorted(hole.faces));
  await page.getByTestId("plan-setup-3").click(); // again: clears it
  expect(await highlighted(page)).toEqual([]);
});

test("test_setup_select_lights_the_countersink", async ({ page }) => {
  // Morgan, 2026-11-08: the setup also selects the countersink surface it cuts.
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "countersunk_hole.step"));
  await shown(page, "countersunk_hole.step", "machining");
  const hole = await featureOf(page, { kind: "hole" });
  await expect(page.getByTestId("plan-setup-1")).toBeVisible();
  await page.getByTestId("plan-setup-1").click();
  expect(await highlighted(page)).toEqual(sorted([...hole.faces, ...hole.countersink_faces]));
});
