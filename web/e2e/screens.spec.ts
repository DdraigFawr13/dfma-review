// UI fixes slice B, the screens (spec docs/specs/ui-fixes.md J7-J9, B1-B3; D-076, D-078): examples from the start form
// and the top bar, one Open… picker for a STEP and its .ipt, and the Machine view with its spindle and chuck.
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { load, openStep, PARTS, shown } from "./helpers";

type Vec = [number, number, number];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = any;

const INV = resolve(PARTS, "..", "inventor", "files");
const SAMPLE = resolve(PARTS, "report_sample.step");
const EXAMPLES: [string, "mill" | "turn"][] = [
  ["report_sample", "mill"], ["angled_hole_in_pocket", "mill"], ["slender_shaft", "turn"], ["clean_one_setup", "mill"],
];

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
const deg = (a: number[], b: number[]) => (Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (len(a) * len(b))))) * 180) / Math.PI;

const analysis = (page: Page): Promise<Result> => page.evaluate(() => window.__dfma.analysis());

/** A setup's direction name ("+Z", "-X") in file coordinates, through the part's axes (spec B3). */
function fileDirection(result: Result, name: string): Vec {
  const axis = result.part.frame["xyz"["XYZ".indexOf(name[1])]] as Vec;
  const s = name[0] === "-" || name[0] === "−" ? -1 : 1;
  return [s * axis[0], s * axis[1], s * axis[2]];
}

test("test_examples", async ({ page }) => {
  for (const [name, process] of EXAMPLES) {
    for (const from of ["form", "bar"] as const) {
      await test.step(`${name} from ${from}`, async () => {
        await page.goto("/");
        if (from === "form") await page.getByTestId(`example-${name}`).click();
        else {
          const button = page.getByTestId("examples-button");
          await expect(button).toHaveAttribute("aria-expanded", "false");
          await button.click();
          await expect(button).toHaveAttribute("aria-expanded", "true");
          await page.getByTestId(`examples-item-${name}`).click();
          await expect(button).toHaveAttribute("aria-expanded", "false");
        }
        await expect(page.locator("#status")).toHaveText(`Showing ${name}.step.`, { timeout: 60_000 });
        await expect(page.getByTestId("overview")).toBeVisible();
        await expect(page.getByTestId("upload-process")).toHaveValue(process);
      });
    }
  }
});

test("test_examples_menu_keys", async ({ page }) => {
  await page.goto("/");
  const button = page.getByTestId("examples-button");
  await button.focus();
  await button.press("Enter");
  await expect(page.getByTestId("examples-menu")).toBeVisible();
  await expect(page.getByRole("menuitem")).toHaveCount(4);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("examples-menu")).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await page.mouse.click(600, 600); // a click outside closes it
  await expect(page.getByTestId("examples-menu")).toBeHidden();
  await button.click();
  await page.keyboard.press("ArrowDown"); // opens on the first; one step down is the second
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toHaveText("Showing angled_hole_in_pocket.step.", { timeout: 60_000 });
});

test("test_example_failed", async ({ page }) => {
  await page.route("**/examples/*.step", (r) => r.abort());
  await page.goto("/");
  await page.getByTestId("example-slender_shaft").click();
  await expect(page.getByTestId("error-message")).toHaveText("The example could not be loaded. Try again.");
});

test("test_top_bar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open…" })).toBeVisible();
  await expect(page.getByTestId("examples-button")).toBeVisible();
  await expect(page.getByTestId("export-pdf")).toBeHidden();
  await expect(page.getByTestId("upload-ipt")).toHaveCount(0); // one picker (J8)
  await load(page, SAMPLE);
  await expect(page.getByTestId("export-pdf")).toBeVisible();
  await expect(page.getByTestId("top-file")).toHaveCount(0); // no file name in the bar
  await expect(page.getByTestId("change-file")).toHaveCount(0); // no "Change file" in the overview
  await expect(page.getByRole("button", { name: "Open…" })).toBeVisible();
});

test("test_open_pair", async ({ page }) => {
  await page.goto("/");
  const input = page.getByTestId("upload-file");
  expect(await input.getAttribute("multiple")).not.toBeNull();
  const step = resolve(PARTS, "box_through_hole.step"), ipt = resolve(INV, "INV_nist_ftc_11_asme1_2021.ipt");
  // not a pair: two STEPs, two .ipt files, three files
  await input.setInputFiles([step, resolve(PARTS, "deep_hole.step")]);
  await expect(page.getByTestId("error-message")).toHaveText("Choose one STEP file and, if you have it, its .ipt.");
  await input.setInputFiles([ipt, ipt]);
  await expect(page.getByTestId("error-message")).toHaveText("Choose one STEP file and, if you have it, its .ipt.");
  await input.setInputFiles([step, ipt, resolve(PARTS, "deep_hole.step")]);
  await expect(page.getByTestId("error-message")).toHaveText("Choose one STEP file and, if you have it, its .ipt.");
  // an .ipt alone waits for its STEP
  await input.setInputFiles(ipt);
  await expect(page.locator("#status")).toHaveText("Now choose the STEP file that Inventor exported from this .ipt.");
  // both in one pick, in either order, are read together
  await input.setInputFiles([ipt, step]);
  await expect(page.locator("#status")).toContainText("with INV_nist_ftc_11_asme1_2021.ipt", { timeout: 60_000 });
});

