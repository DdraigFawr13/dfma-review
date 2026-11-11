/// <reference types="vitest/config" />
import { writeSync } from "node:fs";
import { defineConfig } from "vite";

// The test harness's runners (src/inventor-harness/*.run.ts, started by scripts/harness.mjs), kept out of `npm run check`.
// The reporter says nothing but a failed test's message, so the run's output is the script's own lines.
export default defineConfig({
  server: { fs: { allow: [".."] } },
  test: {
    include: ["src/inventor-harness/*.run.ts"],
    testTimeout: 3_600_000,
    reporters: [{
      onTestCaseResult(testCase: { result(): { state: string; errors?: { message: string }[] } }) {
        const r = testCase.result();
        if (r.state === "failed") writeSync(2, (r.errors ?? []).map((e) => e.message).join("\n") + "\n");
      },
    }],
  },
});
