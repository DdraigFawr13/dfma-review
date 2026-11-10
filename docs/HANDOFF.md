# Handoff

Updated: 2026-11-10. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. First usable version: S1 to S7 merged (#3 to #18). Inventor parts: I1 (#21 to #23), I2 and I3 (#24, #27; D-039 to D-046) merged. Review-steps S1 merged in #29 (D-047). Review-steps S2+S3 merged in #30 (D-051): the step screen is complete. UX audit merged in #31; its 34 fixes merged in #32 (D-053). Now: GitLab Pages port S1 (D-056), and the work-pair check from 2026-11-12. History and full entries: [docs/archive/handoff-2026-11.md](archive/handoff-2026-11.md) (grep it; "Moved 2026-11-09" holds the long entries cut from here).

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
- ▶ GitLab Pages port (Morgan, 2026-11-09; D-054, D-055, D-056): ✔ trial · ✔ spec approved (PR #33) · ▶ S1 site, viewer, parity · ○ S2 holes · ○ S3 plan, cost, PDF (work release possible) · ○ S4 pockets · ○ S5 walls · ○ S6 turning · ○ S7 Inventor · ○ S8 retire Python.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-10 Port S1 mock-up published for Morgan ([page](https://claude.ai/artifact/EDnCkkdnccX7jjsjrP3ZJa); `mockups/port-s1-browser-copy.html`, built by `mockups/build_port_s1.py`): real app with the S1 changes added in the page; 1 fresh check (3 high, 5 medium, 2 low; 8 fixed, 2 kept). Branch `port-s1-site-viewer`. olefile 0.47 was missing from the cloud env again; installed with micromamba.
- 2026-11-10 Port spec approved by Morgan ("Approved, start building"; D-056) and merged with the trial in #33: [docs/specs/gitlab-pages-port.md](specs/gitlab-pages-port.md), 8 slices; all 5 additions approved. [Approval page](https://claude.ai/artifact/AjZQkdVY7ATByDULSNBfmQ), [PR #33](https://github.com/DdraigFawr13/dfma-review/pull/33).

## Next

00. Now: port S1 (PR #34, draft; D-057). Stopped for Morgan's call on 2 browser tests: J3 heartbeat gap 782 ms (limit 200; taps 121.8 ms); J4 `big_plate.step` (49.94 MiB, 12,550 faces) never showed in 15 min; Python's reader alone took 925.6 s; Node run killed for memory. Uncommitted: review fixes and `browser_pending.txt`. No push until Morgan decides.
0. Now: plainer sentences for the rule cases that still read as titles, each shown to Morgan first (D-045). Follow-up from the audit fixes: Hole feature rows still carry aria-pressed and aria-expanded (F15's pattern, out of its scope).
1. Owed from 2026-11-12 (D-035, D-046; now after the merge): one of Morgan's work pairs, with one Hole renamed (names right or absent, never wrong; else switch names off), by Drive share into `tests/inventor/.local/<pair>/`, then `python tests/inventor/local_pairs.py` (now prints Hole features too); counts differ or a gap over 0.01 mm: stop and take the numbers and D-033's fallback to Morgan; else record it in `local_pairs.toml`. Don't ask before 2026-11-12.
2. Recognition and stress-test status, scoring commands and the MFCAD++ download: archive "Moved 2026-11-09" (old Next 3 and 3a). Re-run them on every recognition change.
3. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Shape from the `.ipt` alone: its own phase after I1 (D-035); test-run numbers in the archive.
- `test_nist.py` ctc_02 took 5.8-7.07 s here and once 10.4 s in a busier container, against a 10 s limit; limit unchanged (VER-04); detail in the archive. 2026-11-10: 10.2 s once inside a full `check.py`, 7.9-8.3 s alone (3 runs).
- Backlog and after-project ideas (hole types, ring-face threads, G-code view, waivers, shop profiles): archive "Moved 2026-11-09".
- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).

## Decisions since the last plan update

- 2026-11-10 D-056: port spec approved with its 5 additions; D-054 Accepted.
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
- D-001 to D-037: see `docs/DECISIONS.md` (`grep '^## D-'`).
