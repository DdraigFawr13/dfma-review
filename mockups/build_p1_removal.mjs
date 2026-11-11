// Writes mockups/p1-removal.html: the P1 mock-up (machining spec, P1 S1 and S2), from the 2× screenshots in
// mockups/p1-removal/.
//   node mockups/build_p1_removal.mjs && node .claude/skills/ui-mockups/scripts/add-zoom.mjs mockups/p1-removal.html
// The screenshots are the real app on real parts: a throwaway prototype (mockups/p1-removal/proto.diff: the ghost
// stock box and the PDF lines) taken by mockups/p1-removal/shots.cjs. The plan-list lines, the Stock button and the
// "Your stock" fields are drawn into the page by that script, with numbers from numbers.json (the spec's formula run
// by web/src/removal-proto/mockup.run.ts). Nothing here is built.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "p1-removal");
const img = (name, alt) => `<img src="data:image/png;base64,${fs.readFileSync(path.join(DIR, name)).toString("base64")}" alt="${alt}">`;
const fig = (name, alt, caption) => `<figure>${img(name, alt)}<figcaption>${caption}</figcaption></figure>`;
const record = fs.existsSync(path.join(DIR, "record.html"))
  ? fs.readFileSync(path.join(DIR, "record.html"), "utf8")
  : `<section id="check-record"><h2>Check record</h2><p>Not written yet.</p></section>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Removal Mock-up</title>
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
figure.small img { width:auto; max-width:100%; }
figcaption { font-size:0.875rem; color:var(--muted); padding-top:var(--space-2); }
.q { background:var(--panel); border:1px solid var(--line); border-left:4px solid var(--accent); padding:var(--space-3); margin:var(--space-3) 0; }
code { font-family:"IBM Plex Mono", ui-monospace, monospace; font-size:0.875rem; }
li { margin:4px 0; } .muted { color:var(--muted); font-size:0.875rem; }
</style></head><body><main>
<h1>Removal volume (P1): the mock-up</h1>
<div class="q"><b>Your call:</b> reply in chat with <b>Approve</b>, <b>Change</b> (say what) or <b>Rethink</b>. Approve starts slice S1 (the numbers); S2 (the stock box and your own stock) follows in its own session.</div>
<p class="muted">Screenshots of the real app on real parts: <code>clean_pocket.step</code> from the test parts and NIST CTC 01. The numbers are real: the spec's formula run on each part. The new lines (shaded here so you can find them), the Stock button and the stock fields are drawn into the page for the picture; the see-through box comes from a throwaway prototype that will not be kept. Tap a picture to zoom.</p>

<h2>Slice S1: how much comes off</h2>
<h3>1. Two new lines under Stock</h3>
${fig("01-s1-lines.png", "Machining step for clean_pocket.step with Removal and Not explained lines under Stock", "<b>clean_pocket.step.</b> Removal: 0.79 in³ (12,983 mm³), the 2 × 3 × 1 in block minus the part. Not explained: 0.00 in³ (4 mm³), 0.03 %: the pocket accounts for nearly all of it (the 4 mm³ is most likely the floor mesh's straight segments cutting across its rounded corners: about 0.4 mm² of floor at 0.400 in deep; inference, not measured).")}
${fig("02-s1-ctc01.png", "Machining step for NIST CTC 01: 98.70 % not explained", "<b>NIST CTC 01.</b> 2,401.60 in³ comes off and 98.70 % of it is not explained: no found hole or pocket accounts for it: in the picture that is the outside profile, the notches and the slots (seen, not measured). This is the number that tells you the plan above covers only a small part of the cutting. Slots (the next slices after P1) will bring it down.")}
<h3>2. The same two lines in the PDF</h3>
${fig("pdf-1.png", "PDF page 1 for CTC 01 with Removal and Not explained lines in Part summary", "<b>PDF, Part summary.</b> After Stock: \"Removal: 2,401.60 in³ (39,355,177 mm³), the stock block minus the part\" and \"Not explained by a found feature: 2,370.40 in³ (38,843,883 mm³), 98.70 % of the removal\".")}
<p class="muted">In S1 the numbers also go into the result file the app keeps for each part (a <code>removal</code> block: stock, part, total, each hole's and pocket's own volume, explained and not explained). The volume of each hole is its diameter and depth; of each pocket, its floor area times its depth. Both are approximate by design (spec, "Feature volumes").</p>

<h2>Slice S2: the stock box and your own stock</h2>
<h3>3. Stock box, on by default</h3>
${fig("03-s2-ghost.png", "clean_pocket.step with a see-through stock box and an empty Your stock field", "<b>On the Machining step.</b> A see-through box with its edges drawn shows the stock around the part. A <b>Stock</b> button beside the view buttons (at the left end of their row) turns it on and off (on when you open the step). \"Your stock\" sits under Stock: three sizes in inches and Apply.")}
${fig("06-s2-off.png", "Stock button off, no box", "<b>Stock off.</b> The box goes; the lines stay.")}
<h3>4. Your own stock</h3>
${fig("04-s2-typed.png", "Typed stock 3.25 × 2.25 × 1.125 in with facing lines and the stock box grown", "<b>Typed 3.25 × 2.25 × 1.125 in, then Apply.</b> Sizes pair largest to largest with the part's, in any order you type them. Removal now uses your block: 3.02 in³. One line per axis gives the facing, split evenly between the two sides (assumption: the part sits centred) and the volume of those two layers: Z 0.0625 in a side, 0.91 in³; X 0.1250 in, 0.81 in³; Y 0.1250 in, 0.50 in³ (corners counted once, Z first). The box grows to your size. Not saved: it goes when you open another part.")}
<figure class="small">${img("05a-too-small.png", "Error: your 0.900 in is smaller than the part's 1.000 in")}<figcaption><b>Too small.</b> \"Your 0.900 in is smaller than the part's 1.000 in.\" Nothing else changes. A size equal to the part's is fine (no facing on that axis).</figcaption></figure>
<figure class="small">${img("05b-bad.png", "Error: Type three sizes over 0 in")}<figcaption><b>Empty, not a number, 0 or below.</b> \"Type three sizes over 0 in.\"</figcaption></figure>

<h2>Choices in this mock-up that the spec leaves open</h2>
<p class="muted">Each is my default; say if you want it otherwise.</p>
<ol>
<li><b>Not explained stays on the part-size block when you type your stock</b>, and says so: "0.03 % of the part-size removal". The extra layer is facing and shows in the facing lines, so it is not counted again as "not explained". The spec says the removal line uses your stock but doesn't say this.</li>
<li><b>The Stock button shows on the Machining step only</b>, beside the view buttons at the left end of their row; in the Machine view the view buttons hide, and so do the button and the box.</li>
<li><b>Words:</b> on screen "Not explained" (short, to fit the left column) with the reason after the number; in the PDF "Not explained by a found feature". Big volumes get thousands commas in in³ too (2,401.60 in³).</li>
<li><b>Your stock lasts until you open another part</b> (not saved; spec R6 says session only).</li>
<li><b>The PDF lines</b> show whenever the Stock line shows there, and always use the part-size block (your typed stock is not in the PDF; spec R6).</li>
</ol>
<p class="muted">What doesn't change: the plan, setups, tools, findings and cost stay as they are (spec J7); removal is not a cost driver until time and cost (P4). Milled parts only; a turned part shows no removal lines.</p>

${record}
</main></body></html>
`;
fs.writeFileSync(path.join(HERE, "p1-removal.html"), html);
console.log("wrote mockups/p1-removal.html");
