// Ported from tests/e2e/test_findings.py (S8b): J2 in the browser, on the Features rows (review-steps S2): the row
// shows the finding; tapping it highlights and frames its faces; the Show OK switches; pins and labels.
import { readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { expect, test, type Browser } from "@playwright/test";
import { openStep, PARTS, reanalysis, shown as partShown } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = any;

const results = new Map<string, Promise<Result>>();
/** Local helper (the Python tests called dfma.analyze): the browser engine's result for a part, read back from the
 *  page's own test hook in a throwaway page (`window.__dfma.analysis()`). */
function analysisOf(browser: Browser, file: string, process = "mill", material = "al6061"): Promise<Result> {
  const key = `${file}|${process}|${material}`;
  let p = results.get(key);
  if (!p) {
    p = (async () => {
      const context = await browser.newContext({ baseURL: "http://127.0.0.1:8766" });
      try {
        const page = await context.newPage();
        await page.goto("/");
        await page.getByTestId("upload-process").selectOption(process);
        await page.getByTestId("upload-material").selectOption(material);
        await page.getByTestId("upload-file").setInputFiles(file);
        await expect(page.getByTestId("overview")).toBeVisible({ timeout: 60_000 });
        return await page.evaluate("window.__dfma.analysis()");
      } finally {
        await context.close();
      }
    })();
    results.set(key, p);
  }
  return p;
}

const sortNum = (a: number[]): number[] => [...a].sort((x, y) => x - y);

/** Python's rglob("daratech.stp") under tests/edmr/models/STEP/STI. */
function daratech(): string {
  const root = resolve(PARTS, "..", "edmr", "models", "STEP", "STI");
  const hit = (readdirSync(root, { recursive: true }) as string[]).find((p) => basename(p) === "daratech.stp");
  if (!hit) throw new Error("no daratech.stp");
  return resolve(root, hit);
}

function bboxCentre(result: Result, faceIds: number[]): number[] {
  const pts: number[][] = [];
  for (const f of result.faces) {
    if (!faceIds.includes(f.id)) continue;
    for (let i = 0; i < f.positions.length; i += 3) pts.push(f.positions.slice(i, i + 3));
  }
  return [0, 1, 2].map((k) => (Math.min(...pts.map((p) => p[k])) + Math.max(...pts.map((p) => p[k]))) / 2);
}

test("test_click_highlights_face", async ({ page, browser }) => {
  const deep = resolve(PARTS, "deep_hole.step");
  const result = await analysisOf(browser, deep);
  expect(result.findings.length).toBe(1);
  const finding = result.findings[0];

  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(deep);
  await partShown(page, "deep_hole.step", null);
  await expect(page.getByTestId("overview-features")).toContainText("1 hole and 4 walls checked");
  await openStep(page, "features");
  const row = page.getByTestId("row-F1");
  await expect(row).toContainText("Deep hole");
  await expect(row).toContainText("8.0× the diameter deep. Over 6.0× needs peck drilling (drilling in short steps to clear chips).");
  await expect(row).toContainText("Review");
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual([]);

  await row.click();
  expect(sortNum(await page.evaluate("window.__dfma.highlightedFaces()") as number[])).toEqual(sortNum(finding.faces));
  let target = await page.evaluate("window.__dfma.cameraTarget()") as number[];
  const centre = bboxCentre(result, finding.faces);
  expect(Math.sqrt(target.reduce((s, a, i) => s + (a - centre[i]) ** 2, 0))).toBeLessThanOrEqual(1.0);
  await expect(row).toHaveAttribute("aria-expanded", "true");
  // What is drawn: the finding's faces in the accent colour, every other face faded to 0.35.
  expect(await page.evaluate("window.__dfma.paintedFaces()")).toEqual(sortNum(finding.faces));
  const opacity = await page.evaluate("window.__dfma.opacities()") as Record<string, number>;
  for (let i = 0; i < result.faces.length; i++) {
    expect(opacity[String(i)] === (finding.faces.includes(i) ? 1 : 0.35)).toBe(true);
  }
  // A flag on the view names the finding and its severity, so colour is not the only sign.
  await expect(page.locator(".viewer .flag")).toHaveText("◆F1Review"); // its mark too (D-053)

  // Changing the material re-analyses the same part and keeps the view and the selection,
  // including a view the user has moved: pan first (right-drag), which moves the camera target.
  const box = (await page.getByTestId("viewer-canvas").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(cx + 80, cy + 30, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(200);
  const moved = await page.evaluate("window.__dfma.cameraTarget()") as number[];
  expect(moved).not.toEqual(target);
  target = moved;
  await openStep(page, "part"); // process and material sit in the overview once a part is read
  const analysing = reanalysis(page);
  await page.getByTestId("upload-material").selectOption("plastic");
  await analysing;
  await expect(page.locator("#status")).toHaveText("Showing deep_hole.step.", { timeout: 30_000 });
  await openStep(page, "features");
  await page.waitForTimeout(300);
  expect(await page.evaluate("window.__dfma.cameraTarget()")).toEqual(target);
  expect(sortNum(await page.evaluate("window.__dfma.highlightedFaces()") as number[])).toEqual(sortNum(finding.faces));

  await row.click(); // tapping the open row again clears it
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual([]);
});

test("test_clean_part_shows_clean_verdict", async ({ page, browser }) => {
  const clean = resolve(PARTS, "clean_holes.step");
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(clean);
  await partShown(page, "clean_holes.step", null);
  await expect(page.getByTestId("overview-features")).toContainText("2 holes and 3 walls checked");
  await expect(page.getByTestId("overview-features")).toContainText("No findings. Every feature checked passed its rules.");
  await openStep(page, "features");

  // The Show OK "Holes" switch (on by default) tints the holes that passed.
  const result = await analysisOf(browser, clean);
  const holeFaces = sortNum(result.features.filter((h: Result) => h.kind === "hole").flatMap((h: Result) => h.faces));
  await expect(page.getByTestId("show-ok")).toContainText("Holes");
  expect(await page.evaluate("window.__dfma.checkedFaces()")).toEqual(holeFaces);
  await page.getByTestId("show-checked").uncheck();
  expect(await page.evaluate("window.__dfma.checkedFaces()")).toEqual([]);
  await page.getByTestId("show-checked").check();
  expect(await page.evaluate("window.__dfma.checkedFaces()")).toEqual(holeFaces);
});

test("test_checked_holes_exclude_holes_with_findings", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "stepped_hole.step"));
  await partShown(page, "stepped_hole.step"); // OK tints show on the Features step (review-steps J3)
  await expect(page.getByTestId("overview-features")).toContainText("2 holes and 4 walls checked");
  const result = await analysisOf(browser, resolve(PARTS, "stepped_hole.step"));
  expect(await page.evaluate("window.__dfma.checkedFaces()")).toEqual(
    sortNum(result.features.filter((h: Result) => h.kind === "hole").flatMap((h: Result) => h.faces)));
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "deep_hole.step"));
  await partShown(page, "deep_hole.step");
  await expect(page.getByTestId("row-F1")).toBeVisible();
  expect(await page.evaluate("window.__dfma.checkedFaces()")).toEqual([]); // its only hole has a finding
});

