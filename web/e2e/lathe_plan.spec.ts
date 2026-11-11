// J5 in the browser (S6): a shaft reviewed for turning shows the turning axis, "lathe with live tooling", one
// lathe setup that lights every face its tools cut, the two turning findings and the Passed rows; the same part
// for milling plans only the cross hole (Morgan's comparison). D-023: the Passed list and selectable setups apply
// to turned parts too. Ported from tests/e2e/test_lathe_plan.py (S8b).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { PARTS, openStep, shown } from "./helpers";

/** The Python answer for a part: the frozen key (tests/parity/key, S8a), which stands in for `analyze`. */
function analyze(name: string): any {
  const file = resolve(PARTS, "../parity/key", `tests__parts__${name}.json.gz`);
  if (!existsSync(file)) throw new Error(`${file} is missing from the frozen key: run python tests/parity/key.py --freeze`);
  return JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
}

async function upload(page: Page, name: string, process: string, material = "steel1018", step = "machining"): Promise<void> {
  await page.goto("/");
  await page.getByTestId("upload-process").selectOption(process);
  await page.getByTestId("upload-material").selectOption(material);
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, name));
  await shown(page, name, step);
}

test("test_slender_shaft_on_the_lathe", async ({ page }) => {
  const r = analyze("slender_shaft.step");
  await upload(page, "slender_shaft.step", "turn");
  await expect(page.getByTestId("plan-machine")).toHaveText("lathe with live tooling", { timeout: 30_000 });
  await expect(page.getByTestId("plan-turn-axis")).toHaveText("along −Z of the part");
  await expect(page.getByTestId("plan-stock")).toHaveText("0.500 in round bar, 4.500 in long (part size, no allowance)");
  await expect(page.locator("#plan-count")).toHaveText("1 setup");
  await expect(page.getByTestId("overview-features")).toContainText("1 turned profile, 1 hole and 1 wall checked");
  await expect(page.getByTestId("plan-loads")).toHaveText("3 (the first in each setup counts)"); // frame r3-mach words
  await expect(page.getByTestId("plan-why")).toHaveText(
    "Why 1 setup:Turned in one setup about its axis. Off the axis, cut with live tooling (driven tools on the lathe): hole-1.",
  );
  // S3: the setup chip over the model reads setupHead's words (spec Builder defaults)
  await expect(page.getByTestId("setup-chip-1")).toHaveText("Setup 1 · on the lathe");
  const issues = page.getByTestId("issues-setup-1"); // the slender part and the cross hole sit in the lathe setup
  await expect(issues).toContainText("Fix Slender part F1");
  await expect(issues).toContainText("Review Off the turning axis F2");
  const setup = page.getByTestId("plan-setup-1");
  await expect(setup).toContainText("Setup 1 · on the lathe, about the turning axis");
  await expect(setup).toContainText("Rough turning tool");
  await expect(setup).toContainText("0.125 in (1/8) drill");
  await expect(setup).not.toContainText("turn-rough"); // no tool codes on screen (D-042)
  await setup.click();
  const why = await page.getByTestId("plan-setup-why-1").innerText();
  // In the order the operations run (Morgan, 2026-11-08): 1. turn the outside, 2. drill the cross hole
  expect(
    why.indexOf("1. profile-1 is the turned outside") < why.indexOf("2. profile-1 is the turned outside") &&
      why.indexOf("2. profile-1 is the turned outside") < why.indexOf("3. hole-1 is off the turning axis: live tooling."),
    why,
  ).toBeTruthy();
  await expect(setup).toContainText("1. Rough turning tool");
  await expect(setup).toContainText("2. Finish turning tool");
  await expect(setup).toContainText("3. 0.125 in (1/8) drill");
  await expect(page.getByTestId("plan-setup-why-1")).toContainText(
    "profile-1 is the turned outside. Rough turning tool: turns the 0.500 in outside and faces the ends",
  );
  const cut = [...new Set<number>(r.operations.flatMap((o: any) => o.faces as number[]))].sort((a, b) => a - b);
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual(cut);
  await openStep(page, "features");
  await expect(page.getByTestId("row-F1")).toContainText("Length 9.0× diameter (limit 8.0×)");
  await page.getByTestId("row-F1").click();
  await expect(page.getByTestId("row-detail")).toContainText("F1 · profile-1 · 1 of 1");
  await expect(page.getByTestId("row-detail")).toContainText("0.500 in (1/2) diameter, 4.500 in long");
  await expect(page.getByTestId("row-F2")).toContainText("Hole not on the turning axis: needs a milling operation or live tooling");
  await page.getByTestId("row-F2").click();
  await expect(page.getByTestId("row-detail")).toContainText("90.0° to the turning axis. Cut it with live tooling");
  await expect(page.getByTestId("chip-passed")).toHaveText("Passed 1"); // the wall
  await page.getByTestId("chip-passed").click();
  await expect(page.locator("#rows .srow")).toHaveCount(1);
  await page.locator("#rows .srow").first().click();
  await expect(page.getByTestId("passed-profile-1")).toHaveCount(0); // flagged: in a finding, never in Passed
});

