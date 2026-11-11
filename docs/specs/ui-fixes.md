# UI fixes: the model (A) and the screens (B)

- **Status:** Draft (2026-11-11)
- **Planned in:** [round 1](https://claude.ai/artifact/TC6zxWereXxzeVBLG4MtLE) (collection `round1`), [review](https://claude.ai/artifact/N8rWXXux4n2VWqNhkDzEUB) (collection `review1`), approved [mock-up](https://claude.ai/artifact/Adh7jrTqHCskfymUbrPkc4) (`mockups/ui-fixes.html`; prototype `mockups/ui-fixes/proto.diff`, reference only). **Decisions:** D-076; amends D-017, D-023, D-042 and UI_STYLE "Selected finding" when built.

## Problem

Morgan, from 4 photos of the work copy (2026-11-10): "The rotating is the hardest currently" (round 1 `worst`). Picking a row with many copies lit the whole part. Users are engineers (`users`). Pins lag while the part moves.

Measured on `main` (`d42fcfd`), production build (`node web/scripts/build-pages.mjs`), Chromium with software WebGL, 1280 × 800, `nist_ctc_02_asme1_ap242-e2.stp` (635 faces, 42 findings), 3 runs each:

- Drag (40 mouse moves): frame gap median 16.7 ms, p90 344-466 ms, max 463-620 ms.
- Wheel (20 notches): frame gap median 16.6-16.7 ms, p90 398-403 ms, max 482-532 ms.
- Split with a timing build: pin placement (`placeFlags`) median 420 ms per frame, drawing 3.3 ms. Of placement, 396 ms is the ray tests that find each pin's visible spots.

Two causes found in the code, not in the plan:

- **Rotation axis.** OrbitControls fixes its orbit axis from `camera.up` when it is built (`three/examples/jsm/controls/OrbitControls.js:406`); the viewer builds it while `up` is three's default +Y (`web/src/viewer.ts` constructor), then `place()` sets `up` to +Z on every fit. So the part spins about the file's Y axis while the screen is held Z-up (inference from the code; not yet seen on screen).
- **Pin cost.** Every camera change re-places every pin, with up to 24 ray tests per finding against every face (`anchorsOf`).

## Goals

- A drag or wheel turn on CTC 02 draws with no pin placement: frame gap p90 under 50 ms (target, labelled; measured with `web/scripts/pin-lag.mjs`, before and after, in the PR).
- The part turns about the file's vertical axis (+Z), so left-right drags spin it like a turntable and it never rolls.
- A picked row lights one finding; everything else is grey.
- Every model control has a keyboard way and a visible focus ring.
- Slice B: a first-time user can load an example without a file; the Machining step shows each setup from the spindle.

## Non-goals

- No view cube (round 1 `p_cube`: "no"). No cutaway, no dimensions on the part (Soon, after A and B). No tool-access check (after steps and slots; review `c_r_reach`).
- Touch gestures unchanged (one finger rotates, two move and zoom).
- The PDF's pictures unchanged: no triad, no grey-out change (`snapshot()` paints as the screen does today, see Design A4).
- Passed rows unchanged: an open passed row still lights all its features until one feature is picked.
- No faster pin placement in slice A beyond not placing while moving (see Alternatives and Risks).
- Real machine shapes: the spindle and chuck are placeholders.

## Journeys and checks

Each check fails at `d42fcfd`. E2E tests run in the test build (`web/dist-pages-test`, `npm run e2e`); new ones go in `web/e2e/model.spec.ts` (A) and `web/e2e/screens.spec.ts` (B), which `testMatch: "*.spec.ts"` already picks up (`web/e2e/playwright.config.ts`).

### J1 Rotate, move and zoom like Inventor (A)

- **Given** `box_through_hole.step` shown.
- **When** left-drag; Shift + left-drag; middle-drag; Shift + middle-drag; right-drag; wheel forward with the mouse off-centre.
- **Then** left-drag and Shift + middle-drag rotate (target unchanged, camera moved); middle-drag, Shift + left-drag and right-drag move (target and camera moved by the same vector); wheel forward brings the camera closer and moves the target towards the point under the mouse. After any rotation the camera's up stays +Z (file axes) to 1e-6. **Check:** `test_mouse_like_inventor` reads `__dfma.view()` before and after each gesture.
- **When** a middle-button `mousedown` on the canvas. **Then** its `defaultPrevented` is true (no autoscroll, no paste). **Check:** `test_middle_click_blocked`.

### J2 View buttons (A)

- **Given** `report_sample.step` shown.
- **When** each of Home, Front, Top, Right, Iso is pressed.
- **Then** the camera looks along the named direction (table in Design A2) to within 0.1°, the whole part is framed, the part's faces never move (`__dfma.facePositions()` hash unchanged), and Home equals the view the part opened with. **Check:** `test_view_buttons`.

### J3 Axis triad (A)

- **Given** a part shown. **When** Front, then Top, is pressed.
- **Then** `__dfma.triad()` reports each arrow's on-screen direction and label; after Front, the arrow for the axis named in Design A3 points right / up as the table says, within 2°. The triad's letters are `--ink` on `--view` (contrast over 4.5:1). **Check:** `test_axis_triad`; screenshot at 2× in the PR.

### J4 Pins hide while the camera moves (A)

- **Given** `report_sample.step` with pins shown.
- **When** a drag is in progress, a wheel notch, or an arrow key on the focused model.
- **Then** within one frame every `.flag` and the leader layer are hidden and `__dfma.placements()` does not grow while moving; 150 ms after the last change (allow 150-600 ms) pins show again where a still camera would put them (`flagState()` equals a fresh placement). A view button, a row pick or a setup chip does not hide them; it re-places them once. **Check:** `test_pins_hide_while_moving` (event-driven waits on the hidden and shown states, no fixed sleep as a pass condition); `web/scripts/pin-lag.mjs` before/after numbers in the PR.

### J5 One feature at a time (A)

- **Given** `report_sample.step`, Features step.
- **When** row "Sharp corner ×4" (F4-F7) is opened; then › ; then → with the open row focused; then ←.
- **Then** only F4's edge bar is accent, F4's walls solid grey; every other face `--part` at opacity 0.35, every other bar `--part` at 0.35; Show OK tints and other findings' colours are not drawn (`paintedFaces()`, a new `faceColours()` hook). › and → move to F5 ("2 of 4"), ← back to F4. The same holds for "Deep hole ×2" on report_sample (one hole's faces only). **Check:** `test_one_feature_at_a_time`; existing assertions that expect a row's union change (Design A5).
- **When** nothing is picked. **Then** colours and Show OK as today (existing `findings.spec.ts`, `steps.spec.ts` pass unchanged).

