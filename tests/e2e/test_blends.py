"""I3 S3 J5 in the browser: the Fillets and chamfers panel (D-043, mockups/blends-panel.html), answered with the
CTC 04 and STC 10 fixtures through page.route (lined up by the test harness; the app refuses NIST pairs)."""

from __future__ import annotations

import json

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS
from test_hole_features import CTC04, open_pair

pytestmark = pytest.mark.e2e
FIXTURES = PARTS.parent / "inventor" / "fixtures"
STC10 = ("nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt")


def test_panel(page: Page, base_url: str, tmp_path):
    """CTC 04: 7 fillets and 1 chamfer, all matched, so the panel starts folded; tapping a row selects its faces."""
    result = json.loads((FIXTURES / "ctc_04.json").read_text("utf-8"))
    open_pair(page, base_url, tmp_path, result, CTC04)
    panel = page.get_by_test_id("blends-panel")
    expect(panel).to_be_visible()
    expect(panel).not_to_have_attribute("open", "")  # all matched (D-043)
    expect(page.locator("#blends-count")).to_have_text("8")
    page.locator("#blends-panel > summary").click()
    expect(panel).to_contain_text("From INV_nist_ctc_04_asme1_2021.ipt: 7 fillets, 1 chamfer: 8 matched, 0 disagree, "
                                  "0 not mapped. Sizes as designed in the .ipt.")
    rows = page.get_by_test_id("blend-row")
    expect(rows).to_have_count(8)
    expect(rows.nth(1)).to_contain_text("Chamfer · 0.197 in [5 mm] × 0.197 in [5 mm], 90°")
    expect(rows.nth(1)).to_contain_text("12 of 24 faces found in the STEP")
    last = rows.nth(7)
    expect(last).to_contain_text("Fillet · R0.197 in [5 mm]")
    expect(last).to_contain_text("32 of 36 faces found in the STEP · copied by 1 pattern or mirror feature")
    blend = result["inventor"]["blends"][7]
    last.click()
    expect(last).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("window.__dfma.highlightedFaces()") == sorted(blend["step_faces"])
    last.click()  # tapping again clears it
    expect(last).to_have_attribute("aria-pressed", "false")
    assert page.evaluate("window.__dfma.highlightedFaces()") == []


def test_panel_opens_for_not_mapped(page: Page, base_url: str, tmp_path):
    """STC 10: the 0.15 mm fillet has no STEP face at its place: the panel opens by itself and says why, as plain
    text (never a finding); the row can't be tapped."""
    result = json.loads((FIXTURES / "stc_10.json").read_text("utf-8"))
    open_pair(page, base_url, tmp_path, result, STC10)
    panel = page.get_by_test_id("blends-panel")
    expect(panel).to_have_attribute("open", "")
    rows = page.get_by_test_id("blend-row")
    expect(rows).to_have_count(4)
    lone = rows.nth(2)
    expect(lone).to_contain_text("not mapped")
    expect(lone).to_contain_text("Not mapped: no STEP face of its shape at its place. Our limit, not a finding.")
    assert lone.evaluate("e => e.tagName") == "DIV"
    assert not [f for f in result["findings"] if f["rule"] == "blend_mismatch"]


def test_panel_hidden_without_ipt(page: Page, base_url: str, tmp_path):
    result = json.loads((FIXTURES / "ctc_04.json").read_text("utf-8"))
    result.pop("inventor")
    page.route("**/api/analyze", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(result)))
    page.goto(base_url)
    step = tmp_path / CTC04[0]
    step.write_text("placeholder")
    page.get_by_test_id("upload-file").set_input_files(step)
    expect(page.locator("#status")).to_have_text(f"Showing {result['part']['name']}.")
    expect(page.get_by_test_id("blends-panel")).to_be_hidden()
