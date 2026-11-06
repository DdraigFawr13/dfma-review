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

- Every push: `python scripts/check.py` inside the `dfma` environment (drift check, service tests, web check and build, browser tests).
- Cloud sessions have no conda. The "Network" environment's setup script builds the env at `/opt/mamba/envs/dfma` on a fresh container; if it is missing, install micromamba from conda-forge (D-008) and build `environment.yml` yourself. Set `DFMA_CHROMIUM` to the preinstalled Chromium (`/opt/pw-browsers/chromium-*/chrome-linux64/chrome`).

## What CI runs

- **CI** (`ci.yml`): one Linux job runs `scripts/check.py` on every PR update (non-draft) and `main` push, with the conda environment cached. Markdown and `docs/**` changes skip it.
- No deploys yet.

## Project rules

- Every finding and number in a report traces to a measurement on the model or a stated assumption; a finding that can't show its evidence doesn't ship (D-001).
- No AI at runtime unless Morgan approves it (D-001; Morgan: "I don't want to integrate ai into this if it can be avoided").
- Show each slice to Morgan as a status page plus a view-only demo page (D-009).
- Keep the app portable: it moves later to a company host and the company GitLab, so avoid lock-in to one hosting vendor (D-001).

## Overrides

Master rules this project deliberately changes. Each line names the rule id and the reason; the same entry is in `.ai-master.json` "overrides".

- None.
