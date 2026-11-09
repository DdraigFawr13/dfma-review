"""Write round3-frames.html: the final-candidate screens (Morgan's round 1 and 2 picks plus the four calls left to Claude).

    python3 mockups/ui-direction/build_round3_frames.py

Reads the shared frame CSS from round2-frames.html so every round draws with the same tokens.
"""

from __future__ import annotations

from pathlib import Path

HERE = Path(__file__).resolve().parent
R2 = (HERE / "round2-frames.html").read_text(encoding="utf-8")
HEAD = R2[: R2.index("<body>")].replace("UI direction round 2 frames", "UI direction round 3 frames")

EXTRA = """<style>
.frame.w900 { width: 900px; height: 1080px; }
.top h1, .btn, .step { white-space: nowrap; }
.w900 .top > .num { display: none; }
.w900 .step { padding: 0 8px; }
.w900 .body { grid-template-columns: 1fr !important; grid-template-rows: 420px auto; }
.okrow { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.okrow .lbl { font-size: .875rem; font-weight: 600; color: var(--muted); margin-right: 2px; }
.sw { width: 14px; height: 14px; border-radius: 2px; flex: none; }
.err { border-left: 4px solid var(--high); background: var(--panel); padding: 10px 12px; color: var(--high); font-weight: 600; }
.driver { display: grid; grid-template-columns: 1fr auto auto; gap: 4px 14px; padding: 10px 14px; border-bottom: 1px solid var(--line); align-items: baseline; }
.driver .f { grid-column: 1 / 4; font-size: .875rem; color: var(--muted); }
.chip.on .box { position: relative; } .chip.on .box::after { content: ""; position: absolute; left: 4px; top: 1px; width: 4px; height: 8px; border: solid var(--accent-ink); border-width: 0 2px 2px 0; transform: rotate(45deg); }
.spin { width: 28px; height: 28px; border: 3px solid var(--line); border-top-color: var(--accent); border-radius: 50%; }
ul.plain { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
</style>
"""

STEPS = ["Part", "Features", "Machining", "Cost", "Report"]
COUNTS = {"Features": '<span class="c"><span class="mk high"></span>4 <span class="mk medium"></span>4</span>'}


def nav(on: int, loaded: bool = True) -> str:
    out = []
    for i, name in enumerate(STEPS, 1):
        cls = "step on" if i == on else ("step" if loaded or i == 1 else "step off")
        out.append(f'<span class="{cls}"><span class="n">{i}</span>{name}{" " + COUNTS[name] if loaded and name in COUNTS else ""}</span>')
    return '<nav class="steps">' + "".join(out) + "</nav>"


def top(on: int, loaded: bool = True) -> str:
    right = '<span class="num muted">report_sample.step</span><span class="btn">Export PDF</span>' if loaded else ""
    return f'<header class="top"><h1>DFMA Review</h1>{nav(on, loaded)}<span class="spacer"></span>{right}</header>'


def frame(fid: str, tag: str, on: int, body: str, loaded: bool = True, cols: str = "1fr 460px", cls: str = "") -> str:
    return (f'<section class="frame {cls}" id="{fid}"><span class="tag">{tag}</span>{top(on, loaded)}'
            f'<div class="body" style="display:grid;grid-template-columns:{cols};gap:16px;padding:16px;flex:1;min-height:0">{body}</div></section>\n')


FORM = """<div class="drop">
  <h2>Start a review</h2>
  <div class="field"><label>STEP file</label><span class="btn">Open STEP file…</span></div>
  <div class="field"><label>Inventor part (.ipt), optional</label><span class="btn ghost">Add .ipt…</span></div>
  <div class="field"><label>Process</label><span class="inp sel">Milling</span></div>
  <div class="field"><label>Material</label><span class="inp sel">Aluminum 6061</span></div>
  %s
  <p class="muted" style="font-size:.875rem;margin:0">Your files are analysed on this computer and deleted straight after. Nothing is kept.</p>
</div>"""

PINS_ALL = """<span class="pin m" style="left:60.9%;top:40.2%"><b>F1 +1</b><i></i></span>
<span class="pin h" style="left:54.2%;top:39.7%"><b>F4</b><i></i></span>
<span class="pin h" style="left:40.8%;top:30.2%"><b>F5</b><i></i></span>
<span class="pin h tall" style="left:59.6%;top:33.7%"><b>F6</b><i></i></span>
<span class="pin h" style="left:46.4%;top:29.2%"><b>F7 +1</b><i></i></span>"""

