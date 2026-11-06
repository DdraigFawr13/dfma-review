# Handoff

Updated: 2026-11-06. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Design. The brainstorm is done ([docs/CONCEPT.md](CONCEPT.md), D-001) and the master harness `v4.11.0` is in (D-002, [#1](https://github.com/DdraigFawr13/dfma-review/pull/1), merged by auto-merge on green). Next: `planning-interview`.

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ▶ Design: `planning-interview` from the brief's Design brief, then `ui-style` and `ui-mockups` for key screens.
- ○ Spec stage 1 (STEP report) with `write-spec`, then build it in slice sessions.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-06 Brainstorm pages: [open questions](https://claude.ai/artifact/BAQurJCWYqGxEZJehD7uGB), [concepts](https://claude.ai/artifact/Mgi7WVFxTne89GD9ZkjzGe), [round 1](https://claude.ai/artifact/QRrJhDYjzW3NapQUBGR6rH). Brief committed as `main`'s first commit (f27c508).
- 2026-11-06 Bootstrap #1: manifest, sync, starter docs, CI drift check. Morgan approved; `main` is the default branch.

## Next

1. Run `planning-interview` round 1 from `docs/CONCEPT.md` "Design brief". Ask only what the brief leaves open.

## Open questions

- Does stage 1 show time? The answers conflict (critique card "no times" agreed, and the take "time as a range" agreed). Recommended: show a labelled range.
- Test parts: Morgan said find public parts or make them later. Candidate: NIST MBE PMI test models (licence and fit not checked).
- Stack for STEP geometry (OpenCascade via pythonOCC, CadQuery or opencascade.js) and where it runs: for design.

## Brainstorm trial (master D-048)

- 2026-11-06: 4 concepts; dropped with reasons: yes; kill criteria: yes; rounds: 1; measured agent cost $0.74; measures 2 (round 1 asks nothing the brief answered) and 3 (concept survives design unchanged): pending design.

## Decisions since the last plan update

- 2026-11-06 Concept chosen (D-001). Full master setup with web-app layer (D-002).
