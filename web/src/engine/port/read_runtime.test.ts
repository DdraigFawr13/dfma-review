// Ported from tests/service/test_read.py::test_runtime (S8b). Python marked it `timed`: it asserts a wall-clock limit,
// so it runs alone in the timed step (vitest.timed.config.ts, `npm run timed`), never in the parallel default run
// (VER-11; on CI's parallel run, two NIST limits failed at 11.7 s and 13.3 s, run 42966410926).
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { loadNodeOc, analyzeOrRefuse } from "../node";
import { PARTS } from "./groupa_common";

const STEP_PARTS = readdirSync(PARTS).filter((f) => f.endsWith(".step")).sort();

describe("runtime", () => {
  // Every committed part finishes in under 10 s, including engine start (the browser's worker start; Python's was the
  // process start). Each part loads its own engine.
  for (const file of STEP_PARTS) {
    test(file.replace(/\.step$/, ""), async () => {
      const start = performance.now();
      const engine = await loadNodeOc();
      try {
        await analyzeOrRefuse(engine, new Uint8Array(readFileSync(resolve(PARTS, file))), file, "mill"); // bad files answer too
      } finally {
        const elapsed = (performance.now() - start) / 1000;
        expect(elapsed, `${file} took ${elapsed.toFixed(2)} s`).toBeLessThan(10.0);
      }
    });
  }
});
