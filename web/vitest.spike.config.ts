/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// The spikes (research), kept out of `npm run check`: shape from .ipt (src/inventor-shape-spike/) and reach (src/reach-spike/).
export default defineConfig({
  server: { fs: { allow: [".."] } },
  test: { include: ["src/inventor-shape-spike/*.run.ts", "src/reach-spike/*.run.ts"], testTimeout: 600_000 },
});
