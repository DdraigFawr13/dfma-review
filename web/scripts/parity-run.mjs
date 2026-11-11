// npm run parity [-- set]: the parity run on the browser engine, split over PARITY_SHARDS processes (default 4;
// S8a). Each process runs parity.test.ts with PARITY_SHARD=k/n and writes its counts to a temp file; this script
// prints one summary and exits non-zero when any shard fails or any file differs. PARITY_SET: quick (default) or full.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const set = process.env.PARITY_SET ?? process.argv[2] ?? "quick";
const shards = Number(process.env.PARITY_SHARDS ?? 4);
const dir = mkdtempSync(join(tmpdir(), "parity-"));
const started = Date.now();

function runShard(k) {
  const out = join(dir, `shard-${k}.json`);
  const env = { ...process.env, PARITY_SET: set, PARITY_SHARD: `${k}/${shards}`, PARITY_RESULTS: out };
  const child = spawn("npx", ["vitest", "run", "--silent=false", "--config", "vitest.parity.config.ts", "src/engine/parity.test.ts"],
    { env, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on("line", (line) => console.log(`[${k}] ${line}`));
  }
  return new Promise((resolve) => child.on("close", (code) => resolve({ k, code, out })));
}

const results = await Promise.all(Array.from({ length: shards }, (_, k) => runShard(k)));
const total = { files: 0, same: 0, bad: [], crashed: [], leftOut: {}, keys: [] };
const failed = [];
for (const r of results) {
  if (r.code !== 0 || !existsSync(r.out)) { failed.push(r.k); continue; }
  const s = JSON.parse(readFileSync(r.out, "utf8"));
  total.files += s.files; total.same += s.same; total.bad.push(...s.bad); total.crashed.push(...s.crashed);
  for (const [key, n] of Object.entries(s.leftOut)) total.leftOut[key] = (total.leftOut[key] ?? 0) + n;
  total.keys = s.keys;
}
const left = Object.keys(total.leftOut).length ? Object.entries(total.leftOut).map(([k, n]) => `${k} ${n}`).join(", ") : "none";
console.log(`\nparity ${set}: ${total.files} files compared, ${total.same} the same, ${total.bad.length} different, ` +
  `${total.crashed.length} Python crashed${total.crashed.length ? ` (${total.crashed.join(", ")})` : ""}; ` +
  `keys: ${total.keys.join(", ")}; files left out per key: ${left}; ` +
  `${shards} shards in ${((Date.now() - started) / 1000).toFixed(1)} s`);
if (failed.length) { console.log(`parity: shard(s) ${failed.join(", ")} failed`); process.exit(1); }
process.exit(total.bad.length ? 1 : 0);