VIEW_ALL = f'<div class="view"><div class="stage"><img src="img/model-wide.png" alt="">{PINS_ALL}</div></div>'
VIEW_PLAIN = '<div class="view"><div class="stage"><img src="img/model-wide.png" alt=""></div></div>'
VIEW_SEL = '<div class="view"><div class="stage"><img src="img/model-wide-sel.png" alt=""><span class="pin h sel" style="left:50%;top:45%"><b>F4 FIX</b><i></i></span></div>%s</div>'

OKROW = """<div class="viewtools" style="right:12px"><div class="panel okrow" style="padding:6px 10px">
  <span class="lbl">Show OK</span>
  <span class="chip on"><span class="box"></span><span class="sw" style="background:var(--low)"></span>Holes</span>
  <span class="chip on"><span class="box"></span><span class="sw" style="background:#8559b8"></span>Pockets</span>
  <span class="chip on"><span class="box"></span><span class="sw" style="background:#1d7f86"></span>Corners</span>
  <span class="chip"><span class="box"></span><span class="sw" style="background:#6b5d4f"></span>Walls</span>
</div></div>"""

OVERVIEW_PANEL = """<div class="panel" style="display:flex;flex-direction:column">
  <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:grid;gap:4px">
    <div style="display:flex;align-items:center;gap:8px"><span class="label">report_sample.step</span><span class="spacer"></span><span class="open" style="color:var(--accent);font-weight:600">Change file</span></div>
    <span class="num">4.000 × 2.500 × 2.000 in · 14 faces · inch</span>
    <span class="muted">Milling · Aluminum 6061</span>
  </div>
  <div class="score"><h3>2 · Features</h3><span class="open">Open ›</span>
    <div class="sub"><span><span class="mk high"></span><b class="sev high">Fix</b> 4</span><span><span class="mk medium"></span><b class="sev medium">Review</b> 4</span><span><span class="mk ok"></span><b class="sev ok">OK</b> 9</span></div>
    <div class="sub">2 holes, 1 pocket, 4 corners and 9 walls checked</div></div>
  <div class="score"><h3>3 · Machining</h3><span class="open">Open ›</span>
    <div class="sub"><span>3-axis mill</span><span class="num">2 setups</span><span class="num">4 tool loads</span></div></div>
  <div class="score"><h3>4 · Cost</h3><span class="open">Open ›</span>
    <div class="sub"><span class="num">7 drivers</span><span>Biggest: distinct tools 4.0, sharp or small inside corners 4.0 (weights are estimates)</span></div></div>
  <div class="score" style="border:0"><h3>5 · Report</h3><span class="open">Open ›</span><div class="sub">PDF of all of the above</div></div>
  <div style="margin-top:auto;padding:14px 16px;background:var(--bg);border-top:1px solid var(--line);display:grid;gap:6px">
    <span class="label">Fix first</span>
    <div style="display:flex;gap:8px;align-items:center"><span class="mk high"></span><span class="sev high">Fix</span><b>Sharp corner ×4</b><span class="num muted">F4–F7</span><span class="muted">Inside corners have no radius.</span></div>
  </div>
</div>"""

ROWS = """<div class="srow sel"><span class="mk high"></span><span class="t"><span class="sev high">Fix</span> Sharp corner ×4</span><span class="ids">F4–F7</span>
  <span class="s">Inside corners have no radius. Needs 0.031 in (1/32) or more, or EDM.</span>
  <span class="chk">Corner radius check · limit is an estimate</span>
  <dl class="more"><dt>Showing</dt><dd class="num">F4 · corner-1 · 1 of 4</dd><dt>Measured</dt><dd class="num">radius 0.000 in, pocket 0.250 in deep</dd><dt>Fix</dt><dd>A larger radius also lets a larger end mill cut the pocket.</dd></dl>
</div>
<div class="srow"><span class="mk medium"></span><span class="t"><span class="sev medium">Review</span> Deep hole ×2</span><span class="ids">F1 F2</span>
  <span class="s">9.6× and 7.2× the diameter deep. Over 6.0× needs peck drilling.</span><span class="chk">Hole depth check · limit is an estimate</span></div>
<div class="srow"><span class="mk medium"></span><span class="t"><span class="sev medium">Review</span> Drill size</span><span class="ids">F3</span>
  <span class="s">0.260 in isn't a standard drill. Nearest is 0.266 in (17/64).</span><span class="chk">Hole size check · drill list, within 0.0005 in</span></div>
<div class="srow"><span class="mk medium"></span><span class="t"><span class="sev medium">Review</span> Deep pocket</span><span class="ids">F8</span>
  <span class="s">Depth is 8.0× the end mill that fits. Over 3.0× needs a long tool.</span><span class="chk">Pocket depth check · limit is an estimate</span></div>"""


