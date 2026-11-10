"""Port S1 in the browser engine's test build (port spec J1, J3, J4, J5, J6, J6b; screens as the approved mock-up, D-057).

Run with `pytest -m e2e --engine browser` (scripts/check.py does); deselected in the service run.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS, ROOT, expected
from test_view import canvas, changed

pytestmark = [pytest.mark.e2e, pytest.mark.browser_only]

sys.path.insert(0, str(ROOT / "service"))
from dfma import settings  # noqa: E402
from dfma.analyze import analyze  # noqa: E402  the answer key for the hole rows (S2)  the messages and limits the browser copy must keep
from dfma.rows import checks_run  # noqa: E402
from dfma.rules import RULES  # noqa: E402

NIST = ROOT / "tests" / "nist" / ".cache" / "NIST-PMI-STEP-Files"
KEY_DIR = ROOT / "tests" / "parity" / ".cache" / "key"
BIG_PLATE = PARTS / ".cache" / "big_plate.step"
WASM_LIMIT = 2 * 1024**3  # J4: the worker's wasm memory stays under 2 GB


def nist(name: str):
    from nist_files import ap242_files
    ap242_files()  # unpacks the zip once
    return NIST / name


# The rules the browser copy has ported, by process (web/src/engine/rules/index.ts `ported`); each slice adds its own.
PORTED = {"mill": {"hole_depth", "hole_size", "access", "corner_radius", "pocket_depth", "undercut"},
          "turn": set()}  # S2: holes; S4: pockets, corners, undercuts; Milling only until S6


def not_checked(process: str = "mill") -> str:
    names = checks_run([r.ID for r in RULES if process in r.PROCESSES and r.ID not in PORTED[process]])
    return f"Not checked yet in this copy: {', '.join(names)}."


def read(page: Page, path, timeout_ms: int = 120_000) -> dict:
    """Pick a STEP file and wait for the overview; return the analysis on screen."""
    page.get_by_test_id("upload-file").set_input_files(path)
    expect(page.get_by_test_id("overview")).to_be_visible(timeout=timeout_ms)
    return page.evaluate("() => window.__dfma.analysis()")


def test_view_part(page: Page, base_url: str):
    """J1: the start form, the copy mark, the Part step as Python gives it, and the model rotates."""
    page.goto(base_url)
    expect(page.get_by_test_id("copy-tag")).to_have_text("Test copy")
    expect(page.locator(".privacy")).to_have_text("Your file stays on this computer. Nothing is uploaded.")
    expect(page.locator("#ipt-field")).to_be_hidden()
    expect(page.locator("#status")).to_have_text("Choose a STEP file to start.")
    before = canvas(page)
    read(page, PARTS / "report_sample.step")
    part = expected("report_sample")
    expect(page.get_by_test_id("part-size")).to_have_text("4.000 × 2.500 × 2.000 in")
    expect(page.get_by_test_id("face-count")).to_have_text(f"{part['face_count']} faces")
    expect(page.get_by_test_id("part-units")).to_have_text(part["units"])
    page.wait_for_timeout(300)
    shown = canvas(page)
    assert changed(before, shown) > 50, "the canvas did not change after reading the part"
    box = page.get_by_test_id("viewer-canvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + 120, cy + 40, steps=8)
    page.mouse.up()
    page.wait_for_timeout(300)
    assert changed(shown, canvas(page)) > 50, "dragging did not rotate the part"


def test_not_checked_notice(page: Page, base_url: str):
    """J1 and D-057: the Not-checked-yet line on the Features card and step and on Report, naming only the checks not
    ported. From S2 the hole checks run on a milled part, so its chips, Show OK and "Checks run" show; from S3 its
    Machining and Cost show the plan and the drivers. A turned part runs no check and has no plan yet (S6), so it keeps
    S1's states: no chips, Show OK or checks, and Machining and Cost not worked out yet."""
    page.goto(base_url)
    read(page, PARTS / "report_sample.step")
    line = not_checked()
    later = "Not worked out yet in this copy."
    expect(page.get_by_test_id("overview-features")).to_contain_text(line)
    expect(page.get_by_test_id("overview-machining")).to_contain_text("3-axis mill")
    expect(page.get_by_test_id("overview-cost")).not_to_contain_text(later)
    page.get_by_test_id("step-features").click()
    expect(page.get_by_test_id("features-notrun")).to_have_text(line)
    expect(page.locator("#row-chips button").first).to_be_visible()
    expect(page.get_by_test_id("show-ok")).to_be_visible()
    page.get_by_test_id("step-machining").click()
    expect(page.get_by_test_id("plan-notrun")).to_be_hidden()  # S4: the plan holds pockets too, so no pocket line (D-061)
    expect(page.get_by_test_id("plan-machine")).to_have_text("3-axis mill")
    expect(page.locator("#plan-none")).to_be_hidden()
    page.get_by_test_id("step-cost").click()
    expect(page.get_by_test_id("cost-total")).to_be_visible()
    expect(page.locator("#cost")).not_to_contain_text(later)
    page.get_by_test_id("step-report").click()
    expect(page.get_by_test_id("report-notrun")).to_have_text(line)
    expect(page.locator("#report-checks")).to_be_visible()
    for name in ("Hole depth check", "Hole size check", "Access check"):
        expect(page.locator("#report-checks")).to_contain_text(name)
    expect(page.locator("#page-report [data-pdf]:visible")).to_have_count(2)  # the findings and the plan; no .ipt
    expect(page.locator('#page-report [data-pdf="findings"]')).to_be_visible()
    expect(page.locator('#page-report [data-pdf="plan"]')).to_be_visible()
    # A turned part names every turning check and keeps S1's states (the Process select sits on the Part step)
    page.get_by_test_id("step-part").click()
    page.get_by_test_id("upload-process").select_option("turn")
    page.get_by_test_id("step-report").click()
    expect(page.get_by_test_id("report-notrun")).to_have_text(not_checked("turn"), timeout=60_000)
    expect(page.locator("#report-checks")).to_be_hidden()
    expect(page.locator("#page-report [data-pdf]:visible")).to_have_count(0)
    page.get_by_test_id("step-features").click()
    expect(page.locator("#row-chips button")).to_have_count(0)
    expect(page.get_by_test_id("show-ok")).to_be_hidden()
    expect(page.locator("#rows")).not_to_contain_text("No findings")
    page.get_by_test_id("step-machining").click()
    expect(page.get_by_test_id("plan-notrun")).to_have_text(later)
    page.get_by_test_id("step-cost").click()
    expect(page.locator("#cost")).to_have_text(later)


