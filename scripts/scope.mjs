// What a change touches, for `npm run check` and CI (D-082): a change made only of screen code, browser tests and
// docs skips the engine-only steps (the parity run against the frozen key, the timed engine tests); anything else
// runs them. The browser tests, type check, unit tests and builds always run.
//
//   node scripts/scope.mjs skip-if-ui -- <command…>   run <command> unless the change is UI-only
//   node scripts/scope.mjs                            print the decision and the files it read
//
// Which change: CI_EVENT=pull_request: HEAD^1..HEAD (GitHub's merge commit, fetch-depth 2). CI_EVENT=push (main) or
// workflow_dispatch: always full, a safety net once per merge. Local (no CI_EVENT): from the merge base with
// origin/main to the working tree, untracked files included. No base, an empty change or DFMA_FULL=1: full.
// Node built-ins only, so it runs on Windows too (D-001).
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Files a UI-only change may touch: the page's own code directly in web/src (not api.ts, whose types the engine
 *  imports, nor worker.ts, which runs it), browser tests, the page and its assets, Markdown, docs and mock-ups.
 *  The engine also reads web/src/grading, web/src/inventor-harness and config/, so those are not UI. */
const UI = [
  /\.md$/,
  /^docs\//,
  /^mockups\//,
  /^web\/e2e\//,
  /^web\/index\.html$/,
  /^web\/public\//,
  /^web\/src\/(?!api\.ts$|worker\.ts$)[^/]+$/,
];

/** Whether every file is UI-only; an empty list is not (nothing to judge by: run everything). */
export function uiOnly(files) {
  return files.length > 0 && files.every((f) => UI.some((re) => re.test(f)));
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const lines = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/** The files of the change, or null when there is nothing to compare with. */
export function changedFiles(env = process.env) {
  if (env.DFMA_FULL === "1") return null;
  try {
    if (env.CI_EVENT === "pull_request") return lines(git("diff", "--name-only", "HEAD^1", "HEAD"));
    if (env.CI_EVENT) return null; // push to main, manual run: full
    const base = git("merge-base", "HEAD", "origin/main").trim();
    return [...new Set([...lines(git("diff", "--name-only", base)), ...lines(git("ls-files", "--others", "--exclude-standard"))])];
  } catch {
    return null;
  }
}

function main(argv) {
  const files = changedFiles();
  const ui = files !== null && uiOnly(files);
  const why = files === null ? "no change to compare with" : `${files.length} changed file${files.length === 1 ? "" : "s"}`;
  if (argv[0] !== "skip-if-ui") {
    console.log(`scope: ${ui ? "UI-only" : "full"} (${why})`);
    for (const f of files ?? []) console.log(`  ${f}`);
    return 0;
  }
  const command = argv.slice(argv.indexOf("--") + 1);
  if (ui) {
    console.log(`scope: UI-only change (${why}): skipping \`${command.join(" ")}\` (D-082; DFMA_FULL=1 runs it)`);
    return 0;
  }
  console.log(`scope: full (${why}): running \`${command.join(" ")}\``);
  // Arguments passed as given (no shell on Linux or macOS, so quoting survives); Windows needs the shell for npm.cmd
  return spawnSync(command[0], command.slice(1), { stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
