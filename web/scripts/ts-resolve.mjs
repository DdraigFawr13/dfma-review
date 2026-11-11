// A Node resolve hook: lets plain Node import the engine's extensionless TypeScript paths ("./analyze" for
// analyze.ts, "./rules" for rules/index.ts). The grading entries use it:
//   node --import ./scripts/ts-register.mjs --experimental-transform-types src/grading/grade.ts ...
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:") && !/\.\w+$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    const path = fileURLToPath(base);
    for (const tail of [".ts", "/index.ts"]) {
      if (existsSync(path + tail) && statSync(path + tail).isFile()) return next(base.href + tail, context);
    }
  }
  return next(specifier, context);
}

// Vite's `?raw` imports (config/*.toml as text): the file's text as the default export.
export async function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith("?raw")) {
    const text = readFileSync(fileURLToPath(url.slice(0, -4)), "utf8");
    return { format: "module", shortCircuit: true, source: `export default ${JSON.stringify(text)};` };
  }
  return next(url, context);
}
