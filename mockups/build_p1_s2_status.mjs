// Writes mockups/p1-s2-status.html: the P1 S2 status page for Morgan (D-009), from the 2× screenshots of the built app
// in mockups/p1-s2-status/ (taken by its shots.cjs on web/dist-pages-test).
//   node mockups/build_p1_s2_status.mjs && node .claude/skills/ui-mockups/scripts/add-zoom.mjs mockups/p1-s2-status.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO = "https://claude.ai/artifact/D4wrFp3MAWt3EwN2SqYJsy";
const MOCK = "https://claude.ai/artifact/9AyZ9UKCJRt3PKZA4yLJnM";
const PR = "https://github.com/DdraigFawr13/dfma-review/pull/61";
const shot = (name, alt, caption, dir = "p1-s2-status") => `<figure><img src="data:image/png;base64,${
  fs.readFileSync(path.join(HERE, dir, name)).toString("base64")}" alt="${alt}"><figcaption>${caption}</figcaption></figure>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>P1 S2 Status</title>
<style>
:root { --bg:#eef2f6; --panel:#ffffff; --ink:#16263d; --muted:#55657a; --line:#c4cfdc; --accent:#1f5fa8; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#121a24; --panel:#1b2532; --ink:#e4ebf3; --muted:#a3b1c2; --line:#34445a; --accent:#7fb0ea; color-scheme: dark; } }
:root[data-theme="dark"] { --bg:#121a24; --panel:#1b2532; --ink:#e4ebf3; --muted:#a3b1c2; --line:#34445a; --accent:#7fb0ea; color-scheme: dark; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 "IBM Plex Sans", system-ui, sans-serif; }
main { max-width:860px; margin:0 auto; padding-block:16px 40px; padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)); }
h1 { font-size:1.25rem; text-wrap:balance; } h2 { font-size:1.125rem; margin-top:28px; }
a { color:var(--accent); } code { font-family:"IBM Plex Mono", ui-monospace, monospace; font-size:.875rem; }
.answer { background:var(--panel); border:1px solid var(--line); border-left:4px solid var(--accent); padding:12px 16px; }
.answer p { margin:0 0 8px; } .answer p:last-child { margin:0; }
figure { margin:12px 0; background:var(--panel); border:1px solid var(--line); padding:8px; }
figure img { width:100%; height:auto; display:block; }
figcaption { color:var(--muted); font-size:.875rem; padding-top:8px; }
li { margin:4px 0; } .muted { color:var(--muted); font-size:.875rem; }
</style></head><body><main>
<h1>P1 S2: the stock box and your own stock, built</h1>
<div class="answer">
<p><b>Built and checked; waiting for your approval to merge.</b> On the Machining step a see-through stock box shows around a milled part. A <b>Stock</b> button beside the view buttons turns it on or off. Under Stock, <b>Your stock</b> takes three sizes in inches. Apply puts the removal on your block and adds one facing line per axis. All of it is as the <a href="${MOCK}">approved mock-up</a> shows (D-089).</p>
<p><b>Try it:</b> open the <a href="${DEMO}">demo</a>, tap <code>clean_pocket.step</code> (first in the list), then Machining. Tap Stock to turn the box off and on. Type 3.25, 2.25 and 1.125, then tap Apply. <a href="${PR}">Pull request</a>.</p>
</div>

<h2>What you'll see</h2>
${shot("03-ghost.png", "Machining step for clean_pocket.step with the see-through stock box", "<b>The stock box, on by default.</b> It is the part's own block (no allowance), with its edges drawn.")}
${shot("04-typed.png", "Your stock 3.25 by 2.25 by 1.125 in applied", "<b>Your stock applied (built).</b> Removal 3.02 in³ (49,470 mm³) from your 2.250 × 3.250 × 1.125 in block. Not explained stays on the part-size removal. Facing Z 0.0625 in per side (0.91 in³), X 0.1250 (0.81 in³), Y 0.1250 (0.50 in³). The box takes your size, centred.")}
${shot("04-s2-typed.png", "The approved mock-up of the same screen", "<b>The approved mock-up, for comparison.</b>", "p1-removal")}
${shot("05a-too-small.png", "Too small message", "<b>A size smaller than the part's.</b> The line names it. The lines and the box stay as they were.")}
${shot("05b-bad.png", "Bad size message", "<b>An empty size, a size that isn't a number, or 0.</b>")}
${shot("06-off.png", "Stock button off", "<b>Stock off.</b>")}
${shot("07-phone-200.png", "Phone width at 200 % text", "<b>Phone width (390 px) at 200 % text.</b> The fields wrap and the page has no sideways scroll.")}
<p class="muted">Against the mock-up, the numbers, wording and placement are the same. The only difference is the mock-up's light tint, which marked the new rows on that page and is not part of the app.</p>

<h2>What was checked</h2>
<ul>
<li><code>npm run check</code>: exit 0 in 601 s (budget 900 s): 876 unit tests, 119 browser tests and 6 timed browser tests passed. Parity quick: 122 of 122 files the same on the existing key (117 s).</li>
<li>New tests, each seen failing first, plus two planted bugs caught: "ghost stock" (the button, on and off, hidden in the Machine view and on other steps, the box's size and centre, the box back after a PDF export), and "typed stock" (the mock-up's numbers, the box at your size, typed text kept when the list redraws, too small, a bad size, Enter, and a new part clears it). Unit tests: "facing per side" (the spec's 4 × 2.5 × 1.25 in on a 3.937 × 2.362 × 1.181 in part: 0.0315, 0.0690 and 0.0345 in per side), the pairing on a part turned in its frame, "stock too small" and "bad stock size".</li>
<li>Parity passes on the existing key, so the engine is unchanged (J7).</li>
</ul>

<h2>Small choices made while building (say if any should change)</h2>
<ul>
<li>The part's sides are taken as the Stock line shows them (to 0.001 in), so typing the size shown is accepted with 0 facing. The spec's example numbers come out this way.</li>
<li>If more than one size is too small, there is one sentence per size.</li>
<li>After a wrong Apply, the size in use stays: the box and lines don't change.</li>
<li>The box hides with its button in the Machine view and on other steps. It is not in the PDF picture.</li>
<li>A turned part has no box, no button and no Your stock.</li>
<li>Your stock stays when you change material or process on the same part, and goes when you open another part (D-089).</li>
</ul>

<h2>Next</h2>
<p>After you approve and it merges: steps and slots S1 (HANDOFF Next 000) in a new session.</p>
</main></body></html>
`;
fs.writeFileSync(path.join(HERE, "p1-s2-status.html"), html);
console.log("wrote mockups/p1-s2-status.html");
