# DFMA Review

- **Date:** 2026-11-06. **Pages:** [open questions](https://claude.ai/artifact/BAQurJCWYqGxEZJehD7uGB), [concepts](https://claude.ai/artifact/Mgi7WVFxTne89GD9ZkjzGe), [round 1](https://claude.ai/artifact/QRrJhDYjzW3NapQUBGR6rH). **Agent cost:** $0.74 measured (research $0.47, critique $0.26).

## Pitch

A design companion for mechanical engineers. Load a part or an assembly and get a design review: DFM findings for each part and DFA findings for each assembly, the machines, setups and tool changes it would need, an estimated manufacturing time, and the changes that would make it better. Later stages check drawings for GD&T and unreasonable tolerances, and generate DXF drawings. Every number in the review traces to a measurement on the model or a stated assumption.

## Who it's for

Design mechanical engineers checking parts before release, and shop managers reading the machine and time estimates. A web app in a desktop browser. It is built here on general web hosting, then moved to a company host and the company GitLab. Today these reviews are "not really done at all" (Morgan).

## Core loop or idea

One tool, built in Morgan's priority order:

1. **Report.** Upload a STEP file. The tool recognises features (holes, pockets, slots, walls) and runs DFM/DFA rules, recording each measured value and the face it came from. A slice of process planning covers 3-axis milling and turning first: setups by access direction, a generic tool per feature, tool changes, and time as a labelled range from generic feeds and speeds.
2. **Design review.** Each finding can be accepted or rejected, with a note, and the signed-off review exports as a report. Single user first.
3. **Drawing check.** Read DXF drawings and flag GD&T errors against ASME Y14.5-2018 (inch) and unreasonable tolerances.
4. **Drawing generation.** Produce DXF drawings from the model, styled after Morgan's DXF references.

## What it isn't

- Not useless: "I would hate if it was not useful" (Morgan). A finding that can't show its measurement doesn't ship.
- Not AI-driven: "I don't want to integrate ai into this if it can be avoided" (Morgan). Rules and code compute the findings, and templates write the review.
- Not shop-specific yet: generic processes now, with machine and tooling lists later.
- Not a native Inventor reader yet: STEP and DXF first, with room for Inventor integration later.
- Not a team platform at first: no accounts or comments until the single-user review proves useful.

## Concepts dropped

- **B. AI-first reviewer:** cut by Morgan. Its numbers can't be traced and vary from run to run, and a general chat model already gives this kind of feedback. Morgan also wants no AI where it can be avoided.
- **A. Rule checker:** merged into the chosen concept (stage 1 engine).
- **C. Virtual machinist:** merged into the chosen concept. Only the setup, tool and time-range slice is kept, because full process planning is too large to build first.
- **D. Design review workspace:** merged into the chosen concept as the single-user stage 2. Team features come later.

## Kill criteria

- On a test set of 5-10 parts, feature recognition misses or misidentifies features often enough that most findings need manual correction.
- Time ranges miss a machinist's estimate by more than about 2× on most test parts, even with assumptions stated.
- Morgan or a shop manager reads a stage 1 report on a real part and says it would not change the design.
- Stage 1 doesn't produce a usable report on simple prismatic parts after a reasonable build effort. Then stop and re-scope before stages 2-4.

## Open questions

- Time estimates: Morgan agreed with the critique card that said "setups and tools, no times" and also with my take to keep times as a range. Morgan's first proof names "machine estimates". Confirm in design whether stage 1 shows time.
- Test parts: Morgan said "find parts online or we can make them later." Candidate public set: the NIST MBE PMI test models (STEP AP242 with PMI). Not checked yet for licence or fit.
- Drawing check input: stage 3 reads DXF. Whether Morgan's STEP exports carry GD&T (AP242 PMI) is not checked.
- Project kind: Tool (lens row "Tool").
- Brainstorm trial:
  - 2026-11-06: 4 concepts; dropped with reasons: yes; kill criteria: yes; rounds: 1; measured agent cost $0.74; measures 2 and 3: pending design.

## Design brief

Start `planning-interview` from this brief. Round 1 should not ask again what is settled here.

- **Settled:**
  - The chosen concept and its four stages, in Morgan's order.
  - STEP input first and DXF for drawings.
  - Generic processes, with 3-axis milling and turning first.
  - ASME Y14.5-2018 in inches.
  - A web app that can later move to a company host and GitLab, so it avoids lock-in to one hosting vendor.
  - Users are design engineers and shop managers.
  - No AI at runtime unless it can't be avoided.
  - Every finding shows its measurement and face.
  - Single user first.
  - No hard limits on time or budget.
- **Open for design:**
  - Whether stage 1 shows time, and how (see Open questions).
  - The stack for STEP geometry: OpenCascade (pythonOCC, CadQuery, or opencascade.js in the browser), and where it runs (server or browser).
  - The first rule list (5-6 rules, each with a test part).
  - The report format (web page, PDF, both).
  - The DFA method for assemblies (part count and handling questions).
  - The test-part set and who judges usefulness.
  - Where it is hosted in the meantime.
- **Must not reopen:** concept B (cut), adding AI at runtime without Morgan's say-so, and native Inventor files before STEP works.
