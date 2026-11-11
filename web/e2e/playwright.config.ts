// Browser e2e tests (port spec "Browser tests", S8b): the test build (web/dist-pages-test, VITE_TEST=1) on a static
// server, Chromium only. Run with `npm --prefix web run e2e`. Traces stay off unless asked for (--trace on).
import { defineConfig, devices } from "@playwright/test";

const PORT = 8766;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 120_000,
  retries: 0,
  reporter: [["list"]],
  workers: Number(process.env.E2E_WORKERS ?? 2),
  use: {
    baseURL,
    launchOptions: {
      // Software WebGL so the canvas renders headless (as the Python conftest did).
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
      // DFMA_CHROMIUM points at a preinstalled browser (the sandbox's /opt/pw-browsers build).
      executablePath: process.env.DFMA_CHROMIUM || undefined,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite preview --outDir dist-pages-test --port ${PORT} --strictPort --host 127.0.0.1`,
    cwd: "..",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