@pytest.mark.timed
def test_ui_responsive(page: Page, base_url: str):
    """J3: while the slowest NIST file is analysed, "Analyzing" shows, the page's main thread never stalls for 200 ms
    (a 10 ms heartbeat records its longest gap from the upload to the worker's reply), and a tap on the Part tab,
    timed from the test's side, is handled within 200 ms. The drawing of the result after the reply is printed, not
    limited: it is the shared 3D viewer (the service app: 1,144 and 1,387 ms on this file, 2026-11-10)."""
    page.goto(base_url)
    page.wait_for_function("() => window.__dfmaEngineReady === true", timeout=120_000)  # compiled while idle
    page.evaluate("""() => {
      const beat = window.__beat = { last: performance.now(), worst: 0, beats: 0, replied: false, draw: 0 };
      window.__beatTimer = setInterval(() => {
        const now = performance.now(), gap = now - beat.last;
        if (beat.replied) beat.draw = Math.max(beat.draw, gap); else beat.worst = Math.max(beat.worst, gap);
        beat.last = now;
        beat.beats++;
      }, 10);
      const W = window.Worker;  // note the worker's reply, so gaps after it count as drawing
      window.Worker = function (...a) {
        const w = new W(...a);
        w.addEventListener("message", (e) => { if (e.data && e.data.type !== "ready") beat.replied = true; });
        return w;
      };
    }""")
    page.get_by_test_id("upload-file").set_input_files(nist("nist_ctc_02_asme1_ap242-e2.stp"))
    expect(page.locator("#status")).to_contain_text("Analyzing")
    taps = []
    while not page.evaluate("() => window.__beat.replied"):
        start = time.perf_counter()
        page.evaluate("() => document.querySelector('[data-testid=\"step-part\"]').click()")
        if not page.evaluate("() => window.__beat.replied"):  # a tap that overlapped the reply is drawing time
            taps.append((time.perf_counter() - start) * 1000)
        if len(taps) > 5000:
            break
    expect(page.get_by_test_id("overview")).to_be_visible(timeout=120_000)
    page.wait_for_timeout(1000)
    beat = page.evaluate("() => { clearInterval(window.__beatTimer); return window.__beat; }")
    print(f"during the analysis: heartbeats {beat['beats']}, longest gap {beat['worst']:.1f} ms; taps {len(taps)}, "
          f"slowest {max(taps, default=0):.1f} ms; drawing the result: longest gap {beat['draw']:.1f} ms")
    assert taps, "the analysis finished before a tap could be timed"
    assert beat["worst"] < 200, "the page's main thread stalled during the analysis"
    assert max(taps) < 200


