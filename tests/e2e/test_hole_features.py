"""I2 S1 J1 in the browser: the Hole features panel (D-040, mockups/hole-features-panel.html), answered with the
CTC 04 and STC 10 fixtures through page.route (lined up by the test harness; the app refuses NIST pairs)."""

from __future__ import annotations

import json

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS
from steps import open_step

pytestmark = pytest.mark.e2e
FIXTURES = PARTS.parent / "inventor" / "fixtures"
CTC04 = ("nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt")


def open_pair(page: Page, base_url: str, tmp_path, result: dict, names) -> None:
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


def test_panel(page: Page, base_url: str, tmp_path):
    result = json.loads((FIXTURES / "ctc_04.json").read_text("utf-8"))
    open_pair(page, base_url, tmp_path, result, CTC04)
    panel = page.get_by_test_id("hole-features-panel")
    expect(panel).to_be_visible()
    expect(panel).to_have_attribute("open", "")  # opens: holes disagree (D-040)
    expect(page.locator("#hole-features-count")).to_have_text("9")
    expect(panel).to_contain_text("From INV_nist_ctc_04_asme1_2021.ipt: 9 Hole features, 54 holes: 40 matched, "
                                  "13 disagree, 1 not mapped.")
    rows = page.get_by_test_id("hole-feature-row")
    expect(rows).to_have_count(9)
    big = rows.nth(6)
    expect(big).to_contain_text("disagrees")
    expect(big).to_contain_text("Countersink · 30 holes")
    expect(big).to_contain_text("Ø0.551 in [14 mm] through · countersink Ø0.787 in [20 mm] × 90° (as designed in the .ipt)")
    expect(big).to_contain_text("26 matched, 4 disagree, 0 not mapped")
    expect(page.get_by_test_id("hole-feature-hole")).to_have_count(0)  # folded until tapped
    # Tapping a feature selects all its mapped holes and unfolds its disagreeing ones
    feat = next(f for f in result["inventor"]["hole_features"] if f["id"] == "hf-7")
    by_id = {f["id"]: f for f in result["features"]}
    faces = sorted({i for h in feat["holes"] if h["hole"] for i in by_id[h["hole"]]["faces"]})
    big.click()
    expect(big).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("window.__dfma.highlightedFaces()") == faces
    holes = page.get_by_test_id("hole-feature-hole")
    expect(holes).to_have_count(4)
    first = next(h for h in feat["holes"] if h["state"] == "disagrees")
    assert first["gaps"][0]["text"].endswith("mm] off the hole's axis")  # 0.25-0.26 mm: NIST's two files differ
    expect(holes.first).to_contain_text(f"{first['gaps'][0]['text']} · finding F35")
    # Tapping a hole selects it alone
    one = next(h for h in feat["holes"] if h["state"] == "disagrees")
    holes.first.click()
    expect(holes.first).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("window.__dfma.highlightedFaces()") == sorted(by_id[one["hole"]]["faces"])
    # A feature with no mapped hole still unfolds, to show its hole's reason as plain text (never a finding)
    expect(rows.nth(7)).to_contain_text("not mapped")
    rows.nth(7).click()
    lone = page.get_by_test_id("hole-feature-hole")
    expect(lone).to_have_count(1)
    assert lone.first.evaluate("e => e.tagName") == "DIV"
    expect(lone.first).to_contain_text("Not mapped: no hole on this axis. Our limit, not a finding.")


def test_panel_hidden_without_ipt(page: Page, base_url: str, tmp_path):
    result = json.loads((FIXTURES / "ctc_04.json").read_text("utf-8"))
    result.pop("inventor")
    page.route("**/api/analyze", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(result)))
    page.goto(base_url)
    step = tmp_path / CTC04[0]
    step.write_text("placeholder")
    page.get_by_test_id("upload-file").set_input_files(step)
    expect(page.locator("#status")).to_have_text(f"Showing {result['part']['name']}.")
    open_step(page, "features")
    expect(page.get_by_test_id("hole-features-panel")).to_be_hidden()


STC10 = ("nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt")


def test_names(page: Page, base_url: str, tmp_path):
    """I2 S2: CTC 04's Hole features and threads show their Inventor names in small print (rank rule)."""
    result = json.loads((FIXTURES / "ctc_04.json").read_text("utf-8"))
    open_pair(page, base_url, tmp_path, result, CTC04)
    rows = page.get_by_test_id("hole-feature-row")
    names = ["Hole8", "Hole10", "Hole11", "Hole12", "Hole13", "Hole19", "Hole20", "Hole21", "Hole22"]
    for i, n in enumerate(names):
        expect(rows.nth(i).locator(".fname")).to_have_text(n)
    expect(page.get_by_test_id("hole-features-panel")).not_to_contain_text("in the browser")
    threads = page.get_by_test_id("thread-row")
    expect(threads.first.locator(".fname")).to_have_text("Hole8")


def test_no_names_and_copies(page: Page, base_url: str, tmp_path):
    """I2 S2: STC 10 has 11 Hole names for 9 features read, so no names; its first feature has 2 copied holes."""
    result = json.loads((FIXTURES / "stc_10.json").read_text("utf-8"))
    open_pair(page, base_url, tmp_path, result, STC10)
    panel = page.get_by_test_id("hole-features-panel")
    expect(panel).to_contain_text("11 Hole features in the browser, 9 read.")
    expect(panel.locator(".fname")).to_have_count(0)
    expect(page.get_by_test_id("threads-panel").locator(".fname")).to_have_count(0)
    expect(page.get_by_test_id("hole-feature-row").first).to_contain_text(
        "4 holes: 2 drawn, 2 copied by 1 pattern or mirror feature")
