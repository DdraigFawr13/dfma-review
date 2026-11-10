// The parity run (port spec J2, Parity): every file of the set through analyze() in Node, compared with the Python
// key on the keys ported so far. PARITY_KEY_DIR (default tests/parity/.cache/key, written by
// `python tests/parity/key.py --set <set>`) and PARITY_SET (default quick). A missing key fails; it never skips.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import type { Process } from "../api";
import { compare, SLICE } from "./compare";
import { analyzeOrRefuse, loadNodeOc } from "./node";

const ROOT = resolve(__dirname, "../../..");
const KEY_DIR = resolve(ROOT, process.env.PARITY_KEY_DIR ?? "tests/parity/.cache/key");
const SET = process.env.PARITY_SET ?? "quick";

test(`S${SLICE} keys: the browser engine equals the Python key on the ${SET} set`, async () => {
  const indexPath = resolve(KEY_DIR, `index-${SET}.json`);
  expect(existsSync(indexPath), `${indexPath} is missing: run python tests/parity/key.py --set ${SET}`).toBe(true);
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as { path: string; process: Process; key: string }[];
  const oc = await loadNodeOc();
  const bad: string[] = [];
  const crashed: string[] = [];
  let same = 0;
  for (const entry of index) {
    const key = JSON.parse(readFileSync(resolve(KEY_DIR, entry.key), "utf8"));
    const bytes = new Uint8Array(readFileSync(resolve(ROOT, entry.path)));
    const result = analyzeOrRefuse(oc, bytes, entry.path.split("/").pop()!, entry.process);
    const outcome = compare(result, key);
    if (outcome.status === "python_crashed") crashed.push(entry.path);
    if (outcome.diffs.length) bad.push(`${entry.path}:\n    ${outcome.diffs.join("\n    ")}`);
    else if (outcome.status === "same") same++;
  }
  console.log(`parity ${SET}: ${index.length} files compared, ${same} the same, ${bad.length} different, ` +
    `${crashed.length} Python crashed${crashed.length ? ` (${crashed.join(", ")})` : ""}; ` +
    `keys: part, faces, assumptions, rules_run, checks_run on every file; left out: every other key (S2 to S7)`);
  expect(bad, bad.join("\n")).toEqual([]);
}, 3_600_000);
