// Why each missed step face was missed (steps S1 round 3): reruns the parts a grading result lists as step-class misses with
// the open-floor diagnostic on and prints a tally of reasons.
//   node --no-warnings --experimental-transform-types --import ./scripts/ts-register.mjs scripts/census-steps.ts <result.json> <out.json> [<set folder>]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadNodeOc } from "../src/engine/node.ts";
import { gradeFile } from "../src/grading/analyse.ts";
import { OPEN_DIAG } from "../src/engine/features/pockets.ts";
const res = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = process.argv[3];
const STEP = [8, 9, 10, 20, 21, 22];
const byPart = new Map<string, { class: number; faces: number[] }[]>();
for (const m of res.misses) if (STEP.includes(m.class)) { (byPart.get(m.part) ?? byPart.set(m.part, []).get(m.part)!).push(m); }
const oc = await loadNodeOc();
const rows: any[] = [];
for (const [part, ms] of byPart) {
  const r = await gradeFile(oc, resolve(process.argv[4] ?? "../tests/grading/.cache/mfcadpp", part));
  const held = new Map<number, string>(); for (const [k, fs] of r.held_steps ?? []) for (const f of fs) held.set(f, k);
  for (const m of ms) for (const f of m.faces) {
    rows.push({ part, class: m.class, face: f, kind: r.faces[f]?.kind, held: held.get(f) ?? null, why: OPEN_DIAG.why.get(f) ?? [] });
  }
}
writeFileSync(out, JSON.stringify(rows, null, 1));
const tally = new Map<string, number>();
for (const x of rows) { const k = `${x.class} | ${x.held ? "HELD " + x.held : ""} ${x.why.join("; ") || "(never a floor/wall candidate)"}`; tally.set(k, (tally.get(k) ?? 0) + 1); }
for (const [k, n] of [...tally].sort()) console.log(String(n).padStart(4), k);
console.log("total", rows.length);
