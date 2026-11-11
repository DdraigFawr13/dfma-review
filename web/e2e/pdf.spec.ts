// Ported from tests/e2e/test_pdf.py (S8b): J6 in the browser: Export PDF on report_sample downloads a PDF whose first
// page holds the summary, the machine plan and the cost drivers, with one embedded image per finding; and the
// Threads, Hole features and Fillets and chamfers sections for the NIST pair fixtures.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { openStep, PARTS, shown } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = any;

// --- Local helpers -------------------------------------------------------------------------------------------------

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

/** Local helper (steps.py `show_finding`): open the Features row holding finding `fid` and step (›) to it. */
async function showFinding(page: Page, result: Result, fid: string): Promise<void> {
  const row = result.rows.find((r: Result) => r.findings.includes(fid));
  await page.getByTestId(`row-${row.id.replace(/^row:/, "")}`).click();
  for (let i = 0; i < row.findings.indexOf(fid); i++) await page.getByTestId("row-next").click();
  await expect(page.getByTestId("row-detail")).toContainText(`${fid} · `);
}

interface PdfPage { text: string; tjs: string[]; contents: string; xobjects: string[] }
interface Pdf { pages: PdfPage[]; image: (name: string) => string }

/** Local helper (the Python tests read the PDF with pypdf): a small reader for what jsPDF writes here, with plain
 *  (uncompressed) page content streams and `(text) Tj` strings. Read as Latin-1, which is the PDF's WinAnsi for the
 *  characters used (· × ° Ø). Text is each string of a page in drawing order, joined by a space. */
function readPdf(file: string): Pdf {
  const raw = readFileSync(file).toString("latin1");
  const objects = new Map<number, { dict: string; stream: string | null }>();
  for (const m of raw.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)) {
    const body = m[2];
    const at = body.indexOf("stream\n");
    objects.set(Number(m[1]), at < 0 ? { dict: body, stream: null }
      : { dict: body.slice(0, at), stream: body.slice(at + 7, body.lastIndexOf("\nendstream")) });
  }
  const unescape = (s: string) => s.replace(/\\(\d{1,3}|[\s\S])/g, (_m, c: string) =>
    /^\d/.test(c) ? String.fromCharCode(parseInt(c, 8)) : ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[c] ?? c);
  const kids = [...(raw.match(/\/Kids \[([^\]]*)\]/)?.[1] ?? "").matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
  const resources = (dict: string) => {
    const ref = dict.match(/\/Resources (\d+) 0 R/);
    return ref ? objects.get(Number(ref[1]))!.dict : dict;
  };
  const pages = kids.map((id) => {
    const dict = objects.get(id)!.dict;
    const contents = objects.get(Number(dict.match(/\/Contents (\d+) 0 R/)![1]))!.stream ?? "";
    const tjs = [...contents.matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/g)].map((m) => unescape(m[1]));
    const xo = resources(dict).match(/\/XObject\s*<<([^>]*)>>/)?.[1] ?? "";
    const xobjects = [...xo.matchAll(/\/\S+ (\d+) 0 R/g)].map((m) => m[1]);
    return { text: tjs.join(" "), tjs, contents, xobjects };
  });
  return { pages, image: (n) => objects.get(Number(n))!.stream ?? "" };
}

const flat = (s: string) => s.replace(/\n/g, " ");
const squash = (s: string) => s.replace(/ +/g, " ");
const fixture = (name: string): Result => JSON.parse(readFileSync(resolve(PARTS, "..", "inventor", "fixtures", name), "utf8"));
const fulfilling = (result: Result) => (r: import("@playwright/test").Route) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });

// --- Tests ---------------------------------------------------------------------------------------------------------

