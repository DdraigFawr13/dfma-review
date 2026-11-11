// The guarded parity re-freeze (steps-slots spec, Design "Parity re-freeze"; first used by P0, D-085). Run by
// scripts/parity-refreeze.mjs, never by `npm run check`. For every entry of tests/parity/key/index-<set>.json in this
// shard, runs the engine as parity.test.ts does and compares with the frozen key. A change is allowed only on the
// keys and fields the current slice names in ALLOWED; anything else fails the shard. Each changed file's new key goes
// to PARITY_REFREEZE_OUT (a temp dir, the key file's own name); the launcher copies them into the key only when every
// shard passed. The new key is the old one with the allowed keys replaced: faces (with their positions), __harness and
// every other key stay as frozen.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { expect, test } from "vitest";
import type { Process } from "../api";
import { compare } from "./compare";
import { analyzeOrRefuse, loadNodeOc } from "./node";
import { KNOWN_TESSELLATION, parseShard, shardOf } from "./parity-shard";

const ROOT = resolve(__dirname, "../../..");
const KEY_DIR = resolve(ROOT, "tests/parity/key");
const SET = process.env.PARITY_SET ?? "quick";
const { k, n } = parseShard(process.env.PARITY_SHARD ?? "0/1");
const OUT = process.env.PARITY_REFREEZE_OUT;
const REPORT = process.env.PARITY_REFREEZE_REPORT;

/** What this slice may change. P0 (D-085): a counterbore is cut from its large end, so a hole may gain `tool_dirs`,
 *  and the plan and the cost built on it may change; every hole and pocket keeps its own tools. */
const ALLOWED = {
  keys: ["setups", "operations", "tools", "tool_changes", "cost_drivers", "cost_total"],
  featureFields: { hole: ["tool_dirs"] } as Record<string, string[]>,
};

type Entry = { path: string; process: Process; key: string; ipt?: string; harness?: boolean };
type Obj = Record<string, unknown>;
type Feat = { id: string; kind: string } & Obj;
type Op = { setup: number; tool: string; features: string[] };

const readBytes = (file: string): Buffer => (file.endsWith(".gz") ? gunzipSync(readFileSync(file)) : readFileSync(file));
const readKey = (file: string): Obj => JSON.parse(readBytes(file).toString("utf8"));

/** Each planned feature's set of tools, as the operations name it. */
function toolsOf(side: Obj): Map<string, string> {
  const out = new Map<string, Set<string>>();
  for (const op of (side.operations as Op[]) ?? []) for (const f of op.features) (out.get(f) ?? out.set(f, new Set()).get(f)!).add(op.tool);
  return new Map([...out].map(([f, t]) => [f, [...t].sort().join(",")]));
}

/** The side with the allowed feature fields taken out, and the allowed keys set to `base`'s, so compare() sees only
 *  the changes this slice may not make. */
function masked(side: Obj, base: Obj): Obj {
  const out: Obj = { ...side };
  for (const key of ALLOWED.keys) if (key in base) out[key] = base[key]; else delete out[key];
  if (Array.isArray(side.features)) {
    out.features = (side.features as Feat[]).map((f) => {
      const drop = ALLOWED.featureFields[f.kind] ?? [];
      return Object.fromEntries(Object.entries(f).filter(([name]) => !drop.includes(name)));
    });
  }
  return out;
}

const setupsText = (side: Obj) => ((side.setups as { direction: string; features: string[] }[]) ?? [])
  .map((s) => `${s.direction} [${s.features.join(" ")}]`).join(", ");

test(`parity re-freeze on the ${SET} set (shard ${k}/${n})`, async () => {
  const index = JSON.parse(readFileSync(resolve(KEY_DIR, `index-${SET}.json`), "utf8")) as Entry[];
  const sizeOf = (e: Entry) => readFileSync(resolve(ROOT, e.path)).length + (e.ipt ? readBytes(resolve(ROOT, e.ipt)).length : 0);
  const shard = shardOf(index.map(sizeOf), n);
  const oc = await loadNodeOc();
  const refused: string[] = [];
  const changed: string[] = [];
  if (OUT) mkdirSync(OUT, { recursive: true });
  for (const [entry, i] of index.map((e, j) => [e, j] as const)) {
    if (shard[i] !== k) continue;
    const old = readKey(resolve(KEY_DIR, entry.key));
    if ("crash" in old || "error" in old) continue; // nothing of a refused file is in the allowed keys
    const bytes = new Uint8Array(readFileSync(resolve(ROOT, entry.path)));
    const ipt = entry.ipt ? { bytes: new Uint8Array(readBytes(resolve(ROOT, entry.ipt))), name: entry.ipt.replace(/\.gz$/, "").split("/").pop()! } : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const harness = entry.harness ? { transform: (old as any).__harness?.transform, check: false } : {};
    const result = await analyzeOrRefuse(oc, bytes, entry.path.split("/").pop()!, entry.process, "al6061", ipt, harness) as Obj;
    const label = entry.ipt ? `${entry.path} + ${entry.ipt}` : entry.path;
    if (compare(result, old).diffs.length === 0) continue;
    const exempt = KNOWN_TESSELLATION[entry.path] ?? [];
    const others = compare(masked(result, old), masked(old, old)).diffs.filter((d) => {
      const m = /^faces\[(\d+)\]\.positions:/.exec(d);
      return !(m && exempt.includes(Number(m[1])));
    });
    const [ta, tb] = [toolsOf(old), toolsOf(result)];
    const lostTools = [...new Set([...ta.keys(), ...tb.keys()])].filter((f) => ta.get(f) !== tb.get(f))
      .map((f) => `${f}: tools ${ta.get(f) ?? "none"} -> ${tb.get(f) ?? "none"}`);
    if (others.length || lostTools.length) {
      refused.push(`${label}:\n    ${[...others, ...lostTools].slice(0, 10).join("\n    ")}`);
      continue;
    }
    const fields = (result.features as Feat[]).flatMap((f, j) => {
      const was = (old.features as Feat[])[j];
      const moved = (ALLOWED.featureFields[f.kind] ?? []).filter((x) => JSON.stringify(f[x]) !== JSON.stringify(was[x]));
      return moved.length ? [`${f.id} ${moved.map((x) => `${x}=${JSON.stringify(f[x] ?? null)}`).join(" ")}`] : [];
    });
    const keys = ALLOWED.keys.filter((key) => JSON.stringify(result[key]) !== JSON.stringify(old[key]));
    const count = (side: Obj) => `${(side.setups as unknown[]).length} setups, ${side.tool_changes} tool loads`;
    changed.push(`${label}\n    ${count(old)} -> ${count(result)}; keys changed: ${keys.join(", ") || "none"}` +
      `\n    features: ${fields.join("; ") || "none"}\n    setups before: ${setupsText(old)}\n    setups after:  ${setupsText(result)}`);
    const next: Obj = { ...old };
    for (const key of ALLOWED.keys) if (key in result) next[key] = result[key];
    next.features = result.features;
    if (OUT) writeFileSync(resolve(OUT, entry.key), gzipSync(JSON.stringify(next)));
  }
  const text = `## shard ${k}/${n}: ${changed.length} changed, ${refused.length} refused\n` +
    changed.map((c) => `CHANGED ${c}`).join("\n") + (refused.length ? `\n${refused.map((r) => `REFUSED ${r}`).join("\n")}` : "");
  console.log(text);
  if (REPORT) writeFileSync(REPORT, text);
  expect(refused, refused.join("\n")).toEqual([]);
}, 3_600_000);
