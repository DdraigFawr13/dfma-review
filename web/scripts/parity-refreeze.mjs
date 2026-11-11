// npm --prefix web run parity:refreeze [quick|full] [--write]: the guarded parity re-freeze (steps-slots spec, Design
// "Parity re-freeze"; P0, D-085). Runs src/engine/parity-refreeze.test.ts on four shards; each prints the files that
// changed (the allowed changes, with the setups before and after) and any change outside the slice's allowed list.
// Without --write it only reports. With --write, and only when no shard refused a change, it copies the new keys into
// tests/parity/key/ (the index is unchanged). Exits 1 when any shard refused a change or failed.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const write = args.includes("--write");
const set = args.find((a) => !a.startsWith("--")) ?? "quick";
const shards = Number(process.env.PARITY_SHARDS ?? 4);
const dir = mkdtempSync(join(tmpdir(), "refreeze-"));
const keyDir = resolve(fileURLToPath(new URL("../../tests/parity/key", import.meta.url)));
const started = Date.now();

function runShard(k) {
  const report = join(dir, `report-${k}.txt`);
  const env = { ...process.env, PARITY_SET: set, PARITY_SHARD: `${k}/${shards}`, PARITY_REFREEZE_OUT: join(dir, "keys"), PARITY_REFREEZE_REPORT: report };
  const child = spawn("npx", ["vitest", "run", "--config", "vitest.parity.config.ts", "src/engine/parity-refreeze.test.ts"],
    { env, stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" });
  return new Promise((done) => child.on("close", (code) => done({ k, code, report })));
}

const results = await Promise.all(Array.from({ length: shards }, (_, k) => runShard(k)));
for (const r of results) console.log(existsSync(r.report) ? readFileSync(r.report, "utf8") : `## shard ${r.k}: no report (exit ${r.code})`);
const failed = results.filter((r) => r.code !== 0).map((r) => r.k);
const keys = existsSync(join(dir, "keys")) ? readdirSync(join(dir, "keys")) : [];
console.log(`\nparity:refreeze ${set}: ${keys.length} key file(s) changed; ${failed.length ? `shard(s) ${failed.join(", ")} refused or failed` : "no change refused"}; ` +
  `${((Date.now() - started) / 1000).toFixed(1)} s`);
if (failed.length) process.exit(1);
if (write) {
  for (const f of keys) copyFileSync(join(dir, "keys", f), join(keyDir, f));
  console.log(`wrote ${keys.length} key file(s) to tests/parity/key/`);
} else console.log("report only: run again with --write to write them");
