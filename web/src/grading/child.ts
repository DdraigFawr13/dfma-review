// One file in its own process, for run.ts: `node ... child.ts grade <file>` prints MARK and the grading result
// (analyse.ts; the browser engine's child.py), `child.ts counts <file>` the counts a scorecard keeps. Never import it.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { analyzeOrRefuse, loadNodeOc } from "../engine/node.ts";
import { MSG_FAILED } from "../engine/settings.ts";
import { gradeFile } from "./analyse.ts";
import { MARK } from "./score.ts";

const [mode, path] = process.argv.slice(2);
let out: object;
try {
  const oc = await loadNodeOc();
  if (mode === "grade") out = await gradeFile(oc, path);
  else {
    // A refusal is a read error; any other failure (MSG_FAILED) is the browser engine's "crash" (python: the worker stopped)
    const r = (await analyzeOrRefuse(oc, new Uint8Array(readFileSync(path)), basename(path), "mill")) as {
      error?: string; part: { face_count: number; not_analysed_faces: number[] }; features: unknown[];
    };
    out = r.error
      ? { status: r.error === MSG_FAILED ? "crash" : "read_error", face_count: 0, not_analysed: 0, features: 0, error: null }
      : { status: "ok", face_count: r.part.face_count, not_analysed: r.part.not_analysed_faces.length, features: r.features.length, error: null };
  }
} catch (exc) { // a Python-level failure; an engine abort kills the process and the parent calls it a crash
  out = { faces: [], features: [], ignored_solids: 0, error: `${(exc as Error).name}: ${(exc as Error).message}` };
}
process.stdout.write(`\n${MARK}${JSON.stringify(out)}\n`);
process.exit(0);
