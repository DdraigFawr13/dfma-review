// Writes mockups/p1-s1-status.html: the P1 S1 status page for Morgan (D-009), from the 2× screenshots of the built app
// in mockups/p1-s1-status/ (taken by its shots.cjs on web/dist-pages).
//   node mockups/build_p1_s1_status.mjs && node .claude/skills/ui-mockups/scripts/add-zoom.mjs mockups/p1-s1-status.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO = "https://claude.ai/artifact/NLELKgNM6cXgeW21VcaVoH";
const MOCK = "https://claude.ai/artifact/9AyZ9UKCJRt3PKZA4yLJnM";
const PR = "https://github.com/DdraigFawr13/dfma-review/pull/60";
const shot = (name, alt, caption) => `<figure><img src="data:image/png;base64,${
  fs.readFileSync(path.join(HERE, "p1-s1-status", name)).toString("base64")}" alt="${alt}"><figcaption>${caption}</figcaption></figure>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>P1 S1 Status</title>
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
<h1>P1 S1: how much comes off, built</h1>
<div class="answer">
<p><b>Done and checked; merging when CI is green (your approval, D-089).</b> Every milled part now says how much material comes off the stock block and how much of it no found hole or pocket explains, on the Machining step and in the PDF, worded as the <a href="${MOCK}">approved mock-up</a>.</p>
<p><b>Try it:</b> the <a href="${DEMO}">demo</a>: tap <code>clean_pocket.step</code> (first in the list) or any NIST part, then Machining. Export PDF doesn't work inside the demo viewer; the PDF is shown below. <a href="${PR}">PR #60</a>.</p>
</div>

<h2>What you'll see</h2>
${shot("01-clean-pocket.png", "Machining step for clean_pocket.step with Removal and Not explained", "<b>clean_pocket.step, built.</b> Removal 0.79 in³ (12,983 mm³); not explained 0.00 in³ (4 mm³), 0.03 %. Same as the mock-up.")}
${shot("02-ctc01.png", "Machining step for NIST CTC 01", "<b>NIST CTC 01, built.</b> 2,401.60 in³ comes off; 98.70 % is not explained (the outside profile, notches and slots).")}
${shot("pdf-1.png", "PDF page 1 for CTC 01", "<b>PDF, Part summary.</b> The two lines after Stock.")}
<p class="muted">Against the mock-up: one difference, CTC 01's not-explained mm³ reads 38,843,882 built against 38,843,883 in the mock-up (the mock-up's script rounded the pocket floors differently; 1 mm³ in 39 million).</p>

<h2>What was checked</h2>
<ul>
<li><code>npm run check</code>: exit 0 in 720 s (budget 900 s); 871 unit tests, 117 browser tests, parity quick 122 of 122 the same.</li>
<li>Full parity on the re-frozen key: 335 files, 0 different (2 known tessellation and 6 Python crashes, as before). The guarded re-freeze changed 303 key files, all only by the new <code>removal</code> block (and the new assumption line on milled parts); none refused.</li>
<li>EDMR tests: 114 of 114 passed.</li>
<li>New tests, each seen failing before the code: a built block with a hole and a pocket (stock 180,000 mm³; hole π×25×30 and pocket 6,400 mm³ within 0.5 %), a pocket with an island (5,600 mm³), the floor rule on hand-built meshes, a turned part (no removal), the 17 NIST files (features never add up to more than the removal; FTC/STC twins agree within 0.5 points; 45.9 s), the screen and PDF lines, and the browser test on clean_pocket.</li>
<li>Nothing else changed: same features, findings, setups, tools and cost on every file (J7).</li>
</ul>

<h2>Small choices made while building</h2>
<ul>
<li>The removal assumption line ("Removal is the stock block minus the part's exact volume; …") shows on milled parts only: a turned part has no removal.</li>
<li>In the PDF the two lines appear wherever the Stock line does.</li>
</ul>

<h2>Next</h2>
<p>P1 S2 in a new session once this merges: the see-through stock box with its Stock button, and "Your stock" with the facing lines, as the mock-up shows.</p>
</main></body></html>
`;
fs.writeFileSync(path.join(HERE, "p1-s1-status.html"), html);
console.log("wrote mockups/p1-s1-status.html");