test("test_pocket_and_corner_switches", async ({ page, browser }) => {
  // S3 (D-015): pockets and corners checked with no finding have their own colour and switch;
  // a corner fillet is also a pocket wall and shows the corner colour.
  const file = resolve(PARTS, "clean_pocket.step");
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(file);
  await partShown(page, "clean_pocket.step", null);
  await expect(page.getByTestId("overview-features")).toContainText("1 pocket, 4 corners and 8 walls checked");
  await openStep(page, "features");
  const result = await analysisOf(browser, file);
  const pockets = result.features.filter((f: Result) => f.kind === "pocket");
  expect(pockets.length).toBe(1);
  const cornerFaces = sortNum([...new Set<number>(result.features.filter((f: Result) => f.kind === "corner").flatMap((f: Result) => f.faces))]);
  const pocketOnly = sortNum((pockets[0].faces as number[]).filter((i) => !cornerFaces.includes(i)));
  expect(await page.evaluate("window.__dfma.checkedFaces('pocket')")).toEqual(pocketOnly);
  expect(await page.evaluate("window.__dfma.checkedFaces('corner')")).toEqual(cornerFaces);
  await page.getByTestId("show-checked-corners").uncheck();
  expect(await page.evaluate("window.__dfma.checkedFaces('corner')")).toEqual([]);
  await page.getByTestId("show-checked-pockets").uncheck();
  expect(await page.evaluate("window.__dfma.checkedFaces('pocket')")).toEqual([]);
});

