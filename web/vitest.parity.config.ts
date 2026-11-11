/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// npm run parity / parity:full / demo-results: the long Node runs kept out of `npm run check`.
export default defineConfig({
  server: { fs: { allow: [".."] } },
  test: { include: ["src/engine/parity.test.ts", "src/engine/demo-results.test.ts", "src/engine/port/edmr.test.ts"], testTimeout: 3_600_000 },
});