def features_panel(passed: bool) -> str:
    chips = ('<span class="chip">Issues 8</span><span class="chip on">Passed 9</span><span class="chip">All</span>' if passed
             else '<span class="chip on">Issues 8</span><span class="chip">Passed 9</span><span class="chip">All</span>')
    if passed:
        walls = [("wall-1", "4.000"), ("wall-2", "1.000"), ("wall-3", "2.000"), ("wall-4", "0.500"), ("wall-5", "2.500"),
                 ("wall-6", "0.700"), ("wall-7", "0.500"), ("wall-8", "2.250"), ("wall-9", "1.000")]
        rows = ('<div class="srow"><span class="mk ok"></span><span class="t"><span class="sev ok">OK</span> Walls ×9</span><span class="ids"></span>'
                '<span class="s">Thinnest is 0.500 in. At least 0.030 in is needed.</span><span class="chk">Thin wall check</span>'
                '<span class="chk" style="color:var(--accent);font-weight:600">Show all 9 ›</span></div>')
    else:
        rows = ROWS
    return (f'<div class="panel" style="display:flex;flex-direction:column;min-height:0"><div style="display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)">{chips}</div>'
            f'{rows}<div style="margin-top:auto;display:flex;justify-content:space-between;padding:12px;border-top:1px solid var(--line)"><span class="btn ghost">‹ Part</span><span class="btn">Machining ›</span></div></div>')


COST = """<div class="panel" style="display:flex;flex-direction:column;min-height:0">
  <div style="padding:12px 14px;border-bottom:1px solid var(--line)"><h2>What drives the cost</h2></div>
  <div class="driver"><b>Distinct tools</b><span class="num muted">4 × 1.0</span><span class="num">4.0</span></div>
  <div class="driver"><b>Sharp or small inside corners</b><span class="num muted">4 × 1.0</span><span class="num">4.0</span><span class="f num">F4–F7</span></div>
  <div class="driver"><b>Deep holes and bores</b><span class="num muted">2 × 1.0</span><span class="num">2.0</span><span class="f num">F1 F2</span></div>
  <div class="driver"><b>Deep pockets</b><span class="num muted">1 × 1.0</span><span class="num">1.0</span><span class="f num">F8</span></div>
  <div class="driver"><b>Setups beyond the first</b><span class="num muted">1 × 1.0</span><span class="num">1.0</span></div>
  <div class="driver"><b>Non-standard holes</b><span class="num muted">1 × 1.0</span><span class="num">1.0</span><span class="f num">F3</span></div>
  <div class="driver"><b>Undersized or sub-1/8 in tools</b><span class="num muted">1 × 1.0</span><span class="num">1.0</span></div>
  <div class="driver" style="background:var(--bg);border-bottom:2px solid var(--ink)"><b>Total score</b><span></span><span class="num" style="font-weight:700">14.0</span></div>
  <p class="muted" style="margin:0;padding:12px 14px;font-size:.875rem">Score is count × weight. Every weight is an estimate. No time or dollars yet.</p>
  <div style="margin-top:auto;display:flex;justify-content:space-between;padding:12px;border-top:1px solid var(--line)"><span class="btn ghost">‹ Machining</span><span class="btn">Report ›</span></div>
</div>"""