@pytest.mark.per_slice
def test_peak_memory(page: Page, base_url: str):
    """J4: the largest full-set file, then a 48 to 50 MiB plate, each in a fresh worker, wasm memory under 2 GB.
    Once per slice, not on every push (D-058): Python's own reader takes 925.6 s on the plate (2026-11-10)."""
    if not BIG_PLATE.exists():
        pytest.fail(f"{BIG_PLATE} is missing: run python tests/parts/make_parts.py --big-plate (scripts/check.py does)")
    page.set_default_timeout(3_600_000)
    page.goto(base_url + "/?time_limit_s=3600")  # the 60-minute limit (D-058)
    first = read(page, nist("nist_ftc_09_asme1_ap242-e1.stp"))
    page.get_by_test_id("change-file").click()
    started = time.perf_counter()
    second = read(page, BIG_PLATE, timeout_ms=3_600_000)
    print(f"big_plate: {time.perf_counter() - started:.0f} s in the page")
    for name, a in (("nist_ftc_09", first), ("big_plate", second)):
        print(f"{name}: wasm {a['wasm_bytes'] / 2**20:.0f} MiB, worker {a['worker']}, {a['part']['face_count']} faces")
        assert 0 < a["wasm_bytes"] < WASM_LIMIT
    assert second["worker"] == first["worker"] + 1, "the second analysis did not start in a fresh worker"


def test_refused(page: Page, base_url: str, tmp_path):
    """J5: refusals show the same messages as today, with "try again" only where it can help (audit F3)."""
    page.goto(base_url)
    big = tmp_path / "too_big.step"
    big.write_bytes(b"0" * (settings.MAX_UPLOAD_BYTES + 1))
    ipt = sorted((ROOT / "tests" / "inventor" / "files").glob("*.ipt"))[0]
    for path, message in ((PARTS / "not_step.step", settings.MSG_NOT_STEP), (PARTS / "no_solid.step", settings.MSG_NO_SOLID),
                          (big, settings.MSG_TOO_LARGE), (ipt, settings.MSG_IPT_NEEDS_STEP)):
        page.get_by_test_id("upload-file").set_input_files(path)
        expect(page.get_by_test_id("error-message")).to_contain_text(message, timeout=60_000)
        expect(page.locator("#error-next")).to_be_hidden()


def test_timeout(page: Page, base_url: str):
    """J5: past the time limit (the test build's ?time_limit_s=), MSG_TOO_LONG with "try again"."""
    page.goto(base_url + "/?time_limit_s=0.05")
    page.get_by_test_id("upload-file").set_input_files(nist("nist_ctc_02_asme1_ap242-e2.stp"))
    expect(page.get_by_test_id("error-message")).to_contain_text(settings.MSG_TOO_LONG, timeout=120_000)
    expect(page.locator("#error-next")).to_be_visible()


