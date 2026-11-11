// `npm run`-less runner: the Node `register` transform of each NIST pair in the parity key's index (the `harness`
// entries) against the transform Python's harness found (`__harness` in the key). Prints one line per pair and the
// counts. PARITY_KEY_DIR as in src/engine/parity.test.ts. A missing key fails; it never skips. The key has no transform
// for the three sheet-metal pairs (the app path refuses them before any mapping); for those, and to cross-check the
// rest, PYTHON_TRANSFORMS names a JSON file {<ipt name>: {rows, shift}} written by Python's nist_pair.transform.
import { existsSync, readFileSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { loadNodeOc } from "../engine/node";
import { transform } from "./nistPair";

const ROOT = resolve(__dirname, "../../..");
const KEY_DIR = resolve(ROOT, process.env.PARITY_KEY_DIR ?? "tests/parity/.cache/key");

test("the Node transform equals the Python one on every NIST pair", async () => {
  const indexPath = resolve(KEY_DIR, "index-quick.json");
  expect(existsSync(indexPath), `${indexPath} is missing: run python tests/parity/key.py --set quick`).toBe(true);
  const index = (JSON.parse(readFileSync(indexPath, "utf8")) as { path: string; ipt?: string; harness?: boolean; key: string }[])
    .filter((e) => e.ipt && e.harness && e.ipt.startsWith("tests/inventor/files/"));
  const oc = await loadNodeOc();
  let same = 0;
  const bad: string[] = [];
  for (const e of index) {
    const iptName = e.ipt!.split("/").pop()!;
    const fromKey = JSON.parse(readFileSync(resolve(KEY_DIR, e.key), "utf8")).__harness?.transform as [number[][], number[]] | undefined;
    const direct = process.env.PYTHON_TRANSFORMS ? JSON.parse(readFileSync(process.env.PYTHON_TRANSFORMS, "utf8"))[iptName] : undefined;
    const want = fromKey ?? (direct ? [direct.rows, direct.shift] as [number[][], number[]] : undefined);
    if (want === undefined) { bad.push(`${iptName}: no Python transform in the key; set PYTHON_TRANSFORMS`); continue; }
    const bytes = (p: string) => new Uint8Array(readFileSync(resolve(ROOT, p)));
    const [rows, shift] = await transform(oc, bytes(e.path), e.path.split("/").pop()!, bytes(e.ipt!));
    if (fromKey && direct && JSON.stringify(fromKey) !== JSON.stringify([direct.rows, direct.shift])) bad.push(`${iptName}: the key and PYTHON_TRANSFORMS differ`);
    const equal = JSON.stringify(rows) === JSON.stringify(want[0]) && JSON.stringify(shift) === JSON.stringify(want[1]);
    if (equal) same++; else bad.push(`${e.ipt}: node ${JSON.stringify([rows, shift])} python ${JSON.stringify(want)}`);
    writeSync(1, `${equal ? "equal    " : "DIFFERENT"} ${e.ipt!.split("/").pop()}\n`);
  }
  writeSync(1, `${index.length} pairs compared, ${same} equal, ${bad.length} different\n${bad.join("\n")}\n`);
  expect(index.length).toBe(16);
  expect(bad).toEqual([]);
});
