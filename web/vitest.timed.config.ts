/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// The tests that assert a wall-clock limit (Python's `timed` marker; VER-11): one file at a time, after the parallel
// default run, so other work cannot slow them past their limits. Run by `npm run timed` (root) and `npm --prefix web run timed`.
export default defineConfig({
  server: { fs: { allow: [".."] } },
  test: {
    include: ["src/engine/port/nist.test.ts", "src/engine/port/read_runtime.test.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