test("test_export_pdf", async ({ page, browser }, testInfo) => {
  const result = await analysisOf(browser, resolve(PARTS, "report_sample.step"));
  expect(new Set(result.findings.map((f: Result) => f.rule)).size).toBeGreaterThanOrEqual(3); // J6: at least 3 rules have a finding

  await page.goto("/");
  const button = page.getByTestId("export-pdf");
  await expect(button).toBeDisabled(); // nothing to export before a part is loaded
  await expect(button).toBeHidden(); // in the top bar once a part is read (review-steps)
  await page.getByTestId("upload-file").setInputFiles(resolve(PARTS, "report_sample.step"));
  await shown(page, "report_sample.step", "cost");
  await expect(page.getByTestId("driver-distinct_tools")).toBeVisible();
  await expect(page.getByTestId("driver-distinct_tools")).toContainText("4 × 1.0");
  await expect(page.getByTestId("driver-distinct_tools")).toContainText("4.0");
  await expect(button).toBeEnabled();
  await openStep(page, "features");

  await showFinding(page, result, "F2"); // the reader's own selection (row F1 F2, at F2) must survive the export
  const camera = await page.evaluate("window.__dfma.cameraTarget()");
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  const path = testInfo.outputPath("report.pdf");
  await download.saveAs(path);
  expect(download.suggestedFilename()).toBe("report_sample-dfma-review.pdf");
  // the shown finding's faces (UI fixes A5, D-076): the row is at F2
  expect(await page.evaluate("window.__dfma.highlightedFaces()")).toEqual(
    [...result.findings.find((f: Result) => f.id === "F2").faces].sort((a: number, b: number) => a - b));
  expect(await page.evaluate("window.__dfma.cameraTarget()")).toEqual(camera);
  await expect(page.getByTestId("row-F1")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("row-detail")).toContainText("F2 · hole-2 · 2 of 2");

  // UI fixes A13: the triad pass leaves the renderer as it was, and no PDF picture holds the triad
  expect(await page.evaluate(() => window.__dfma.renderState())).toEqual({ autoClear: true, scissorTest: false });

  const pdf = readPdf(path);
  {
    const jpeg = Buffer.from(pdf.image(pdf.pages[1].xobjects[0]), "latin1").toString("base64");
    const hits = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, img.height - 128, 128, 128).data; // the bottom-left corner, where the triad would be
      // The triad's X and Y arrows are red #c62828 and green #2e7d32; every face not selected is grey (A5), so a
      // clearly red or green pixel there is the triad. Not ±8 of its colours: JPEG blurs its 1 px lines further
      // (a picture with the triad drawn in had 0 pixels within ±8; builder default, spec S1).
      let n = 0;
      for (let i = 0; i < px.length; i += 4) {
        const [r, g2, b] = [px[i], px[i + 1], px[i + 2]];
        if ((r - Math.max(g2, b) > 50) || (g2 - Math.max(r, b) > 30)) n++;
      }
      return n;
    }, jpeg);
    expect(hits).toBe(0);
  }
  const first = flat(pdf.pages[0].text);
  const stock = (result.stock.size_in as number[]).map((v) => v.toFixed(3)).join(" × "); // the part's own axes, as the screen shows it
  for (const text of ["DFMA Review report", "report_sample.step", `${result.findings.length} findings: 4 Fix, 4 Review.`,
    "Machine: 3-axis mill", `Stock: ${stock} in block`, "Setup 1 · from +X", "Setup 2 · from -X",
    "1. 1/4 in end mill (em-0.250)  hole-1", "2. 0.250 in (1/4) drill (dr-0.2500)  hole-2",
    "3. 3/4 in end mill (em-0.750)  pocket-1", "4. 1/32 in end mill (smallest; nothing fits) (em-0.031)  pocket-1", "Tool loads: 4 (the first in each setup counts)", "Tools (4)",
    "Cost drivers", "Distinct tools: 4 × 1.0 = 4.0", "Sharp or small inside corners: 4 × 1.0 = 4.0",
    "Undersized or sub-1/8 in tools: 1 × 1.0 = 1.0", "Deep pockets: 1 × 1.0 = 1.0", "estimate",
    "Total score: 14.0 points Score is", // D-061: the total, with no "(partial)" in the Python app
    "Checks run: Hole depth check, Hole size check, Corner radius check"]) { // check names (review-steps S1)
    expect(first.includes(text), `${JSON.stringify(text)} is not on page 1`).toBe(true);
  }

  // jsPDF lists every image in one shared resource table, so count what a page draws
  const picturesDrawn = (n: number) => (pdf.pages[n].contents.match(/\bDo\b/g) ?? []).length;

  expect(picturesDrawn(0)).toBe(0); // the pictures are on the finding pages
  // One section per finding, each with its own picture, after page 1 (and an assumptions page last).
  expect(pdf.pages.length).toBe(1 + result.findings.length + 1);
  for (const [i, finding] of (result.findings as Result[]).entries()) {
    const n = i + 1;
    const section = pdf.pages[n];
    expect(section.text.startsWith(`${finding.id} `), section.text.slice(0, 40)).toBe(true);
    const word = ({ high: "FIX", medium: "REVIEW" } as Record<string, string>)[finding.severity]; // D-042: words, not high / medium
    expect(section.text.startsWith(`${finding.id} · ${word} · `), section.text.slice(0, 40)).toBe(true);
    expect(section.text.includes("D-0")).toBe(false); // limits in words, no decision ids (review-steps S1)
    expect(flat(section.text).includes(finding.title)).toBe(true);
    expect(picturesDrawn(n)).toBe(1);
  }
  const last = pdf.pages.length - 1;
  expect(pdf.pages[last].text.includes("Assumptions") && picturesDrawn(last) === 0).toBe(true);
  const images = pdf.pages[1].xobjects.map((id) => pdf.image(id)); // the shared table: one picture per set of faces
  // Two findings on the same faces (hole-1's size and depth) get the same picture, which jsPDF stores once.
  const faceSets = new Set((result.findings as Result[]).map((f) => [...f.faces].sort((a: number, b: number) => a - b).join(",")));
  expect(images.length === faceSets.size && new Set(images).size === images.length).toBe(true);
});

