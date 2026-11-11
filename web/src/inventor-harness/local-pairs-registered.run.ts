// A check of localPairs' passing path with pairs the app's pair check never passes (every NIST pair is refused, J2): the
// pair check is replaced by the one with no refusal and the transform is the one `register` found (PYTHON_TRANSFORMS, a
// JSON file {<ipt name>: {rows, shift}}). The same two substitutions on tests/inventor/local_pairs.py give the lines
// to compare. Env as local-pairs.run.ts.
import { readFileSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, vi } from "vitest";
import { loadNodeOc } from "../engine/node";

const transforms = JSON.parse(readFileSync(process.env.PYTHON_TRANSFORMS!, "utf8")) as Record<string, { rows: number[][]; shift: number[] }>;

vi.mock("../engine/analyze", async (original) => {
  const m = await original<typeof import("../engine/analyze")>();
  return {
    ...m,
    analyze: (oc: unknown, step: Uint8Array, name: string, process: "mill", material: "al6061", ipt: { name: string }) =>
      (m.analyze as (...a: unknown[]) => unknown)(oc, step, name, process, material, ipt,
        { transform: [transforms[ipt.name].rows, transforms[ipt.name].shift], check: false }),
  };
});
vi.mock("../engine/inventor/pair", async (original) => {
  const m = await original<typeof import("../engine/inventor/pair")>();
  return { ...m, checkPair: (oc: never, ipt: never, step: never) => m.pairReason(oc, ipt, step)[1] };
});

test("local pairs, registered", async () => {
  const { localPairs } = await import("./localPairs");
  const ROOT = resolve(__dirname, "../../..");
  const dir = resolve(ROOT, process.env.LOCAL_PAIRS_DIR ?? "tests/inventor/.local");
  const toml = readFileSync(resolve(ROOT, process.env.LOCAL_PAIRS_TOML ?? "tests/inventor/local_pairs.toml"), "utf8");
  const code = await localPairs(await loadNodeOc(), dir, toml, (line) => writeSync(1, line + "\n"));
  expect(typeof code).toBe("number");
});
