// I1 S1 in the browser: the two file fields (D-034), the .ipt checks' messages, a pair shown.
// Ported from tests/e2e/test_upload_pair.py.
// Local helpers: `nistStep` unpacks one NIST STEP file from the committed zip with `unzip` (tests/nist_files.py
// `ap242_files`); test_pair_shown reads its routed answer from the page's own engine (window.__dfma.analysis()) in
// place of dfma.analyze.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { PARTS, shown } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */
const INV = resolve(PARTS, "..", "inventor", "files");
const BOX = resolve(PARTS, "box_through_hole.step");
const NIST_ZIP = resolve(PARTS, "..", "nist", "NIST-PMI-STEP-Files.zip");
const MSG_IPT_NEEDS_STEP = "Add the STEP export of this part: the shape is read from the STEP"; // service/dfma/settings.py

/** One AP242 STEP file of the NIST zip, written into `dir`. */
function nistStep(dir: string, name: string): string {
  const data = execFileSync("unzip", ["-p", NIST_ZIP, `NIST-PMI-STEP-Files/${name}`], { maxBuffer: 64 * 1024 * 1024 });
  mkdirSync(dir, { recursive: true });
  const out = resolve(dir, name);
  writeFileSync(out, data);
  return out;
}

test("test_ipt_first_waits", async ({ page }) => {
  await page.goto("/");
  const calls: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/analyze")) calls.push(r.url()); });
  await page.getByTestId("upload-ipt").setInputFiles(resolve(INV, "INV_nist_ftc_11_asme1_2021.ipt"));
  await expect(page.locator("#status")).toHaveText("Now choose the STEP file that Inventor exported from this .ipt.");
  expect(calls).toEqual([]);
});

test("test_ipt_in_step_field", async ({ page }) => {
  await page.goto("/");
  const calls: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/analyze")) calls.push(r.url()); });
  await page.getByTestId("upload-file").setInputFiles({
    name: "part.ipt", mimeType: "application/octet-stream", buffer: readFileSync(resolve(INV, "INV_nist_ftc_11_asme1_2021.ipt")),
  });
  await expect(page.getByTestId("error-message")).toHaveText(MSG_IPT_NEEDS_STEP);
  expect(calls).toEqual([]);
});

test("test_nist_pair_refused", async ({ page }, testInfo) => {
  await page.goto("/");
  const step = nistStep(testInfo.outputPath("nist"), "nist_ctc_04_asme1_ap242-e1.stp");
  await page.getByTestId("upload-ipt").setInputFiles(resolve(INV, "INV_nist_ctc_04_asme1_2021.ipt"));
  await page.getByTestId("upload-file").setInputFiles(step);
  await expect(page.getByTestId("error-message")).toHaveText(
    "These files don't match: the STEP has 483 faces, the .ipt 368. Export the STEP again from this .ipt and upload both.",
    { timeout: 30_000 });
  await expect(page.getByTestId("overview")).toBeHidden(); // no part numbers beside the error
  await expect(page.getByTestId("start-form")).toBeVisible();
});

test("test_pair_shown", async ({ page, context }) => {
  // A passing pair, answered through page.route (no work pair in the repo, D-032): the bar shows the build.
  const other = await context.newPage();
  await other.goto("/");
  await other.getByTestId("upload-file").setInputFiles(BOX);
  await shown(other, "box_through_hole.step", null);
  const result: any = await other.evaluate("window.__dfma.analysis()");
  await other.close();
  result.inventor = {
    name: "box.ipt", saved_with: "2024.1 (Build 281209000, 209)", acis_version: "229.6.0.65535",
    checks: { faces: [8, 8], corners: [10, 10], worst_corner_gap_mm: 0.0 },
  };
  const bodies: Buffer[] = [];
  await page.addInitScript("window.__dfmaFakeService = true");
  await page.route("**/api/analyze", async (route) => {
    bodies.push(route.request().postDataBuffer() ?? Buffer.alloc(0));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
  });
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(BOX);
  await expect(page.locator("#status")).toHaveText("Showing box_through_hole.step with box.ipt."); // the routed answer has it
  await page.getByTestId("upload-ipt").setInputFiles(resolve(INV, "INV_nist_ftc_11_asme1_2021.ipt"));
  await expect(page.getByTestId("ipt-build")).toHaveText("2024.1 (Build 281209000, 209)");
  await expect(page.locator("#inventor-meta")).toBeVisible();
  expect(bodies.length).toBe(2);
  expect(bodies[0].includes('name="ipt"')).toBe(false); // sent only once picked
  expect(bodies[1].includes('name="ipt"')).toBe(true);
});
