"""J5 in the browser (S6): a shaft reviewed for turning shows the turning axis, "lathe with live tooling", one
lathe setup that lights every face its tools cut, the two turning findings and the Passed list; the same part
for milling plans only the cross hole (Morgan's comparison). D-023: the Passed list and selectable setups apply
to turned parts too."""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS

from dfma.analyze import analyze

pytestmark = pytest.mark.e2e


def _upload(page: Page, base_url: str, name: str, process: str, material: str = "steel1018") -> None:
    page.goto(base_url)
    page.get_by_test_id("upload-process").select_option(process)
    page.get_by_test_id("upload-material").select_option(material)
    page.get_by_test_id("upload-file").set_input_files(PARTS / name)


def test_slender_shaft_on_the_lathe(page: Page, base_url: str):
    r = analyze(PARTS / "slender_shaft.step", "slender_shaft.step", "turn", "steel1018")
    _upload(page, base_url, "slender_shaft.step", "turn")
    expect(page.get_by_test_id("plan-machine")).to_have_text("lathe with live tooling", timeout=30_000)
    expect(page.get_by_test_id("plan-turn-axis")).to_have_text("along −Z of the part")
    expect(page.get_by_test_id("plan-stock")).to_have_text(
        "0.500 in round bar, 4.500 in long (the part's size; no allowance added)")
    expect(page.locator("#plan-count")).to_have_text("1 setup")
    expect(page.get_by_test_id("verdict")).to_contain_text("1 turned profile, 1 hole and 1 wall checked")
    expect(page.get_by_test_id("plan-loads")).to_have_text("3 (including the first in each setup)")
    expect(page.get_by_test_id("plan-why")).to_have_text(
        "Turned in one setup about its axis. Off the axis, cut with live tooling: hole-1.")
    setup = page.get_by_test_id("plan-setup-1")
    expect(setup).to_contain_text("Setup 1 · on the lathe, about the turning axis")
    expect(setup).to_contain_text("Rough turning tool turn-rough")
    expect(setup).to_contain_text("0.125 in (1/8) drill dr-0.1250")
    setup.click()
    why = page.get_by_test_id("plan-setup-why-1").inner_text()
    # In the order the operations run (Morgan, 2026-11-08): 1. turn the outside, 2. drill the cross hole
    assert (why.index("1. profile-1 is the turned outside") < why.index("2. profile-1 is the turned outside")
            < why.index("3. hole-1 is off the turning axis: live tooling.")), why
    expect(setup).to_contain_text("1. Rough turning tool turn-rough")
    expect(setup).to_contain_text("2. Finish turning tool turn-finish")
    expect(setup).to_contain_text("3. 0.125 in (1/8) drill dr-0.1250")
    expect(page.get_by_test_id("plan-setup-why-1")).to_contain_text(
        "profile-1 is the turned outside. Rough turning tool: turns the 0.500 in outside and faces the ends")
    cut = sorted({i for o in r["operations"] for i in o["faces"]})
    assert page.evaluate("window.__dfma.highlightedFaces()") == cut
    expect(page.get_by_test_id("finding-F1")).to_contain_text("Length 9.0× diameter (limit 8.0×)")
    expect(page.get_by_test_id("finding-F1")).to_contain_text("profile-1 · 0.500 in (1/2) diameter, 4.500 in long")
    expect(page.get_by_test_id("finding-F2")).to_contain_text(
        "Hole not on the turning axis: needs a milling operation or live tooling")
    expect(page.get_by_test_id("finding-F2")).to_contain_text("90.0° to the turning axis. Cut it with live tooling")
    expect(page.get_by_test_id("passed")).to_contain_text("1 feature · 1 check")  # the wall
    page.get_by_test_id("passed").locator("summary").click()
    expect(page.get_by_test_id("passed-profile-1")).to_have_count(0)  # flagged: in a finding, never in Passed


