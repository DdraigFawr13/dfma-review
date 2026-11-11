/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

// Two builds (port spec Design "web/vite.config.ts"):
// - the service build (npm run build): web/dist, served by the Python app (python -m dfma start);
// - the static site (npm run build:pages, scripts/build-pages.mjs): VITE_ENGINE=browser, base "./", into
//   dist-pages/ (dist-pages-test/ with VITE_TEST=1). VITE_COPY=test (default) marks it "Test copy"; work has no mark.
const ENGINE = process.env.VITE_ENGINE ?? "service";
const COPY = process.env.VITE_COPY ?? "test";
const TEST = process.env.VITE_TEST === "1";

/** The browser copy's page (S1 mock-up, D-057): the copy mark, its privacy line and the Licenses link (the .ipt
 *  field and the status line hidden until S7 are back as in the service copy). Done on the HTML so the built index.html carries them (J7). */
function browserPage(): Plugin {
  return {
    name: "dfma-browser-page",
    transformIndexHtml(html) {
      const swap = (from: string, to: string) => {
        if (!html.includes(from)) throw new Error(`index.html no longer holds: ${from}`);
        html = html.replace(from, to);
      };
      if (COPY === "test") swap("<h1>DFMA Review</h1>", '<h1>DFMA Review</h1>\n      <span class="copytag" data-testid="copy-tag">Test copy</span>');
      swap("Your files are analyzed on this computer and deleted straight after. Nothing is kept.",
        "Your file stays on this computer. Nothing is uploaded.");
      swap("</main>", '</main>\n    <footer class="foot"><a href="licences.html" data-testid="licenses-link">Licenses</a></footer>');
      return html;
    },
  };
}

/** Every npm package the built page ships must be named on licences.html (port spec J6; SAFE-05): the build fails
 *  otherwise. The packages come from the bundle's own module ids, so a package that jsPDF pulls in counts too. */
function licensesListed(): Plugin {
  return {
    name: "dfma-licenses-listed",
    generateBundle() {
      const packages = new Set<string>();
      for (const id of this.getModuleIds()) {
        const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id.replace(/\\/g, "/"));
        if (m) packages.add(m[1]);
      }
      const page = readFileSync(resolve(import.meta.dirname, "public/licences.html"), "utf8");
      const missing = [...packages].filter((p) => !page.includes(`>${p}<`)).sort();
      if (process.env.DFMA_LIST_PACKAGES) console.log(`packages: ${[...packages].sort().join(" ")}`);
      if (missing.length) this.error(`public/licences.html does not list: ${missing.join(", ")}`);
    },
  };
}

export default defineConfig(ENGINE === "demo"
  ? {
      // The demo (scripts/make_demo.py --engine browser): the browser copy's page, its answers from browser-engine
      // results the demo script inlines; absolute paths, as make_demo.py reads web/dist.
      plugins: [browserPage()],
      build: { outDir: "dist-demo", emptyOutDir: true, chunkSizeWarningLimit: 5000 },
      server: { fs: { allow: [".."] } },
    }
  : ENGINE === "browser"
  ? {
      base: "./",
      plugins: [browserPage(), licensesListed()],
      build: { outDir: process.env.DFMA_OUT_DIR ?? (TEST ? "dist-pages-test" : "dist-pages"), emptyOutDir: true, chunkSizeWarningLimit: 5000 },
      worker: { format: "es", plugins: () => [licensesListed()] }, // the worker is its own bundle: check it too
      server: { fs: { allow: [".."] } }, // config/*.toml is read with ?raw from outside web/
    }
  : {
      build: { outDir: "dist", emptyOutDir: true },
      server: { proxy: { "/api": "http://127.0.0.1:8000" }, fs: { allow: [".."] } },
      test: { exclude: ["**/node_modules/**", "e2e/**", "src/engine/parity.test.ts", "src/engine/demo-results.test.ts"] },
    });
