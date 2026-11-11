// Runs one file through child.ts in its own Node process (a file that aborts the engine is then a result, not a dead
// run; LESSONS "read"), up to `jobs` at a time. Plain Node reads the engine's TypeScript through scripts/ts-register.mjs.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MARK, type ChildResult } from "./score.ts";

export const TIME_LIMIT_S = 180.0; // as grade.py
const CHILD = fileURLToPath(new URL("./child.ts", import.meta.url));
const REGISTER = fileURLToPath(new URL("../../scripts/ts-register.mjs", import.meta.url));

/** The `node` arguments that run a grading entry (the launcher scripts/grading.mjs and run() both use them). */
export const nodeArgs = (entry: string, ...rest: string[]): string[] =>
  ["--no-warnings", "--experimental-transform-types", "--import", REGISTER, entry, ...rest];

export type Mode = "grade" | "counts";

/** Run `child.ts <mode> <path>` and read its result line. Status: ok, read_error, timeout or crash (as grade.analyse). */
export function runChild(mode: Mode, path: string, timeoutS = TIME_LIMIT_S): Promise<ChildResult> {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, nodeArgs(CHILD, mode, path), { stdio: ["ignore", "pipe", "pipe"] });
    let [out, err, timedOut] = ["", "", false];
    const timer = setTimeout(() => { timedOut = true; proc.kill("SIGKILL"); }, timeoutS * 1000);
    proc.stdout.on("data", (d) => { out += d; });
    proc.stderr.on("data", (d) => { err = (err + d).slice(-400); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return resolve({ status: "timeout" } as ChildResult);
      const lines = out.split("\n").filter((l) => l.startsWith(MARK));
      if (code !== 0 || !lines.length) return resolve({ status: "crash", returncode: code ?? -1, stderr: err } as ChildResult);
      const result = JSON.parse(lines[lines.length - 1].slice(MARK.length)) as ChildResult;
      result.status ??= result.error ? "read_error" : "ok"; // counts mode names its own status
      resolve(result);
    });
  });
}

/** `fn` over every item, `jobs` at a time; results in the order of the items. */
export async function pool<T, R>(items: T[], jobs: number, fn: (item: T, n: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const n = next++;
      out[n] = await fn(items[n], n);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, items.length)) }, worker));
  return out;
}
