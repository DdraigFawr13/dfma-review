"""Port S1 in the browser engine's test build (port spec J1, J3, J4, J5, J6, J6b; screens as the approved mock-up, D-057).

Run with `pytest -m e2e --engine browser` (scripts/check.py does); deselected in the service run.
"""

from __future__ import annotations

import json
import subprocess
import sys

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS, ROOT, expected
from test_view import canvas, changed

pytestmark = [pytest.mark.e2e, pytest.mark.browser_only]

sys.path.insert(0, str(ROOT / "service"))
from dfma import settings  # noqa: E402  the messages and limits the browser copy must keep
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


def not_checked(process: str = "mill") -> str:
    names = checks_run([r.ID for r in RULES if process in r.PROCESSES])
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
    """J1 and D-057: the Not-checked-yet line on the Features card and step and on Report; Machining and Cost not
    worked out yet; no chips, Show OK, "No findings" or empty "Checks run"."""
    page.goto(base_url)
    read(page, PARTS / "report_sample.step")
    line = not_checked()
    later = "Not worked out yet in this copy."
    expect(page.get_by_test_id("overview-features")).to_contain_text(line)
    expect(page.get_by_test_id("overview-features")).not_to_contain_text("No findings")
    expect(page.get_by_test_id("overview-machining")).to_contain_text(later)
    expect(page.get_by_test_id("overview-cost")).to_contain_text(later)
    page.get_by_test_id("step-features").click()
    expect(page.get_by_test_id("features-notrun")).to_have_text(line)
    expect(page.locator("#row-chips button")).to_have_count(0)
    expect(page.get_by_test_id("show-ok")).to_be_hidden()
    expect(page.locator("#rows")).not_to_contain_text("No findings")
    page.get_by_test_id("step-machining").click()
    expect(page.get_by_test_id("plan-notrun")).to_have_text(later)
    expect(page.locator("#plan-none")).to_be_hidden()
    page.get_by_test_id("step-cost").click()
    expect(page.locator("#cost")).to_have_text(later)
    page.get_by_test_id("step-report").click()
    expect(page.get_by_test_id("report-notrun")).to_have_text(line)
    expect(page.locator("#report-checks")).to_be_hidden()
    expect(page.locator("#page-report [data-pdf]:visible")).to_have_count(0)
    # A turned part names the turning checks (the Process select sits on the Part step)
    page.get_by_test_id("step-part").click()
    page.get_by_test_id("upload-process").select_option("turn")
    page.get_by_test_id("step-report").click()
    expect(page.get_by_test_id("report-notrun")).to_have_text(not_checked("turn"), timeout=60_000)


def test_ui_responsive(page: Page, base_url: str):
    """J3: while the slowest NIST file is analysed, "Analyzing" shows and a tap on a step tab is handled in 200 ms."""
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(nist("nist_ctc_02_asme1_ap242-e2.stp"))
    expect(page.locator("#status")).to_contain_text("Analyzing")
    samples = []
    while page.get_by_test_id("overview").is_hidden() and len(samples) < 50:
        samples.append(page.evaluate("""() => new Promise((done) => {
          const t = performance.now();
          const tab = document.querySelector('[data-testid="step-part"]');
          tab.addEventListener('click', () => setTimeout(() => done(performance.now() - t), 0), { once: true });
          tab.click();
        })"""))
    expect(page.get_by_test_id("overview")).to_be_visible(timeout=120_000)
    print(f"tab taps during the analysis: {len(samples)}, slowest {max(samples, default=0):.1f} ms")
    assert samples, "the analysis finished before a tap could be timed"
    assert max(samples) < 200


def test_peak_memory(page: Page, base_url: str):
    """J4: the largest full-set file, then a 48 to 50 MiB plate, each in a fresh worker, wasm memory under 2 GB."""
    if not BIG_PLATE.exists():
        pytest.fail(f"{BIG_PLATE} is missing: run python tests/parts/make_parts.py --big-plate (scripts/check.py does)")
    page.goto(base_url + "/?time_limit_s=600")
    first = read(page, nist("nist_ftc_09_asme1_ap242-e1.stp"))
    page.get_by_test_id("change-file").click()
    second = read(page, BIG_PLATE, timeout_ms=900_000)
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
