// J7: the GitHub Pages build says "Test copy"; the work build (--mode work) does not. Both carry the browser copy's
// privacy line and hide the .ipt field (S1 mock-up, D-057).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

const WEB = resolve(__dirname, "..");

function build(mode: "test" | "work"): string {
  const out = mkdtempSync(join(tmpdir(), `dfma-pages-${mode}-`));
  try {
    const run = spawnSync(process.execPath, ["scripts/build-pages.mjs", "--mode", mode],
      { cwd: WEB, env: { ...process.env, DFMA_OUT_DIR: out }, encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    return readFileSync(join(out, "index.html"), "utf8");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

test("the test build says Test copy and the work build does not", () => {
  const testPage = build("test");
  const workPage = build("work");
  expect(testPage).toContain(">Test copy<");
  expect(workPage).not.toContain("Test copy");
  for (const page of [testPage, workPage]) {
    expect(page).toContain("Your file stays on this computer. Nothing is uploaded.");
    expect(page).not.toContain("deleted straight after");
    expect(page).toContain('id="ipt-field" hidden');
    expect(page).toContain(">Choose a STEP file to start.<");
    expect(page).toContain('href="licences.html"');
  }
}, 120_000);
