"""Build the view-only demo page (D-009): the real web build in one HTML file, with test parts analysed in advance.

    python scripts/make_demo.py <out.html>        (inside the dfma environment, after `npm --prefix web run build`)
    python scripts/make_demo.py --engine browser <out.html>
        (the GitLab Pages port, D-056: the browser copy's page, `node web/scripts/build-pages.mjs --demo`, answered
        from the browser engine's own results, `npm --prefix web run demo-results`; no .ipt pairs until S7)

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

sys.path.insert(0, str(ROOT / "tests"))
sys.path.insert(0, str(ROOT / "tests" / "inventor"))

from dfma import settings  # noqa: E402
from dfma.analyze import analyze  # noqa: E402
from dfma.errors import ReadError  # noqa: E402
from nist_files import ap242_files  # noqa: E402
from nist_pair import DEMO_LABEL, analyze_registered  # noqa: E402

PARTS = ROOT / "tests" / "parts"
SET3 = ROOT / "tests" / "grading" / "sets" / "hole_ends_walls"
DEMO = [  # (file, what Morgan looks for[, the process a tap picks: turning parts open on Turning])
    (PARTS / "report_sample.step", "Review steps S1: the overview, then walk Part · Features · Machining · Cost · Report"),
    (PARTS / "slender_shaft.step", "S6: opens on Turning; switch to Milling to compare", "turn"),
    (PARTS / "flange_bolt_hole.step", "S6 (Turning): off-centre bolt hole", "turn"),
    (PARTS / "stout_shaft.step", "S6 (Turning): length 5× diameter", "turn"),
    (PARTS / "shaft_with_groove_and_bore.step", "S6 (Turning): grooves and a bore", "turn"),
    (PARTS / "clean_shaft.step", "S6 (Turning): clean", "turn"),
    (PARTS / "block_as_turn.step", "S6 (Turning): no turning axis", "turn"),
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

INV = ROOT / "tests" / "inventor" / "files"
# I1 S1: NIST pairs the app refuses, answered by the real service here (step stem, .ipt, what Morgan looks for)
PAIRS = [
    ("nist_ctc_04_asme1_ap242", "INV_nist_ctc_04_asme1_2021.ipt", "I1: NIST CTC 04 + its .ipt, refused (other CAD wrote the STEP)"),
    ("nist_ctc_03_asme1_ap242", "INV_nist_ctc_03_asme1_2021.ipt", "I1: NIST CTC 03 + its .ipt, sheet metal refused"),
]
# I1 S2: NIST pairs lined up by the test harness (tests/inventor/nist_pair.py), so their threads show. Their file
# names get " (lined up)" in the demo, so the shim's key differs from the refused entry of the same files.
HARNESS = [
    ("nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt", "I1 S2 + I2 S1: 4 threads M12x1.75 - 6H, matched; 9 Hole features, 54 holes (13 disagree: NIST's two files differ)"),
    ("nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt", "I1 S2 + I2 S1: 6 threads, one 0.10 mm off its hole (a finding); 9 Hole features, 24 holes"),
]
LINED_UP = " (lined up)"
NOTE_SERVICE = "<b>View-only demo</b> of the real app, with these test parts analyzed in advance. Tap a part (a turning part opens on Turning): it opens on its overview; walk the five steps with the tabs, the card headings, Next and Back, or the phone's Back. Process and material sit under the file name and work as in the app. Your files can't be uploaded here; the first two I1 pairs show the app's refusals; the two marked \"lined up\" were lined up by the test harness so their threads show (the app itself refuses them); a matching pair needs your own files in the app. Export PDF builds the file only in the app on a computer: this viewer blocks downloads, so here it saves nothing (the S7 mock-up shows the PDF pages)."
NOTE_BROWSER = ("<b>View-only demo</b> of the test copy that runs in the browser, with these test parts analyzed in advance by "
                "its own engine. Tap a part (a turning part opens on Turning): it opens on its overview; walk the five "
                "steps with the tabs, Next and Back. On milled parts it runs the hole and pocket checks (hole depth and size, "
                "corner radius, pocket depth, undercut and access) and works out the machine plan and cost drivers; thin "
                "walls, the other checks and turned parts come in later slices, and each step names what is not done yet. Your files can't be uploaded here. Export PDF saves nothing in this viewer, "
                "which blocks downloads; it works in the app.")


def browser_results() -> dict:
    """Every DEMO part, process and material through the browser engine in Node (npm run demo-results)."""
    import os
    import subprocess
    import tempfile
    jobs = [{"path": path.relative_to(ROOT).as_posix(), "process": process, "material": material}
            for path, *_ in DEMO for process in settings.PROCESSES for material in settings.MATERIALS]
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / "in.json", Path(tmp) / "out.json"
        src.write_text(json.dumps(jobs), encoding="utf-8")
        npm = "npm.cmd" if sys.platform == "win32" else "npm"
        subprocess.run([npm, "--prefix", "web", "run", "demo-results"], cwd=ROOT, check=True,
                       env={**os.environ, "DEMO_IN": str(src), "DEMO_OUT": str(dst)})
        return json.loads(dst.read_text(encoding="utf-8"))


def main() -> int:
    args = sys.argv[1:]
    browser = args[:2] == ["--engine", "browser"]
    if browser:
        args = args[2:]
    out = Path(args[0])
    dist = ROOT / "web" / ("dist-demo" if browser else "dist")
    html = (dist / "index.html").read_text(encoding="utf-8")
    results = browser_results() if browser else {}
    for path, *_ in ([] if browser else DEMO):
        for process in settings.PROCESSES:
            for material in settings.MATERIALS:
                results[f"{path.name}|{process}|{material}"] = analyze(path, path.name, process, material)
    pairs = []
    for stem, ipt, what in ([] if browser else PAIRS):
        step = next(p for p in ap242_files() if p.name.startswith(stem))
        pairs.append([step.name, ipt, what])
        for process in settings.PROCESSES:
            for material in settings.MATERIALS:
                try:
                    hit = analyze(step, step.name, process, material, ipt_path=INV / ipt, ipt_name=ipt)
                except ReadError as e:
                    hit = {"__status": 422, "error": str(e)}
                results[f"{step.name}+{ipt}|{process}|{material}"] = hit
    for name, ipt, what in ([] if browser else HARNESS):
        step = next(p for p in ap242_files() if p.name == name)
        shown = step.stem + LINED_UP + step.suffix
        pairs.append([shown, ipt, f"{what}. {DEMO_LABEL}"])
        for process in settings.PROCESSES:
            for material in settings.MATERIALS:
                results[f"{shown}+{ipt}|{process}|{material}"] = analyze_registered(step, INV / ipt, process, material)

    # Each part's mesh is the same for every process and material: keep one copy and point at it, so the page
    # stays under the 16 MB artifact limit (the two NIST thread pairs alone added about 10 MB of copies).
    meshes: dict[str, list] = {}
    for key, hit in results.items():
        if isinstance(hit.get("faces"), list):
            part = key.split("|")[0]
            meshes.setdefault(part, hit["faces"])
            if meshes[part] == hit["faces"]:
                results[key] = {**hit, "faces": part}

    def inline_css(m):
        css = (dist / m.group(1).lstrip("/")).read_text(encoding="utf-8")
        css = re.sub(r"url\((/fonts/[^)]+)\)", lambda f: "url(data:font/woff2;base64,"
                     + base64.b64encode((dist / f.group(1).lstrip("/")).read_bytes()).decode() + ")", css)
        return f"<style>{css}</style>"

    html = re.sub(r'<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>', inline_css, html)
    js_src = re.search(r'<script type="module"[^>]*src="([^"]+)"[^>]*></script>', html)
    js = (dist / js_src.group(1).lstrip("/")).read_text(encoding="utf-8")
    html = html.replace(js_src.group(0), "")
    names = [[d[0].name, d[1], d[2] if len(d) > 2 else "mill"] for d in DEMO]
    shim = """
