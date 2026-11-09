"""Write review-steps-features.html: the Threads, Hole features and Fillets and chamfers groups inside the
Features step (review-steps spec S2 "First", D-048), drawn with round 3's styles on real data.

    python3 mockups/build_review_steps_features.py

Data: tests/inventor/fixtures/stc_10.json (NIST STC 10 + INV_nist_ftc_10_asme1_2024.ipt, as the demo answers
it). Every row's words are today's (D-036, D-040, D-043), copied from the built S1 screen on that fixture; the
grouped Issues rows follow the spec's Design "Rows". Model pictures: the built S1 viewer on the same fixture.
"""

from __future__ import annotations

import base64
from pathlib import Path

HERE = Path(__file__).resolve().parent
R3 = (HERE / "ui-direction" / "round3-frames.html").read_text(encoding="utf-8")
HEAD = R3[: R3.index("<body>")].replace("UI direction round 3 frames", "Features groups")
IMG = HERE / "review-steps-features"


def img(name: str) -> str:
    return "data:image/png;base64," + base64.b64encode((IMG / name).read_bytes()).decode()


EXTRA = """<style>
.frame.w900 { width: 900px; height: 1900px; }
.frame.long { height: 1900px; }
.w900 .top > .num { display: none; }
.w900 .step { padding: 0 8px; }
.w900 .body { grid-template-columns: 1fr !important; grid-template-rows: 420px auto; }
.view img.model { width: 100%; height: 100%; object-fit: contain; }
.scroll { overflow-y: auto; min-height: 0; flex: 1; }
.src { padding: 12px 14px 6px; font-size: .875rem; font-weight: 600; color: var(--muted); border-top: 2px solid var(--line); }
.grp { display: grid; grid-template-columns: 18px 1fr auto; gap: 3px var(--space-2); padding: 10px var(--space-3); border-bottom: 1px solid var(--line); align-items: baseline; }
.grp .t { font-weight: 600; }
.grp .tw { font-size: .875rem; color: var(--muted); grid-column: 2 / 4; }
.grp .open { color: var(--accent); font-weight: 600; font-size: .875rem; }
.grp .car { color: var(--muted); }
.st { font-family: var(--mono); font-weight: 700; font-size: .875rem; letter-spacing: .02em; }
.st.dis { color: var(--medium); } .st.mat { color: var(--low); } .st.nm { color: var(--muted); }
.irow { display: grid; grid-template-columns: 1fr auto; gap: 2px var(--space-2); padding: 8px var(--space-3) 8px 38px; border-bottom: 1px solid var(--line); }
.irow .s { grid-column: 1 / 3; font-size: .875rem; }
.irow .s.muted { color: var(--muted); }
.irow.sel { outline: 2px solid var(--accent); outline-offset: -2px; background: var(--sel); }
.intro { padding: 8px var(--space-3) 8px 38px; font-size: .875rem; color: var(--muted); border-bottom: 1px solid var(--line); margin: 0; }
.note { max-width: 1280px; font-size: 1rem; line-height: 1.5; }
.note li { margin-bottom: 4px; }
#check-record { max-width: 1280px; }
</style>
"""

STEPS = ["Part", "Features", "Machining", "Cost", "Report"]


def top(on: int) -> str:
    out = []
    for i, name in enumerate(STEPS, 1):
        c = ' <span class="c"><span class="mk high"></span>15 <span class="mk medium"></span>17</span>' if name == "Features" else ""
        out.append(f'<span class="step{" on" if i == on else ""}"><span class="n">{i}</span>{name}{c}</span>')
    return ('<header class="top"><h1>DFMA Review</h1><nav class="steps">' + "".join(out) + '</nav><span class="spacer"></span>'
            '<span class="num muted">nist_stc_10_asme1_ap242-e2.stp</span><span class="btn">Export PDF</span></header>')


