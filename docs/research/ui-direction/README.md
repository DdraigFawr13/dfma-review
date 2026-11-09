# UI direction: research and mock-up rounds

Started 2026-11-09 on branch `ccr-d8b01a15-facop0`, beside the Inventor I2+I3 work. This folder and `mockups/ui-direction/` are the only files it touches, so the two sessions don't collide. HANDOFF gets a line when this merges.

Morgan, 2026-11-09: the UI "is getting increasingly convoluted and complicated with too much description and unclear labeling. Let's do some research into UI design for this sort of thing and see if we can get a better design language and direction. Come up with a series of mockups that will help us slowly narrow down and combine features."

Status: **proposals only**. Nothing here changes a decision until Morgan approves it and it lands in DECISIONS.

## Plan

- Round 1: today's problems, rules from research, 5 layouts (A tabs, B inspection sheet, C model first, D steps, E feature tree), pieces to mix, words, look. Morgan marks keep / maybe / cut.
- Round 2: 2-3 combined screens from the kept pieces, plus the states round 1 skipped (empty, loading, error, Plan and Cost) and, if asked, other looks.
- Round 3: one screen at 1280 px and 900 px, through the `ui-mockups` checks, for approval. Then UI_STYLE and DECISIONS change, and a build slice.

## Round log

- 2026-11-09 Round 1 published: [page](https://claude.ai/artifact/3WKMC2icNNuE9i9scBLT3n) (answers in its `ui1` collection). Fresh check: 1 reviewer, 65,865 tokens; 9 fixes (record on the page).

## What's wrong today (measured 2026-11-09, demo build, report_sample.step, 1280 × 900)

- The side column holds 4 panels (Findings, Threads, Machine plan, Cost drivers), each scrolling in its own box; 1 of 8 findings is in view.
- With every panel open: 910 words in `main`, 479 of them in the findings list (8 findings plus 9 passed walls).
- The same title and fix line repeat once per corner (4 times).
- The legend under the model has 7 entries.
- Code names show to users: `em-0.250`, `dr-0.2500`, `config/tools.toml`.
- The verdict line lists every rule run.

## Research (agent report, 2026-11-09; sources checked by the agent, pages that refused noted)

- DFM tools put a short issue list beside the model in 2-3 severity tiers; selecting a row lights its faces; the long text sits one click away. Protolabs splits "required changes" from "advisories" and shows "a precise thickness measurement" ([Protolabs](https://www.protolabs.com/resources/design-tips/navigating-manufacturing-analysis/)). aPriori groups by severity or issue type; a row click highlights features in the 3D view (docs, snippet only: 403). Fictiv: a click on a message highlights its areas ([Fictiv](https://www.fictiv.com/help/getting-a-quote/how-do-i-view-and-respond-to-dfm-feedback)). Siemens NX Check-Mate: pass, fail, skipped and info marks ([Siemens](https://blogs.sw.siemens.com/nx-design/learn-more-about-checks-with-out-of-the-box-testing-with-nx-check-mate)). Paperless Parts warning names are 2-5 words ([Paperless Parts](https://paperlessparts.com/product-update/new-sheet-metal-interrogation-warnings)).
- NN/g: "designs that go beyond 2 disclosure levels typically have low usability" ([progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)); "Users typically see about 2 words for most list items" ([first 2 words](https://www.nngroup.com/articles/first-2-words-a-signal-for-scanning/)); "Users shouldn't need to find a tooltip in order to complete their task" ([tooltips](https://www.nngroup.com/articles/tooltip-guidelines/)).
- IBM Carbon: "Relying solely on color to convey status is insufficient"; use colour, shape or symbol together ([status](https://carbondesignsystem.com/patterns/status-indicator-pattern/)); "Sections of a UI are allowed to be dense, but the whole page should not be crowded" ([spacing](https://carbondesignsystem.com/elements/spacing/overview/)).
- BIM issue tools: pin colour shows status, the selected issue's pin grows, pins toggle from the panel ([Autodesk](https://help.autodesk.com/cloudhelp/2023/ENU/Revit-Collaborate/files/GUID-C52A8E15-1D5E-4D9C-BC5A-E8280191571E.htm)); BIMcollab quick zoom moves only the camera ([BIMcollab](https://helpcenter.bimcollab.com/portal/en/kb/articles/quick-zoom-and-section-box)).
- Design systems to borrow ideas from: Siemens iX (industrial, MIT), Blueprint (data-dense desktop, Apache-2.0-based), Carbon (Apache 2.0). Ideas only; no assets copied.
- Not verified: words per finding in any vendor; Hubs, DFMPro, Fusion, Onshape, CADDi and Bananaz review screens.

## Files and rebuild

- `mockups/ui-direction/round1-frames.html`: the five 1280 × 800 frames. Model pictures in `img/` are real renders from the demo build; pins are placed by hand.
- `mockups/ui-direction/round1.src.html`: the round page (copy and questions).
- Rebuild: `node mockups/ui-direction/shoot.js mockups/ui-direction/round1-frames.html <dir>`, copy `img/cur-report.png` into `<dir>`, then `python3 mockups/ui-direction/build_round.py mockups/ui-direction/round1.src.html <dir> <out.html>` (needs Pillow; the system Python has it, the `dfma` env doesn't).