def test_licences(page: Page, base_url: str):
    """J6: the footer's Licenses link opens the page with the engine, its license texts and every runtime package."""
    page.goto(base_url)
    page.get_by_test_id("licenses-link").click()
    expect(page.locator("h1")).to_have_text("DFMA Review · Licenses")
    expect(page.locator("body")).to_contain_text("LGPL-2.1-only with the Open CASCADE exception 1.0")
    deps = json.loads((ROOT / "web" / "package.json").read_text(encoding="utf-8"))["dependencies"]
    for name, version in deps.items():
        expect(page.locator("body")).to_contain_text(name)
        expect(page.locator("body")).to_contain_text(version)
    for link in ("licences/opencascade-LICENSE.txt", "licences/opencascade-OCCT-exception.txt", "fonts/OFL.txt"):
        assert page.request.get(f"{base_url}/{link}").ok, link


@pytest.mark.parametrize("path", ["tests/parts/report_sample.step", "tests/parts/countersunk_hole.step",
                                  "tests/parts/clean_holes.step",
                                  "tests/nist/.cache/NIST-PMI-STEP-Files/nist_ctc_01_asme1_ap242-e1.stp",
                                  "tests/nist/.cache/NIST-PMI-STEP-Files/nist_ftc_09_asme1_ap242-e1.stp"])
