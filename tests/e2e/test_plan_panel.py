"""J4 in the browser (S5; the Machining step, review-steps S3): the machine, the setups with their tools (names only,
no tool codes, D-042), and the tool-load count; a feature the access rule flags is listed in no setup."""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS
from steps import open_step, shown

pytestmark = pytest.mark.e2e


def test_plan_panel_two_sided_block(page: Page, base_url: str):
    page.goto(base_url)
    expect(page.get_by_test_id("plan")).to_be_hidden()
    page.get_by_test_id("upload-file").set_input_files(PARTS / "two_sided_block.step")
    shown(page, "two_sided_block.step", "machining")
    expect(page.get_by_test_id("plan-machine")).to_have_text("3-axis mill")
    expect(page.get_by_test_id("plan-loads")).to_have_text("5 (the first in each setup counts)")  # D-029; frame r3-mach words
    expect(page.locator("#plan-count")).to_have_text("3 setups")
    expect(page.get_by_test_id("plan-setup-1")).to_contain_text("Setup 1 · from +Z")
    expect(page.get_by_test_id("plan-setup-1").locator(".shint")).to_have_text("Show on model ›")  # D-061, both copies
    expect(page.get_by_test_id("plan-notrun")).to_be_hidden()  # no pocket line in the Python app
    expect(page.get_by_test_id("plan-setup-1")).to_contain_text("1. 1/2 in end mill")  # roughs
    expect(page.get_by_test_id("plan-setup-1")).to_contain_text("2. 1/4 in end mill")  # finishes
    expect(page.get_by_test_id("plan-setup-1")).not_to_contain_text("em-0.500")  # no tool codes on screen
    page.get_by_test_id("plan-setup-1").click()
    expect(page.get_by_test_id("plan-setup-why-1")).to_contain_text(
        "1/2 in end mill: roughs it out, the largest at most 75% of its 0.750 in gap.")
    expect(page.get_by_test_id("plan-setup-3")).to_contain_text("Setup 3 · from −X")
    expect(page.get_by_test_id("plan-setup-3")).to_contain_text("0.250 in (1/4) drill")
    expect(page.get_by_test_id("plan-setup-3")).to_contain_text("hole-1")
    expect(page.get_by_test_id("plan-not-planned")).to_have_count(0)


def test_plan_panel_angled_hole(page: Page, base_url: str):
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "angled_hole.step")
    shown(page, "angled_hole.step", "machining")
    expect(page.get_by_test_id("plan-machine")).to_have_text("4/5-axis mill or fixture")
    expect(page.get_by_test_id("plan-loads")).to_have_text("0 (the first in each setup counts)")
    expect(page.get_by_test_id("plan-setup-1")).to_contain_text("Nothing to cut from this side.")
    expect(page.get_by_test_id("plan-not-planned")).to_contain_text("hole-1 (F1)")
    expect(page.get_by_test_id("issues-no-setup")).to_contain_text("Fix Angled feature F1")
    open_step(page, "features")
    expect(page.get_by_test_id("row-F1")).to_contain_text("needs a 4/5-axis mill or a fixture")
    expect(page.get_by_test_id("row-F1")).to_contain_text("Fix")


def test_setup_card_focus_and_size(page: Page, base_url: str):
    """D-061 (S3 review): the setup card's focus ring sits inside the card, which clips what overflows it, and its
    head band is at least 32 px tall, 44 px below 900 px (docs/UI_STYLE.md, audit F16). Both copies."""
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "clean_holes.step")
    shown(page, "clean_holes.step", "machining")
    setup = page.get_by_test_id("plan-setup-1")
    assert setup.locator(".shead").bounding_box()["height"] >= 32
    setup.focus()
    page.keyboard.press("Tab")
    page.keyboard.press("Shift+Tab")  # focus by keyboard, so :focus-visible applies
    style = setup.evaluate("e => [e.matches(':focus-visible'), getComputedStyle(e).outlineStyle, getComputedStyle(e).outlineOffset,"
                           " getComputedStyle(e).outlineWidth]")
    assert style[0] and style[1] == "solid", style
    assert float(style[2].rstrip("px")) + float(style[3].rstrip("px")) <= 0, style  # drawn inside the card
    page.set_viewport_size({"width": 412, "height": 915})
    assert setup.locator(".shead").bounding_box()["height"] >= 44
