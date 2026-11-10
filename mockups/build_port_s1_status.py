"""Write port-s1-status.html: Morgan's status page for port S1 (D-009), with 2x screenshots of the built browser copy
(tap to zoom: scripts/add_zoom.py). Numbers come from mockups/port-s1/status.json, filled from this session's runs.

    python3 mockups/build_port_s1_status.py && python3 scripts/add_zoom.py mockups/port-s1-status.html
"""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMG = HERE / "port-s1" / "built"
N = json.loads((HERE / "port-s1" / "status.json").read_text(encoding="utf-8"))


def fig(name: str, caption: str) -> str:
    data = base64.b64encode((IMG / name).read_bytes()).decode()
    return f'<figure><img src="data:image/png;base64,{data}" alt="{html.escape(caption)}" /><figcaption>{caption}</figcaption></figure>'


def li(items: list[str]) -> str:
    return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"


PAGE = """<title>Port S1 Status</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* One reading column; the app's drawing-office tokens, with a dark set for this page only */
:root { --bg: #eef2f6; --panel: #ffffff; --ink: #16263d; --muted: #55657a; --line: #c4cfdc; --accent: #1f5fa8; --ok: #3f6b2a; --warn: #a35a00;
  --sans: "IBM Plex Sans", system-ui, sans-serif; --mono: "IBM Plex Mono", ui-monospace, monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #10171f; --panel: #18212c; --ink: #e6ecf3; --muted: #a9b6c6; --line: #2e3b4b; --accent: #7fb0ea; --ok: #8cc56f; --warn: #e0a050; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #10171f; --panel: #18212c; --ink: #e6ecf3; --muted: #a9b6c6; --line: #2e3b4b; --accent: #7fb0ea; --ok: #8cc56f; --warn: #e0a050; color-scheme: dark }
body { background: var(--bg); color: var(--ink); font: 400 1rem/1.55 var(--sans); padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 16px 32px; }
main { max-width: 760px; margin: 0 auto; display: grid; gap: 16px; }
h1 { font-size: 1.35rem; margin: 0; text-wrap: balance; }
h2 { font-size: 1.05rem; margin: 0 0 6px; }
p, li { margin: 0; }
ul { margin: 0; padding-left: 1.2em; display: grid; gap: 4px; }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 2px; padding: 14px 16px; display: grid; gap: 8px; min-width: 0; }
figure { margin: 0; display: grid; gap: 6px; }
figure img { width: 100%; height: auto; border: 1px solid var(--line); }
figcaption { font-size: 0.9rem; color: var(--muted); }
.num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.ok { color: var(--ok); font-weight: 700; }
.warn { color: var(--warn); font-weight: 700; }
a { color: var(--accent); }
</style>
<main>
<h1>Port S1: the test copy runs in the browser</h1>
<p>__LEAD__</p>
<section><h2>Try it</h2>__TRY__</section>
<section><h2>The built screens</h2><p>Tap a picture to zoom. They match the approved mock-up; the one difference I found (a stray line under the notice on Features) is fixed.</p>__SHOTS__</section>
<section><h2>What was measured</h2>__MEASURED__</section>
<section><h2>Your two decisions, done (D-058)</h2>__DECISIONS__</section>
<section><h2>Not done, or left for later</h2>__LATER__</section>
<section><h2>Plan</h2>__PLAN__</section>
</main>
"""


def main() -> None:
    shots = "".join(fig(n, c) for n, c in [
        ("2-part.png", "Part step on report_sample.step: size, faces and units as the Python app; the not-yet lines on the cards."),
        ("3-features.png", "Features: only the not-checked line while no check has run."),
        ("4-report.png", "Report: the line, and what this copy's PDF holds."),
        ("1-start.png", "Start: the Test copy mark, the new privacy line, no .ipt field, Licenses at the foot."),
        ("5-licenses.png", "Licenses: the engine, its license texts, every package the page ships, the fonts."),
    ])
    page = PAGE.replace("__LEAD__", N["lead"]).replace("__TRY__", li(N["try"])).replace("__SHOTS__", shots)
    page = page.replace("__MEASURED__", li(N["measured"])).replace("__DECISIONS__", li(N["decisions"]))
    page = page.replace("__LATER__", li(N["later"])).replace("__PLAN__", li(N["plan"]))
    (HERE / "port-s1-status.html").write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
