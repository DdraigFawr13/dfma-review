// Port of tests/service/test_nist.py: the NIST MBE PMI gold-standard files (D-011) stay untouched, all read, and the
// map never gets worse. The scorecard is tests/nist/scorecard.toml; the files are the AP242 STEP files of the zip.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "smol-toml";
import { beforeAll, describe, expect, test } from "vitest";
import { nistFiles } from "../../grading/scorecard";
import { analyzeOrRefuse, loadNodeOc } from "../node";
import type { OC } from "../oc";

const ROOT = resolve(__dirname, "../../../..");
const NIST_DIR = join(ROOT, "tests", "nist");
const ZIP = join(NIST_DIR, "NIST-PMI-STEP-Files.zip");
const SHA256 = "8fa78429e6d8d9b0d7681d223b6aa9ec98c3772185c55b1a0e3679b21c181911";

interface Card { name: string; face_count: number; not_analysed: number; features: number }
const SCORECARD = Object.fromEntries(
  ((parse(readFileSync(join(NIST_DIR, "scorecard.toml"), "utf8")) as unknown as { file: Card[] }).file).map((f) => [f.name, f]));

/** nist_files.ap242_files: unpack the zip once into tests/nist/.cache (a private folder renamed into place). */
function unpackOnce() {
  const cache = join(NIST_DIR, ".cache");
  const folder = join(cache, "NIST-PMI-STEP-Files");
  if (existsSync(folder)) return;
  mkdirSync(cache, { recursive: true });
  const work = mkdtempSync(join(cache, ".unpack-"));
  try {
    execFileSync("unzip", ["-q", ZIP, "-d", work]);
    renameSync(join(work, "NIST-PMI-STEP-Files"), folder);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
unpackOnce();
const FILES = nistFiles();

/** test_rows.covers_every_finding_once: rows cover each finding once, each has a short title, Fix rows come first. */
function coversEveryFindingOnce(result: any): void { // eslint-disable-line @typescript-eslint/no-explicit-any
  const ids: string[] = result.rows.flatMap((r: any) => r.findings); // eslint-disable-line @typescript-eslint/no-explicit-any
  expect([...ids].sort()).toEqual(result.findings.map((f: { id: string }) => f.id).sort());
  expect(new Set(ids).size).toBe(ids.length);
  const sev: string[] = result.rows.map((r: { severity: string }) => r.severity);
  expect(sev).toEqual([...sev].sort((a, b) => Number(a !== "high") - Number(b !== "high")));
  for (const r of result.rows) {
    expect(r.short && r.sentence && String(r.check).endsWith("check"), JSON.stringify(r)).toBeTruthy();
    expect(r.id).toBe(`row:${r.findings[0]}`);
  }
}

test("the zip is untouched", () => {
  expect(createHash("sha256").update(readFileSync(ZIP)).digest("hex"),
    "tests/nist/NIST-PMI-STEP-Files.zip changed; it must stay byte for byte as NIST publishes it").toBe(SHA256);
});

test("every file is scored", () => {
  expect(FILES.length).toBe(17);
  expect(FILES.map((p) => p.split("/").pop()!).sort()).toEqual(Object.keys(SCORECARD).sort());
});

describe("NIST files", () => {
  let oc: OC;
  beforeAll(async () => { oc = await loadNodeOc(); }, 120_000);

  test.each(FILES.map((p) => [p.split("/").pop()!.replace(/\.stp$/, ""), p]))("%s", async (_stem, path) => {
    const name = path.split("/").pop()!;
    const start = performance.now();
    const result = (await analyzeOrRefuse(oc, new Uint8Array(readFileSync(path)), name, "mill")) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const seconds = (performance.now() - start) / 1000;
    const score = SCORECARD[name];
    expect(result.error, name).toBeUndefined();
    expect(seconds, `${name} took ${seconds.toFixed(1)} s`).toBeLessThan(10);
    expect(result.part.face_count).toBe(score.face_count);
    // The map may only get better: fewer faces left unanalysed, at least as many features found.
    expect(result.part.not_analysed_faces.length).toBeLessThanOrEqual(score.not_analysed);
    expect(result.features.length).toBeGreaterThanOrEqual(score.features);
    coversEveryFindingOnce(result); // review-steps S2: rows cover every finding once
  }, 60_000);
});