OKROW = """<div class="viewtools" style="right:12px;left:auto"><div class="panel okrow" style="padding:6px 10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
  <span class="lbl" style="font-size:.875rem;font-weight:600;color:var(--muted)">Show OK</span>
  <span class="chip on"><span class="box"></span><span class="sw" style="width:14px;height:14px;border-radius:2px;background:var(--low)"></span>Holes</span>
  <span class="chip on"><span class="box"></span><span class="sw" style="width:14px;height:14px;border-radius:2px;background:#8559b8"></span>Pockets</span>
  <span class="chip on"><span class="box"></span><span class="sw" style="width:14px;height:14px;border-radius:2px;background:#1d7f86"></span>Corners</span>
  <span class="chip"><span class="box"></span><span class="sw" style="width:14px;height:14px;border-radius:2px;background:#6b5d4f"></span>Walls</span>
</div></div>"""


def view(picture: str) -> str:
    return f'<div class="view" style="position:relative"><div class="stage" style="width:100%;height:100%"><img class="model" src="{img(picture)}" alt="The STC 10 model in the built viewer"></div>{OKROW}</div>'


ROWS_SEL = """<div class="srow sel"><span class="mk high"></span><span class="t"><span class="sev high">Fix</span> Sharp corner ×15</span><span class="ids">F10–F24</span>
  <span class="s">Inside corners have no radius. Needs 0.031 in (1/32) or more, or EDM.</span>
  <span class="chk">Corner radius check · limit is an estimate</span>
  <dl class="more"><dt>Showing</dt><dd class="num">‹ F10 · corner-5 · 1 of 15 ›</dd><dt>Measured</dt><dd class="num">radius 0.000 in, pocket 0.079 in deep</dd><dt>Fix</dt><dd>Add a corner radius of 0.031 in (1/32) or more; a larger radius lets a larger end mill cut the pocket.</dd></dl>
</div>"""
ROWS_SHUT = """<div class="srow"><span class="mk high"></span><span class="t"><span class="sev high">Fix</span> Sharp corner ×15</span><span class="ids">F10–F24</span>
  <span class="s">Inside corners have no radius. Needs 0.031 in (1/32) or more, or EDM.</span><span class="chk">Corner radius check · limit is an estimate</span></div>"""
ROWS_REST = """<div class="srow"><span class="mk medium"></span><span class="t"><span class="sev medium">Review</span> Deep hole ×5</span><span class="ids">F1–F5</span>
  <span class="s">7.9× and 6.4× the diameter deep. Over 6.0× needs peck drilling.</span><span class="chk">Hole depth check · limit is an estimate</span></div>
<div class="srow"><span class="mk medium"></span><span class="t"><span class="sev medium">Review</span> Small corner radius ×4</span><span class="ids">F6–F9</span>
  <span class="s">Corner radius 0.079 in: the end mill that fits cuts 5.4× its diameter deep (limit 4.0×).</span><span class="chk">Corner radius check · limit is an estimate</span></div>
<div class="srow"><span class="mk medium"></span><span class="t"><span class="sev medium">Review</span> Deep pocket</span><span class="ids">F25</span>
  <span class="s">Depth is 5.4× the end mill that fits. Over 3.0× needs a long tool.</span><span class="chk">Pocket depth check · limit is an estimate</span></div>
<div class="srow"><span class="mk medium"></span><span class="t"><span class="sev medium">Review</span> Thread vs hole</span><span class="ids">F26</span>
  <span class="s">M3x0.5 thread on hole-38: 0.10 mm off the hole's axis. Possible cause: the part or an old STEP export differs from the .ipt.</span><span class="chk">.ipt check · the .ipt and STEP must agree within 0.01 mm</span></div>
<div class="srow"><span class="mk medium"></span><span class="t"><span class="sev medium">Review</span> Hole feature vs hole ×6</span><span class="ids">F27–F32</span>
  <span class="s">Hole feature hf-3 hole on hole-5: Ø0.097 in [2.46 mm] in the .ipt, Ø0.118 in [3.00 mm] in the STEP; the Ø0.097 in [2.46 mm] section is 0.472 in [12.00 mm] long in the .ipt, 0.236 in [6.00 mm] in the STEP. Possible cause: the part or an old STEP export differs from the .ipt. Worst of 6.</span><span class="chk">.ipt check · the .ipt and STEP must agree within 0.01 mm</span></div>"""

SRC = '<div class="src">From INV_nist_ftc_10_asme1_2024.ipt</div>'


def grp(name: str, n: int, tally: str, opened: bool) -> str:
    car = "▾" if opened else "▸"
    return (f'<div class="grp"><span class="car" aria-hidden="true">{car}</span><span class="t">{name} <span class="num muted">{n}</span></span>'
            f'<span class="open">{"Close" if opened else "Open"}</span><span class="tw">{tally}</span></div>')


