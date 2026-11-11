// D-082: which changes skip the engine-only checks (scripts/scope.mjs).
import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain .mjs script at the repo root, no type declarations
import { uiOnly } from "../../scripts/scope.mjs";

describe("uiOnly (D-082)", () => {
  it("is true for screen code, browser tests, the page, docs and mock-ups", () => {
    expect(uiOnly(["web/src/viewer.ts", "web/src/main.ts", "web/src/style.css", "web/src/steps.test.ts",
      "web/e2e/model.spec.ts", "web/index.html", "web/public/fonts/a.woff2", "docs/HANDOFF.md", "mockups/x.html", "README.md"])).toBe(true);
  });
  it.each([
    "web/src/engine/analyze.ts", // the engine
    "web/src/api.ts", // types the engine imports
    "web/src/worker.ts", // runs the engine
    "web/src/grading/score.ts", "web/src/inventor-harness/built.ts", // read by engine tests
    "config/tools.toml", // the engine's settings
    "web/package.json", "web/package-lock.json", // the packages
    "web/vite.config.ts", "web/vitest.parity.config.ts", "web/scripts/parity-run.mjs",
    "package.json", "scripts/scope.mjs", ".github/workflows/ci.yml", // the checks themselves
    "tests/parity/key/a.json.gz", "tests/parts/box.step", "tests/nist/x.stp",
  ])("is false when %s changes", (f) => {
    expect(uiOnly(["web/src/viewer.ts", f])).toBe(false);
  });
  it("is false for an empty change (nothing to judge by)", () => {
    expect(uiOnly([])).toBe(false);
  });
});
