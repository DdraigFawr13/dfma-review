// P1 S1 (machining spec J1, D-088, D-089): the Machining step's removal lines, worded as the approved P1 mock-up. The
// expected text comes from the engine's own answer for the part (removalLines on window.__dfma.analysis()), not typed in.
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { removalLines } from "../src/removal";
import { load, openStep, PARTS } from "./helpers";

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
  // under Stock, in the plan list's own terms
  await expect(page.locator("#plan dt").nth(2)).toHaveText("Removal");
  await expect(page.locator("#plan dt").nth(3)).toHaveText("Not explained");
  expect(await removal.evaluate((dd) => dd.previousElementSibling?.previousElementSibling?.getAttribute("data-testid"))).toBe("plan-stock");
});
