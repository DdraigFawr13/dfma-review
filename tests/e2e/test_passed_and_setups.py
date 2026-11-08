"""D-023 (proposed) in the browser: the Passed list is collapsed by default and a row shows its math and selects
its faces; a setup in the Machine plan selects its features and shows why."""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS

from dfma.analyze import analyze

pytestmark = pytest.mark.e2e


def test_passed_list(page: Page, base_url: str):
    r = analyze(PARTS / "clean_one_setup.step", "clean_one_setup.step")
    hole = next(f for f in r["features"] if f["id"] == "hole-2")
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "clean_one_setup.step")
    passed = page.get_by_test_id("passed")
    expect(passed).to_contain_text("16 features · 22 checks", timeout=30_000)
    expect(passed).not_to_have_attribute("open", "")  # collapsed by default
    expect(page.get_by_test_id("passed-hole-2")).to_be_hidden()
    passed.locator("summary").click()
    row = page.get_by_test_id("passed-hole-2")
    expect(row).to_contain_text("hole depth: Depth 2.0× diameter, at most 6.0×")
    expect(row.locator(".pmath").first).to_be_hidden()
    row.click()
    expect(page.get_by_test_id("passed-hole-2")).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_test_id("passed-hole-2").locator(".pmath").first).to_contain_text(
        "0.500 in deep ÷ 0.250 in diameter = 2.00× ≤ 6.0× · limit: estimate")
    assert page.evaluate("window.__dfma.highlightedFaces()") == sorted(hole["faces"])
    expect(page.get_by_test_id("passed")).to_have_attribute("open", "")  # stays open while selecting


def test_setup_select_shows_why(page: Page, base_url: str):
    r = analyze(PARTS / "two_sided_block.step", "two_sided_block.step")
    hole = next(f for f in r["features"] if f["kind"] == "hole")
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "two_sided_block.step")
    expect(page.get_by_test_id("plan-why")).to_contain_text("The fewest directions that reach them all: +Z, −Z, −X.",
                                                         timeout=30_000)
    page.get_by_test_id("plan-setup-3").click()
    expect(page.get_by_test_id("plan-setup-why-3")).to_contain_text(
        "hole-1 opens −X. 0.250 in (1/4) drill: matches its 0.250 in diameter.")
    assert page.evaluate("window.__dfma.highlightedFaces()") == sorted(hole["faces"])
    page.get_by_test_id("plan-setup-3").click()  # again: clears it
    assert page.evaluate("window.__dfma.highlightedFaces()") == []
