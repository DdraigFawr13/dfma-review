# Handoff

Updated: 2026-11-06. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Spec. The brainstorm (D-001), bootstrap (D-002, [#1](https://github.com/DdraigFawr13/dfma-review/pull/1), merged by hand on green: auto-merge is off in the repo) and design (D-003 to D-006) are done. Morgan approved the plan on 2026-11-06. Now: the first-version spec with `write-spec`.

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ✔ Design: `planning-interview`, 2 rounds plus approval (D-003 to D-006).
- ▶ Spec the first usable version with `write-spec`; `ui-style` before the first screen slice.
- ○ Build the first version slice by slice: spike, test parts, 7 rules, report.
- ○ Assemblies and DFA · history and compare · time and $.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-06 Brainstorm pages: [open questions](https://claude.ai/artifact/BAQurJCWYqGxEZJehD7uGB), [concepts](https://claude.ai/artifact/Mgi7WVFxTne89GD9ZkjzGe), [round 1](https://claude.ai/artifact/QRrJhDYjzW3NapQUBGR6rH). Brief committed as `main`'s first commit (f27c508).
- 2026-11-06 Bootstrap #1: manifest, sync, starter docs, CI drift check. Morgan approved; `main` is the default branch.
- 2026-11-06 Design pages: [round 1](https://claude.ai/artifact/4Xa6iLguwU2pnXQXCAYydk), [round 2](https://claude.ai/artifact/LEGMPWU3Avt4E9pjnSvbhG), [approval](https://claude.ai/artifact/WDr91uJChvS9RkBziPWDHo). Agent cost: stack research $0.46, review $0.15 (measured).

## Next

1. Spec drafted: [docs/specs/first-version.md](specs/first-version.md). Three fresh checks (paraphrase, critic, zero decisions) running; then sort findings and ask Morgan to approve it.
2. Morgan: turn on "Allow auto-merge" in the repo settings.

## Open questions

- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).
- Which CAD exports the test STEP files (Inventor version): unknown; public models first.

## Brainstorm trial (master D-048)

- 2026-11-06: 4 concepts; dropped with reasons: yes; kill criteria: yes; rounds: 1; measured agent cost $0.74; measure 2 (design round 1 asked nothing the brief answered): yes, every question came from the brief's open list; measure 3 (concept survived design unchanged): asked of Morgan 2026-11-06.

## Decisions since the last plan update

- 2026-11-06 Concept chosen (D-001). Full master setup with web-app layer (D-002).
- 2026-11-06 First-version scope (D-003), stack (D-004), rules and units (D-005), company-move gates (D-006).
