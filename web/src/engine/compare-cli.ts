// npm --prefix web run compare -- <result.json> <key.json>: the parity compare on one file (J6b). Exit 1 on any
// difference. Run by plain Node, which strips the types (Node 22.23.4).
import { readFileSync } from "node:fs";
import { compare } from "./compare.ts";

const [resultPath, keyPath] = process.argv.slice(2);
if (!resultPath || !keyPath) {
  console.error("usage: compare <result.json> <key.json>");
  process.exit(2);
}
const outcome = compare(JSON.parse(readFileSync(resultPath, "utf8")), JSON.parse(readFileSync(keyPath, "utf8")));
console.log(`${outcome.status}${outcome.diffs.length ? ":\n  " + outcome.diffs.join("\n  ") : ""}`);
process.exit(outcome.status === "different" ? 1 : 0);
