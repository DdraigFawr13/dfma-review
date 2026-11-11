// The runner of `npm run nist-pair -- <step> <ipt>`: prints the lines of tests/inventor/nist_pair.py.
import { readFileSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import { loadNodeOc } from "../engine/node";
import { pyFloat } from "./pyRepr";
import { analyzeRegistered, threadLines, transform } from "./nistPair";

test("nist pair", async () => {
  const [step, ipt] = [process.env.NIST_PAIR_STEP!, process.env.NIST_PAIR_IPT!];
  const oc = await loadNodeOc();
  const bytes = [new Uint8Array(readFileSync(resolve(step))), new Uint8Array(readFileSync(resolve(ipt)))];
  const name = (p: string) => p.split("/").pop()!;
  const r = await analyzeRegistered(oc, bytes[0], name(step), bytes[1], name(ipt)) as Parameters<typeof threadLines>[0];
  const [rows, shift] = await transform(oc, bytes[0], name(step), bytes[1]);
  writeSync(1, `transform ((${rows.map((x) => `(${x.map(pyFloat).join(", ")})`).join(", ")}), (${shift.map(pyFloat).join(", ")}))\n`);
  for (const line of threadLines(r)) writeSync(1, line + "\n");
});
