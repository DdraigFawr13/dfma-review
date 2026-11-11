// Launcher for the grading entries on the browser engine (S8a): plain Node, which reads the engine's TypeScript
// through scripts/ts-register.mjs.
//   node scripts/grading.mjs grade mfcadpp|situs <path> [...]      (src/grading/grade.ts)
//   node scripts/grading.mjs summary <result.json>...              (src/grading/summary.ts)
//   node scripts/grading.mjs nist-scorecard                        (src/grading/scorecard.ts nist)
//   node scripts/grading.mjs edmr-scorecard                        (src/grading/scorecard.ts edmr)
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const [cmd, ...rest] = process.argv.slice(2);
const entries = { grade: ["../src/grading/grade.ts"], summary: ["../src/grading/summary.ts"],
  "nist-scorecard": ["../src/grading/scorecard.ts", "nist"], "edmr-scorecard": ["../src/grading/scorecard.ts", "edmr"] };
if (!entries[cmd]) {
  console.error("usage: grading.mjs grade|summary|nist-scorecard|edmr-scorecard [args]");
  process.exit(2);
}
const [entry, ...fixed] = entries[cmd];
const args = ["--no-warnings", "--experimental-transform-types", "--import", here("./ts-register.mjs"), here(entry), ...fixed, ...rest];
process.exit(spawnSync(process.execPath, args, { stdio: "inherit" }).status ?? 1);
