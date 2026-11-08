"""I1 S1 in the browser: the two file fields (D-034), the .ipt checks' messages, a pair shown."""

from __future__ import annotations

import json
import shutil

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS
from nist_files import ap242_files

from dfma import settings
from dfma.analyze import analyze

pytestmark = pytest.mark.e2e
INV = PARTS.parent / "inventor" / "files"
BOX = PARTS / "box_through_hole.step"


def test_ipt_first_waits(page: Page, base_url: str):
    page.goto(base_url)
    calls = []
    page.on("request", lambda r: calls.append(r.url) if "/api/analyze" in r.url else None)
    page.get_by_test_id("upload-ipt").set_input_files(INV / "INV_nist_ftc_11_asme1_2021.ipt")
    expect(page.locator("#status")).to_have_text("Now choose the STEP file that Inventor exported from this .ipt.")
    assert calls == []


def test_ipt_in_step_field(page: Page, base_url: str, tmp_path):
    page.goto(base_url)
    calls = []
    page.on("request", lambda r: calls.append(r.url) if "/api/analyze" in r.url else None)
    p = tmp_path / "part.ipt"
    shutil.copyfile(INV / "INV_nist_ftc_11_asme1_2021.ipt", p)
    page.get_by_test_id("upload-file").set_input_files(p)
    expect(page.get_by_test_id("error-message")).to_have_text(settings.MSG_IPT_NEEDS_STEP)
    assert calls == []


def test_nist_pair_refused(page: Page, base_url: str):
    page.goto(base_url)
    step = next(p for p in ap242_files() if p.name.startswith("nist_ctc_04_asme1_ap242"))
    page.get_by_test_id("upload-ipt").set_input_files(INV / "INV_nist_ctc_04_asme1_2021.ipt")
    page.get_by_test_id("upload-file").set_input_files(step)
    expect(page.get_by_test_id("error-message")).to_have_text(
        "These files don't match: the STEP has 483 faces, the .ipt 368. Export the STEP again from this .ipt "
        "and upload both.", timeout=30_000)
    expect(page.locator("#summary")).to_be_hidden()


def test_pair_shown(page: Page, base_url: str):
    """A passing pair, answered through page.route (no work pair in the repo, D-032): the bar shows the build."""
    result = analyze(BOX, BOX.name)
    result["inventor"] = {"name": "box.ipt", "saved_with": "2024.1 (Build 281209000, 209)",
                          "acis_version": "229.6.0.65535",
                          "checks": {"faces": [8, 8], "corners": [10, 10], "worst_corner_gap_mm": 0.0}}
    bodies = []

    def answer(route):
        bodies.append(route.request.post_data_buffer or b"")
        route.fulfill(status=200, content_type="application/json", body=json.dumps(result))

    page.route("**/api/analyze", answer)
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(BOX)
    expect(page.locator("#status")).to_have_text(f"Showing {BOX.name} with box.ipt.")  # the routed answer has it
    page.get_by_test_id("upload-ipt").set_input_files(INV / "INV_nist_ftc_11_asme1_2021.ipt")
    expect(page.get_by_test_id("ipt-build")).to_have_text("2024.1 (Build 281209000, 209)")
    expect(page.locator("#inventor-meta")).to_be_visible()
    assert len(bodies) == 2
    assert b'name="ipt"' not in bodies[0] and b'name="ipt"' in bodies[1]  # sent only once picked
