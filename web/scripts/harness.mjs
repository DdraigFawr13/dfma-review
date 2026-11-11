// Run the Inventor test harness's Node ports (src/inventor-harness/):
//   node scripts/harness.mjs local-pairs               tests/inventor/local_pairs.py (LOCAL_PAIRS_DIR, LOCAL_PAIRS_TOML)
//   node scripts/harness.mjs nist-pair <step> <ipt>    tests/inventor/nist_pair.py
// They run under vitest because the engine's imports carry no file extension; the reporter stays quiet, so the
// output is the Python script's lines.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const [what, step, ipt] = process.argv.slice(2);
const files = { "local-pairs": "src/inventor-harness/local-pairs.run.ts", "nist-pair": "src/inventor-harness/nist-pair.run.ts" };
if (!files[what] || (what === "nist-pair" && !(step && ipt))) {
  console.error("usage: harness.mjs local-pairs | nist-pair <step> <ipt>");
  process.exit(2);
}
const env = { ...process.env, NIST_PAIR_STEP: step && resolve(step), NIST_PAIR_IPT: ipt && resolve(ipt) };
const run = spawnSync("npx", ["vitest", "run", "--silent=false", "--config", "vitest.harness.config.ts", files[what]],
  { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(run.status ?? 1);
