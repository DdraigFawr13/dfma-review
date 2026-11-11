// J4 in the browser (S5; the Machining step, review-steps S3): the machine, the setups with their tools (names only,
// no tool codes, D-042), and the tool-load count; a feature the access rule flags is listed in no setup.
// Ported from tests/e2e/test_plan_panel.py.
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { PARTS, openStep, shown } from "./helpers";

test("test_plan_panel_two_sided_block", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("plan")).toBeHidden();
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "two_sided_block.step"));
  await shown(page, "two_sided_block.step", "machining");
  await expect(page.getByTestId("plan-machine")).toHaveText("3-axis mill");
  await expect(page.getByTestId("plan-loads")).toHaveText("5 (the first in each setup counts)"); // D-029; frame r3-mach words
  await expect(page.locator("#plan-count")).toHaveText("3 setups");
  await expect(page.getByTestId("plan-setup-1")).toContainText("Setup 1 · from +Z");
  await expect(page.getByTestId("plan-setup-1").locator(".shint")).toHaveText("Show on model ›"); // D-061, both copies
  await expect(page.getByTestId("plan-notrun")).toBeHidden(); // no pocket line in the Python app
  await expect(page.getByTestId("plan-setup-1")).toContainText("1. 1/2 in end mill"); // roughs
  await expect(page.getByTestId("plan-setup-1")).toContainText("2. 1/4 in end mill"); // finishes
  await expect(page.getByTestId("plan-setup-1")).not.toContainText("em-0.500"); // no tool codes on screen
  await page.getByTestId("plan-setup-1").click();
  await expect(page.getByTestId("plan-setup-why-1")).toContainText("1/2 in end mill: roughs it out, the largest at most 75% of its 0.750 in gap.");
  await expect(page.getByTestId("plan-setup-3")).toContainText("Setup 3 · from −X");
  await expect(page.getByTestId("plan-setup-3")).toContainText("0.250 in (1/4) drill");
  await expect(page.getByTestId("plan-setup-3")).toContainText("hole-1");
  await expect(page.getByTestId("plan-not-planned")).toHaveCount(0);
});

test("test_plan_panel_angled_hole", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "angled_hole.step"));
  await shown(page, "angled_hole.step", "machining");
  await expect(page.getByTestId("plan-machine")).toHaveText("4/5-axis mill or fixture");
  await expect(page.getByTestId("plan-loads")).toHaveText("0 (the first in each setup counts)");
  await expect(page.getByTestId("plan-setup-1")).toContainText("Nothing to cut from this side.");
  await expect(page.getByTestId("plan-not-planned")).toContainText("hole-1 (F1)");
  await expect(page.getByTestId("issues-no-setup")).toContainText("Fix Angled feature F1");
  await openStep(page, "features");
  await expect(page.getByTestId("row-F1")).toContainText("needs a 4/5-axis mill or a fixture");
  await expect(page.getByTestId("row-F1")).toContainText("Fix");
});

test("test_setup_card_focus_and_size", async ({ page }) => {
  // D-061 (S3 review): the setup card's focus ring sits inside the card, which clips what overflows it, and its
  // head band is at least 32 px tall, 44 px below 900 px (docs/UI_STYLE.md, audit F16). Both copies.
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "clean_holes.step"));
  await shown(page, "clean_holes.step", "machining");
  const setup = page.getByTestId("plan-setup-1");
  expect((await setup.locator(".shead").boundingBox())!.height).toBeGreaterThanOrEqual(32);
  await setup.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab"); // focus by keyboard, so :focus-visible applies
  const style = await setup.evaluate((e) => [e.matches(":focus-visible"), getComputedStyle(e).outlineStyle, getComputedStyle(e).outlineOffset, getComputedStyle(e).outlineWidth]) as [boolean, string, string, string];
  expect(style[0] && style[1] === "solid", JSON.stringify(style)).toBeTruthy();
  expect(parseFloat(style[2]) + parseFloat(style[3]), JSON.stringify(style)).toBeLessThanOrEqual(0); // drawn inside the card
  await page.setViewportSize({ width: 412, height: 915 });
  expect((await setup.locator(".shead").boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