THREADS_T = '<span class="st dis">DISAGREES</span> 1 · <span class="st mat">MATCHED</span> 5'
HF_T = '9 Hole features, 24 holes: <span class="st dis">DISAGREE</span> 7 · <span class="st mat">MATCHED</span> 17'
BL_T = '4 fillets, 0 chamfers: <span class="st nm">NOT MAPPED</span> 1 · <span class="st mat">MATCHED</span> 3'

THREAD_ROWS = """<p class="intro">Tap a thread to show its hole.</p>
<div class="irow sel"><span><span class="st dis">DISAGREES</span> <b>M3x0.5 - 6H</b></span><span class="num muted">hole-38</span>
  <span class="s">0.236 in [6 mm] deep · tap drill 0.098 in [2.5 mm] (as stored in the .ipt)</span>
  <span class="s">0.004 in [0.10 mm] off the hole's axis · finding F26</span></div>
<div class="irow"><span><span class="st mat">MATCHED</span> <b>M3x0.5 - 6H</b></span><span class="num muted">hole-36</span><span class="s">0.236 in [6 mm] deep · tap drill 0.098 in [2.5 mm] (as stored in the .ipt)</span></div>
<div class="irow"><span><span class="st mat">MATCHED</span> <b>M3x0.5 - 6H</b></span><span class="num muted">hole-34</span><span class="s">0.236 in [6 mm] deep · tap drill 0.098 in [2.5 mm] (as stored in the .ipt)</span></div>
<div class="irow"><span><span class="st mat">MATCHED</span> <b>M3x0.5 - 6H</b></span><span class="num muted">hole-37</span><span class="s">0.236 in [6 mm] deep · tap drill 0.098 in [2.5 mm] (as stored in the .ipt)</span></div>
<div class="irow"><span><span class="st mat">MATCHED</span> <b>M3x0.5 - 6H</b></span><span class="num muted">hole-5</span><span class="s">0.236 in [6 mm] deep · tap drill 0.098 in [2.5 mm] (as stored in the .ipt)</span></div>
<div class="irow"><span><span class="st mat">MATCHED</span> <b>M3x0.5 - 6H</b></span><span class="num muted">hole-35</span><span class="s">0.236 in [6 mm] deep · tap drill 0.098 in [2.5 mm] (as stored in the .ipt)</span></div>"""

BLEND_ROWS = """<p class="intro">Sizes as designed in the .ipt. Tap one to show its faces.</p>
<div class="irow"><span><span class="st mat">MATCHED</span> <b>Fillet · R0.039 in [1 mm]</b></span><span class="num muted">bl-1</span><span class="s">73 of 73 faces found in the STEP</span></div>
<div class="irow"><span><span class="st mat">MATCHED</span> <b>Fillet · R0.079 in [2 mm]</b></span><span class="num muted">bl-2</span><span class="s">12 of 12 faces found in the STEP</span></div>
<div class="irow"><span><span class="st nm">NOT MAPPED</span> <b>Fillet · R0.006 in [0.15 mm]</b></span><span class="num muted">bl-3</span><span class="s">0 of 4 faces found in the STEP</span><span class="s muted">Not mapped: no STEP face of its shape at its place. Our limit, not a finding.</span></div>
<div class="irow"><span><span class="st mat">MATCHED</span> <b>Fillet · R0.008 in [0.2 mm]</b></span><span class="num muted">bl-4</span><span class="s">4 of 4 faces found in the STEP</span></div>"""

CHIPS = '<div style="display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)"><span class="chip on">Issues 32</span><span class="chip">Passed 294</span><span class="chip">All</span></div>'
FOOT = '<div style="display:flex;justify-content:space-between;padding:12px;border-top:1px solid var(--line)"><span class="btn ghost">‹ Part</span><span class="btn">Machining ›</span></div>'


def panel(inner: str) -> str:
    return f'<div class="panel" style="display:flex;flex-direction:column;min-height:0">{CHIPS}<div class="scroll">{inner}</div>{FOOT}</div>'


