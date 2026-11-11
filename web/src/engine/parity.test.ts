// The parity run (port spec J2, Parity): every file of the set through analyze() in Node, compared with the key on
// the keys ported so far. PARITY_KEY_DIR (default tests/parity/key, the frozen key; S8a) and PARITY_SET (default
// quick). A missing key fails; it never skips.
// S8a: PARITY_SHARD="k/n" runs only shard k of n (parity-shard.ts; scripts/parity-run.mjs starts four). Each shard
// writes its counts to PARITY_RESULTS (a JSON file) for the runner's one summary line.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { expect, test } from "vitest";
import type { Process } from "../api";
import { compare, PORTED_KEYS, SLICE } from "./compare";
import { analyzeOrRefuse, loadNodeOc } from "./node";
import { parseShard, shardOf } from "./parity-shard";

const ROOT = resolve(__dirname, "../../..");
const KEY_DIR = resolve(ROOT, process.env.PARITY_KEY_DIR ?? "tests/parity/key");
// S8b (D-073): the faces whose point positions differ from the frozen Python key by tessellation only (measured per
// face on 2026-11-11 with Python OCC and the browser engine; both on the surface within 1.3e-4 mm). Keyed by the
// entry's path in tests/parity/key/index-*.json, by face index.
const KNOWN_TESSELLATION: Record<string, number[]> = {
  "tests/grading/sets/bullnose_draft/bn_ball6.step": [14, 18],
  "tests/edmr/models/STEP/STI/nasty_cheese/nasty_cheese.stp": [202],
};

const SET = process.env.PARITY_SET ?? "quick";
const { k, n } = parseShard(process.env.PARITY_SHARD ?? "0/1");
const RESULTS = process.env.PARITY_RESULTS;
// The frozen key is gzipped (key.py --freeze); an older plain .json key still reads
// Frozen .ipt inputs are gzipped too (the hostile set, key.py --freeze)
const readBytes = (file: string): Buffer => (file.endsWith(".gz") ? gunzipSync(readFileSync(file)) : readFileSync(file));
const readKey = (file: string) => JSON.parse((file.endsWith(".gz") ? gunzipSync(readFileSync(file)) : readFileSync(file)).toString("utf8"));

type Entry = { path: string; process: Process; key: string; ipt?: string; harness?: boolean };

test(`S${SLICE} keys: the browser engine equals the key on the ${SET} set (shard ${k}/${n})`, async () => {
  const indexPath = resolve(KEY_DIR, `index-${SET}.json`);
  expect(existsSync(indexPath), `${indexPath} is missing: the frozen key is tests/parity/key/ (S8b: the frozen key)`).toBe(true);
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as Entry[];
  // Each entry's size: its STEP and its .ipt, so the shards get about the same bytes
  const sizeOf = (e: Entry) => readFileSync(resolve(ROOT, e.path)).length + (e.ipt ? readBytes(resolve(ROOT, e.ipt)).length : 0);
  const shard = shardOf(index.map(sizeOf), n);
  const mine = index.map((e, i) => [e, i] as const).filter(([, i]) => shard[i] === k);
  const oc = await loadNodeOc();
  const bad: string[] = [];
  const crashed: string[] = [];
  let same = 0;
  let known = 0;
  const leftOut = new Map<string, number>();
  const started = performance.now();
  for (const [entry, i] of mine) {
    const t0 = performance.now();
    const key = readKey(resolve(KEY_DIR, entry.key));
    const bytes = new Uint8Array(readFileSync(resolve(ROOT, entry.path)));
    // S7: an .ipt beside the STEP; `harness` lines the pair up with the transform Python's harness found (nist_pair.py)
    const ipt = entry.ipt ? { bytes: new Uint8Array(readBytes(resolve(ROOT, entry.ipt))), name: entry.ipt.replace(/\.gz$/, "").split("/").pop()! } : undefined;
    const harness = entry.harness ? { transform: key.__harness?.transform, check: false } : {};
    const result = await analyzeOrRefuse(oc, bytes, entry.path.split("/").pop()!, entry.process, "al6061", ipt, harness);
    const outcome = compare(result, key);
    if (outcome.status === "python_crashed") crashed.push(entry.path);
    for (const kk of new Set(outcome.leftOut)) leftOut.set(kk, (leftOut.get(kk) ?? 0) + 1);
    const label = entry.ipt ? `${entry.path} + ${entry.ipt}${entry.harness ? " (harness)" : ""}` : entry.path;
    // S8b (D-073, measured 2026-11-11): these faces' points differ between the frozen Python key and the browser's
    // OpenCascade (8.0.0 vs pythonocc's 8.0.1); the same points lie on the surface within 1.3e-4 mm. Only the position
    // compare of these named faces is exempt; every other key and face of the file is still compared.
    const exempt = KNOWN_TESSELLATION[entry.path] ?? [];
    const diffs = outcome.diffs.filter((d) => {
      const m = /^faces\[(\d+)\]\.positions:/.exec(d);
      return !(m && exempt.includes(Number(m[1])));
    });
    const tessellation = outcome.diffs.length > 0 && diffs.length === 0;
    if (tessellation) known++;
    if (diffs.length) bad.push(`${label}:\n    ${diffs.join("\n    ")}`);
    // One line per file, as it finishes (Morgan, 2026-11-10: a long run shows it is moving, and a stopped run keeps its
    // results so far)
    const secs = (x: number) => (x / 1000).toFixed(1);
    console.log(`parity ${SET} [${i + 1}/${index.length}] shard ${k}/${n} ${diffs.length ? "DIFFERENT" : tessellation ? "KNOWN TESSELLATION" : outcome.status} ` +
      `${secs(performance.now() - t0)} s (total ${secs(performance.now() - started)} s): ${label}` +
      (diffs.length ? `\n    ${diffs.slice(0, 5).join("\n    ")}` : ""));
    if (!diffs.length && outcome.status === "same") same++;
  }
  if (RESULTS) {
    writeFileSync(RESULTS, JSON.stringify({
      files: mine.length, same, known, bad, crashed,
      leftOut: Object.fromEntries(leftOut),
      keys: Object.entries(PORTED_KEYS).filter(([s]) => Number(s) <= SLICE).flatMap(([, ks]) => ks),
    }));
  }
  console.log(`parity ${SET} shard ${k}/${n}: ${mine.length} files, ${same} the same, ${known} known tessellation, ${bad.length} different, ${crashed.length} Python crashed`);
  expect(bad, bad.join("\n")).toEqual([]);
}, 3_600_000);
