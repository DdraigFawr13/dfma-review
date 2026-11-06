import { defineConfig } from "vite";

// The page is served by the Python app (python -m dfma start) from web/dist.
export default defineConfig({
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