REPORT = """<div class="panel" style="display:flex;flex-direction:column;min-height:0;padding:16px;gap:14px">
  <h2>Report</h2>
  <div style="display:grid;gap:6px"><span class="label">The PDF holds</span>
    <ul class="plain"><li>Page 1: the counts, part summary, machine plan, tools, cost drivers, and threads when an .ipt is given</li><li>Then a page for each finding, with a picture of it on the model</li><li>Last: the assumptions</li></ul></div>
  <div style="display:grid;gap:6px"><span class="label">Rules run</span>
    <p style="margin:0">Hole depth, hole size, corner radius, pocket depth, undercut, thin wall, access, looks turned.</p></div>
  <div style="display:flex;gap:8px;align-items:center;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:10px 0"><b>Assumptions (8)</b><span class="spacer"></span><span style="color:var(--accent);font-weight:600">Show ›</span></div>
  <span class="btn" style="align-self:flex-start;height:40px">Export PDF</span>
  <div style="margin-top:auto;display:flex;justify-content:space-between;padding-top:12px;border-top:1px solid var(--line)"><span class="btn ghost">‹ Cost</span><span></span></div>
</div>"""

MACH = R2[R2.index('<!-- ============ V1: Machining'): R2.index("</section>", R2.index('<!-- ============ V1: Machining')) + 10]
MACH = MACH.replace('id="frame-m"', 'id="r3-mach"').replace("V1 · STEPS · MACHINING", "3 · MACHINING")
MACH = MACH.replace(MACH[MACH.index("<header"): MACH.index("</header>") + 9], top(3))
MACH = MACH.replace('<span class="muted">Tool loads</span><span class="num">4</span>', '<span class="muted">Tool loads</span><span class="num">4 <span class="muted" style="font-family:var(--sans)">(the first in each setup counts)</span></span><span class="muted">Why 2</span><span>The holes can be cut from +X; the pocket only from −X.</span>')
assert "Why 2" in MACH

frames = [
    frame("r3-start", "1 · PART · START", 1, '<div class="view"><p class="muted" style="font-size:1rem">The part shows here once it\'s read.</p></div>' + FORM % "", loaded=False, cols="1fr 440px"),
    frame("r3-loading", "1 · PART · READING", 1, '<div class="view" style="flex-direction:column;gap:12px"><span class="spin"></span><p style="font-size:1rem;margin:0">Analysing report_sample.step…</p></div>'
          + FORM % "", loaded=False, cols="1fr 440px"),
    frame("r3-error", "1 · PART · REFUSED", 1, '<div class="view"><p class="muted" style="font-size:1rem">No part loaded.</p></div>'
          + FORM % '<p class="err" style="margin:0">Error: This is not a STEP file this tool can read</p><p style="margin:0">Choose another file, or try again.</p>', loaded=False, cols="1fr 440px"),
    frame("r3-overview", "1 · PART · OVERVIEW", 1, VIEW_ALL + OVERVIEW_PANEL),
    frame("r3-features", "2 · FEATURES · ISSUES", 2, VIEW_SEL.replace("%s", OKROW) + features_panel(False)),
    frame("r3-passed", "2 · FEATURES · PASSED", 2, (VIEW_SEL.replace("model-wide-sel", "model-wide").replace('<span class="pin h sel" style="left:50%;top:45%"><b>F4 FIX</b><i></i></span>', "").replace("%s", OKROW.replace('<span class="chip"><span class="box"></span><span class="sw" style="background:#6b5d4f"></span>Walls', '<span class="chip on"><span class="box"></span><span class="sw" style="background:#6b5d4f"></span>Walls'))) + features_panel(True)),
    MACH,
    frame("r3-cost", "4 · COST", 4, VIEW_PLAIN + COST),
    frame("r3-report", "5 · REPORT", 5, VIEW_PLAIN + REPORT),
    frame("r3-overview-900", "900 PX · OVERVIEW", 1, VIEW_ALL + OVERVIEW_PANEL, cls="w900"),
    frame("r3-features-900", "900 PX · FEATURES", 2, VIEW_SEL.replace("%s", OKROW) + features_panel(False), cls="w900"),
]
HEAD = HEAD.replace("</head>", EXTRA + "</head>")
(HERE / "round3-frames.html").write_text(HEAD + "<body>\n" + "".join(frames) + "</body>\n</html>\n", encoding="utf-8")
print("wrote round3-frames.html,", len(frames), "frames")