/** The pair fixtures: a placeholder STEP and .ipt, the service's answer faked from a committed JSON result. */
async function pairPdf(page: Page, testInfo: import("@playwright/test").TestInfo, result: Result, stepName: string, iptName: string,
  panel: string): Promise<{ pdf: Pdf }> {
  await page.addInitScript("window.__dfmaFakeService = true");
  await page.route("**/api/analyze", fulfilling(result));
  await page.goto("/");
  await page.getByTestId("upload-ipt").setInputFiles({ name: iptName, mimeType: "application/octet-stream", buffer: Buffer.from("placeholder") });
  await page.getByTestId("upload-file").setInputFiles({ name: stepName, mimeType: "application/octet-stream", buffer: Buffer.from("placeholder") });
  await shown(page, stepName);
  await expect(page.getByTestId(panel)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-pdf").click()]);
  const path = testInfo.outputPath("report.pdf");
  await download.saveAs(path);
  return { pdf: readPdf(path) };
}

test("test_pdf_threads", { tag: "@timed" }, async ({ page }, testInfo) => {
  // J5: the summary page's Threads section, one line per thread; F26 (the disagreeing thread) has its page.
  // Timed: waits 30 s for the PDF of the large CTC 04 / STC 10 fixture (about 10 s alone); CI's lanes slowed it past that (S7)
  const { pdf } = await pairPdf(page, testInfo, fixture("stc_10.json"), "nist_stc_10_asme1_ap242-e2.stp",
    "INV_nist_ftc_10_asme1_2024.ipt", "threads-panel");
  const text = squash(flat(pdf.pages.map((p) => p.text).join(" ")));
  for (const line of ["Threads (from INV_nist_ftc_10_asme1_2024.ipt)", "5 matched, 1 disagrees, 0 not mapped.",
    "hole-38 M3x0.5 - 6H 0.236 in [6 mm] deep tap drill 0.098 in [2.5 mm] disagrees: 0.004 in [0.10 mm] "
    + "off the hole's axis; see F26",
    "hole-36 M3x0.5 - 6H 0.236 in [6 mm] deep tap drill 0.098 in [2.5 mm] matched"]) {
    expect(text.includes(line), `${JSON.stringify(line)} is not in the PDF`).toBe(true);
  }
  const pages = pdf.pages.map((p) => flat(p.text));
  expect(pages.some((p) => p.includes("F26 · REVIEW"))).toBe(true); // its finding page, headed with the word (D-042)
});

test("test_pdf_hole_features", { tag: "@timed" }, async ({ page }, testInfo) => {
  // I2 S1 J6: the summary page's Hole features section after Threads (D-040), one line per feature; a
  // disagreeing hole (F39) has its finding page.
  // Timed: waits 30 s for the PDF of the large CTC 04 / STC 10 fixture (about 10 s alone); CI's lanes slowed it past that (S7)
  const { pdf } = await pairPdf(page, testInfo, fixture("ctc_04.json"), "nist_ctc_04_asme1_ap242-e1.stp",
    "INV_nist_ctc_04_asme1_2021.ipt", "hole-features-panel");
  const text = squash(flat(pdf.pages.map((p) => p.text).join(" ")));
  for (const line of ["Hole features (from INV_nist_ctc_04_asme1_2021.ipt)",
    "9 Hole features, 54 holes: 40 matched, 13 disagree, 1 not mapped. Sizes as designed in the .ipt.",
    "hf-7 Countersink · 30 holes · Hole20: Ø0.551 in [14 mm] through, countersink Ø0.787 in [20 mm] × 90°. "
    + "26 matched, 4 disagree, 0 not mapped (findings F35, F36, F37, F38).",
    "hf-8 Countersink · 1 hole · Hole21: Ø0.551 in [14 mm] through, countersink Ø0.787 in [20 mm] × 90°. "
    + "0 matched, 0 disagree, 1 not mapped; not mapped: no hole on this axis (our limit, not a finding).",
    "(finding F39)",
    "hole-37 M12x1.75 - 6H Hole8 0.984 in [25 mm] deep", // I2 S2: the thread's feature name
    "F35 · REVIEW · Hole feature vs hole · .ipt check Hole20 hole on hole-12"]) { // I2 S2: the name in its title
    expect(text.includes(line), `${JSON.stringify(line)} is not in the PDF`).toBe(true);
  }
  expect(text.indexOf("Threads (from")).toBeLessThan(text.indexOf("Hole features (from"));
  const pages = pdf.pages.map((p) => flat(p.text));
  expect(pages.some((p) => p.includes("F39 · REVIEW"))).toBe(true); // its finding page
});

test("test_pdf_blends", { tag: "@timed" }, async ({ page }, testInfo) => {
  // I3 S3 (D-043): the summary page's Fillets and chamfers section after Hole features, one line per blend.
  // Timed: waits 30 s for the PDF of the large CTC 04 / STC 10 fixture (about 10 s alone); CI's lanes slowed it past that (S7)
  const { pdf } = await pairPdf(page, testInfo, fixture("ctc_04.json"), "nist_ctc_04_asme1_ap242-e1.stp",
    "INV_nist_ctc_04_asme1_2021.ipt", "blends-panel");
  const text = squash(flat(pdf.pages.map((p) => p.text).join(" ")));
  for (const line of ["Fillets and chamfers (from INV_nist_ctc_04_asme1_2021.ipt)",
    "7 fillets, 1 chamfer: 8 matched, 0 disagree, 0 not mapped. Sizes as designed in the .ipt.",
    "bl-2 Chamfer · 0.197 in [5 mm] × 0.197 in [5 mm], 90°: matched; 12 of 24 faces found in the STEP.",
    "bl-8 Fillet · R0.197 in [5 mm]: matched; 32 of 36 faces found in the STEP; copied by 1 pattern or "
    + "mirror feature."]) {
    expect(text.includes(line), `${JSON.stringify(line)} is not in the PDF`).toBe(true);
  }
  expect(text.indexOf("Hole features (from")).toBeLessThan(text.indexOf("Fillets and chamfers (from"));
});
