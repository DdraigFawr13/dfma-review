// P1 S1 (machining spec J1, D-088, D-089): the Machining step's removal lines, worded as the approved P1 mock-up. The
// expected text comes from the engine's own answer for the part (removalLines on window.__dfma.analysis()), not typed in.
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { removalLines, typedStock } from "../src/removal";
import { load, openStep, PARTS, shown } from "./helpers";

test("removal lines", async ({ page }) => {
  await load(page, resolve(PARTS, "clean_pocket.step"));
  await openStep(page, "machining");
  const result = await page.evaluate(() => window.__dfma.analysis());
  const lines = removalLines(result as never);
  expect(lines.map(([term]) => term)).toEqual(["Removal", "Not explained"]);
  const removal = page.getByTestId("plan-removal");
  const unexplained = page.getByTestId("plan-unexplained");
  await expect(removal).toHaveText(lines[0][1]);
  await expect(unexplained).toHaveText(lines[1][1]);
  // under Stock and Your stock (P1 S2), in the plan list's own terms
  await expect(page.locator("#plan dt").nth(2)).toHaveText("Your stock");
  await expect(page.locator("#plan dt").nth(3)).toHaveText("Removal");
  await expect(page.locator("#plan dt").nth(4)).toHaveText("Not explained");
  expect(await removal.evaluate((dd) => dd.previousElementSibling?.previousElementSibling?.getAttribute("data-testid"))).toBe("plan-your-stock");
});

// P1 S2 (machining spec J2, D-089): the ghost stock box, on Machining only, beside the view buttons, hidden in the
// Machine view; on by default.
test("ghost stock", async ({ page }) => {
  await load(page, resolve(PARTS, "clean_pocket.step"));
  const toggle = page.getByTestId("stock-toggle");
  await expect(toggle).toBeHidden(); // the Part step: no button, no box
  expect((await page.evaluate(() => window.__dfma.stock())).shown).toBe(false);
  await openStep(page, "machining");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const result = await page.evaluate(() => window.__dfma.analysis());
  const sides = (result as { stock: { size_in: number[] } }).stock.size_in.map((v) => v * 25.4);
  const on = await page.evaluate(() => window.__dfma.stock());
  expect(on.shown).toBe(true);
  on.size_mm.forEach((v, k) => expect(v).toBeCloseTo(sides[k], 2));
  // centred on the part (a box with no allowance has the part's own bounds)
  const part = await page.evaluate(() => window.__dfma.part());
  on.center.forEach((v, k) => expect(v).toBeCloseTo(part.center[k], 2));
  // the PDF picture is taken without the box, and the box comes back after it
  await Promise.all([page.waitForEvent("download"), page.getByTestId("export-pdf").click()]);
  expect((await page.evaluate(() => window.__dfma.stock())).shown).toBe(true);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect((await page.evaluate(() => window.__dfma.stock())).shown).toBe(false);
  await toggle.click();
  expect((await page.evaluate(() => window.__dfma.stock())).shown).toBe(true);
  // the Machine view hides the button with the view buttons, and the box with it
  await page.getByTestId("mode-machine").check();
  await expect(toggle).toBeHidden();
  expect((await page.evaluate(() => window.__dfma.stock())).shown).toBe(false);
  await page.locator("#mode-part").check();
  expect((await page.evaluate(() => window.__dfma.stock())).shown).toBe(true);
  // another step: no box
  await openStep(page, "features");
  expect((await page.evaluate(() => window.__dfma.stock())).shown).toBe(false);
});

