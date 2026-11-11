/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// The shape-from-.ipt spike (src/inventor-shape-spike/, research), kept out of `npm run check`.
export default defineConfig({
  server: { fs: { allow: [".."] } },
  test: { include: ["src/inventor-shape-spike/*.run.ts"], testTimeout: 600_000 },
});
