// S1 in the browser: upload a part, see it, rotate it (J1); a bad file shows its message (J7).
// Ported from tests/e2e/test_view.py.
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PARTS, expected } from "./helpers";

// Mean and variance of the canvas pixels, plus a small fingerprint to compare frames.
const CANVAS_STATS = `() => {
  const src = document.querySelector('[data-testid="viewer-canvas"]');
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  const lum = [];
  for (let i = 0; i < d.length; i += 4) lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  const variance = lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length;
  return { variance, pixels: lum.map(v => Math.round(v)) };
}`;

interface Stats { variance: number; pixels: number[] }

const canvas = (page: Page): Promise<Stats> => page.evaluate(`(${CANVAS_STATS})()`);

function changed(a: Stats, b: Stats): number {
  return a.pixels.filter((x, i) => Math.abs(x - b.pixels[i]) > 8).length;
}

test("test_upload_shows_part", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("viewer-canvas")).toBeVisible();
  const before = await canvas(page);

  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "box_through_hole.step"));
  await expect(page.getByTestId("part-size")).toHaveText("2.000 × 1.000 × 0.500 in", { timeout: 30_000 });
  const count = expected("box_through_hole").face_count;
  await expect(page.getByTestId("face-count")).toHaveText(`${count} faces`);
  await page.waitForTimeout(300);

  const shown = await canvas(page);
  expect(shown.variance).toBeGreaterThan(0);
  expect(changed(before, shown), "the canvas did not change after the upload").toBeGreaterThan(50);

  const box = (await page.getByTestId("viewer-canvas").boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(changed(shown, await canvas(page)), "dragging did not rotate the part").toBeGreaterThan(50);
});

test("test_bad_upload_message", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "not_step.step"));
  await expect(page.getByTestId("error-message")).toHaveText(
    "This is not a STEP file this tool can read. Export it again as .step or .stp from your CAD.", { timeout: 30_000 });
  // The app keeps working: a good file still loads.
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "box_inch.step"));
  await expect(page.getByTestId("part-size")).toHaveText("2.000 × 1.000 × 0.500 in", { timeout: 30_000 });
  await expect(page.getByTestId("error-message")).toBeHidden();
});