### J6 Keys on the focused model (A)

- **Given** a part shown. **When** Tab reaches the model.
- **Then** it shows a 3 px `--accent` focus ring, inset (the viewer clips; LESSONS "spec" S3 build). ← → ↑ ↓ rotate 10° per press; Shift + arrows move 10% of the view height; `+` / `=` / NumpadAdd zoom in 1.25×, `-` / NumpadSubtract out; H goes Home. The page does not scroll. **Check:** `test_model_keys` (camera via `__dfma.view()`, `window.scrollY` unchanged, ring width read with `getComputedStyle`).

### J7 Examples (B)

- **Given** the start form. **When** an example is picked (start form list, or Examples ▾ in the top bar).
- **Then** the part loads as if uploaded, Process switches to Turning for slender_shaft and Milling for the other three, and the status line reads "Showing <name>.". **Check:** `test_examples` loads each of the 4.

### J8 Top bar and one picker (B)

- **Given** any state. **Then** the top bar has Open…, Examples ▾ and, once a part is shown, Export PDF; no file name in the bar; no "Change file" in the overview.
- **When** Open… takes a STEP and its `.ipt` in one pick. **Then** both are analysed together, as `upload-file` + `upload-ipt` do today. **Check:** `test_open_pair`; `upload_pair.spec.ts` moved onto the one picker.

### J9 Machine view (B)

- **Given** `report_sample.step`, Machining. **When** Machine is chosen and Setup 2 tapped.
- **Then** the camera looks down the setup's direction (spindle on top of the screen); tapping a tool row (a `<button>` at least 32 px tall) lights the faces it cuts in that setup and shows a placeholder spindle whose cutter diameter equals the tool's `diameter_in` (scene units converted). For `slender_shaft.step` (Turning) the turning axis lies across the screen and a placeholder chuck shows at the axis's lower end. Part keeps today's behaviour. **Check:** `test_machine_view_mill`, `test_machine_view_lathe`.

## Decisions