<script>
window.__DEMO = %s;
window.__MESH = %s;
const realFetch = window.fetch;
window.fetch = async (url, init) => {
  if (String(url).endsWith("/api/analyze")) {
    const b = init.body, ipt = b.get("ipt");
    const key = [b.get("file").name + (ipt ? "+" + ipt.name : ""), b.get("process"), b.get("material")].join("|");
    await new Promise((r) => setTimeout(r, 150));
    let hit = window.__DEMO[key];
    if (hit && typeof hit.faces === "string") hit = {...hit, faces: window.__MESH[hit.faces]};
    const code = !hit ? 422 : (hit.__status || 200);
    return new Response(JSON.stringify(hit || {error: "Not in this demo"}), {status: code});
  }
  return realFetch(url, init);
};
</script>""" % (json.dumps(results, separators=(",", ":")), json.dumps(meshes, separators=(",", ":")))
    picker = """
<div class="demo-bar" role="group" aria-label="Demo parts">
  <p class="demo-note">%s</p>
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
  document.getElementById("process").value = b.dataset.process; // a turning part opens on Turning
  const input = document.getElementById("file"), dt = new DataTransfer();
  const ipt = document.getElementById("ipt"), dti = new DataTransfer();
  if (b.dataset.ipt) dti.items.add(new File(["demo"], b.dataset.ipt));
  ipt.files = dti.files; // set first, without its own change event: one analysis per tap
  dt.items.add(new File(["demo"], b.dataset.name));
  input.files = dt.files;
  input.dispatchEvent(new Event("change"));
});
</script>""" % (NOTE_BROWSER if browser else NOTE_SERVICE, "".join(f'<button type="button" data-name="{s}" data-ipt="{i}" data-process="mill" aria-pressed="false">'
                         f'{s.removesuffix(".stp")} + .ipt<small>{w}</small></button>' for s, i, w in pairs)
       + "".join(f'<button type="button" data-name="{n}" data-process="{pr}" aria-pressed="false">'
                 f'{n.removesuffix(".step")}<small>{w}</small></button>' for n, w, pr in names))
    html = html.replace("<title>DFMA Review</title>", "<title>DFMA Review Demo</title>")
    html = html.replace("<head>", "<head>" + shim, 1)
    html = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + picker, html, count=1)
    html = html.replace("</body>", f'<script type="module">{js}</script></body>')
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB, {len(results)} results)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
