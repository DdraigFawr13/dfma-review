// Writes mockups/ui-fixes-a-status.html: the UI fixes S1 (slice A) status page for Morgan (D-009), from the 2×
// screenshots in mockups/ui-fixes-a/ (taken by mockups/ui-fixes-a/shots.mjs on the production build).
//   node mockups/build_ui_fixes_a_status.mjs && node .claude/skills/ui-mockups/scripts/add-zoom.mjs mockups/ui-fixes-a-status.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO = "https://claude.ai/artifact/KzexiP7jM8zQdB3RQox29M";
const PR = "https://github.com/DdraigFawr13/dfma-review/pull/51";
const shot = (name, alt, caption) => `<figure><img class="shot" src="data:image/png;base64,${
  fs.readFileSync(path.join(HERE, "ui-fixes-a", name)).toString("base64")}" alt="${alt}"><figcaption>${caption}</figcaption></figure>`;

const html = `<title>UI Fixes Slice A</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* One reading column; screenshots full width, tap to zoom. Same palette as the app (UI_STYLE). */
:root { --bg:#eef2f6; --panel:#ffffff; --ink:#16263d; --muted:#55657a; --line:#c4cfdc; --accent:#1f5fa8; --warn:#9a5b00;
  --sans:"IBM Plex Sans", system-ui, sans-serif; --mono:"IBM Plex Mono", ui-monospace, monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#121a24; --panel:#1b2532; --ink:#e4ebf3; --muted:#a3b1c2; --line:#34445a; --accent:#7fb0ea; --warn:#f0b35a; color-scheme: dark; } }
:root[data-theme="dark"] { --bg:#121a24; --panel:#1b2532; --ink:#e4ebf3; --muted:#a3b1c2; --line:#34445a; --accent:#7fb0ea; --warn:#f0b35a; color-scheme: dark; }
body { background:var(--bg); color:var(--ink); font:16px/1.55 var(--sans); }
main { max-width:860px; margin:0 auto; padding-block:16px 40px; padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)); }
h1 { font-size:1.4rem; margin:.2em 0; text-wrap:balance; } h2 { font-size:1.15rem; margin:1.8em 0 .4em; text-wrap:balance; }
a { color:var(--accent); } .muted { color:var(--muted); } code { font-family:var(--mono); font-size:.92em; }
.answer { background:var(--panel); border:1px solid var(--line); border-left:4px solid var(--accent); padding:12px 16px; border-radius:2px; display:grid; gap:10px; }
.answer p { margin:0; }
.decide { border-left-color:var(--warn); }
figure { margin:0 0 18px; background:var(--panel); border:1px solid var(--line); border-radius:2px; padding:10px; }
figcaption { color:var(--muted); font-size:.95rem; padding-top:8px; }
img.shot { width:100%; height:auto; display:block; border:1px solid var(--line); }
ul, ol { padding-left:1.2em; } li { margin:.35em 0; }
.table { overflow-x:auto; } table { border-collapse:collapse; width:100%; font-size:.95rem; font-variant-numeric:tabular-nums; }
th, td { border-top:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top; }
</style>
<main>
<h1>UI fixes, slice A: the model</h1>
<p class="muted">DFMA Review · 2026-11-11 · <a href="${PR}">PR #51</a> (approved, D-080) · spec <code>docs/specs/ui-fixes.md</code> S1</p>

<div class="answer">
<p><strong>Slice A is built and every check passes.</strong> The part now turns freely, like Inventor's free orbit. Five view buttons put it back. A small XYZ in the corner shows the part's own axes. Pins hide while the part moves. Picking a row lights one feature, and the rest of the part goes grey.</p>
<p><strong>Try it:</strong> the <a href="${DEMO}">demo</a>, or the work copy once this merges. Tap report_sample, then Features. Open "Deep hole ×2": one hole lights, and › lights the other. Drag to spin the part and watch the pins go and come back. Press each view button.</p>
</div>

<h2>Decided, and still open</h2>
<div class="answer decide">
<p><strong>1. Approved</strong> after the demo (D-080). Slice B (examples, Open…, the machine view) starts in a new session once it merges.</p>
<p><strong>2. Drag speed on big parts.</strong> The spec's goal was a frame every 50 ms or less while turning CTC 02. Here it is about 190 ms, down from 310-420 ms. The page itself now does almost no work while you drag: 0.2 s against 11-15 s before. What's left looks like this container drawing in software. Your PC's graphics card should be much faster. Please tell me how it feels at work.</p>
<p><strong>3. Arrow keys.</strong> I made each arrow move the camera that way: ← goes round to the left, so the part seems to turn right. If you'd rather the part follows the arrow, it's a one-line change.</p>
</div>

<h2>Screens (tap to zoom)</h2>
${shot("one-feature.png", "Features step on report_sample, Sharp corner row at 2 of 4", "Sharp corner ×4 at 2 of 4: only F5's corner is lit. Every other face is plain grey, with no Fix or Review colour. The view buttons sit at the model's bottom right, and the triad with its \"Part axes\" caption at the bottom left.")}
${shot("one-hole.png", "Deep hole row picked: one hole lit", "Deep hole ×2: one hole lit, not both.")}
${shot("view-top.png", "Top view of report_sample", "Top: looking down the file's Z. The triad shows the part's own axes, which point another way on this part: its Z is the file's −Y.")}
${shot("view-front.png", "Front view of report_sample", "Front: X points down and Y right; Z points at you, so it shows as a dot.")}
${shot("focus.png", "The model with its keyboard focus ring", "Tab to the model: a blue ring inside its edge. Arrows turn it 10°, Shift + arrows move it, + and − zoom, H goes home.")}
${shot("narrow.png", "The model at 360 px wide", "On a phone (360 px): the view buttons move under the model, and the triad is smaller with no caption.")}

<h2>Calls I made while building</h2>
<ul>
<li>three's free-orbit control had two bugs in the way we use it: the first pan or zoom jumped by about the part's size, and it lost track of which way is up. I added a two-line fix for each, and the tests cover both.</li>
<li>A row now lights the finding it shows, so six older checks expected the whole row. I changed them to the new behaviour; none got weaker.</li>
<li>The triad sits 24 px up so its caption fits under it (the spec's numbers made them overlap).</li>
<li>A fresh reviewer read the code against the spec and found 8 items. All are fixed: pins could stay hidden after a cancelled touch, and 3 checks couldn't fail.</li>
</ul>

<h2>Checks</h2>
<ul>
<li><code>npm run check</code>: 838 unit tests, parity 122 of 122, 108 browser tests and 69 timed tests passed, in 662 s (budget 900 s).</li>
<li>The 9 new browser tests each failed on main first. Planted bugs (pins back at 0 ms, colours kept while selected, a wrong Top view, the triad in the PDF) each made their test fail.</li>
<li>The demo can't save a PDF inside the page viewer, the same as earlier demos.</li>
</ul>
<div class="table"><table>
<tr><th>CTC 02, 3 runs each</th><th>main</th><th>this branch</th></tr>
<tr><td>Drag: slowest 1 frame in 10</td><td>310-423 ms</td><td>192-196 ms</td></tr>
<tr><td>Drag: the page's own work, 40 moves</td><td>10.9-15.2 s</td><td>0.22-0.27 s</td></tr>
<tr><td>Wheel: slowest 1 frame in 10</td><td>340-411 ms</td><td>263-412 ms</td></tr>
</table></div>
<p class="muted">The wheel barely changes: the test's notches come more than 0.15 s apart, so pins come back between them, as the spec expected. Measured with <code>web/scripts/pin-lag.mjs</code> on a production build, in software graphics.</p>

<h2>Plan map</h2>
<ul>
<li>✔ Research, bootstrap, design, first usable version, UI direction, GitLab Pages port.</li>
<li>▶ UI fixes: ✔ plan and mock-up · ✔ spec · ▶ slice A, the model (this page) · ○ slice B, the screens · ○ later: cutaway, dimensions.</li>
<li>○ Steps and slots · ○ edge treatments · ○ pocket shapes · ○ Stages 2-4 (design review, DXF check, DXF drawings).</li>
</ul>
<p class="muted">Still owed, from 2026-11-12: your work-pair check (D-046).</p>
</main>
`;
fs.writeFileSync(path.join(HERE, "ui-fixes-a-status.html"), html);
console.log("wrote mockups/ui-fixes-a-status.html");
