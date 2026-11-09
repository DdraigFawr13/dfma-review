# Handoff

Updated: 2026-11-09. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. First usable version: S1 to S7 merged (#3 to #18). Inventor parts: I1 (#21 to #23), I2 and I3 (#24, #27; D-039 to D-046) merged. Review-steps S1 merged in #29 (D-047). Review-steps S2+S3 merged in #30 (D-051): the step screen is complete. UX audit merged in #31; its 34 fixes merged in #32 (D-053). Now: the work-pair check from 2026-11-12, and Morgan's call on a GitLab Pages port (D-054, proposed). History and full entries: [docs/archive/handoff-2026-11.md](archive/handoff-2026-11.md) (grep it; "Moved 2026-11-09" holds the long entries cut from here).

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ✔ Design: `planning-interview`, 2 rounds plus approval (D-003 to D-006).
- ✔ Spec the first usable version (D-007, 6 fresh checks, $1.49).
- ✔ Build slice by slice: S1 to S7, grading spike, recognition rounds, stress-test, undercut and turning sets (#3 to #18).
- ○ Assemblies and DFA · history and compare · time and $.
- ▶ Inventor parts (Morgan, 2026-11-08): ✔ research · ✔ own reader (D-031) · ✔ plan (D-032) · ✔ spec I1 (D-033) · ✔ I1 S1 #21, S2 #22, S3 #23 · ✔ spec I2+I3 (D-039) · ✔ I2 S1 hole features #24 (D-041) · ✔ S2 names and copies and S3 fillets and chamfers, merged in #27 (D-043, D-046) · ▶ work-pair check owed (from 2026-11-12).
- ○ Inventor shape from the `.ipt` alone (D-035; after I1).
- ✔ UI direction: research and 3 mock-up rounds, approved (D-042, #25) · ✔ spec approved (D-045, #28) · ✔ S1 merged in #29 (D-047) · ✔ S2 + S3 merged in #30 (D-048 to D-052) · ✔ UX audit #31 · ✔ audit fixes #32 (D-053) ([round 3](https://claude.ai/artifact/V5jsL9TkRoY7HDiPJM4DS8); answers and sources in `docs/research/ui-direction/README.md`).
- ▶ GitLab Pages port (Morgan, 2026-11-09; D-054 proposed): ✔ trial (`spikes/ocjs/README.md`) · ✔ go-ahead to plan · ▶ spec · ○ port in slices.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-09 opencascade.js trial (Morgan: run "on Gitlab pages completely"): the fork reads all 33 NIST files the same as the app, 8,137 of 8,137 faces, in Node and Chromium; recognizer engine calls identical except 214 meshed faces; 512 of 512 `.ipt` streams. `spikes/ocjs/README.md`, D-054. [Status](https://claude.ai/artifact/Xi214RHUBM5P85dq69PbE9).
- 2026-11-09 Audit fixes approved by Morgan ("Approved, merge when ready") and merged in #32 (D-053): all 34 findings; `check.py` 926 service, 26 web, 78 browser passed. [PR #32](https://github.com/DdraigFawr13/dfma-review/pull/32); full entry in the archive.

## Next

00. Now: Morgan's answers on [Port Spec Approval](https://claude.ai/artifact/AjZQkdVY7ATByDULSNBfmQ) (collection `final`; wait for "spec done") for [docs/specs/gitlab-pages-port.md](specs/gitlab-pages-port.md). Then write-spec step 7: Status Approved, D-054 Accepted, the 5 additions in DECISIONS, Next = S1 (mock-up first).
0. Now: plainer sentences for the rule cases that still read as titles, each shown to Morgan first (D-045). Follow-up from the audit fixes: Hole feature rows still carry aria-pressed and aria-expanded (F15's pattern, out of its scope).
1. Owed from 2026-11-12 (D-035, D-046; now after the merge): one of Morgan's work pairs, with one Hole renamed (names right or absent, never wrong; else switch names off), by Drive share into `tests/inventor/.local/<pair>/`, then `python tests/inventor/local_pairs.py` (now prints Hole features too); counts differ or a gap over 0.01 mm: stop and take the numbers and D-033's fallback to Morgan; else record it in `local_pairs.toml`. Don't ask before 2026-11-12.
2. Recognition and stress-test status, scoring commands and the MFCAD++ download: archive "Moved 2026-11-09" (old Next 3 and 3a). Re-run them on every recognition change.
3. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Shape from the `.ipt` alone: its own phase after I1 (D-035); test-run numbers in the archive.
- `test_nist.py` ctc_02 took 5.8-7.07 s here and once 10.4 s in a busier container, against a 10 s limit; limit unchanged (VER-04); detail in the archive.
- Backlog and after-project ideas (hole types, ring-face threads, G-code view, waivers, shop profiles): archive "Moved 2026-11-09".
- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).

## Decisions since the last plan update

- 2026-11-09 D-055: port planning answers (Chrome, GitHub Pages copy, Python as answer key, full engine, holes first, work release after holes and PDF, tell IT first).
- 2026-11-09 D-054 (Proposed): a static GitLab Pages build on opencascade.js; trial passed on geometry and `.ipt` streams.
- 2026-11-09 D-053: the UX audit's 34 fixes as recommended; amends D-017 (pins carry ▲/◆), D-042 ("Why n setups:", no stretched cards) and D-049 ("What to do").
- 2026-11-09 D-052: a deep pocket's advice counts its passes at a safe depth (1× the tool, 0.5× in stainless; estimate).
- 2026-11-09 D-051: review-steps S2+S3 approved and merged (#30); spec shipped.
- 2026-11-09 D-050: an angled hole or pocket is a Review; a hole is a Fix when it enters its face off square.
- 2026-11-09 D-049: Features groups mock-up approved; a corner sits in its pocket's setup, a thin wall under "Whole part".
- 2026-11-09 D-048: review-steps S2 and S3 built and merged together, one branch and one PR.
- 2026-11-09 D-047: review-steps S1 approved and merged (#29); builder calls recorded.
- 2026-11-09 D-046: merge #27 now; the work-pair check follows the merge (amends D-041).
- 2026-11-09 D-045: review-steps spec approved; 3 slices; rows.py; build from main.
- 2026-11-09 D-042: review screen redesign approved (steps Part · Features · Machining · Cost · Report, overview after reading, Fix / Review, plain-sentence rows, Show OK per kind, cost total); not built. Found on that branch: `test_nist` ctc_02 took 10.5 s and 11.1 s (limit 10 s) in 2 of 3 full runs in a cloud container under load, 9.19 s alone; limit unchanged (VER-04).
- 2026-11-09 D-041: merge I2 S1 now (#24); S2 and S3 on a new branch, merged after the work-pair check.
- D-001 to D-037: see `docs/DECISIONS.md` (`grep '^## D-'`).
