"""Write port-s1-browser-copy.html: the S1 mock-up of the GitLab Pages port (spec docs/specs/gitlab-pages-port.md,
Design "Not checked yet", J1, J6; D-056).

    python3 mockups/build_port_s1.py && python3 scripts/add_zoom.py mockups/port-s1-browser-copy.html

Pictures: the real app (python -m dfma start) in Chromium with the S1 changes added in the page by
mockups/port-s1/shoot.js <out dir> <reply.json>. Its /api/analyze reply is Python's own for tests/parts/report_sample.step, reshaped to
what S1's browser engine returns (spec Parity "S1": part, faces, assumptions kept; the rest Python's empty values;
checks_not_run added). The Licences picture is mockups/port-s1/licences.html.
"""

from __future__ import annotations

import base64
import html
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMG = HERE / "port-s1"


def fig(name: str, caption: str) -> str:
    data = base64.b64encode((IMG / name).read_bytes()).decode()
    return (f'<figure><img src="data:image/png;base64,{data}" alt="{html.escape(caption)}" />'
            f"<figcaption>{caption}</figcaption></figure>")


SHOTS = [
    ("01-start-1280.png", "1 · Start. Header: “Test copy”. The .ipt field is gone. The line under the form now reads “Your file stays on this computer. Nothing is uploaded.” Footer: Licenses."),
    ("03-loading-1280.png", "2 · Analyzing, as today (spinner over the model, status line)."),
    ("04-part-1280.png", "3 · Part step after reading. Size, faces and units as today. Features card: the Not-checked-yet line. Machining and Cost cards: “Not worked out yet in this copy.”"),
    ("05-features-1280.png", "4 · Features step: only the line. No chips, no “No findings”, no Show OK switches while no check has run."),
    ("06-machining-1280.png", "5 · Machining step: “Not worked out yet in this copy.”"),
    ("07-cost-1280.png", "6 · Cost step: the same line, no total."),
    ("08-report-1280.png", "7 · Report step: the line under the heading. The empty “Checks run” list goes, and “The PDF holds” lists only what this copy’s PDF has."),
    ("02-refused-1280.png", "8 · A refused file: the same message and place as today."),
    ("09-part-900.png", "9 · 900 px wide: the side column stacks under the model, as today."),
    ("10-part-1280-200.png", "10 · 1280 px with text at 200%: the step bar wraps; the cards scroll inside the side column, as today."),
    ("11-licences-1280.png", "11 · The Licenses page, opened from the footer."),
]

CHOICES = [
    ("The line under the form",
     "Today it reads “Your files are analyzed on this computer and deleted straight after. Nothing is kept.” In this copy the file is never sent anywhere, "
     "so the spec’s wording replaces it: “Your file stays on this computer. Nothing is uploaded.”"),
    ("Features card and Features step",
     "Today, with no findings, both say “No findings. Every feature checked passed its rules.” With no check run, that would be false. "
     "So the line takes its place, and the chips (Issues 0 · Passed 0) and Show OK switches hide. From S2 they come back, counting holes only."),
    ("Report step",
     "The “Checks run” list would be empty, so it hides. “The PDF holds” keeps only page 1 and the assumptions; the plan, finding pages and .ipt lines come back with their slices."),
    ("The PDF",
     "Page 1 prints the same line after the part summary. Not pictured: the PDF can’t show it until the line is built."),
    ("Status line",
     "Today it says “Choose a STEP file to start. Add its .ipt too, if you have one.” With the .ipt field hidden it becomes “Choose a STEP file to start.”"),
    ("Turning",
     "The list follows the process. For a turned part it reads: “Not checked yet in this copy: Hole depth check, Hole size check, Thin wall check, "
     "Turning axis check, Length to diameter check, Bore depth check, .ipt check.”"),
    (".ipt check in the list",
     "It stays in “Not checked yet” although this copy has no .ipt field yet, so the list is complete."),
    ("First open",
     "The engine is about 11.5 MB to download the first time (cached after). Meanwhile the page shows “Analyzing <file>…” as in picture 2, "
     "and the 60 s time limit starts only once the engine has loaded. I suggest no new wording for this wait; say if you want one."),
    ("“Test copy” mark",
     "Boxed, in the header after the name, in the normal type (not the capitals the Fix / Review labels use)."),
    ("The line’s look",
     "Ink text on the page grey, with a grey bar on the left. It uses no severity color, so it can’t be mistaken for a finding."),
    ("“Licenses”, American spelling",
     "The spec wrote “Licences”; the style rule is American spelling, so the link and page say “Licenses”. "
     "The page lists the engine (exact package, its source and license text), the other packages and the fonts."),
]


