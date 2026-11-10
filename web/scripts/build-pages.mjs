// npm run build:pages [-- --mode work]  /  npm run build:pages:test  /  node scripts/build-pages.mjs --demo
// Builds the static site with the browser engine (port spec Design, Hosting): sets VITE_ENGINE, VITE_COPY and
// VITE_TEST, then runs Vite's build. A wrapper, so the same command works on Windows, macOS and Linux.
import { build } from "vite";

const args = process.argv.slice(2);
const at = args.indexOf("--mode");
const mode = at >= 0 ? args[at + 1] : "test";
if (!["test", "work"].includes(mode)) {
  console.error(`unknown --mode ${mode}: use test or work`);
  process.exit(2);
}
// --demo: the browser copy's page answered through fetch, for scripts/make_demo.py --engine browser (D-056), into dist-demo/
process.env.VITE_ENGINE = args.includes("--demo") ? "demo" : "browser";
process.env.VITE_COPY = mode;
process.env.VITE_TEST = args.includes("--test") ? "1" : "";
await build();
