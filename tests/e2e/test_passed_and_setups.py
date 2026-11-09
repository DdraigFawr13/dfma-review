"""D-023 in the browser, moved to the Features rows (review-steps S2, frame r3-passed): the Passed chip groups the
features with no finding by kind and check; an open passed row shows each feature's math and a feature selects its
faces. A setup in the Machining step selects its features and shows why."""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS
from steps import open_step, shown

from dfma.analyze import analyze

pytestmark = pytest.mark.e2e


def test_passed_list(page: Page, base_url: str):
    r = analyze(PARTS / "clean_one_setup.step", "clean_one_setup.step")
    hole = next(f for f in r["features"] if f["id"] == "hole-2")
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "clean_one_setup.step")
    shown(page, "clean_one_setup.step")
    expect(page.get_by_test_id("chip-passed")).to_have_text("Passed 16")  # 16 features, as before
    expect(page.get_by_test_id("chip-issues")).to_have_attribute("aria-pressed", "true")  # issues first
    expect(page.get_by_test_id("passed-hole-2")).to_have_count(0)  # passed rows wait behind their chip
    page.get_by_test_id("chip-passed").click()
    holes = page.get_by_test_id("row-pass-hole-hole_depth")
    expect(holes).to_contain_text("Holes ×")
    expect(holes).to_contain_text("Hole depth check")
    holes.click()
    row = page.get_by_test_id("passed-hole-2")
    expect(row).to_contain_text("hole-2 · 0.250 in (1/4) diameter, 0.500 in deep")  # what the feature is (D-023)
    expect(row).to_contain_text("✓ Depth 2.0× diameter, at most 6.0×")
    expect(row.locator(".pmath")).to_contain_text(
        "0.5000 in deep ÷ 0.2500 in diameter = 2.00× ≤ 6.0× · limit is an estimate")
    row.click()
    expect(page.get_by_test_id("passed-hole-2")).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("window.__dfma.highlightedFaces()") == sorted(hole["faces"])
    # A material change re-analyses the same file: the chip, the open row and the selection are kept.
    open_step(page, "part")  # process and material sit in the overview once a part is read
    with page.expect_response(lambda r: r.url.endswith("/api/analyze"), timeout=30_000):
        page.select_option("#material", "plastic")
    expect(page.locator("#status")).to_have_text("Showing clean_one_setup.step.", timeout=30_000)
    open_step(page, "features")
    expect(page.get_by_test_id("chip-passed")).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_test_id("passed-hole-2")).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("window.__dfma.highlightedFaces()") == sorted(hole["faces"])
    page.get_by_test_id("passed-hole-2").click()  # again: back to the whole row
    expect(page.get_by_test_id("passed-hole-2")).to_have_attribute("aria-pressed", "false")
    page.get_by_test_id("row-pass-hole-hole_depth").click()  # the open row again: closes it, clears the selection
    assert page.evaluate("window.__dfma.highlightedFaces()") == []
    expect(page.get_by_test_id("passed-hole-2")).to_have_count(0)
    # A new file starts on its issues again, no row open (D-023: passed detail folded by default).
    page.get_by_test_id("upload-file").set_input_files(PARTS / "two_sided_block.step")
    expect(page.get_by_test_id("chip-passed")).to_have_text("Passed 25", timeout=30_000)
    expect(page.get_by_test_id("chip-issues")).to_have_attribute("aria-pressed", "true")


def test_passed_open_at_200_percent_text_has_no_sideways_scroll(page: Page, base_url: str):
    page.set_viewport_size({"width": 1280, "height": 900})
    page.goto(base_url)
    page.add_style_tag(content="html { font-size: 200% !important; }")
    page.get_by_test_id("upload-file").set_input_files(PARTS / "clean_one_setup.step")
    shown(page, "clean_one_setup.step")
    page.get_by_test_id("chip-passed").click()
    page.get_by_test_id("row-pass-hole-hole_depth").click()
    page.get_by_test_id("passed-hole-2").click()
    assert page.evaluate("document.documentElement.scrollWidth") <= 1280
    open_step(page, "machining")
    page.get_by_test_id("plan-setup-1").click()
    assert page.evaluate("document.documentElement.scrollWidth") <= 1280


def test_setup_select_shows_why(page: Page, base_url: str):
    r = analyze(PARTS / "two_sided_block.step", "two_sided_block.step")
    hole = next(f for f in r["features"] if f["kind"] == "hole")
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "two_sided_block.step")
    shown(page, "two_sided_block.step", "machining")
    expect(page.get_by_test_id("plan-why")).to_contain_text("The fewest directions that reach them all: +Z, −Z, −X.")
    page.get_by_test_id("plan-setup-3").click()
    expect(page.get_by_test_id("plan-setup-why-3")).to_contain_text(
        "hole-1 opens −X. 0.250 in (1/4) drill: matches its 0.250 in diameter.")
    assert page.evaluate("window.__dfma.highlightedFaces()") == sorted(hole["faces"])
    page.get_by_test_id("plan-setup-3").click()  # again: clears it
    assert page.evaluate("window.__dfma.highlightedFaces()") == []


def test_setup_select_lights_the_countersink(page: Page, base_url: str):
    """Morgan, 2026-11-08: the setup also selects the countersink surface it cuts."""
    r = analyze(PARTS / "countersunk_hole.step", "countersunk_hole.step")
    hole = next(f for f in r["features"] if f["kind"] == "hole")
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "countersunk_hole.step")
    shown(page, "countersunk_hole.step", "machining")
    expect(page.get_by_test_id("plan-setup-1")).to_be_visible()
    page.get_by_test_id("plan-setup-1").click()
    assert page.evaluate("window.__dfma.highlightedFaces()") == sorted(hole["faces"] + hole["countersink_faces"])