def main() -> None:
    shots = "\n".join(fig(n, c) for n, c in SHOTS)
    choices = "\n".join(f"<li><b>{t}.</b> {d}</li>" for t, d in CHOICES)
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Test copy mock-up</title>
<style>
:root {{ --bg: #eef2f6; --panel: #ffffff; --ink: #16263d; --muted: #55657a; --line: #c4cfdc; --accent: #1f5fa8;
  --radius: 2px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }}
:root[data-theme="dark"] {{ --bg: #10171f; --panel: #18212c; --ink: #e6ecf3; --muted: #a9b6c6; --line: #2e3b4b; --accent: #7fb0ea; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg: #10171f; --panel: #18212c; --ink: #e6ecf3; --muted: #a9b6c6; --line: #2e3b4b; --accent: #7fb0ea; }} }}
body {{ margin: 0; background: var(--bg); color: var(--ink); font: 400 1rem/1.5 "IBM Plex Sans", system-ui, sans-serif; }}
main {{ max-width: 980px; margin: 0 auto; padding: var(--space-4); }}
h1 {{ font-size: 1.25rem; margin: 0 0 var(--space-2); }}
h2 {{ font-size: 1.125rem; margin: var(--space-4) 0 var(--space-2); }}
p, li {{ font-size: 1rem; }}
.lead {{ font-size: 1.0625rem; }}
figure {{ margin: 0 0 var(--space-4); background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: var(--space-2); }}
figure img {{ display: block; width: 100%; height: auto; }}
figcaption {{ padding: var(--space-2) var(--space-2) 0; font-size: 0.875rem; color: var(--ink); }}
ul {{ padding-left: 1.2em; }}
li {{ margin-bottom: var(--space-2); }}
.ask {{ background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--accent); padding: var(--space-3); }}
#check-record {{ font-size: 0.875rem; color: var(--muted); }}
#check-record li, #check-record p {{ font-size: 0.875rem; }}
code {{ font-size: 0.875rem; }}
</style>
</head>
<body>
<main>
<h1>Test copy: what the first browser version shows</h1>
<p class="lead">Slice 1 builds a copy that runs in Chrome with nothing installed. It reads the part and shows the 3D model.
It runs <b>no checks yet</b>, so every step says so plainly. Below is the real app with these changes, on <code>report_sample.step</code>.</p>
<p class="ask">Reply in chat: <b>Approve</b>, <b>Change</b> (say what), or <b>Rethink</b>. No code is written until you approve.</p>
<h2>The screens</h2>
<p>Tap a picture to zoom.</p>
{shots}
<h2>What I chose beyond the spec’s list</h2>
<p>The spec names the header, the start-form line, the hidden .ipt field and the two “not yet” lines. Making them showed these too:</p>
<ul>
{choices}
</ul>
<h2>What stays the same</h2>
<ul>
<li>Every other word and message that exists today: the part summary, the step bar, and every refusal (not a STEP file, no solid, too large, took too long, failed, each with Try again where it is today).</li>
<li>The look: the same colors, fonts and sizes.</li>
</ul>
<section id="check-record"><h2>Check record</h2>
CHECK_RECORD
</section>
</main>
</body>
</html>
"""
    record = (HERE / "port-s1" / "check-record.html").read_text(encoding="utf-8")
    (HERE / "port-s1-browser-copy.html").write_text(page.replace("CHECK_RECORD", record), encoding="utf-8")


if __name__ == "__main__":
    main()