test("test_wall_switch", async ({ page, browser }) => {
  // S4 (D-014, D-016): walls checked with no finding have their own colour and switch, off by default.
  // Walls are painted first, so a face that is also in a hole or pocket keeps that kind's colour,
  // and a wall with a finding is not "checked".
  await page.goto("/");
  await page.getByTestId("upload-material").selectOption("plastic");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "thin_rib.step"));
  await partShown(page, "thin_rib.step", null);
  await expect(page.getByTestId("overview-features")).toContainText("6 walls checked");
  await openStep(page, "features");
  await expect(page.getByTestId("row-F1")).toContainText("Wall 0.040 in thick (limit 0.060 in)");
  await expect(page.getByTestId("row-F1")).toContainText("Thin wall check · limit is an estimate");
  await page.getByTestId("row-F1").click();
  await expect(page.getByTestId("row-detail")).toContainText("0.040 in thick");
  await page.getByTestId("row-F1").click();
  let result = await analysisOf(browser, resolve(PARTS, "thin_rib.step"), "mill", "plastic");
  const flagged = new Set<string>(result.findings.map((f: Result) => f.feature));
  const walls = result.features.filter((f: Result) => f.kind === "wall");
  const findingFaces = new Set<number>(result.findings.flatMap((f: Result) => f.faces));
  const passed = sortNum([...new Set<number>(walls.filter((w: Result) => !flagged.has(w.id)).flatMap((w: Result) => w.faces))]
    .filter((i) => !findingFaces.has(i)));
  expect(await page.getByTestId("show-checked-walls").isChecked()).toBe(false);
  expect(await page.evaluate("window.__dfma.checkedFaces('wall')")).toEqual([]);
  await page.getByTestId("show-checked-walls").check();
  expect(await page.evaluate("window.__dfma.checkedFaces('wall')")).toEqual(passed);
  await page.getByTestId("show-checked-walls").uncheck();
  expect(await page.evaluate("window.__dfma.checkedFaces('wall')")).toEqual([]);

  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "clean_holes.step"));
  await partShown(page, "clean_holes.step", null);
  await expect(page.getByTestId("overview-features")).toContainText("2 holes and 3 walls checked");
  await openStep(page, "features");
  await page.getByTestId("show-checked-walls").check();
  result = await analysisOf(browser, resolve(PARTS, "clean_holes.step"));
  const holeFaces = new Set<number>(result.features.filter((f: Result) => f.kind === "hole").flatMap((f: Result) => f.faces));
  const wallFaces = new Set<number>(result.features.filter((f: Result) => f.kind === "wall").flatMap((f: Result) => f.faces));
  expect(await page.evaluate("window.__dfma.checkedFaces('wall')")).toEqual(sortNum([...wallFaces].filter((i) => !holeFaces.has(i))));
  expect(await page.evaluate("window.__dfma.checkedFaces('hole')")).toEqual(sortNum([...holeFaces]));
});

test("test_sharp_corner_is_drawn_on_its_edge", async ({ page, browser }) => {
  // A sharp corner has no face: selecting it paints no face accent, its walls stay solid (D-015).
  const file = resolve(PARTS, "pocket_sharp.step");
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(file);
  await partShown(page, "pocket_sharp.step");
  await page.getByTestId("row-F1").click(); // the Sharp corner row: all its corners, its pin F1's
  const result = await analysisOf(browser, file);
  const row = result.rows.find((r: Result) => r.id === "row:F1");
  const walls = sortNum([...new Set<number>(result.findings.filter((f: Result) => row.findings.includes(f.id)).flatMap((f: Result) => f.faces))]);
  expect(await page.evaluate("window.__dfma.paintedFaces()")).toEqual([]);
  const opacities = await page.evaluate("window.__dfma.opacities()") as Record<string, number>;
  expect(walls.every((w) => opacities[String(w)] === 1)).toBe(true);
  expect(sortNum(await page.evaluate("window.__dfma.highlightedFaces()") as number[])).toEqual(walls);
});

type Box = { id: string; x: number; y: number; w: number; h: number };
function overlapping(boxes: Box[]): string[][] {
  const out: string[][] = [];
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) {
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push([a.id, b.id]);
    }
  });
  return out;
}

