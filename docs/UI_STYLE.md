# UI style

<!-- Template from the `ui-style` skill. Fill each section from the taste board picks and the project's files; keep these prompt comments. Never write a value from memory (WS-06). -->

Look: **Drawing office**, picked by Morgan on the [S2 form](https://claude.ai/artifact/7E7WfzWghKK6UF2kvhqUWZ) on 2026-11-06 (Keep: Drawing office, Inspection sheet; Cut: Shop floor, Layout blue; Drawing office leads, D-010).

## Target devices
<!-- Devices and widths in px, and which width is first (mock-ups and checks start there). Write the minimums as `Minimum text: <n> px` and `Minimum tap: <n> px`; `ui-mockups` reads them for its lint. Take these from the project's docs; if none say, ask Morgan. -->

- PC or laptop browser only (Morgan, S2 form; CONCEPT.md: "A web app in a desktop browser").
- First width: **1280 px**. Also checked at 900 px (the stacking point, spec "Web page") and at 1280 px with 200% text (APP-02).
- Phones are not a target. The page must still not break below 900 px: the panels stack.
- Minimum text: 14 px
- Minimum tap: 32 px

## Idea
<!-- The look in two sentences, from the taste board picks. -->

Pale blue-grey paper, navy ink and a faint grid behind the part, so the screen reads like an engineering drawing. Colour is kept for meaning: the accent marks what is selected, and severity colours mark findings.

## Tokens
<!-- Colours and spacing as named tokens, for light and dark. Screens use the names, never literal values. -->

Copied from the Drawing office sample on the S2 form. Light only in the first version (assumption: Morgan asked for no dark theme, and none was shown; add one as a token change if asked).

| Token | Value | Use |
|---|---|---|
| `--bg` | `#eef2f6` | page ("paper") |
| `--panel` | `#ffffff` | upload, findings and summary panels |
| `--ink` | `#16263d` | text, part edges |
| `--muted` | `#55657a` | secondary text, hints |
| `--line` | `#c4cfdc` | borders, dividers |
| `--accent` | `#1f5fa8` | selected finding, highlighted faces, focus ring, primary button |
| `--accent-ink` | `#ffffff` | text on `--accent` |
| `--view` | `#e3eaf2` | 3D view background |
| `--grid` | `#cfd9e5` | grid lines in the 3D view |
| `--part` | `#a9b6c6` | part faces with no finding |
| `--high` | `#b3261e` | high severity (label, stripe, faces) |
| `--medium` | `#a35a00` | medium severity |
| `--low` | `#3f6b2a` | low severity (in the schema; no rule produces it yet), the "clean" verdict and holes checked with no finding |
| `--ok-pocket` | `#8559b8` | pockets checked with no finding (D-015) |
| `--ok-corner` | `#1d7f86` | corners checked with no finding (D-015) |
| `--ok-wall` | `#6b5d4f` | walls checked with no finding (D-016; mock-up `mockups/wall-legend.html`) |
| `--radius` | `2px` | every border radius |
| `--space-1` … `--space-4` | `4px`, `8px`, `12px`, `16px` | gaps and padding |

Contrast (WCAG ratio, measured with a script in the S2 session; S3 swatches: `--ok-pocket` 5.10 on `--panel`, 4.20 on `--view`; `--ok-corner` 4.74 and 3.91; S4: `--ok-wall` 6.36 and 5.24): `--ink` on `--panel` 15.2, `--muted` on `--panel` 5.95, `--accent` on `--panel` 6.44, `--accent-ink` on `--accent` 6.44, `--high` on `--panel` 6.54, `--medium` on `--panel` 5.22, `--medium` on `--bg` 4.64, `--medium` on `--view` 4.31, `--low` on `--panel` 6.27. Severity text sits on `--panel` or `--bg`, never on `--view`.

## Type
<!-- Faces, sizes and number settings (tabular figures, units). Copy settings from the accepted specimen, not from memory (adventure-manager LESSONS:10). -->

- Body and headings: **IBM Plex Sans** 400, 600, 700, fallback `system-ui, sans-serif`.
- Numbers, ids and file names: **IBM Plex Mono** 500, 600, fallback `ui-monospace, monospace`.
- Both fonts (SIL Open Font License 1.1) ship as `.woff2` files with the app. They load from the app itself, never from a font host, so nothing leaves the PC (APP-01) and the app works offline.
- Sizes in rem from a 16 px root: 0.875rem (14 px, minimum), 1rem, 1.125rem (panel titles), 1.25rem (app title).
- Severity labels: Plex Mono 700, uppercase, letter-spacing 0.06em.
- Numbers use `font-variant-numeric: tabular-nums`. Inches to 0.001 in with a fraction where one fits ("0.250 in (1/4)"); ratios to 0.1 ("8.0×") (spec "Units", `web/src/format.ts`).

## Controls
<!-- Buttons, sheets, inputs: how each looks and how it answers a tap (done, waiting, or refused and why). -->

- **Selects and file input:** `--panel` fill, 1px `--line` border, `--radius`, at least 32 px tall, label above.
- **Primary button** (Export PDF, from S7): `--accent` fill, `--accent-ink` text.
- **Finding row:** a button the full width of the list. Severity label (text and colour), then the title, then a muted line with the feature, the value and the limit source. Clicking it selects the finding: 2px `--accent` border, its faces turn `--accent` in the 3D view and the camera frames them. Clicking the selected finding again clears the selection.
- **Selected finding:** its faces turn `--accent`, every other face is drawn at opacity 0.35, and the camera frames the faces, never tighter than 40% of the part's size. A sharp inside corner is a bar along its edge, accent when selected, with its walls kept solid (D-015). Faces with a finding and nothing selected are drawn in their severity colour, each with a pin (D-017): "F1" on a white pill ringed in the severity colour, on a visible spot of its faces; pins that would overlap fold into one ("F4 +2"); pins behind the part hide. The selected pin is solid in its severity colour with white text and ring, "F1 MEDIUM", raised on a stem to a dot on its spot.
- **Colour legend:** under the 3D view (D-014): a 14 px swatch and its word for High, Medium and Selected, then one checkbox per feature kind for features checked with no finding (S2: "Holes checked, no finding", `--low`; S3: "Pockets checked, no finding", `--ok-pocket`, and "Corners checked, no finding", `--ok-corner`; all on by default, D-015; S4: "Walls checked, no finding", `--ok-wall`, painted first so other kinds win, and off by default, D-016). Each later feature kind adds its own row and swatch.
- **Verdict line:** severity words with counts ("HIGH 1 · MEDIUM 2"; a zero count in `--muted`), then "N holes checked · Rules run: …". A part with no findings shows "CLEAN no findings" in `--low`.
- **Waiting:** while a file is analysed, the status line says "Analysing <name>…" and the findings list keeps its space.
- **Refused:** errors show in the error box with the reason (J7 messages), in `--high` on `--panel` with a left stripe and the word "Error:".
- **Focus:** 3px `--accent` outline, 2px offset, on every control.

## Layout and sizes
<!-- Columns, gutters and spacing at each target width; what moves or hides at each width. -->

- Next layout, approved and not built yet (D-041): a step-by-step review, [round 3 mock-ups](https://claude.ai/artifact/V5jsL9TkRoY7HDiPJM4DS8) (`mockups/ui-direction/round3-frames.html`). The lines below describe the screen as built until that slice lands; it then rewrites Controls, Layout and checklist item 9.

- Review screen: the [approved mock-up](https://claude.ai/artifact/2upjSXCWKez2VVsedPVZbH) (`mockups/review-screen.html`, D-012). Top bar: file, process, material, then part size, faces and units on the right. Verdict line under it. At 1280 px: 3D view (flexible) and findings panel (400 px). Below 900 px the findings stack under the view and the bar wraps.
- The status row under the bar keeps a fixed 34 px height, so an error message never moves the view.
- Page gutter `--space-4`; gaps between panels `--space-4`; inside panels `--space-3`.

## Avoid
<!-- The master Avoid list is linked below. Add this project's own items under Project, each tagged (lint) or (look) and ending with its source in brackets. -->
Master list: `../.claude/skills/ui-style/references/avoid.md` (the path from `docs/`; from another folder, make it relative to that folder).
### Project

- (look) Colour as the only sign of severity: every coloured face or row also carries its severity word [APP-02; spec "Web page"]
- (look) A number with no unit, or inches shown to more or fewer than 3 decimals [D-005; spec "Units"]
- (look) A finding shown without its measured value and the limit it broke [D-001; spec Goals]
- (lint) Fonts loaded from a font host at run time [APP-01; Morgan, S2 form: PC browser, company move D-006]

## Pitfalls
<!-- The master Pitfalls are linked below. A LESSONS `ui` entry at count 2 becomes a Project pitfall here, ending with its source in brackets (SRC-05). -->
Master list: `../.claude/skills/ui-style/references/avoid.md`.
### Project

- None yet (no LESSONS `ui` entries).

## Where facts live
<!-- The files that hold the names, numbers and options screens show (content files, schemas, rules), plus docs/DECISIONS.md. Mock-ups take facts only from these. -->

- `docs/specs/first-version.md`: response schema, rules and their titles, units, test parts, the `data-testid` hooks.
- `service/dfma/settings.py`: processes, materials, error messages, the 50 MB limit.
- `web/index.html`: control labels ("Milling", "Aluminum 6061", …) and the privacy line.
- `web/src/format.ts`: how inches, fractions and ratios are written.
- `tests/parts/expected.toml`: test parts, face counts and expected findings.
- `config/thresholds.toml` and `config/tools.toml` (from S2): limits and drill sizes.
- `docs/DECISIONS.md`.

## New-screen checklist
<!-- Run before calling a screen done. Add project items at the end. -->
1. Colours and faces come from Tokens and Type; no literal values.
2. Fits the first target width without sideways scroll; text and taps meet the minimums.
3. Every view state screenshotted (normal, empty, alert, loading).
4. New class names grepped against the CSS.
5. Every tap answers on the same screen (done, waiting, or refused and why).
6. Buttons, alerts and empty states worded on purpose; no Avoid-list copy.
7. The built screen screenshotted at the same width beside its approved mock-up; differences listed for Morgan.
8. Checked at 1280 px with text at 200%: nothing clipped, findings still readable.
9. Every severity colour on screen has its severity word beside it.