def frame(fid: str, tag: str, body: str, cls: str = "") -> str:
    return (f'<section class="frame {cls}" id="{fid}"><span class="tag">{tag}</span>{top(2)}'
            f'<div class="body" style="display:grid;grid-template-columns:1fr 460px;gap:16px;padding:16px;flex:1;min-height:0">{body}</div></section>\n')


FOLDED = SRC + grp("Threads", 6, THREADS_T, True) + "" if False else SRC + grp("Threads", 6, THREADS_T, False) + grp("Hole features", 9, HF_T, False) + grp("Fillets and chamfers", 4, BL_T, False)
OPEN_THREADS = SRC + grp("Threads", 6, THREADS_T, True) + THREAD_ROWS + grp("Hole features", 9, HF_T, False) + grp("Fillets and chamfers", 4, BL_T, False)

NOTE = """<section class="note"><h2>Features groups: what changes</h2>
<p>Drawn on NIST STC 10 with its .ipt (the demo's pair), Milling, Aluminum 6061. Words and numbers are copied from the built S1 screen on the same data; the model pictures are the built viewer.</p>
<ul>
<li><b>Today</b> (S1, built): Threads, Hole features and Fillets and chamfers are three boxes that each scroll inside the Features list (picture below).</li>
<li>Frames 1 and 2 are drawn full length so the groups show; on screen the list scrolls as one inside the 900 px window, as frame 3 shows.</li>
<li><b>Proposed:</b> under the Issues rows, one line "From &lt;the .ipt&gt;", then one row per group: name, count and its tally in the approved words (MATCHED, DISAGREES, NOT MAPPED). Tap a row to open it in place; no box scrolls inside another, the step's list scrolls as one.</li>
<li>An opened group shows today's rows (D-036, D-040, D-043), unchanged; tapping a row still selects its hole or faces on the model. Its intro line drops the "From &lt;.ipt&gt;: n matched, n disagree, n not mapped" part, which the group row now shows, and keeps the rest ("Tap a thread to show its hole."; for Hole features "11 Hole features in the browser, 9 read." stays).</li>
<li>A group opens by itself when it did before: Threads when the .ipt has threads; Hole features and Fillets and chamfers when one disagrees or isn't mapped. On STC 10 that opens all three; frame 1 shows them folded to show the layout.</li>
<li>The groups show under every chip (Issues, Passed, All). With no .ipt there are no groups (frame r3-features, unchanged). An .ipt with none of a kind keeps its row: "Threads 0", opening to "No threads in this .ipt."</li>
<li>Also for Morgan's eye: the opened row's detail labels its advice "Fix" on a Fix row and "Suggestion" on a Review row (the round 3 frame showed "Fix" only, on a Fix row).</li>
</ul></section>"""

TODAY = '<section class="note"><h2>Today (built S1, same part)</h2><img src="%s" alt="Today: three scrolling boxes inside the Features step" style="width:100%%;max-width:1280px;border:1px solid var(--line)"></section>'

frames = [
    frame("f-issues", "2 · FEATURES · ISSUES · .ipt GROUPS FOLDED (FULL LENGTH)", view("model-f10.png") + panel(ROWS_SEL + ROWS_REST + FOLDED), cls="long"),
    frame("f-threads", "2 · FEATURES · THREADS OPEN, DISAGREES TAPPED (FULL LENGTH)", view("model-thread.png") + panel(ROWS_SHUT + ROWS_REST + OPEN_THREADS), cls="long"),
    frame("f-blends", "2 · FEATURES · FILLETS AND CHAMFERS OPEN (SCROLLED)", view("model-f10.png") + panel(SRC + grp("Threads", 6, THREADS_T, False) + grp("Hole features", 9, HF_T, False) + grp("Fillets and chamfers", 4, BL_T, True) + BLEND_ROWS)),
    frame("f-issues-900", "900 PX · FEATURES", view("model-f10.png") + panel(ROWS_SEL + ROWS_REST + FOLDED), cls="w900"),
]

today = IMG / "today.png"
page = HEAD.replace("</head>", EXTRA + "</head>") + "<body>\n" + NOTE + "".join(frames)
if today.exists():
    page += TODAY % img("today.png")
page += "<!--RECORD--></body>\n</html>\n"
(HERE / "review-steps-features.html").write_text(page, encoding="utf-8")
print("wrote review-steps-features.html,", len(frames), "frames")
