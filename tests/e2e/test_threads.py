"""I1 S2 J1 in the browser: the Threads panel (D-036), answered with the CTC 04 and STC 10 fixtures through
page.route (lined up by the test harness; the app itself refuses NIST pairs, J2)."""

from __future__ import annotations

import json

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS
from steps import open_step

pytestmark = pytest.mark.e2e
FIXTURES = PARTS.parent / "inventor" / "fixtures"
CTC04 = ("nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt")
STC10 = ("nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt")


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text("utf-8"))


def open_pair(page: Page, base_url: str, tmp_path, result: dict, names) -> None:
    """Pick two placeholder files named as the pair; /api/analyze answers with `result`."""
    page.route("**/api/analyze", lambda r: r.fulfill(status=200, content_type="application/json",
                                                       body=json.dumps(result)))
    page.goto(base_url)
    step, ipt = tmp_path / names[0], tmp_path / names[1]
    step.write_text("placeholder")
    ipt.write_bytes(b"placeholder")
    page.get_by_test_id("upload-ipt").set_input_files(ipt)
    page.get_by_test_id("upload-file").set_input_files(step)
    expect(page.locator("#status")).to_have_text(f"Showing {result['part']['name']} with {names[1]}.")
    open_step(page, "features")  # the .ipt panels are groups in the Features step (review-steps J6)


def test_threads_panel(page: Page, base_url: str, tmp_path):
    result = fixture("ctc_04")
    open_pair(page, base_url, tmp_path, result, CTC04)
    panel = page.get_by_test_id("threads-panel")
    expect(panel).to_be_visible()
    expect(panel).to_have_attribute("open", "")  # opens when the .ipt has threads (D-036)
    expect(page.locator("#threads-count")).to_have_text("4")
    rows = page.get_by_test_id("thread-row")
    expect(rows).to_have_count(4)
    expect(panel).to_contain_text("From INV_nist_ctc_04_asme1_2021.ipt: 4 matched, 0 disagrees, 0 not mapped.")
    for n, hole in enumerate(("hole-37", "hole-38", "hole-39", "hole-40")):
        row = rows.nth(n)
        expect(row).to_contain_text("matched")
        expect(row).to_contain_text("M12x1.75 - 6H")
        expect(row).to_contain_text(hole)
        expect(row).to_contain_text("0.984 in [25 mm] deep · tap drill 0.404 in [10.25 mm] (as stored in the .ipt)")
    # Tapping a row selects its hole; tapping it again clears it
    hole = next(f for f in result["features"] if f["id"] == "hole-38")
    rows.nth(1).click()
    expect(rows.nth(1)).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("window.__dfma.highlightedFaces()") == sorted(hole["faces"])
    rows.nth(1).click()
    expect(rows.nth(1)).to_have_attribute("aria-pressed", "false")
    assert page.evaluate("window.__dfma.highlightedFaces()") == []
    # The hole itself shows its callout (J1): its Passed row, or a finding on it
    page.get_by_test_id("passed").locator("summary").click()
    passed = page.get_by_test_id("passed-hole-37")
    findings = [f for f in result["findings"] if f["feature"] == "hole-37"]
    target = page.get_by_test_id(f"finding-{findings[0]['id']}") if findings else passed
    expect(target).to_contain_text("Thread: M12x1.75 - 6H (from the .ipt)")


def test_thread_disagrees_and_states(page: Page, base_url: str, tmp_path):
    result = fixture("stc_10")
    t = result["inventor"]["threads"][1]  # built: one thread not mapped (no NIST file has one)
    t.update(state="not_mapped", hole=None, gaps=[], reason="external thread: not on a hole")
    open_pair(page, base_url, tmp_path, result, STC10)
    rows = page.get_by_test_id("thread-row")
    expect(rows).to_have_count(6)
    expect(rows.nth(0)).to_contain_text("disagrees")
    expect(rows.nth(0)).to_contain_text("0.004 in [0.10 mm] off the hole's axis · finding F26")
    expect(rows.nth(1)).to_contain_text("Not mapped: external thread: not on a hole. Our limit, not a finding.")
    assert rows.nth(1).evaluate("e => e.tagName") == "DIV"  # no hole: plain text, not a button
    expect(page.get_by_test_id("finding-F26")).to_contain_text("M3x0.5 thread on hole-38: 0.10 mm off the hole's axis")


def test_no_threads_and_no_ipt(page: Page, base_url: str, tmp_path):
    result = fixture("stc_10")
    result["inventor"]["threads"] = []
    for f in result["features"]:
        f.pop("thread", None)
    result["findings"] = [f for f in result["findings"] if f["rule"] != "thread_mismatch"]
    open_pair(page, base_url, tmp_path, result, STC10)
    panel = page.get_by_test_id("threads-panel")
    expect(panel).to_be_visible()
    expect(panel).not_to_have_attribute("open", "")  # folded when there are none
    expect(page.locator("#threads-count")).to_have_text("0")
    panel.locator("summary").click()
    expect(panel).to_contain_text("No threads in this .ipt.")
    # Only a STEP: no panel, as before S2
    del result["inventor"]
    page.unroute("**/api/analyze")
    page.route("**/api/analyze", lambda r: r.fulfill(status=200, content_type="application/json",
                                                       body=json.dumps(result)))
    page.get_by_test_id("upload-ipt").set_input_files([])
    page.get_by_test_id("upload-file").set_input_files(PARTS / "box_through_hole.step")
    expect(page.locator("#status")).to_have_text(f"Showing {result['part']['name']}.")
    open_step(page, "features")
    expect(panel).to_be_hidden()
