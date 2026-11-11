// I1 S2 J1 in the browser: the Threads panel (D-036), answered with the CTC 04 and STC 10 fixtures through
// page.route (lined up by the test harness; the app itself refuses NIST pairs, J2). Ported from tests/e2e/test_threads.py.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PARTS, openStep } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */
const FIXTURES = resolve(PARTS, "..", "inventor", "fixtures");
const CTC04: [string, string] = ["nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt"];
const STC10: [string, string] = ["nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt"];

const fixture = (name: string): any => JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), "utf8"));
const answer = (result: any) => (r: any) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
const placeholder = (name: string) => ({ name, mimeType: "application/octet-stream", buffer: Buffer.from("placeholder") });

/** Pick two placeholder files named as the pair; /api/analyze answers with `result` (the test build's fake-service flag, as conftest set it). */
async function openPair(page: Page, result: any, names: [string, string]): Promise<void> {
  await page.addInitScript("window.__dfmaFakeService = true");
  await page.route("**/api/analyze", answer(result));
  await page.goto("/");
  await page.getByTestId("upload-ipt").setInputFiles(placeholder(names[1]));
  await page.getByTestId("upload-file").setInputFiles(placeholder(names[0]));
  await expect(page.locator("#status")).toHaveText(`Showing ${result.part.name} with ${names[1]}.`);
  await openStep(page, "features"); // the .ipt panels are groups in the Features step (review-steps J6)
}

/** Open the Features row holding finding `fid` and step (›) to it (steps.py `show_finding`). */
async function showFinding(page: Page, result: any, fid: string): Promise<void> {
  const row = result.rows.find((r: any) => r.findings.includes(fid));
  await page.getByTestId(`row-${row.id.replace(/^row:/, "")}`).click();
  for (let i = 0; i < row.findings.indexOf(fid); i++) await page.getByTestId("row-next").click();
  await expect(page.getByTestId("row-detail")).toContainText(`${fid} · `);
}

test("test_threads_panel", async ({ page }) => {
  const result = fixture("ctc_04");
  await openPair(page, result, CTC04);
  const panel = page.getByTestId("threads-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("open", ""); // opens when the .ipt has threads (D-036)
  await expect(page.locator("#threads-count")).toHaveText("4");
  const rows = page.getByTestId("thread-row");
  await expect(rows).toHaveCount(4);
  // The counts sit on the group's row (D-049); the source once above the groups
  await expect(page.getByTestId("ipt-groups")).toContainText("From INV_nist_ctc_04_asme1_2021.ipt");
  await expect(page.locator("#threads-tally")).toHaveText("matched 4");
  await expect(panel).toContainText("Tap a thread to show its hole.");
  for (const [n, hole] of ["hole-37", "hole-38", "hole-39", "hole-40"].entries()) {
    const row = rows.nth(n);
    await expect(row).toContainText("matched");
    await expect(row).toContainText("M12x1.75 - 6H");
    await expect(row).toContainText(hole);
    await expect(row).toContainText("0.984 in [25 mm] deep · tap drill 0.404 in [10.25 mm] (as stored in the .ipt)");
  }
  // Tapping a row selects its hole; tapping it again clears it
  const hole = result.features.find((f: any) => f.id === "hole-38");
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual([...hole.faces].sort((a: number, b: number) => a - b));
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual([]);
  // The hole itself shows its callout (J1): in a finding's detail, or its passed feature
  const findings = result.findings.filter((f: any) => f.feature === "hole-37");
  let target;
  if (findings.length) {
    await showFinding(page, result, findings[0].id);
    target = page.getByTestId("row-detail");
  } else {
    await page.getByTestId("chip-passed").click();
    await page.getByTestId("row-pass-hole-hole_depth").click();
    target = page.getByTestId("passed-hole-37");
  }
  await expect(target).toContainText("Thread: M12x1.75 - 6H (from the .ipt)");
});

test("test_thread_disagrees_and_states", async ({ page }) => {
  const result = fixture("stc_10");
  const t = result.inventor.threads[1]; // built: one thread not mapped (no NIST file has one)
  Object.assign(t, { state: "not_mapped", hole: null, gaps: [], reason: "external thread: not on a hole" });
  await openPair(page, result, STC10);
  const rows = page.getByTestId("thread-row");
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0)).toContainText("disagrees");
  await expect(rows.nth(0)).toContainText("0.004 in [0.10 mm] off the hole's axis · finding F26");
  await expect(rows.nth(1)).toContainText("Not mapped: external thread: not on a hole. Our limit, not a finding.");
  expect(await rows.nth(1).evaluate((e) => e.tagName)).toBe("DIV"); // no hole: plain text, not a button
  await expect(page.getByTestId("row-F26")).toContainText("M3x0.5 thread on hole-38: 0.10 mm off the hole's axis");
  await expect(page.locator("#threads-tally")).toHaveText("disagrees 1 · not mapped 1 · matched 4");
});

test("test_no_threads_and_no_ipt", async ({ page }) => {
  const result = fixture("stc_10");
  result.inventor.threads = [];
  for (const f of result.features) delete f.thread;
  result.findings = result.findings.filter((f: any) => f.rule !== "thread_mismatch");
  await openPair(page, result, STC10);
  const panel = page.getByTestId("threads-panel");
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute("open", ""); // folded when there are none
  await expect(page.locator("#threads-count")).toHaveText("0");
  await panel.locator("summary").click();
  await expect(panel).toContainText("No threads in this .ipt.");
  // Only a STEP: no panel, as before S2
  delete result.inventor;
  await page.unroute("**/api/analyze");
  await page.route("**/api/analyze", answer(result));
  await page.getByTestId("upload-ipt").setInputFiles([]);
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "box_through_hole.step"));
  await expect(page.locator("#status")).toHaveText(`Showing ${result.part.name}.`);
  await openStep(page, "features");
  await expect(panel).toBeHidden();
});