def test_clean_shaft_passed_list(page: Page, base_url: str):
    _upload(page, base_url, "clean_shaft.step", "turn", "al6061")
    expect(page.get_by_test_id("plan-machine")).to_have_text("lathe", timeout=30_000)
    page.get_by_test_id("passed").locator("summary").click()
    row = page.get_by_test_id("passed-profile-1")
    expect(row).to_contain_text("1.000 in (1) diameter, 3.000 in long")
    expect(row).to_contain_text("Round faces on one axis: a lathe part")
    expect(row).to_contain_text("Length 4.0× its smallest diameter, 0.750 in, at most 4.0×")
    expect(page.get_by_test_id("passed-hole-1")).to_contain_text("On the turning axis: cut on the lathe")


def test_inside_groove_note(page: Page, base_url: str):
    """D-026: the plan says an inside groove is not cut by every shop."""
    _upload(page, base_url, "shaft_with_groove_and_bore.step", "turn")
    expect(page.get_by_test_id("plan-setup-1")).to_be_visible(timeout=30_000)
    page.get_by_test_id("plan-setup-1").click()
    why = page.get_by_test_id("plan-setup-why-1")
    expect(why).to_contain_text("groove-1 is a groove on the axis.")
    expect(why).to_contain_text("groove-2 is an inside groove on the axis; not every shop cuts inside grooves")


def test_slender_shaft_for_milling(page: Page, base_url: str):
    _upload(page, base_url, "slender_shaft.step", "mill")
    expect(page.get_by_test_id("plan-machine")).to_have_text("3-axis mill", timeout=30_000)
    expect(page.get_by_test_id("plan-turn-axis")).to_have_count(0)
    expect(page.get_by_test_id("plan-setup-1")).to_contain_text("Setup 1 · from +X")
    expect(page.get_by_test_id("plan-stock")).to_contain_text("in block (the part's size; no allowance added)")
    expect(page.get_by_test_id("finding-F1")).to_contain_text("This part looks turned; review it for Turning")


def test_block_as_turn_shows_no_plan(page: Page, base_url: str):
    _upload(page, base_url, "block_as_turn.step", "turn", "al6061")
    expect(page.get_by_test_id("finding-F1")).to_contain_text("No turning axis found; check the process",
                                                              timeout=30_000)
    expect(page.get_by_test_id("finding-F1")).to_contain_text("limit: assumption")
    expect(page.get_by_test_id("plan-machine")).to_have_count(0)


def test_part_wide_pin_does_not_hide_the_cross_hole(page: Page, base_url: str):
    """D-027 (Morgan, 2026-11-08: "I don't see that off center hole"): the length finding's pin covers the
    whole outside, so it moves to a free spot of its faces instead of sitting on the cross hole."""
    _upload(page, base_url, "slender_shaft.step", "turn")
    expect(page.get_by_test_id("finding-F2")).to_be_visible(timeout=30_000)
    page.wait_for_timeout(300)
    state = {s["id"]: s for s in page.evaluate("window.__dfma.flagState()")}
    assert state["F1"]["shown"] and state["F2"]["shown"], state
    assert state["F1"]["mergedInto"] == "" and state["F2"]["mergedInto"] == "", state
    one = page.locator('.viewer .flag[data-id="F1"]').bounding_box()
    two = page.locator('.viewer .flag[data-id="F2"]').bounding_box()
    apart = (one["x"] + one["width"] <= two["x"] or two["x"] + two["width"] <= one["x"]
             or one["y"] + one["height"] <= two["y"] or two["y"] + two["height"] <= one["y"])
    assert apart, (one, two)


def test_flange_bolt_hole(page: Page, base_url: str):
    """Morgan, 2026-11-08: an off-centre hole parallel to the axis needs live tooling too."""
    _upload(page, base_url, "flange_bolt_hole.step", "turn")
    expect(page.get_by_test_id("plan-machine")).to_have_text("lathe with live tooling", timeout=30_000)
    expect(page.get_by_test_id("finding-F1")).to_contain_text(
        "Hole not on the turning axis: needs a milling operation or live tooling")
    expect(page.get_by_test_id("finding-F1")).to_contain_text("0.7500 in off the turning axis")
