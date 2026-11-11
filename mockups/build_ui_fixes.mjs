// Writes mockups/ui-fixes.html: the UI fixes mock-up (HANDOFF 000a), from the 2× screenshots in mockups/ui-fixes/.
//   node mockups/build_ui_fixes.mjs && node .claude/skills/ui-mockups/scripts/add-zoom.mjs mockups/ui-fixes.html
// The screenshots are the real app (main, and a throwaway prototype of mockups/ui-fixes/proto.diff) on real test
// parts, taken by mockups/ui-fixes/shots.cjs; buttons, the examples list, the Part / Machine switch and the labels
// are drawn into the page by that script. Nothing here is built.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const img = (name, alt) =>
  `<img src="data:image/png;base64,${fs.readFileSync(path.join(HERE, "ui-fixes", name)).toString("base64")}" alt="${alt}">`;
const fig = (name, alt, caption) => `<figure>${img(name, alt)}<figcaption>${caption}</figcaption></figure>`;
const record = fs.existsSync(path.join(HERE, "ui-fixes", "record.html"))
  ? fs.readFileSync(path.join(HERE, "ui-fixes", "record.html"), "utf8")
  : `<section id="check-record"><h2>Check record</h2><p>Not written yet.</p></section>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI Fixes Mock-up</title>
<style>
:root { --bg:#eef2f6; --panel:#ffffff; --ink:#16263d; --muted:#55657a; --line:#c4cfdc; --accent:#1f5fa8; --accent-ink:#ffffff;
  --radius:2px; --space-2:8px; --space-3:12px; --space-4:16px; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#121a24; --panel:#1b2532; --ink:#e4ebf3; --muted:#a3b1c2; --line:#34445a; --accent:#7fb0ea; --accent-ink:#0d1520; color-scheme: dark; } }
:root[data-theme="dark"] { --bg:#121a24; --panel:#1b2532; --ink:#e4ebf3; --muted:#a3b1c2; --line:#34445a; --accent:#7fb0ea; --accent-ink:#0d1520; color-scheme: dark; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 "IBM Plex Sans", system-ui, sans-serif; }
main { max-width:860px; margin:0 auto; padding-block:var(--space-4); padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)); }
h1 { font-size:1.25rem; text-wrap:balance; } h2 { font-size:1.125rem; margin-top:28px; } h3 { font-size:1rem; margin:20px 0 4px; }
figure { margin:var(--space-3) 0; background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); padding:var(--space-2); }
figure img { width:100%; height:auto; display:block; }
figcaption { font-size:0.875rem; color:var(--muted); padding-top:var(--space-2); }
.q { background:var(--panel); border:1px solid var(--line); border-left:4px solid var(--accent); padding:var(--space-3); margin:var(--space-3) 0; }
.keys { width:100%; border-collapse:collapse; background:var(--panel); font-size:0.9375rem; }
.keys th, .keys td { text-align:left; padding:6px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
.wrap { overflow-x:auto; }
code { font-family:"IBM Plex Mono", ui-monospace, monospace; font-size:0.875rem; }
li { margin:4px 0; } .muted { color:var(--muted); font-size:0.875rem; }
</style></head><body><main>
<h1>UI fixes: the mock-up</h1>
<div class="q"><b>Your call:</b> reply in chat with <b>Approve</b>, <b>Change</b> (say what) or <b>Rethink</b>. Approve leads to the final plan page; nothing is built before you approve that.</div>
<p class="muted">These are screenshots of the real app on real test parts from <code>tests/parts</code>. The new behaviour of the model (one feature lit, the rest grey; the machine view's camera) comes from a throwaway prototype that will not be kept. The new buttons, the examples list, the Part / Machine switch and the labels are drawn into the page for the picture. Tap a picture to zoom.</p>

<h2>Slice A: the model</h2>
<h3>1. One feature at a time</h3>
${fig("02-row-before.png", "Today: Deep hole ×2 picked, both holes blue", "<b>Today.</b> report_sample.step, Features, Deep hole ×2 picked: both holes light up in blue, and the other findings keep their colour, faded. A row with many copies, such as thin walls, lights them all; I think that is the all-blue part in your photo (inference: I haven't seen the photo).")}
${fig("03-row-after.png", "Proposed: only hole 1 blue, the rest grey", "<b>Proposed.</b> The same pick lights only the hole the row shows (F1, 1 of 2); the rest of the part is plain grey. The model zooms to it, as today. View buttons sit at the model's bottom left.")}
${fig("03b-row-after-next.png", "Proposed: after › the second hole is lit", "<b>Proposed, after ›.</b> The second hole (F2, 2 of 2) is lit instead. ‹ › or ← → with the row focused step through them.")}

<h3>2. Pins while the part moves</h3>
${fig("04-moving.png", "Proposed: the part while it moves, no pins", "<b>Proposed, while moving.</b> Any drag, wheel turn or key hides every pin; they come back about 150 ms after the part stops, where they are today. With nothing picked the colours stay as now (Show OK switches unchanged).")}

<h3>3. Rotate and move like Inventor</h3>
<div class="wrap"><table class="keys">
<tr><th>Do</th><th>Mouse or trackpad</th><th>Keys (model focused)</th></tr>
<tr><td>Rotate</td><td>Left-drag, or Shift + middle-drag</td><td>Arrows</td></tr>
<tr><td>Move</td><td>Middle-drag, or Shift + left-drag (trackpads); right-drag still works</td><td>Shift + arrows</td></tr>
<tr><td>Zoom</td><td>Wheel: forward zooms in, towards the point under the mouse</td><td>+ and −</td></tr>
<tr><td>Set views</td><td>Buttons Home, Front, Top, Right, Iso</td><td>H for Home</td></tr>
<tr><td>Step features</td><td>‹ › in the open row</td><td>← → with the open row focused</td></tr>
</table></div>
<p class="muted">Touch stays as today: one finger rotates, two move and zoom. Middle-click's autoscroll (Windows) and paste (Linux) are blocked over the model. The model gets a visible focus ring when tabbed to.</p>

<h2>Slice B: the screens</h2>
<h3>4. Start form with examples</h3>
${fig("01-start.png", "Proposed start form: one Open… and four examples", "<b>Proposed.</b> One Open… takes the STEP and its .ipt together. Four examples underneath; an example sets Process itself (slender_shaft to Turning). The top bar has Open… and Examples ▾ from the start.")}
<h3>5. Top bar with Open… and Examples</h3>
${fig("07-examples-menu.png", "Proposed: Examples menu open over a loaded part", "<b>Proposed.</b> Open…, Examples ▾ and Export PDF. To fit, the file name leaves the bar; it stays in the line under it (“Showing angled_hole_in_pocket.step.”). “Change file” goes from the overview.")}
<h3>6. Machine view on Machining</h3>
${fig("05-machine-mill.png", "Proposed machine view, mill, setup 2 from −X", "<b>Proposed, mill.</b> Part / Machine switch over the model. A setup chip turns the part so its spindle is on top (Setup 2 from −X: the pocket faces up). Tapping a tool row lights the faces it cuts: tool 3, the 3/4 in end mill, lights pocket-1.")}
${fig("06-machine-lathe.png", "Proposed machine view, lathe", "<b>Proposed, lathe.</b> slender_shaft.step: the turning axis lies across the screen, as a lathe looks from the front. The whole part is red because Slender part (F1, Fix) is about the whole part, as today.")}

<h2>Later</h2>
<ul><li><b>Tool-access check:</b> after steps and slots (your review note), research first.</li><li><b>Cutaway and dimensions on the part:</b> Soon, after A and B.</li></ul>

<h2>Checks you can try on the work copy</h2>
<ul>
<li>Pick Deep hole ×2 on report_sample: one hole lit, the rest grey; › lights the other.</li>
<li>Spin the part with the wheel and by dragging: no pins while it moves, pins back within a quarter second of stopping. I will also time a big part on a production build before and after and give you the numbers.</li>
<li>Middle-drag moves, Shift + middle-drag rotates, the wheel zooms to the mouse, in Chrome or Edge at work; no autoscroll circle.</li>
<li>Tab to the model: arrows rotate, + − zoom, H goes home.</li>
<li>Open… with a STEP and its .ipt picked together; Examples ▾ loads each of the four.</li>
<li>Machining, Machine: each setup chip puts the spindle on top; tapping a tool lights its faces.</li>
</ul>

${record}
</main></body></html>
`;
fs.writeFileSync(path.join(HERE, "ui-fixes.html"), html);
console.log("wrote mockups/ui-fixes.html", html.length, "bytes");