def test_worker_parity(page: Page, base_url: str, path: str, tmp_path):
    """J6b: the real worker in Chromium gives the key's answer, by the same compare rules as the Node parity."""
    nist("nist_ctc_01_asme1_ap242-e1.stp")
    key = KEY_DIR / (path.replace("/", "__") + ".json")
    if not key.exists():
        pytest.fail(f"{key} is missing: run python tests/parity/key.py --set quick (scripts/check.py does)")
    page.goto(base_url)
    result = read(page, ROOT / path)
    out = tmp_path / "result.json"
    out.write_text(json.dumps(result), encoding="utf-8")
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    run = subprocess.run([npm, "--prefix", "web", "run", "-s", "compare", "--", str(out), str(key)], cwd=ROOT,
                         capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr


@pytest.mark.parametrize("name", ["report_sample", "countersunk_hole", "deep_hole", "clean_holes"])
def test_hole_rows(page: Page, base_url: str, name: str):
    """S2 ("Morgan tries"): the hole rows on the Features step are Python's, word for word; a row's tap lights its
    faces; a part with no hole finding says so above the Not-checked-yet line."""
    file = PARTS / f"{name}.step"
    key = analyze(file, file.name)
    holes = [f for f in key["features"] if f["kind"] == "hole"]
    ported = PORTED["mill"]
    on_holes = {f["id"] for f in holes}
    kinds = {f["id"]: f["kind"] for f in key["features"]}
    # the browser copy numbers its findings over every ported rule and kind (holes, pockets, corners from S4)
    findings = [f for f in key["findings"] if f["rule"] in ported and kinds.get(f.get("feature")) in ("hole", "pocket", "corner")]
    kept = {f["id"] for f in findings if f.get("feature") in on_holes}
    rows = [r for r in key["rows"] if r["rule"] in ported and set(r["findings"]) <= kept]  # the rows on holes only
    assert holes, f"{name} has no hole"
    page.goto(base_url)
    result = read(page, file)
    assert len([f for f in result["features"] if f["kind"] == "hole"]) == len(holes)
    card = page.get_by_test_id("overview-features")
    expect(card).to_contain_text(f"{len(holes)} hole{'s' if len(holes) != 1 else ''}")  # S4: "…, 1 pocket and 4 corners checked"
    expect(card).to_contain_text(not_checked())
    page.get_by_test_id("step-features").click()
    if not rows:
        expect(card).to_contain_text("No findings. Every feature checked passed its rules.")
        return
    # Python numbers the findings across every rule; the browser copy across the ported ones (port spec Parity)
    ids = {f["id"]: f"F{n}" for n, f in enumerate(findings, 1)}
    for r in rows:
        row = page.get_by_test_id(f"row-{ids[r['findings'][0]]}")
        expect(row).to_contain_text(r["short"])
        expect(row).to_contain_text(r["sentence"])
    first = rows[0]
    faces = sorted({i for f in findings if f["id"] in first["findings"] for i in f["faces"]})
    page.get_by_test_id(f"row-{ids[first['findings'][0]]}").click()
    assert sorted(page.evaluate("window.__dfma.highlightedFaces()")) == faces


POCKETS_LATER = "Pockets are not in this plan yet in this copy, so it may need more setups and tools."  # gone in S4


@pytest.mark.parametrize("name", ["clean_pocket", "pocket_sharp", "pocket_deep", "pocket_island", "report_sample"])
def test_pocket_rows(page: Page, base_url: str, name: str):
    """S4: the pocket and corner rows on the Features step are Python's, word for word, and a row's tap lights its
    faces; the pockets and corners are Python's, ids and faces (the parity compare checks every number)."""
    file = PARTS / f"{name}.step"
    key = analyze(file, file.name)
    kinds = ("pocket", "corner")
    mine = [f for f in key["features"] if f["kind"] in kinds]
    assert any(f["kind"] == "pocket" for f in mine), f"{name} has no pocket"
    page.goto(base_url)
    result = read(page, file)
    shown = [(f["id"], f["faces"]) for f in result["features"] if f["kind"] in kinds]
    assert shown == [(f["id"], f["faces"]) for f in mine]
    ported = PORTED["mill"]
    kind_of = {f["id"]: f["kind"] for f in key["features"]}
    findings = [f for f in key["findings"] if f["rule"] in ported and kind_of.get(f.get("feature")) in ("hole", *kinds)]
    on = {f["id"] for f in findings if kind_of.get(f.get("feature")) in kinds}
    rows = [r for r in key["rows"] if r["rule"] in ported and set(r["findings"]) & on]
    page.get_by_test_id("step-features").click()
    ids = {f["id"]: f"F{n}" for n, f in enumerate(findings, 1)}  # renumbered over the ported rules (port spec Parity)
    for r in rows:
        row = page.get_by_test_id(f"row-{ids[r['findings'][0]]}")
        expect(row).to_contain_text(r["short"])
        expect(row).to_contain_text(r["sentence"])
    if rows:
        first = rows[0]
        faces = sorted({i for f in findings if f["id"] in first["findings"] for i in f["faces"]})
        page.get_by_test_id(f"row-{ids[first['findings'][0]]}").click()
        assert sorted(page.evaluate("window.__dfma.highlightedFaces()")) == faces


def test_plan_and_cost(page: Page, base_url: str, tmp_path):
    """S3 (D-061): clean_holes.step's plan and drivers as Python gives them; no pocket line on Machining or in the PDF
    from S4; the setup card says what a tap does and that it is done; the total, the Cost card and the PDF read
    "(partial)" while a check that feeds a driver has not run, and the Cost step names those checks."""
    from pypdf import PdfReader
    key = analyze(PARTS / "clean_holes.step", "clean_holes.step")
    page.goto(base_url)
    shown = read(page, PARTS / "clean_holes.step")
    for name in ("machine", "setups", "operations", "tools", "tool_changes", "cost_drivers", "cost_total"):
        assert shown[name] == key[name], name
    assert shown["cost_partial"] is True
    total = f"{key['cost_total']:.1f} points (partial)"
    expect(page.get_by_test_id("overview-cost")).to_contain_text("1 cost driver (partial)")
    page.get_by_test_id("step-machining").click()
    expect(page.get_by_test_id("plan-notrun")).to_be_hidden()  # S4: no pocket line
    setup = page.get_by_test_id("plan-setup-1")
    expect(setup).to_contain_text("Setup 1 · from +Z")
    expect(setup.locator(".shint")).to_have_text("Show on model ›")
    setup.click()
    expect(setup).to_have_attribute("aria-pressed", "true")
    expect(setup.locator(".shint")).to_have_text("Shown on model")
    page.get_by_test_id("step-cost").click()
    expect(page.get_by_test_id("cost-total")).to_contain_text(total)
    expect(page.locator("#cost .notrun")).to_have_text(not_checked())
    with page.expect_download() as download:
        page.get_by_test_id("export-pdf").click()
    path = tmp_path / "report.pdf"
    download.value.save_as(path)
    first = PdfReader(path).pages[0].extract_text().replace("\n", " ")
    for text in ("Machine: 3-axis mill", f"Total score: {total}", not_checked()):
        assert text in first, f"{text!r} is not on page 1"
    assert POCKETS_LATER not in first  # S4: the plan holds pockets