- Two slices, A before B, B after A merges (D-076).
- Orbit about the file's +Z (turntable), up kept +Z; free orbit rejected (Alternatives). **Escalated:** confirm (Open question 2).
- View directions and the opening view in the file's axes; triad in part.frame (D-076). **Escalated:** confirm (Open question 1).
- Pins hidden while the camera moves, back 150 ms after the last change (D-076, round 1 `pinmode`).
- Any selection greys every other face (D-076, round 1 `picked`).

## Alternatives rejected

- **Free orbit (Inventor's default, TrackballControls / ArcballControls):** the part can roll off its up; Home is then the only way back. Fails when a user drags diagonally and loses which way is up. Turntable keeps the part upright; Inventor offers a constrained orbit too.
- **Views in part.frame axes:** of 42 readable sample parts only `stout_shaft` has part axes equal to the file's; 26 have part +Z = file −Z, and `report_sample` has part +Z = file −Y (measured with `analyzeOrRefuse` on `tests/parts`, 2026-11-11). Top would show the underside of most parts. Fails for every pocket part.
- **Depth read instead of ray tests** (one depth render read back per placement): same pins on 171 of 172 views across `tests/parts` + CTC 02 (one fold differed on CTC 02), but placement fell only from 352 to 176 ms median, and resolution 0.5 or 0.25 made no difference (186, 181 ms): the read waits on the renderer. Not worth the risk in A.
- **Measuring each pin once instead of per spot:** 354 ms vs 352 ms. No gain.
- **Placing pins every Nth frame while moving:** still stalls 350+ ms frames on big parts; rejected by `pinmode`.
- **View cube:** Morgan "no" (`p_cube`).

## Risks

- **Pins come back late on big parts.** After a move, one placement still costs about 350-420 ms on CTC 02 here (software WebGL), so pins show about 0.5 s after stopping, and a drag started in that window waits. → Record the after-number in the PR; if Morgan finds it slow at work, a follow-up spec speeds placement (a spatial index over the faces would be a new dependency: SAFE-01).
- **Orbit change moves the opening view's feel.** The opening view and Home keep today's direction and up, so pin tests that depend on the opening view keep passing; only drags change.
- **New wrapper around the canvas moves the pins' host.** Pins and leaders attach to `canvas.parentElement`. → The audit F27 overlap tests (`audit_2026_11_09.spec.ts`) and `findings.spec.ts` pin tests must pass unchanged.
- **Focusable canvas with `role="img"`.** → Change to `role="application"` with a label naming the keys (A6).

## Design

### Slice A

- **A1 Controls** (`viewer.ts`): before building OrbitControls set `camera.up` to (0, 0, 1); `place()` keeps setting (0, 0, 1). `mouseButtons = { LEFT: ROTATE, MIDDLE: PAN, RIGHT: PAN }` (three swaps rotate and pan with Shift, Ctrl or Meta held, `OrbitControls.js:1695,1717`, so Shift + left moves and Shift + middle rotates with no code). `zoomToCursor = true`. Wheel direction is three's default (forward zooms in). `mousedown` and `auxclick` with `button === 1` on the canvas call `preventDefault()`. Touch unchanged.
- **A2 Views** (buttons, file axes, direction from the part's centre to the camera, then up):

  | Button | Direction | Up |
  |---|---|---|
  | Home | (1, −1.2, 0.9) normalized, as `fit()` today | +Z |
  | Front | −Y | +Z |
  | Top | +Z | +Y |
  | Right | +X | +Z |
  | Iso | (1, −1, 1) normalized | +Z |

  Each frames the whole part as `fit()` does (`place()`), immediately, no animation. Top sits at the orbit's pole: place the camera 0.001 rad off +Z towards −Y so OrbitControls' angles are defined and screen-up is +Y. Buttons: `<div class="views" role="group" aria-label="Views">` with five `<button type="button" data-testid="view-home|view-front|view-top|view-right|view-iso">`, at the model's bottom right, 8 px in, chip look (UI_STYLE "Chips": 32 px, 44 px below 900 px). Hidden with no part.
- **A3 Triad** (`viewer.ts`): drawn after the scene in the same canvas, in a 96 × 96 CSS px square 8 px from the bottom-left corner (scissor viewport; `mockups/ui-fixes/proto.diff` `protoDrawGizmo` shows the idea), its own orthographic camera turned like the main one. Arrows along `result.part.frame` x, y, z (file coordinates; `api.ts:109`), coloured #c62828, #2e7d32, #1565c0; letters X, Y, Z in `--ink`, bold, beyond each tip. No origin marker (Morgan: "just the triad is fine"). `setFrame(frame)` is called with each result; no frame → no triad. Hook `__dfma.triad(): { axis: "X" | "Y" | "Z"; dx: number; dy: number }[]` gives each arrow's on-screen unit direction (dy up positive). For J3 the expected directions come from projecting `part.frame` with the Front and Top views of A2.
- **A4 Pins while moving** (`viewer.ts`): the controls' `start` and `change` events and the key handler (A6) mark the camera as moving: the host gets class `moving` (CSS hides `.flag` and `.leaders`), `render()` draws without `placeFlags()`, and a 150 ms timer, restarted by each change, clears `moving` and renders once with placement. `place()` (views, row picks, setup chips, new parts) does not set `moving`. `snapshot()` unchanged. Hook `__dfma.placements(): number` counts `placeFlags()` runs. Constant `PIN_REST_MS = 150`.
- **A5 One feature at a time** (`main.ts` `pickOf`, `viewer.ts` `paint`): a row's pick is the shown finding: `{ id, faces: finding.faces }` (falls back to `rowFaces` only for a passed row, which has no findings). In `paint()`, while anything is selected (row, finding, pass, setup, thread, hf, hfh, bl), every face not chosen is `--part`; ghosting and the sharp-corner walls kept solid stay as today; other edge bars `--part` at 0.35. Hook `__dfma.faceColours(): Record<number, string>` (hex). Tests that assert a row lights its union change to the shown finding's faces: `steps.spec.ts:323`, `browser_engine.spec.ts:359`, `:390`, `:420` (a behaviour change D-076 approved, not a weakened check, VER-01). UI_STYLE "Selected finding" and D-017's "nothing else dims" are amended in the same PR.
- **A6 Keys** (`viewer.ts`): canvas `tabindex="0"`, `role="application"`, `aria-label="3D model of the part. Arrows rotate, Shift and arrows move, plus and minus zoom, H goes home."`. Keydown on the canvas only: ← → turn about +Z by ±10°, ↑ ↓ tilt by ±10° (OrbitControls' polar limits apply), Shift + arrows pan 10% of the view height, `+`/`=`/NumpadAdd and `-`/NumpadSubtract dolly by 1.25 about the target, `h`/`H` Home; each calls `preventDefault()` and `controls.update()` (so A4 hides pins). Focus ring: `.viewer canvas:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }`.
- **A7 Row keys** (`steps.ts` `renderRows`): keydown ArrowLeft / ArrowRight on the open row's button, its ‹ or › calls `onStep(−1 / +1)`, as ‹ › do (no wrap).
- **A8 Words** (`index.html` `.hint`): "Drag to rotate. Middle-drag or Shift + drag to move. The wheel zooms to the mouse. Tab to the model for keys."
- **A9 Markup**: wrap the canvas and the views group in `<div class="stage">` (position relative, flex 1) inside `.viewer`; pins and leaders follow `canvas.parentElement`.
- **A10 `__dfma.view()`**: `{ position, target, up }` as number triples; `__dfma.facePositions()`: a hash of all face position buffers.
- **A11 `web/scripts/pin-lag.mjs`**: the measurement above (production build served by `vite preview`, CTC 02, drag and wheel, 3 runs, prints median, p90, max frame gap). Not in `npm run check`.

### Slice B (detail re-checked against merged A before it starts, write-spec step 8)

- **B1 Examples**: the four files served at `examples/<name>.step` from `tests/parts` by a Vite plugin in `web/vite.config.ts` (copied into every build's output; one home, SRC-01). Each fetched, wrapped as a `File` and analysed through the same path as an upload. Start form: a list "Or try an example" with the 4 names as buttons; top bar: `<button aria-haspopup="menu">Examples ▾</button>` with a menu of the same 4 (Esc closes, focus returns). Process set before analysing: `slender_shaft` → `turn`, others → `mill`. Sizes 33.7-54.0 kB.
- **B2 Top bar**: Open… (a button that clicks one `<input type="file" multiple accept=".step,.stp,.ipt">`, keeps `data-testid="upload-file"`); the files are sorted by extension into the STEP and the `.ipt`; two STEPs or two `.ipt`s → the error "Choose one STEP file and, if you have it, its .ipt.". The start form's two pickers become this one. `#top-file` and "Change file" go; the status line keeps the name.
- **B3 Machine view**: a Part / Machine switch (`role="radiogroup"`, two radio buttons) over the model on Machining only, default Part. In Machine, a setup chip places the camera looking against the setup's direction with that direction on screen-up; the tool rows in the setup become `<button>`s (min 32 px) that light `operations[i].faces` for that setup and tool and show the placeholder spindle (cutter diameter `diameter_in` × 25.4 / file unit factor; length 3 diameters; holder and nose generic, `proto.diff` `protoSpindle`). Turning: the camera looks along the part's −Y of its frame with `turn_axis` horizontal; a three-jaw placeholder chuck at the axis's lower-coordinate end (`protoChuck`). Leaving Machine or Machining removes spindle and chuck and restores Part's camera behaviour.
- **B4 Amends**: D-042 (one picker, "Change file" gone), D-023 (Machine view), UI_STYLE top bar and Machining.

## Slices

### S1 (slice A) The model

- **Morgan tries:** on the work copy, report_sample: pick Deep hole ×2, one hole lit, › lights the other; spin with wheel and drag, no pins while moving; middle-drag moves, Shift + middle-drag rotates; Tab to the model, arrows rotate, H home; press each view button; watch the triad.
- **Checks that fail now:** J1-J6 tests in `web/e2e/model.spec.ts`; the four changed row assertions (A5).
- **Files:** `web/src/viewer.ts`: A1, A3, A4, A5 paint, A6, hooks. `web/src/main.ts`: A5 `pickOf`, `setFrame`, view buttons, hooks. `web/src/steps.ts`: A7. `web/index.html`: A2 group, A6 attributes, A8, A9. `web/src/style.css`: views, stage, `.moving`, focus ring. `web/e2e/model.spec.ts`: new. `web/e2e/steps.spec.ts`, `web/e2e/browser_engine.spec.ts`: A5 changes. `web/scripts/pin-lag.mjs`: A11. `docs/UI_STYLE.md`, `docs/DECISIONS.md` (D-017, D-076 built), `docs/HANDOFF.md`.
- **Waits on:** Open questions 1 and 2.

### S2 (slice B) The screens

- **Morgan tries:** Examples ▾ loads each of the four; Open… with a STEP and its .ipt together; Machining, Machine: each setup chip puts the spindle on top, a tool row lights its faces in the spindle; slender_shaft lies across with a chuck.
- **Checks that fail now:** J7-J9 in `web/e2e/screens.spec.ts`; `upload_pair.spec.ts`, `threads.spec.ts`, `hole_features.spec.ts`, `blends.spec.ts`, `pdf.spec.ts` moved from `upload-ipt` to the one picker; `steps.spec.ts`, `audit_2026_11_09.spec.ts` lose "Change file" / `top-file` assertions in favour of Open….
- **Files:** `web/vite.config.ts` (B1 plugin), `web/index.html`, `web/src/main.ts`, `web/src/findings.ts` (tool rows as buttons), `web/src/viewer.ts` (spindle, chuck, setup camera), `web/src/style.css`, the e2e files above, `docs/UI_STYLE.md`, `docs/DECISIONS.md` (D-023, D-042), `docs/HANDOFF.md`.
- **Waits on:** S1 merged.

## Verification

- Every push: `npm run check` at the repo root (under 900 s, D-073); before ready, `npm --prefix web run edmr` only if the engine changed (slice A and B don't touch `web/src/engine`).
- Pin lag: `node web/scripts/pin-lag.mjs` on `main` and on the branch, numbers in the PR (VER-06).
- Screenshots at 2× of J2, J3, J5 (and J9 for B) on the status page; Morgan's own check on the work copy (VER-07).

## Open questions

1. **Which axes do the views use?** Recommended: Front, Top, Right, Iso and Home in the file's own axes (Top looks down the file's +Z, as Inventor shows it), and the triad in the part's axes (D-076), so the triad matches the setup names ("from −X") but not always the view names. Alternatives: everything in the part's axes (Top shows the underside of 26 of 42 sample parts); everything in the file's axes (the triad then disagrees with the setup names on 41 of 42).
2. **Turntable orbit?** Recommended: the part turns about the file's +Z and never rolls. Alternative: free orbit, Inventor's default.
