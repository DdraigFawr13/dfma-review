"""Build the view-only demo page (D-009): the real web build in one HTML file, with test parts analysed in advance.

    python scripts/make_demo.py <out.html>        (inside the dfma environment, after `npm --prefix web run build`)

The page is the production build (web/dist) with its CSS, JS and fonts inlined. A row of part buttons stands in
for the file picker (Morgan uses a phone, D-009), and `fetch("/api/analyze")` is answered from results the real
service made here, one per part, process and material. Nothing is sent anywhere.
"""

from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "service"))

from dfma import settings  # noqa: E402
from dfma.analyze import analyze  # noqa: E402

PARTS = ROOT / "tests" / "parts"
SET3 = ROOT / "tests" / "grading" / "sets" / "hole_ends_walls"
DEMO = [  # (file, what Morgan looks for)
    (PARTS / "slender_shaft.step", "S6: pick Turning, then Milling to compare"),
    (PARTS / "flange_bolt_hole.step", "S6 (Turning): off-centre bolt hole"),
    (PARTS / "stout_shaft.step", "S6 (Turning): length 5× diameter"),
    (PARTS / "shaft_with_groove_and_bore.step", "S6 (Turning): grooves and a bore"),
    (PARTS / "clean_shaft.step", "S6 (Turning): clean"),
    (PARTS / "block_as_turn.step", "S6 (Turning): no turning axis"),
    (PARTS / "two_sided_block.step", "S5: 3 setups, 3 tool loads"),
    (PARTS / "angled_hole.step", "S5: access finding, 4/5-axis"),
    (PARTS / "angled_hole_in_pocket.step", "S5: angled hole in a pocket floor"),
    (PARTS / "clean_one_setup.step", "S5: 1 setup"),
    (PARTS / "rotated_block.step", "S5: modelled 30° off the axes"),
    (PARTS / "countersunk_hole.step", "S5: drill, then countersink"),
    (SET3 / "cs_mixed.step", "set 3: two countersink angles"),
    (SET3 / "sx_bottom_20.step", "set 3: sloped exit"),
    (SET3 / "hw_top.step", "set 3: thin wall near the top"),
    (PARTS / "deep_hole.step", "S2: deep hole"),
    (PARTS / "pocket_long_thin_tool.step", "S3: pocket"),
    (PARTS / "thin_floor.step", "S4: thin floor"),
]


def main() -> int:
    out = Path(sys.argv[1])
    dist = ROOT / "web" / "dist"
    html = (dist / "index.html").read_text(encoding="utf-8")
    results = {}
    for path, _ in DEMO:
        for process in settings.PROCESSES:
            for material in settings.MATERIALS:
                results[f"{path.name}|{process}|{material}"] = analyze(path, path.name, process, material)

    def inline_css(m):
        css = (dist / m.group(1).lstrip("/")).read_text(encoding="utf-8")
        css = re.sub(r"url\((/fonts/[^)]+)\)", lambda f: "url(data:font/woff2;base64,"
                     + base64.b64encode((dist / f.group(1).lstrip("/")).read_bytes()).decode() + ")", css)
        return f"<style>{css}</style>"

    html = re.sub(r'<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>', inline_css, html)
    js_src = re.search(r'<script type="module"[^>]*src="([^"]+)"[^>]*></script>', html)
    js = (dist / js_src.group(1).lstrip("/")).read_text(encoding="utf-8")
    html = html.replace(js_src.group(0), "")
    names = [[p.name, what] for p, what in DEMO]
    shim = """
<script>
window.__DEMO = %s;
const realFetch = window.fetch;
window.fetch = async (url, init) => {
  if (String(url).endsWith("/api/analyze")) {
    const b = init.body, key = [b.get("file").name, b.get("process"), b.get("material")].join("|");
    await new Promise((r) => setTimeout(r, 150));
    const hit = window.__DEMO[key];
    return new Response(JSON.stringify(hit || {error: "Not in this demo"}), {status: hit ? 200 : 422});
  }
  return realFetch(url, init);
};
</script>""" % json.dumps(results, separators=(",", ":"))
    picker = """
<div class="demo-bar" role="group" aria-label="Demo parts">
  <p class="demo-note"><b>View-only demo</b> of the real app, with these test parts analysed in advance. Tap a part; process and material work as in the app. Your files can't be uploaded here.</p>
  <div class="demo-parts">%s</div>
</div>
<style>
.demo-bar{padding:var(--space-2) var(--space-4);background:var(--panel);border-bottom:1px solid var(--line);display:grid;gap:var(--space-2)}
.demo-note{margin:0;font-size:.875rem;color:var(--muted)}
.demo-parts{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.demo-parts button{font:600 .875rem var(--sans);min-height:32px;padding:4px 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);color:var(--ink);cursor:pointer;text-align:left}
.demo-parts button[aria-pressed=true]{border-color:var(--accent);outline:2px solid var(--accent)}
.demo-parts small{display:block;font-weight:400;color:var(--muted)}
</style>
<script>
for (const b of document.querySelectorAll(".demo-parts button")) b.addEventListener("click", () => {
  for (const o of document.querySelectorAll(".demo-parts button")) o.setAttribute("aria-pressed", String(o === b));
  const input = document.getElementById("file"), dt = new DataTransfer();
  dt.items.add(new File(["demo"], b.dataset.name));
  input.files = dt.files;
  input.dispatchEvent(new Event("change"));
});
</script>""" % "".join(f'<button type="button" data-name="{n}" aria-pressed="false">{n.removesuffix(".step")}'
                        f'<small>{w}</small></button>' for n, w in names)
    html = html.replace("<title>DFMA Review</title>", "<title>DFMA Review Demo</title>")
    html = html.replace("<head>", "<head>" + shim, 1)
    html = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + picker, html, count=1)
    html = html.replace("</body>", f'<script type="module">{js}</script></body>')
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB, {len(results)} results)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
