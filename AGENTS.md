# Agent instructions

DFMA Review: a web app that reviews mechanical parts and assemblies (STEP files) for DFM and DFA, estimates machines, tool changes and time, and later checks and generates DXF drawings. For design mechanical engineers and shop managers. Concept: [docs/CONCEPT.md](docs/CONCEPT.md).

Shared rules come from AI-Master-Instructions and load through CLAUDE.md (`.claude/master/RULES.md`). This file holds only what is specific to this project. Keep it under 80 lines.

## Read first

1. `docs/HANDOFF.md`: current state and next step.
2. `docs/DECISIONS.md`: settled rules. Don't reopen them.
3. `docs/LESSONS.md`: entries for the area you are about to work in.
4. `docs/CONCEPT.md`: the chosen concept; its Design brief is where design starts.
5. `docs/nist/CATALOG.md`: the NIST gold-standard material (D-011), what each file holds, and the answer keys in the papers. Add a NIST file there when a slice uses it.

## Local checks (run before pushing)

- Every push that changes code: `npm run check` at the repo root (drift check, NIST unpack, web type check and vitest, web build and test build, parity against the frozen key, browser e2e, timed tests). A push made only of Markdown, `docs/` and `mockups/` runs `npm run drift` alone, as CI does (D-077). Python is retired (S8b, D-074); the EDMR tests run by `npm --prefix web run edmr` before a PR is marked ready when `web/src/engine/` or the web packages changed (D-077).
- Morgan checks each slice by using it and says what works and what to change (D-077); that is not a substitute for the checks above.
- Time budget (D-073): `npm run check` under 900 s here (measured 421 s on 2026-11-11, S8b, with the timed vitest lane), and CI under its 20-minute `timeout-minutes`. Report the check time against it; over budget means find the slow step (test-design skill, "Time budgets").
- Mark any test that asserts a wall-clock limit `timed` (Vitest test name, or Playwright `{ tag: "@timed" }`), so the timed run covers it.
- Cloud sessions: Node 22 is preinstalled; set `DFMA_CHROMIUM` to the preinstalled Chromium (`/opt/pw-browsers/chromium-*/chrome-linux64/chrome`).

## What CI runs

- **CI** (`ci.yml`): one Linux job, Node 22, runs `npm run check` on every PR update (non-draft) and `main` push; when `scripts/ci-scope.sh` finds only Markdown, `docs/` and `mockups/` changed, the job runs only the drift check and still reports (D-077).
- No deploys yet.

## Project rules

- Every finding and number in a report traces to a measurement on the model or a stated assumption; a finding that can't show its evidence doesn't ship (D-001).
- No AI at runtime unless Morgan approves it (D-001; Morgan: "I don't want to integrate ai into this if it can be avoided").
- Show each slice to Morgan as a status page plus a view-only demo page (D-009); rebuild the demo with `npm run demo`.
- Screenshots on Morgan's pages fit the screen and zoom on tap: take them at 2×, put them before any live wide frames, and run the master's `add-zoom.mjs` on the page (D-024, LESSONS "pages" ×2; the master's `ui-mockups` does the same with `add-zoom.mjs` since v4.12.0).
- When the GitHub API refuses a public repo, use the browser on github.com instead (Morgan, 2026-11-07); put this in research briefs.
- Compare tools only like with like: each tool's current release, the same parts, through our own scorer (`web/src/grading`, `npm --prefix web run grading`); never set our numbers beside numbers another tool measured its own way, and say whose answer key each set is (LESSONS "reports", ×2).
- Before code or a spec relies on a field of an `.ipt` record, check it against the geometry it should agree with on every NIST file that has it, and count the misses (LESSONS "read", ×2).
- Keep the app portable: it moves later to a company host and the company GitLab, so avoid lock-in to one hosting vendor (D-001).

## Overrides

Master rules this project deliberately changes. Each line names the rule id and the reason; the same entry is in `.ai-master.json` "overrides".

- None.
