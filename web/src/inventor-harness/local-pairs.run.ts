// The runner of `npm run local-pairs` (scripts/harness.mjs): prints the lines of tests/inventor/local_pairs.py.
// LOCAL_PAIRS_DIR (default tests/inventor/.local) holds one folder per pair; LOCAL_PAIRS_TOML the expected counts.
import { readFileSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { loadNodeOc } from "../engine/node";
import { localPairs } from "./localPairs";

const ROOT = resolve(__dirname, "../../..");

test("local pairs", async () => {
  const dir = resolve(ROOT, process.env.LOCAL_PAIRS_DIR ?? "tests/inventor/.local");
  const toml = readFileSync(resolve(ROOT, process.env.LOCAL_PAIRS_TOML ?? "tests/inventor/local_pairs.toml"), "utf8");
  const code = await localPairs(await loadNodeOc(), dir, toml, (line) => writeSync(1, line + "\n"));
  expect(code).toBe(0);
});