test("test_finding_labels_never_cover_each_other", async ({ page }) => {
  // Morgan: "the flags for the failing portions are covering each other" (S3). Every visible
  // label sits clear of the others, before and after a finding is selected.
  await page.goto("/");
  for (const name of ["pocket_sharp", "pocket_long_thin_tool", "daratech"]) {
    const path = name !== "daratech" ? resolve(PARTS, `${name}.step`) : daratech(); // 25 findings on a real part
    await page.getByTestId("upload-file").setInputFiles(path);
    await partShown(page, basename(path));
    await expect(page.locator("#rows .srow").first()).toBeVisible();
    // Labels are placed on the next drawn frame; a large part takes longer to draw.
    await page.waitForFunction("window.__dfma.flagBoxes().length >= 4", undefined, { timeout: 30_000 });
    const boxes = await page.evaluate("window.__dfma.flagBoxes()") as Box[];
    expect(overlapping(boxes), name).toEqual([]);
    await page.locator("#rows .srow").first().click();
    await page.waitForTimeout(300);
    expect(overlapping(await page.evaluate("window.__dfma.flagBoxes()") as Box[]), name).toEqual([]);
    await page.locator("#rows .srow").first().click();
  }
});

test("test_pins_sit_on_their_findings", async ({ page }) => {
  // D-017: every finding has a pin on a visible spot of its faces, folded into the pin it would cover
  // ("F4 +2"), or hidden while its spot is behind the part. The selected pin is solid in its severity
  // colour, on a stem to a dot on its spot.
  await page.goto("/");
  const path = daratech();
  await page.getByTestId("upload-file").setInputFiles(path);
  await partShown(page, basename(path));
  await expect(page.locator("#rows .srow").first()).toBeVisible();
  await page.waitForFunction("window.__dfma.flagBoxes().length >= 1", undefined, { timeout: 30_000 });
  type Flag = { id: string; shown: boolean; mergedInto: string };
  const state = await page.evaluate("window.__dfma.flagState()") as Flag[];
  const shownIds = new Set(state.filter((s) => s.shown).map((s) => s.id));
  const chip = (await page.getByTestId("chip-issues").innerText()).split(/\s+/).filter(Boolean).at(-1)!;
  const count = parseInt(chip, 10); // "Issues 23": findings, not rows
  expect(state.length).toBe(count);
  expect(state.every((s) => s.shown || shownIds.has(s.mergedInto) || s.mergedInto === "")).toBe(true);
  expect(shownIds.size).toBeLessThan(count); // 23 findings on this part: some pins fold together
  for (const s of state) { // a folded pin's "+n" counts the pins inside it
    if (s.shown) {
      const inside = state.filter((o) => o.mergedInto === s.id).length;
      const more = await page.locator(`.viewer .flag[data-id="${s.id}"]`).getAttribute("data-more");
      expect(more, s.id).toBe(inside ? `+${inside}` : "");
    }
  }

  const first = page.locator("#rows .srow").first(); // Fix rows first; its pin is its first finding's
  const fid = (await first.getAttribute("data-testid"))!.replace(/^row-/, "");
  await first.click();
  const pin = page.locator(`.viewer .flag[data-id="${fid}"]`);
  await expect(pin).toHaveClass(/\bchosen\b/);
  const severity = (await first.locator(".sev").getAttribute("class"))!.split(/\s+/)[1]; // "sev high"
  const colour = await page.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--${severity}').trim()`);
  expect(await pin.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(await page.evaluate(
    `(() => { const d = document.createElement('i'); d.style.color = '${colour}'; document.body.append(d);` +
    " const c = getComputedStyle(d).color; d.remove(); return c; })()"));
  // D-029: every pin shown stands on a stem to a dot on its spot (before, only the selected one did)
  const shownNow = ((await page.evaluate("window.__dfma.flagState()")) as Flag[]).filter((s) => s.shown).length;
  expect(await page.locator(".viewer svg.leaders line").count()).toBe(shownNow);
  expect(await page.locator(".viewer svg.leaders circle").count()).toBe(shownNow);
  expect(overlapping(await page.evaluate("window.__dfma.flagBoxes()") as Box[])).toEqual([]);
});

test("test_pins_behind_the_part_are_hidden", async ({ page }) => {
  // pocket_sharp's findings are all in its pocket on top: seen from underneath, no pin shows.
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "pocket_sharp.step"));
  await partShown(page, "pocket_sharp.step");
  await expect(page.getByTestId("row-F1")).toBeVisible();
  await page.waitForFunction("window.__dfma.flagBoxes().length >= 1", undefined, { timeout: 30_000 });
  const box = (await page.getByTestId("viewer-canvas").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - box.height * 0.9, { steps: 12 }); // orbit to look up at the bottom face
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await page.evaluate("window.__dfma.flagBoxes()")).toEqual([]);
});
