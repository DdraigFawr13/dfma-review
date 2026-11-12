// Build one of our labelled grading sets from its make.ts (steps and slots spec, "Test set"): plain Node, which reads
// the engine's TypeScript through scripts/ts-register.mjs, as grading.mjs does.
//   node web/scripts/make-set.mjs <set>        (runs tests/grading/sets/<set>/make.ts)
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const [set] = process.argv.slice(2);
const entry = set && here(`../../tests/grading/sets/${set}/make.ts`);
if (!entry || !existsSync(entry)) {
  console.error("usage: make-set.mjs <set>   (a folder of tests/grading/sets with a make.ts)");
  process.exit(2);
}
const args = ["--no-warnings", "--experimental-transform-types", "--import", here("./ts-register.mjs"), entry];
process.exit(spawnSync(process.execPath, args, { stdio: "inherit" }).status ?? 1);