test("test_clean_shaft_passed_list", async ({ page }) => {
  await upload(page, "clean_shaft.step", "turn", "al6061", "features");
  await expect(page.getByTestId("plan-machine")).toHaveText("lathe", { timeout: 30_000 });
  await page.getByTestId("chip-passed").click();
  // A turned profile passes two checks: one passed row each (rows group by kind and check, spec "Rows")
  await page.getByTestId("row-pass-profile-turn_axis").click();
  await expect(page.getByTestId("passed-profile-1")).toContainText("1.000 in (1) diameter, 3.000 in long");
  await expect(page.getByTestId("passed-profile-1")).toContainText("Round faces on one axis: a lathe part");
  await page.getByTestId("row-pass-profile-turn_slender").click();
  await expect(page.getByTestId("passed-profile-1")).toContainText("Length 4.0× its smallest diameter, 0.750 in, at most 4.0×");
  await expect(page.getByTestId("row-pass-profile-turn_slender")).toContainText("Profiles");
  await page.getByTestId("row-pass-hole-turn_offaxis").click();
  await expect(page.getByTestId("passed-hole-1")).toContainText("On the turning axis: cut on the lathe");
});

test("test_inside_groove_note", async ({ page }) => {
  // D-026: the plan says an inside groove is not cut by every shop.
  await upload(page, "shaft_with_groove_and_bore.step", "turn");
  await expect(page.getByTestId("plan-setup-1")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("plan-setup-1").click();
  const why = page.getByTestId("plan-setup-why-1");
  await expect(why).toContainText("groove-1 is a groove on the axis.");
  await expect(why).toContainText("groove-2 is an inside groove on the axis; not every shop cuts inside grooves");
});

test("test_slender_shaft_for_milling", async ({ page }) => {
  await upload(page, "slender_shaft.step", "mill");
  await expect(page.getByTestId("plan-machine")).toHaveText("3-axis mill", { timeout: 30_000 });
  await expect(page.getByTestId("plan-turn-axis")).toHaveCount(0);
  await expect(page.getByTestId("plan-setup-1")).toContainText("Setup 1 · from +X");
  await expect(page.getByTestId("plan-stock")).toContainText("in block (part size, no allowance)");
  await expect(page.getByTestId("row-F1")).toContainText("This part looks turned; review it for Turning");
  await expect(page.getByTestId("issues-whole-part")).toContainText("Looks turned F1"); // no feature: the whole part
});

test("test_block_as_turn_shows_no_plan", async ({ page }) => {
  await upload(page, "block_as_turn.step", "turn", "al6061");
  await expect(page.getByTestId("row-F1")).toContainText("No turning axis found; check the process", { timeout: 30_000 });
  await expect(page.getByTestId("row-F1")).toContainText("limit is an assumption");
  await expect(page.getByTestId("plan-machine")).toHaveCount(0);
});

test("test_part_wide_pin_does_not_hide_the_cross_hole", async ({ page }) => {
  // D-027 (Morgan, 2026-11-08: "I don't see that off center hole"): the length finding's pin covers the
  // whole outside, so it moves to a free spot of its faces instead of sitting on the cross hole.
  await upload(page, "slender_shaft.step", "turn", "steel1018", "features");
  await expect(page.getByTestId("row-F2")).toBeVisible();
  await page.waitForTimeout(300);
  const state: Record<string, any> = Object.fromEntries(((await page.evaluate("window.__dfma.flagState()")) as any[]).map((s) => [s.id, s]));
  expect(state.F1.shown && state.F2.shown, JSON.stringify(state)).toBeTruthy();
  expect(state.F1.mergedInto === "" && state.F2.mergedInto === "", JSON.stringify(state)).toBeTruthy();
  const one = (await page.locator('.viewer .flag[data-id="F1"]').boundingBox())!;
  const two = (await page.locator('.viewer .flag[data-id="F2"]').boundingBox())!;
  const apart =
    one.x + one.width <= two.x || two.x + two.width <= one.x || one.y + one.height <= two.y || two.y + two.height <= one.y;
  expect(apart, JSON.stringify([one, two])).toBeTruthy();
});

test("test_flange_bolt_hole", async ({ page }) => {
  // Morgan, 2026-11-08: an off-centre hole parallel to the axis needs live tooling too.
  await upload(page, "flange_bolt_hole.step", "turn");
  await expect(page.getByTestId("plan-machine")).toHaveText("lathe with live tooling", { timeout: 30_000 });
  await expect(page.getByTestId("row-F1")).toContainText("Hole not on the turning axis: needs a milling operation or live tooling");
  await openStep(page, "features");
  await page.getByTestId("row-F1").click();
  await expect(page.getByTestId("row-detail")).toContainText("0.7500 in off the turning axis");
});