test("typed stock", async ({ page }) => {
  await load(page, resolve(PARTS, "clean_pocket.step"));
  await openStep(page, "machining");
  const result = (await page.evaluate(() => window.__dfma.analysis())) as never;
  const before = await page.getByTestId("plan-removal").textContent();
  const raw = ["3.25", "2.25", "1.125"];
  for (const [k, v] of raw.entries()) await page.getByTestId(`stock-size-${k + 1}`).fill(v);
  await page.getByTestId("stock-apply").click();
  const typed = (typedStock(result, raw) as { typed: [number, number, number] }).typed;
  const lines = removalLines(result, typed);
  expect(lines.map(([t]) => t)).toEqual(["Removal", "Not explained", "Facing Z", "Facing X", "Facing Y"]);
  // the approved mock-up's numbers for this part (mockups/p1-removal/facts.txt): typed in, not derived
  expect(typed).toEqual([2.25, 3.25, 1.125]); // clean_pocket is 2 × 3 × 1 in along its frame
  await expect(page.getByTestId("plan-removal")).toHaveText("3.02 in³ (49,470 mm³): your 2.250 × 3.250 × 1.125 in block minus the part");
  await expect(page.getByTestId("plan-facing-z")).toHaveText("0.0625 in per side, 0.91 in³ in the two layers");
  await expect(page.getByTestId("plan-facing-x")).toHaveText("0.1250 in per side, 0.81 in³ in the two layers");
  await expect(page.getByTestId("plan-facing-y")).toHaveText("0.1250 in per side, 0.50 in³ in the two layers");
  await expect(page.getByTestId("plan-removal")).toHaveText(lines[0][1]);
  await expect(page.getByTestId("plan-unexplained")).toHaveText(lines[1][1]);
  for (const [i, axis] of ["z", "x", "y"].entries()) await expect(page.getByTestId(`plan-facing-${axis}`)).toHaveText(lines[2 + i][1]);
  expect(await page.getByTestId("plan-removal").textContent()).not.toBe(before);
  const box = await page.evaluate(() => window.__dfma.stock());
  box.size_mm.forEach((v, k) => expect(v).toBeCloseTo(typed[k] * 25.4, 2));
  const before0 = await page.evaluate(() => window.__dfma.part());
  box.center.forEach((v, k) => expect(v).toBeCloseTo(before0.center[k], 2)); // your stock centred too (R6)
  // the fields keep what was typed when the plan list redraws (a setup picked)
  await page.getByTestId("plan-setup-1").click();
  await expect(page.getByTestId("stock-size-1")).toHaveValue("3.25");
  await expect(page.getByTestId("plan-facing-z")).toHaveText(lines[2][1]);

  // typed but not applied survives a redraw too
  await page.getByTestId("stock-size-2").fill("2.5");
  await page.getByTestId("plan-setup-1").click();
  await expect(page.getByTestId("stock-size-2")).toHaveValue("2.5");
  await expect(page.getByTestId("plan-facing-z")).toHaveText(lines[2][1]); // not applied: the lines stay
  await page.getByTestId("stock-size-2").fill("2.25");

  // too small: a line names it, and nothing else changes
  await page.getByTestId("stock-size-3").fill("0.9");
  await page.getByTestId("stock-apply").click();
  await expect(page.getByTestId("stock-error")).toHaveText("Your 0.900 in is smaller than the part's 1.000 in.");
  await expect(page.getByTestId("plan-removal")).toHaveText(lines[0][1]);
  expect((await page.evaluate(() => window.__dfma.stock())).size_mm[0]).toBeCloseTo(typed[0] * 25.4, 2);
  // a bad size; Enter applies too
  await page.getByTestId("stock-size-3").fill("0");
  await page.getByTestId("stock-size-3").press("Enter");
  await expect(page.getByTestId("stock-error")).toHaveText("Type three sizes over 0 in.");

  // another part opened in the same page: the typed stock goes (D-089)
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "pocket_sharp.step"));
  await shown(page, "pocket_sharp.step", "machining");
  const other = removalLines((await page.evaluate(() => window.__dfma.analysis())) as never);
  await expect(page.getByTestId("plan-removal")).toHaveText(other[0][1]);
  await expect(page.getByTestId("stock-size-1")).toHaveValue("");
  await expect(page.getByTestId("stock-error")).toHaveCount(0);
  await expect(page.getByTestId("plan-facing-z")).toHaveCount(0);
});
