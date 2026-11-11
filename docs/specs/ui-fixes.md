# UI fixes: the model (A) and the screens (B)

- **Status:** Approved 2026-11-11 (Morgan: "I approve both"; Open questions 1 and 2 taken as recommended, D-078)
- **Planned in:** [round 1](https://claude.ai/artifact/TC6zxWereXxzeVBLG4MtLE) (collection `round1`), [review](https://claude.ai/artifact/N8rWXXux4n2VWqNhkDzEUB) (collection `review1`), approved [mock-up](https://claude.ai/artifact/Adh7jrTqHCskfymUbrPkc4) (`mockups/ui-fixes.html`; prototype `mockups/ui-fixes/proto.diff`, reference only). **Decisions:** D-076, D-078; amends D-017, D-023, D-042 and UI_STYLE "Selected finding" when built.

## Terms

- **File axes:** the X, Y, Z of the STEP file, as the CAD drew it; the 3D view's coordinates (mm, `web/src/engine/read.ts:1`).
- **Part axes:** `result.part.frame` (`web/src/api.ts:109`), three unit vectors in file axes: +Z the outward normal of the largest planar face, +X of the largest face square to it (`web/src/engine/frame.ts:2`). Setup names ("from −X", `plan.ts:12`) use part axes (`features/holes.ts:678`).
- **Work copy:** the copy of the app Morgan runs at work (D-055).
- Form ids (`worst`, `pinmode` and others) are answer keys on the round 1 and review forms linked above.

## Problem

Morgan, from 4 photos of the work copy (2026-11-10): "The rotating is the hardest currently" (round 1 `worst`). Picking a row with many copies lit the whole part. Users are engineers (`users`). Pins lag while the part moves.

Measured on `main` (`d42fcfd`), production build (`node web/scripts/build-pages.mjs`), Chromium with software WebGL, 1280 × 800, `nist_ctc_02_asme1_ap242-e2.stp` (635 faces, 42 findings), 3 runs each:

- Drag (40 mouse moves): frame gap median 16.7 ms, p90 344-466 ms, max 463-620 ms.
- Wheel (20 notches): frame gap median 16.6-16.7 ms, p90 398-403 ms, max 482-532 ms.
- Split with a timing build: pin placement (`placeFlags`) median 420 ms per frame, drawing 3.3 ms. Of placement, 396 ms is the ray tests that find each pin's visible spots.

Two causes found in the code, not in the plan:

- **Rotation axis.** OrbitControls fixes its orbit axis from `camera.up` when it is built (`three/examples/jsm/controls/OrbitControls.js:406`); the viewer builds it while `up` is three's default +Y (`web/src/viewer.ts` constructor), then `place()` sets `up` to +Z on every fit. So the part spins about the file's Y axis while the screen is held Z-up. Checked with three.js 0.187 in Node: from the opening view, a left-right turn of 0.3 rad kept the camera's y (−66.56) and changed its z (49.92 → 64.09); with up set to +Z before building, the same turn kept z (49.92) and changed y (−66.56 → −79.98).
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
- Passed rows unchanged: an open passed row still lights all its features until one feature is picked.
- No faster pin placement in slice A beyond not placing while moving (see Alternatives and Risks).
- The PDF gains no triad. Its pictures do follow the new paint (A5), since `snapshot()` paints as the screen does.
- Real machine shapes: the spindle and chuck are placeholders.

## Journeys and checks

Each check has at least one assertion that fails at `d42fcfd`; assertions marked *(guard)* already pass and stay as regression guards. E2E tests run in the test build (`web/dist-pages-test`, `npm run e2e`); new ones go in `web/e2e/model.spec.ts` (A) and `web/e2e/screens.spec.ts` (B), which `testMatch: "*.spec.ts"` already picks up (`web/e2e/playwright.config.ts`).

### J1 Rotate, move and zoom like Inventor (A)

- **Given** `box_through_hole.step` shown.
- **When** left-drag; Shift + left-drag; middle-drag; Shift + middle-drag; right-drag; wheel forward with the mouse off-centre.
- **Then** left-drag and Shift + middle-drag rotate (target unchanged, camera moved); middle-drag, Shift + left-drag *(guard)* and right-drag *(guard)* move (target and camera moved by the same vector); wheel forward brings the camera closer and moves the target towards the point under the mouse. A horizontal left-drag keeps the camera's height above the target (z − target z) within 1e-6 × the part's bounding-sphere radius and changes the camera's heading by over 5°; "target unchanged" means within 1e-6 × the radius (`__dfma.part()`). Wheel to the mouse: after the notches the point under the mouse before the wheel (picked by ray from `view()`) projects within 4 px of the same screen point. `test_middle_click_blocked` dispatches a cancelable synthetic `mousedown` with `button: 1` on the canvas and reads its `defaultPrevented`. Gestures: drags of 120 px in 8 steps from the canvas centre; wheel 3 notches of deltaY −100 at 150 px left of centre; "moved" means by over 1e-3 of the part's bounding-sphere radius. **Check:** `test_mouse_like_inventor` reads `__dfma.view()` before and after each gesture. Fails now on middle-drag (dolly today), the turn's height, and the target moving under the wheel.
- **When** a middle-button `mousedown` on the canvas. **Then** its `defaultPrevented` is true (no autoscroll, no paste). **Check:** `test_middle_click_blocked`.

### J2 View buttons (A)

- **Given** `report_sample.step` shown.
- **When** each of Home, Front, Top, Right, Iso is pressed.
- **Then** camera position − target is parallel to the Direction in Design A2 within 0.1°, the screen-up is the Up there within 0.1°, all 8 corners of `__dfma.part().box` project inside the view, the screen-up check compares the projected up (screen y of a point above the target along Up), not `camera.up`, the part never moves (`__dfma.partMatrix()` stays the identity, 16 numbers), and Home equals the view the part opened with within 1e-6 × the radius. **Check:** `test_view_buttons` (fails now: no buttons).

### J3 Axis triad (A)

- **Given** a part shown. **When** Front, then Top, is pressed.
- **Then** `__dfma.triad()` reports each arrow's on-screen direction. Expected: project each part axis `a` (file coordinates) on the view: after Front (looking towards +Y, up +Z) it is (a·X, a·Z); after Top (looking towards −Z, up +Y) it is (a·X, a·Y), both in file axes, normalized; compared within 2° for arrows whose projected length is over 0.2 (an arrow pointing at the viewer is skipped). On report_sample (part x = file −Z, y = file +X, z = file −Y) after Front: X points down, Y right, Z is skipped. **Check:** `test_axis_triad` (fails now: no hook); screenshot at 2× in the PR.

### J4 Pins hide while the camera moves (A)

- **Given** `report_sample.step` with pins shown.
- **When** a drag is in progress, a wheel notch, or an arrow key on the focused model.
- **Then** every `.flag` and the leader layer are hidden (`.stage.moving`) and `__dfma.placements()` (a count since page load; tests compare before and after, and first check that it is over 0 with pins shown) does not grow while the button is held, even if the mouse rests 400 ms mid-drag; after the release or the notch pins show again no sooner than 150 ms and no later than 1,500 ms (after an arrow or zoom key: no sooner than 600 ms and no later than 2,000 ms), and `__dfma.flagState()` (existing hook, `main.ts:79`) then equals the state read after pressing the same view again with no move (the same ids shown, folded and hidden). A view button, a row pick or a setup chip never adds `moving`; each re-places pins once. **Check:** `test_pins_stay_hidden_while_held` and `test_pins_return_after_moving`, both tagged `@timed` (the 400 ms rest and the 150-1,500 ms and 600-2,000 ms windows are wall-clock limits, VER-11; AGENTS "Local checks") (the 150-1,500 ms window; AGENTS "Local checks"). Fails now: pins are never hidden. `web/scripts/pin-lag.mjs` numbers before/after in the PR.

### J5 One feature at a time (A)

- **Given** `report_sample.step`, Features step.
- **When** row "Sharp corner ×4" (F4-F7) is opened; then › ; then → with the open row focused; then ←.
- **Then** only F4's edge bar is `--accent`; F4's two walls stay solid (opacity 1) in `--part`; every other face is `--part` at opacity 0.35; every other bar `--part` at 0.35; no face shows a severity colour or a Show OK colour. Read with `__dfma.faceColours()` and `__dfma.barColours()` (new) and `opacities()` (existing). › and → move to F5 ("2 of 4") and frame it: `cameraTarget()` becomes the centre of F5's bar's box within 1e-6 × the radius, as a row pick frames its finding (the mock-up's "the model zooms to it, as today"); ← back to F4. "Deep hole ×2" on report_sample lights one hole's faces only (`highlightedFaces()` = F1's `faces`). **Check:** `test_one_feature_at_a_time` (fails now: the row lights its union and other findings keep their colour); the existing assertions listed in A5.
- **When** nothing is picked. **Then** colours and Show OK as today (existing `findings.spec.ts`, `steps.spec.ts` pass unchanged).

### J6 Keys on the focused model (A)

- **Given** a part shown. **When** Tab reaches the model.
- **Then** it shows a 3 px `--accent` focus ring drawn inside the canvas edge (`outlineOffset` −3px, so the `overflow: hidden` viewer can't clip it) (the viewer clips with `overflow: hidden`, `style.css:177`, which hid a ring before: LESSONS "spec", port S3). ← → turn 10° about +Z per press; ↑ ↓ tilt 10°; Shift + arrows move 10% of the view height; `+` / `=` / NumpadAdd zoom in 1.25×, `-` / NumpadSubtract out; H goes Home (as the Home button: no `moving`). The page does not scroll. **Check:** `test_model_keys` (camera via `__dfma.view()`; `window.scrollY` and the side panel's `scrollTop` unchanged; ring via `getComputedStyle(canvas).outlineWidth` = 3px). Fails now: the canvas can't take focus.

### J7 Examples (B)

- **Given** the start form. **When** an example is picked (start form list, or Examples ▾ in the top bar).
- **Then** the part loads as if uploaded, Process switches to Turning for slender_shaft and Milling for report_sample, angled_hole_in_pocket and clean_one_setup, and the status line (`#status`, under the top bar) reads "Showing report_sample.step." (the file name with its extension, as today). **Check:** `test_examples` loads each of the 4 from both places (fails now: no examples).

### J8 Top bar and one picker (B)

- **Given** any state. **Then** the top bar has Open…, Examples ▾ and, once a part is shown, Export PDF; no file name in the bar; no "Change file" in the overview.
- **When** Open… takes a STEP and its `.ipt` in one pick. **Then** both are analysed together, as `upload-file` + `upload-ipt` do today. **Check:** `test_open_pair`; `upload_pair.spec.ts` moved onto the one picker.

### J9 Machine view (B)

- **Given** `report_sample.step`, Machining. **When** Machine is chosen and Setup 2 tapped.
- **Then** the setup's direction is up on screen (Setup 2 "from −X": the part's −X side faces the top of the screen, as in the mock-up's "the pocket faces up"), so the spindle comes down from the top; `__dfma.view().up` equals that direction in file axes within 0.1°; tapping a tool row (a `<button>` at least 32 px tall) lights the faces it cuts in that setup and shows a placeholder spindle whose cutter diameter is the tool's `diameter_in` × 25.4 mm (`__dfma.spindle()` = `{ diameter_mm }`). For `slender_shaft.step` (Turning) `turn_axis` lies across the screen and a placeholder chuck (`__dfma.chuck()` true) sits at the end with the smaller coordinate along `turn_axis`. Part keeps today's behaviour. **Check:** `test_machine_view_mill`, `test_machine_view_lathe` (fail now: no switch).

## Decisions

- Two slices, A before B, B after A merges (D-076).
- Orbit about the file's +Z (turntable), up kept +Z; free orbit rejected (Alternatives). Settled as recommended (D-078).
- View directions and the opening view in file axes; triad in part axes (D-076), with a small "Part axes" caption under it. Settled as recommended (D-078).
- Pins hidden while the camera moves, back 150 ms after the last mouse or wheel move and 600 ms after the last key (D-076, round 1 `pinmode`).
- Any selection greys every other face (D-076, round 1 `picked`); the PDF pictures follow (they use the same paint).
- Wall-clock tests are tagged `@timed`; estimated added check time for S1 about 3 min (9 new e2e tests, the 8 of J1-J6 plus `test_row_arrow_keys` for A7, at 10-20 s each; estimate), measured and reported in the PR against the 900 s budget (D-073).

## Alternatives rejected

- **Free orbit (Inventor's default, TrackballControls / ArcballControls):** the part can roll off its up; Home is then the only way back. Fails when a user drags diagonally and loses which way is up. Turntable keeps the part upright; Inventor offers a constrained orbit too.
- **Views in part.frame axes:** of 42 readable sample parts only `stout_shaft` has part axes equal to the file's; 26 have part +Z = file −Z, and `report_sample` has part +Z = file −Y (measured with `analyzeOrRefuse` on `tests/parts`, 2026-11-11). Top would show the underside of most parts. Fails for every pocket part.
- **Depth read instead of ray tests** (one depth render read back per placement): same pins on 171 of 172 views across `tests/parts` + CTC 02 (one fold differed on CTC 02), but placement fell only from 352 to 176 ms median, and resolution 0.5 or 0.25 made no difference (186, 181 ms): the read waits on the renderer. Not worth the risk in A.
- **Measuring each pin once instead of per spot:** 354 ms vs 352 ms. No gain.
- **Placing pins every Nth frame while moving:** still stalls 350+ ms frames on big parts; rejected by `pinmode`.
- **View cube:** Morgan "no" (`p_cube`).
- **Keep pins visible and re-project cached spots while moving** (ray tests only at rest): cheaper than hiding, but pins would float over faces that turned away until the part stops. Round 1 `pinmode` chose hiding; a possible follow-up if Morgan misses the pins.

## Risks

- **Pins come back late on big parts.** After a move, one placement still costs about 350-420 ms on CTC 02 here (software WebGL), so pins show about 0.5 s after stopping, and a drag started in that window waits. → Record the after-number in the PR; if Morgan finds it slow at work, a follow-up spec speeds placement (a spatial index over the faces would be a new dependency: SAFE-01).
- **Orbit change moves the opening view's feel.** The opening view and Home keep today's direction and up, so pin tests that depend on the opening view keep passing; only drags change. `findings.spec.ts:322-329` (pins behind the part) drags left to hide pins; with the new axis the same drag turns about +Z instead of Y, so its expected hidden pins may change: re-derive them from the geometry, never loosen them (VER-01), and say so in the PR.
- **Zoom to the mouse moves the pivot.** OrbitControls puts the target in front of the camera at the new distance (`OrbitControls.js:862-865`), so after zooming in on an edge the part turns about a point near that edge. That is how Inventor's zoom-to-cursor feels too (assumption); Home recovers.
- **Slow wheel turns.** Notches more than 150 ms apart each place pins (350-420 ms on CTC 02), so slow scrolling on a big part stutters. → Morgan's check on the work copy; a longer rest is a one-constant change.
- **New wrapper around the canvas moves the pins' host.** Pins and leaders attach to `canvas.parentElement`. → The audit F27 overlap tests (`audit_2026_11_09.spec.ts`) and `findings.spec.ts` pin tests must pass unchanged.
- **Focusable canvas with `role="img"`.** → Change to `role="application"` with a label naming the keys (A6).

## Design

### Slice A

- **A1 Controls** (`viewer.ts`): `controls` stops being `readonly`; a field `orbitUp` (default (0, 0, 1)) holds the controls' up. `private buildControls(up: THREE.Vector3)` keeps the camera position and target, disposes the old controls (their own listeners go with them), sets `orbitUp` and `camera.up` to `up`, builds OrbitControls with the settings below, puts the kept target and position back, calls `update()`, and attaches the controls' `start`, `end` and `change` listeners of A4. The canvas's own listeners (keys A6, middle-click below) are attached once in the constructor, never in `buildControls`. The constructor calls it with (0, 0, 1); slice B calls it for the Machine view (B3). `place()` sets `camera.up` to `orbitUp`, not a fixed +Z. `mouseButtons = { LEFT: ROTATE, MIDDLE: PAN, RIGHT: PAN }` (three swaps rotate and pan with Shift, Ctrl or Meta held, `OrbitControls.js:1695,1717`, so Shift + left moves and Shift + middle rotates with no code). `zoomToCursor = true`. Wheel direction is three's default (forward zooms in). `mousedown` and `auxclick` with `button === 1` on the canvas call `preventDefault()`. Touch unchanged.
- **A2 Views** (buttons, file axes, direction from the part's centre to the camera, then up):

  | Button | Direction | Up |
  |---|---|---|
  | Home | (1, −1.2, 0.9) normalized, as `fit()` today | +Z |
  | Front | −Y | +Z |
  | Top | +Z | +Y |
  | Right | +X | +Z |
  | Iso | (1, −1, 1) normalized | +Z |

  Each frames the whole part as `fit()` does (`place()`), immediately, no animation. Top sits at the orbit's pole: place the camera 0.001 rad off +Z towards −Y so OrbitControls' angles are defined and screen-up is +Y. Buttons: `<div class="views" role="group" aria-label="Views">` with five `<button type="button" data-testid="view-home|view-front|view-top|view-right|view-iso">`, at the model's bottom right, 8 px in, chip look (UI_STYLE "Chips": 32 px, 44 px below 900 px). Hidden with no part.
- **A3 Triad** (`viewer.ts`): drawn after the scene in the same canvas, in a 96 × 96 CSS px square 8 px from the bottom-left corner (scissor viewport, as `protoDrawGizmo` in `mockups/ui-fixes/proto.diff`), with its own orthographic camera (±1.55) placed along the main camera's view direction with the main camera's up. Arrows: `THREE.ArrowHelper` of length 1, head 0.28 long and 0.16 wide, along the part axes (file coordinates), coloured #c62828, #2e7d32, #1565c0; letters X, Y, Z as canvas-texture sprites drawn in the `--ink` colour, bold, at 1.32 along each arrow (as `Viewer.label` in the prototype, which used the arrow colour instead). No origin marker (Morgan: "just the triad is fine"). `setFrame(frame)` is called with each result; no frame → no triad. Hook `__dfma.triad(): { axis: "X" | "Y" | "Z"; dx: number; dy: number }[]` gives each arrow's on-screen unit direction (dy up positive). For J3 the expected directions come from projecting `part.frame` with the Front and Top views of A2.
- **A4 Pins while moving** (`viewer.ts`): only user input moves: the controls' `start` event (a press, a touch, and each wheel notch: `OrbitControls.js:1783-1793` fires `start` then `end`) and each handled arrow or zoom key (A6) set `moving`. The controls' `end` arms a 150 ms timer (`PIN_REST_MS = 150`); a key arms a 600 ms one (`KEY_REST_MS = 600`, longer than a key's repeat delay of about 500 ms, so a held key doesn't bring pins back between repeats); a new `start` cancels a pending timer and a key re-arms it, and while a button is held (a `start` with no `end` yet) a key arms nothing, so no timer fires mid-drag. When it fires, it calls `render()`, whose next animation frame runs `placeFlags()` and only then removes `moving`, so pins never flash at old spots. A view button, Home or `place()` while `moving` cancels the timer and does the same at once. `flagState()` reports `shown: false`, and `flagBoxes()` and `pinFootprints()` report nothing, while `moving`. While `moving`, the stage has class `moving` (`.stage.moving .flag, .stage.moving .leaders { visibility: hidden; }`: not `display: none` and not `el.hidden`, so pins keep their size for measuring) and `render()` draws without `placeFlags()`. The controls' `change` event only calls `render()`, as today, so `place()` and `snapshot()` (which call `controls.update()`) never set `moving`. A font `loadingdone` render while moving also skips placement. Hook `__dfma.placements(): number` counts `placeFlags()` runs.
- **A5 One feature at a time** (`main.ts` `pickOf`, `viewer.ts` `paint`): a row's pick is the shown finding: `{ id: r.findings[at], faces: thatFinding.faces }` (a passed row, which has no findings, keeps `rowFaces`). In `paint()`, while anything is selected (any `Sel` kind: a row, a finding, a passed feature, a setup, a thread, a Hole feature, one of its holes, a blend), every face not chosen is `--part`: no severity colour, no Show OK colour. As today, faces not chosen are drawn at opacity 0.35 (`GHOST_OPACITY`), except the two walls of a selected sharp corner, which stay solid. Other edge bars `--part` at 0.35. Hooks: `__dfma.faceColours(): Record<number, string>` and `__dfma.barColours(): Record<string, { colour: string; opacity: number }>` (by finding id), colours as lower-case `#rrggbb`. Tests whose expectation changes from the row's union to the shown finding's faces: `steps.spec.ts:323` (F4's faces), `browser_engine.spec.ts:359`, `:390`, `:420` (the first finding's faces), `pdf.spec.ts:112` (F2's faces). This is the behaviour D-076 approved, not a weakened check (VER-01). Unchanged: `steps.spec.ts:458` and `lathe_plan.spec.ts:63` (setups light all their faces), `findings.spec.ts:89`, `:123` (one finding per row). UI_STYLE "Selected finding" and D-017's "nothing else dims" are amended in the same PR.
- **A6 Keys** (`viewer.ts`): canvas `tabindex="0"`, `role="application"`, `aria-label="3D model of the part. Arrows rotate, Shift and arrows move, plus and minus zoom, H goes home."`. OrbitControls' own keys stay off (no `listenToKeyEvents`). Keydown on the canvas only, Ctrl, Alt and Meta presses ignored, key repeat allowed: ← turns the camera −10° about the controls' up through the target and → +10° (the part appears to turn the other way); ↑ tilts the camera 10° towards the up axis and ↓ away, clamped so the angle between camera − target and up stays within [0.001, π − 0.001] rad; Shift + arrows move camera and target together by 10% of the view height (← left, ↑ up on screen); `+`/`=`/NumpadAdd moves the camera to target + (camera − target) / 1.25, `-`/NumpadSubtract × 1.25; `h`/`H` Home. Each calls `preventDefault()`, then `controls.update()`; arrows and zoom keys count as a move for A4, H does not (it is the Home view, A2). "View height" is the visible height at the target's distance: 2 × distance × tan(fov / 2). Focus ring: `.stage canvas:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }`.
- **A7 Row keys** (`steps.ts` `renderRows`, `main.ts` `onStep`): keydown ArrowLeft / ArrowRight on the open row's button, its ‹ or › calls `onStep(−1 / +1)` with `preventDefault()`, as ‹ › do. `onStep` clamps `at` to [0, findings − 1] (today only the lower end is clamped, `main.ts:188`; the upper end is clamped later in `pickOf`). Focus stays where it was (the redraw keeps focus by `data-testid`, `main.ts` `showFindings`). **Check:** `test_row_arrow_keys` (report_sample, "Sharp corner ×4": → three times reads "4 of 4", a fourth stays there, ← reads "3 of 4").
- **A8 Words** (`index.html` `.hint`): "Drag to rotate. Middle-drag or Shift + drag to move. The wheel zooms to the mouse. Tab to the model for keys."
- **A9 Markup**: wrap the canvas, the views group and the triad caption in `<div class="stage">` inside `.viewer`. CSS: `.stage { position: relative; flex: 1; display: flex; min-height: 0; }`; the rules on `.viewer canvas` (`style.css:101`, and the 900 px rule at `:180`) move to `.stage canvas` unchanged; below 900 px `.stage { flex: none; }`. `.viewer-note` and `.setupchips` stay positioned against `.viewer` (`style.css:97`, `:243`). Pins and leaders attach to `canvas.parentElement`, now `.stage`; their offsets use `canvas.offsetLeft/Top` within it (0, 0). The audit F27 overlap tests (`audit_2026_11_09.spec.ts`) and the pin tests in `findings.spec.ts` must pass unchanged.
- **A10 Hooks** (`window.__dfma`, declared at `main.ts:59`, set at `main.ts:73` in every build, as the existing hooks): `view(): { position: [n, n, n]; target: [n, n, n]; up: [n, n, n] }`; `partMatrix(): number[]` (the part group's `matrixWorld.elements`); `triad()`, `renderState()`, `part(): { center: [n, n, n]; radius: number; box: [n, n, n, n, n, n] }` (the part's bounding sphere and box), `placements()`, `faceColours()`, `barColours()` as above; slice B adds `spindle()` and `chuck()`.
- **A11 `web/scripts/pin-lag.mjs`** (an ES module port of `docs/specs/ui-fixes-pin-lag.cjs`, the script that measured the Problem's numbers; prints to the console only): serves `web/dist-pages` with `vite preview` on port 8790, opens Chromium (`DFMA_CHROMIUM` if set, with the software WebGL flags of `playwright.config.ts`) at 1280 × 800, uploads `tests/nist/.cache/NIST-PMI-STEP-Files/**/nist_ctc_02_asme1_ap242-e2.stp` (run `npm run nist` first), waits for the first `.flag` and 3 s, then 3 runs each of a drag (40 moves of 6 px right with a ±30 px sine from the centre) and a wheel (20 notches alternating ±60), and prints median, p90 and max gaps between animation frames. Not in `npm run check`.
- **A12 Triad caption and narrow widths**: "Part axes" in `.stage` at bottom 2 px, left 8 px, 96 px wide, centred, `--muted`, 0.75 rem, `aria-hidden` (the triad is a picture). At 500 px and below the triad draws 64 px, the caption hides, and the one views group is moved in the DOM (not copied) into the `.viewfoot` row before the hint, by `matchMedia("(max-width: 500px)")` as `placeShowOk` does for Show OK (`main.ts`), so buttons and triad never overlap at 360 px. **Check:** in `test_view_buttons` at 360 px wide, the views group's box and the triad's square (bottom-left 64 px of the canvas) don't intersect.
- **A13 Renderer state**: the triad pass ends by restoring `autoClear = true`, scissor test off and the full viewport, so `snapshot()` (which calls `renderer.render` directly, `viewer.ts:234`) never draws a triad or a clipped frame; `snapshot()` draws its picture with the triad pass off (a flag read by the render path); hook `__dfma.renderState(): { autoClear: boolean; scissorTest: boolean }` read in `pdf.spec.ts` right after Export PDF must be `{ autoClear: true, scissorTest: false }`, and the PDF picture's bottom-left 96 × 96 px corner must hold no pixel of the three triad colours (±8 per channel).

### Slice B (detail re-checked against merged A before it starts, write-spec step 8)

- **B1 Examples**: `report_sample`, `angled_hole_in_pocket`, `slender_shaft`, `clean_one_setup` (`.step`, 33.7-54.0 kB), served at `${import.meta.env.BASE_URL}examples/<name>.step` from `tests/parts` by a Vite plugin in `web/vite.config.ts` (dev server and every build's output; one home, SRC-01). Each is fetched, wrapped as a `File` and analysed through the same path as an upload. A failed fetch shows "The example could not be loaded. Try again." in the error box with the retry line. Start form: "Or try an example" and the 4 names as buttons (`data-testid="example-<name>"`); top bar: `<button aria-haspopup="menu" aria-expanded data-testid="examples-button">Examples ▾</button>` (`aria-expanded` "false", "true" while open) with a `role="menu"` (`data-testid="examples-menu"`, items `role="menuitem"`, `data-testid="examples-item-<name>"`) of the same 4; picking one closes the menu (↑ ↓ move, Enter picks, Esc and a click outside close, focus returns to the button). Picking one sets Process (`slender_shaft` → `turn`, others → `mill`), keeps Material, and clears any `.ipt`.
- **B2 Top bar**: Open… (a button that clicks one `<input type="file" multiple accept=".step,.stp,.ipt">`, keeping `data-testid="upload-file"`); the files are sorted by extension into the STEP and the `.ipt`; three or more files, two STEPs or two `.ipt`s → the error box (as today, under the picker) shows "Choose one STEP file and, if you have it, its .ipt."; an `.ipt` alone → today's status line "Now choose the STEP file that Inventor exported from this .ipt." (`main.ts` `analyse`). The start form's two pickers become this one. `#top-file` and "Change file" go; `#status` keeps "Showing <name>.".
- **B3 Machine view**: a Part / Machine switch (`role="radiogroup"`, two radio buttons) over the model on Machining only, default Part. In Machine, a setup chip turns the setup's direction name (`"+Z"`, `"-X"`…, part axes, `plan.ts:12`) into file coordinates `d` through `part.frame`, calls `buildControls(d)` (A1), and places the camera with `d` as up on screen, looking from the side and a little above: the view direction (part centre to camera) is `normalize(h + 0.6 d)`, where `h` is the Home direction of A2 with its component along `d` removed and normalized (if that is under 0.1 long, the file axis least aligned with `d`, made perpendicular to it); the orbit then turns about `d`. The view buttons hide in the Machine view (Home there is the setup chip). The tool lines in that setup become `<button>`s (min 32 px) that select a new `Sel` kind `op:<setup>:<tool id>` (added to `kindOf`, `main.ts:118`, and to A5's greying) lighting the union of `faces` of every operation of that tool in that setup (tapping it again clears it, as `select()` does today, and the spindle goes with it), and, for a tool with a `diameter_in` (drills, end mills, countersinks), show the placeholder spindle; turning, boring and grooving tools light their faces with no spindle (the chuck shows instead) with its tip at the centre of those faces' box, axis along `d` (cutter diameter `diameter_in` × 25.4 mm, cutter length 3 diameters; holder 2.2 r × 1.6 d, cone and nose as `protoSpindle`). Turning: `u` = the file axis among +Z, +Y least aligned with `turn_axis`, made perpendicular to it; `buildControls(u)`; the view direction is `normalize(turn_axis × u)`, so `turn_axis` lies across the screen and `u` is up; a three-jaw placeholder chuck (`protoChuck`) at the end with the smaller coordinate along `turn_axis`. Hooks: `spindle(): { diameter_mm: number } | null`, `chuck(): boolean`. Leaving Machine or Machining removes spindle and chuck and calls `buildControls(+Z)` and Home.
- **B4 Amends**: D-042 (one picker, "Change file" gone), D-023 (Machine view), UI_STYLE top bar and Machining.

## Slices

### S1 (slice A) The model

- **Morgan tries:** on the work copy, report_sample: pick Deep hole ×2, one hole lit, › lights the other; spin with wheel and drag, no pins while moving; middle-drag moves, Shift + middle-drag rotates; Tab to the model, arrows rotate, H home; press each view button; watch the triad.
- **Checks that fail now:** J1-J6 tests in `web/e2e/model.spec.ts`; the five changed assertions (A5).
- **Files:** `web/src/viewer.ts`: A1, A3, A4, A5 paint, A6, hooks. `web/src/main.ts`: A5 `pickOf`, `setFrame`, view buttons, hooks. `web/src/steps.ts`: A7. `web/index.html`: A2 group, A6 attributes, A8, A9. `web/src/style.css`: views, stage, `.moving`, focus ring. `web/e2e/model.spec.ts`: new. `web/e2e/steps.spec.ts`, `web/e2e/browser_engine.spec.ts`, `web/e2e/pdf.spec.ts`: A5 changes. `web/scripts/pin-lag.mjs`: A11. `docs/UI_STYLE.md`, `docs/DECISIONS.md` (D-017, D-076 built), `docs/HANDOFF.md`.
- **Waits on:** none.

### S2 (slice B) The screens

- **Morgan tries:** Examples ▾ loads each of the four; Open… with a STEP and its .ipt together; Machining, Machine: each setup chip puts the spindle on top, a tool row lights its faces in the spindle; slender_shaft lies across with a chuck.
- **Checks that fail now:** J7-J9 in `web/e2e/screens.spec.ts`; `upload_pair.spec.ts`, `threads.spec.ts`, `hole_features.spec.ts`, `blends.spec.ts`, `pdf.spec.ts` moved from `upload-ipt` to the one picker; `steps.spec.ts`, `audit_2026_11_09.spec.ts` lose "Change file" / `top-file` assertions in favour of Open….
- **Files:** `web/vite.config.ts` (B1 plugin), `web/index.html`, `web/src/main.ts`, `web/src/findings.ts` (tool rows as buttons), `web/src/viewer.ts` (spindle, chuck, setup camera), `web/src/style.css`, the e2e files above, `docs/UI_STYLE.md`, `docs/DECISIONS.md` (D-023, D-042), `docs/HANDOFF.md`.
- **Needs from S1:** `buildControls` (A1), `.stage` (A9), the hooks of A10, the A5 paint for tool lighting, and A4's rule that only user input hides pins.
- **Waits on:** S1 merged.

## Verification

- Every push: `npm run check` at the repo root (under 900 s, D-073); before ready, `npm --prefix web run edmr` only if the engine changed (slice A and B don't touch `web/src/engine`).
- Pin lag: `node web/scripts/pin-lag.mjs` on `main` and on the branch, numbers in the PR (VER-06).
- Screenshots at 2× of J2, J3, J5 (and J9 for B) on the status page; Morgan's own check on the work copy (VER-07).

## Open questions

Both settled on 2026-11-11 as recommended (D-078); kept for the reasons.


1. **Which axes do the views use?** Recommended: Front, Top, Right, Iso and Home in the file's own axes (Top looks down the file's +Z, as Inventor shows it), and the triad in the part's axes (D-076) with a "Part axes" caption, so the triad matches the setup names ("from −X") but not always the view names. Alternatives: everything in the part's axes (Top shows the underside of 26 of 42 sample parts); everything in the file's axes (the triad then disagrees with the setup names on 41 of 42).
2. **Turntable orbit?** Recommended: the part turns about the file's +Z and never rolls. Alternative: free orbit, Inventor's default.