test("test_machine_view_mill", async ({ page }) => {
  await load(page, SAMPLE);
  await shown(page, "report_sample.step", "machining");
  const result = await analysis(page);
  expect(result.setups.length).toBeGreaterThanOrEqual(2);
  const radios = page.getByRole("radiogroup").getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(page.getByRole("radio", { name: "Part" })).toBeChecked(); // default Part
  await expect(page.getByTestId("view-home")).toBeVisible();
  await page.getByRole("radio", { name: "Machine" }).check();
  await expect(page.getByTestId("view-home")).toBeHidden(); // Home there is the setup chip
  await page.getByTestId("setup-chip-2").click();
  const d = fileDirection(result, result.setups[1].direction);
  const v = await page.evaluate(() => window.__dfma.view());
  expect(deg(v.up, d)).toBeLessThan(0.1);
  // the part's side is up on screen: the camera sits a little above the setup side, looking across
  const toCamera = [v.position[0] - v.target[0], v.position[1] - v.target[1], v.position[2] - v.target[2]];
  expect(dot(toCamera, d) / len(toCamera)).toBeGreaterThan(0.3);
  // a tool row lights the faces it cuts there and shows the spindle at its diameter
  const ops = result.operations.filter((o: { setup: number }) => o.setup === 1);
  expect(ops.length).toBeGreaterThan(0);
  // a tool with a diameter (a drill or an end mill) shows the spindle; one without lights its faces alone
  const first = ops.find((o: { tool: string }) => result.tools.find((t: { id: string }) => t.id === o.tool).diameter_in !== null);
  expect(first, "setup 2 has a tool with a diameter").toBeTruthy();
  const tool = result.tools.find((t: { id: string }) => t.id === first.tool);
  const row = page.getByTestId(`plan-op-2-${tool.id}`).first();
  await expect(row).toBeVisible();
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  await row.click();
  const wanted = new Set(ops.filter((o: { tool: string }) => o.tool === tool.id).flatMap((o: { faces: number[] }) => o.faces));
  expect(new Set(await page.evaluate(() => window.__dfma.highlightedFaces()))).toEqual(wanted);
  const spindle = await page.evaluate(() => window.__dfma.spindle());
  expect(spindle!.diameter_mm).toBeCloseTo(tool.diameter_in * 25.4, 6);
  expect(await page.evaluate(() => window.__dfma.chuck())).toBe(false);
  await row.click(); // again clears it, spindle and all
  expect(await page.evaluate(() => window.__dfma.spindle())).toBeNull();
  // back to Part: today's behaviour, no spindle, Home view
  await page.getByRole("radio", { name: "Part" }).check();
  await expect(page.getByTestId("view-home")).toBeVisible();
  expect(await page.evaluate(() => window.__dfma.spindle())).toBeNull();
});

test("test_machine_view_lathe", async ({ page }) => {
  await load(page, resolve(PARTS, "slender_shaft.step"));
  await page.getByTestId("upload-process").selectOption("turn");
  await expect(page.getByTestId("overview")).toBeVisible({ timeout: 60_000 });
  await shown(page, "slender_shaft.step", "machining");
  const result = await analysis(page);
  expect(result.turn_axis).not.toBeNull();
  await page.getByRole("radio", { name: "Machine" }).check();
  await page.getByTestId("setup-chip-1").click();
  const v = await page.evaluate(() => window.__dfma.view());
  const toCamera = [v.position[0] - v.target[0], v.position[1] - v.target[1], v.position[2] - v.target[2]];
  // the turning axis lies across the screen: square to the view direction
  expect(Math.abs(dot(toCamera, result.turn_axis)) / (len(toCamera) * len(result.turn_axis))).toBeLessThan(0.002);
  expect(await page.evaluate(() => window.__dfma.chuck())).toBe(true);
  await page.getByRole("radio", { name: "Part" }).check();
  expect(await page.evaluate(() => window.__dfma.chuck())).toBe(false);
});

test("test_machine_view_left_with_the_step", async ({ page }) => {
  await load(page, SAMPLE);
  await shown(page, "report_sample.step", "machining");
  await page.getByRole("radio", { name: "Machine" }).check();
  await page.getByTestId("setup-chip-1").click();
  await openStep(page, "features");
  await expect(page.getByRole("radiogroup", { name: "View" })).toBeHidden();
  await openStep(page, "machining");
  await expect(page.getByRole("radio", { name: "Part" })).toBeChecked(); // reset to Part when the step is left
});
