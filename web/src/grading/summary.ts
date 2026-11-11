// One line per result file (the browser engine's tests/grading/summary.py): hole and pocket surfaces found, wrong calls,
// hole surfaces given the right type, whole holes, and the calls on labels the scores leave out. A result file is the
// --out of grade.ts or of Python's grade.py (same shape).
//   node scripts/grading.mjs summary <result.json>...
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { summaryLine, type GradeResult } from "./score.ts";

for (const p of process.argv.slice(2)) console.log(summaryLine(basename(p), JSON.parse(readFileSync(p, "utf8")) as GradeResult));
