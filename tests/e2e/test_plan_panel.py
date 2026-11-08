"""J4 in the browser (S5): the machine plan panel shows the machine, the setups with their tools, and the
tool-load count; a feature the access rule flags is listed as in no setup."""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS

pytestmark = pytest.mark.e2e


def test_plan_panel_two_sided_block(page: Page, base_url: str):
    page.goto(base_url)
    expect(page.get_by_test_id("plan")).to_be_hidden()
    page.get_by_test_id("upload-file").set_input_files(PARTS / "two_sided_block.step")
    expect(page.get_by_test_id("plan-machine")).to_have_text("3-axis mill", timeout=30_000)
    expect(page.get_by_test_id("plan-loads")).to_have_text("5 (including the first in each setup)")  # D-029
    expect(page.locator("#plan-count")).to_have_text("3 setups")
    expect(page.get_by_test_id("plan-setup-1")).to_contain_text("Setup 1 · from +Z")
    expect(page.get_by_test_id("plan-setup-1")).to_contain_text("1. 1/2 in end mill em-0.500")  # roughs
    expect(page.get_by_test_id("plan-setup-1")).to_contain_text("2. 1/4 in end mill em-0.250")  # finishes
    page.get_by_test_id("plan-setup-1").click()
    expect(page.get_by_test_id("plan-setup-why-1")).to_contain_text(
        "1/2 in end mill: roughs it out, the largest at most 75% of its 0.750 in gap.")
    expect(page.get_by_test_id("plan-setup-3")).to_contain_text("Setup 3 · from −X")
    expect(page.get_by_test_id("plan-setup-3")).to_contain_text("0.250 in (1/4) drill dr-0.2500")
    expect(page.get_by_test_id("plan-setup-3")).to_contain_text("hole-1")
    expect(page.get_by_test_id("plan-not-planned")).to_have_count(0)


def test_plan_panel_angled_hole(page: Page, base_url: str):
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "angled_hole.step")
    expect(page.get_by_test_id("plan-machine")).to_have_text("4/5-axis mill or fixture", timeout=30_000)
    expect(page.get_by_test_id("plan-loads")).to_have_text("0 (including the first in each setup)")
    expect(page.get_by_test_id("plan-setup-1")).to_contain_text("Nothing to cut from this side.")
    expect(page.get_by_test_id("plan-not-planned")).to_contain_text("hole-1 (F1)")
    expect(page.get_by_test_id("finding-F1")).to_contain_text("needs a 4/5-axis mill or a fixture")
    expect(page.get_by_test_id("finding-F1")).to_contain_text("high")
