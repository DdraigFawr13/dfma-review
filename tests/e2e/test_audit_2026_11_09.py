"""The 2026-11-09 UX audit's fixes in the browser (docs/audit/2026-11-09-ux.md, D-053). Each test is named after the
finding it closes and asserts the behaviour that finding names; each failed before its fix."""

from __future__ import annotations

import re

import pytest
from playwright.sync_api import Page, expect
from pypdf import PdfReader

from helpers import PARTS
from steps import STEPS, load, open_step

pytestmark = pytest.mark.e2e
SAMPLE = PARTS / "report_sample.step"
INTERNAL = re.compile(r"D-0\d\d|config/|\(spec\b")  # decision ids, file names and spec refs (F1)
BRITISH = re.compile(r"analys(?:e|ed|es|ing)\b|neighbour|millimetre|colour|centre", re.I)  # F12: American spelling


def narrow(page: Page, big_text: bool = False) -> None:
    """412 px wide, as the audit's narrow screenshots; `big_text`: 200% text, as a reader's browser setting."""
    page.set_viewport_size({"width": 412, "height": 915})
    if big_text:
        page.add_init_script("document.addEventListener('DOMContentLoaded', () => {"
                             " document.documentElement.style.fontSize = '200%'; })")


def open_corner_row(page: Page) -> None:
    open_step(page, "features")
    page.get_by_test_id("row-F4").click()
    expect(page.get_by_test_id("row-detail")).to_be_visible()


def body_text(page: Page) -> str:
    return page.evaluate("document.body.innerText")


def export(page: Page, tmp_path) -> list[str]:
    with page.expect_download() as download:
        page.get_by_test_id("export-pdf").click()
    path = tmp_path / "report.pdf"
    download.value.save_as(path)
    return [p.extract_text().replace("\n", " ") for p in PdfReader(path).pages]


# --- wording ---

def test_f1_f12_no_internal_ids_and_american_spelling_on_screen_or_in_the_pdf(page: Page, base_url: str, tmp_path):
    """F1: no "D-0" or "config/" text anywhere a user reads it; F12: American spelling throughout."""
    page.goto(base_url)
    texts = [body_text(page)]
    load(page, base_url, SAMPLE)
    for name in STEPS:
        open_step(page, name)
        if name == "features":
            for row in page.locator("#rows .srow").all():
                row.click()
                texts.append(body_text(page))
        if name == "machining":
            for i in (1, 2):
                page.get_by_test_id(f"plan-setup-{i}").click()
                texts.append(body_text(page))
        if name == "report":
            page.get_by_test_id("report-assumptions").locator("summary").click()
        texts.append(body_text(page))
    texts += export(page, tmp_path)
    # A turned part with an inside groove: its setup's reasons (findings.ts named D-026 there)
    open_step(page, "part")
    page.get_by_test_id("change-file").click()
    page.get_by_test_id("upload-process").select_option("turn")
    load(page, base_url, PARTS / "shaft_with_groove_and_bore.step")
    open_step(page, "machining")
    page.get_by_test_id("plan-setup-1").click()
    texts.append(body_text(page))
    for t in texts:
        assert not INTERNAL.findall(t), INTERNAL.findall(t)
        assert not BRITISH.findall(t), BRITISH.findall(t)


def test_f2_f6_f7_f34_pdf_words_match_the_screen(page: Page, base_url: str, tmp_path):
    """F2: a finding page is headed with its row's short title and check name; F6: "Tool loads" as on screen;
    F7: "Checks run"; F34: "What to do"."""
    load(page, base_url, SAMPLE)
    pages = export(page, tmp_path)
    assert "Tool loads: 4 (the first in each setup counts)" in pages[0]
    assert "Tool changes" not in pages[0]
    assert "Checks run: Hole depth check" in pages[0]
    f1 = next(p for p in pages[1:] if p.startswith("F1 "))
    assert f1.startswith("F1 · REVIEW · Deep hole · Hole depth check"), f1[:80]
    f4 = next(p for p in pages[1:] if p.startswith("F4 "))
    assert f4.startswith("F4 · FIX · Sharp corner · Corner radius check"), f4[:80]
    assert "What to do:" in f4


def test_f7_f8_f22_f23_report_and_cost_words(page: Page, base_url: str):
    """F7 "Checks run"; F8 "Cost drivers" on the heading and the card; F22 points and "tied"; F23 the PDF list split,
    with Fillets and chamfers, and each check's finding count."""
    load(page, base_url, SAMPLE)
    cost = page.get_by_test_id("overview-cost")
    expect(cost).to_contain_text("7 cost drivers")
    expect(cost).to_contain_text("Biggest: distinct tools and sharp or small inside corners, tied at 4.0 points")
    open_step(page, "cost")
    expect(page.locator("#cost-title")).to_have_text("Cost drivers")
    open_step(page, "report")
    report = page.get_by_test_id("page-report")
    expect(report).to_contain_text("Checks run")
    expect(report).not_to_contain_text("Rules run")
    expect(report).to_contain_text(re.compile("fillets and chamfers", re.I))
    assert report.locator("ul.plain li").count() >= 5
    rules = page.get_by_test_id("report-rules")
    for text in ("Corner radius check: 4 findings", "Hole depth check: 2 findings", "Hole size check: 1 finding",
                 "Undercut check: none"):
        expect(rules).to_contain_text(text)


def test_f34_advice_is_what_to_do_on_both_severities(page: Page, base_url: str):
    load(page, base_url, SAMPLE)
    open_step(page, "features")
    for row in ("row-F4", "row-F1"):  # a Fix row, then a Review row
        page.get_by_test_id(row).click()
        expect(page.get_by_test_id("row-detail").locator("dt").nth(2)).to_have_text("What to do")


def test_f3_error_says_how_to_fix_it_beside_the_file_field(page: Page, base_url: str):
    """F3: the refused file's message says what to do, sits under the STEP file field and describes it; "try again"
    shows only when trying again can help (a network error)."""
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "not_step.step")
    error = page.get_by_test_id("error-message")
    expect(error).to_have_text("This is not a STEP file this tool can read. Export it again as .step or .stp from your CAD.",
                               timeout=30_000)
    expect(page.locator("#error-next")).to_be_hidden()
    assert page.get_by_test_id("upload-file").get_attribute("aria-describedby") == "error"
    # right under the STEP file field: after it, before the .ipt field and the settings
    assert page.evaluate("""() => { const e = document.getElementById('error');
      const step = document.getElementById('file').closest('.field'), ipt = document.getElementById('ipt').closest('.field');
      return e.previousElementSibling === step && !!(e.compareDocumentPosition(ipt) & Node.DOCUMENT_POSITION_FOLLOWING); }""")
    page.route("**/api/analyze", lambda r: r.abort())
    page.get_by_test_id("upload-file").set_input_files(SAMPLE)
    expect(error).not_to_contain_text("python -m")
    expect(page.locator("#error-next")).to_be_visible()
    expect(page.locator("#error-next")).to_contain_text("try again")


# --- layout at narrow widths and 200% text ---

def test_f4_open_row_detail_fits_at_200_percent_text(page: Page, base_url: str):
    narrow(page, big_text=True)
    load(page, base_url, SAMPLE)
    open_corner_row(page)
    detail = page.get_by_test_id("row-detail")
    for dt in detail.locator("dt").all():  # each label fits its text and ends before its value
        assert dt.evaluate("e => e.scrollWidth <= e.clientWidth + 1"), dt.inner_text()
        assert dt.evaluate("e => e.getBoundingClientRect().right <= e.nextElementSibling.getBoundingClientRect().left + 1")
    prev, nxt = page.get_by_test_id("row-prev").bounding_box(), page.get_by_test_id("row-next").bounding_box()
    assert abs(prev["y"] - nxt["y"]) < 2, (prev, nxt)  # ‹ and › stay together on one line


def test_f5_cost_labels_keep_their_width_at_200_percent_text(page: Page, base_url: str):
    narrow(page, big_text=True)
    load(page, base_url, SAMPLE)
    open_step(page, "cost")
    for row in page.locator(".driver:not(.total)").all():
        label, count = row.locator("b"), row.locator(".num.muted")
        assert label.bounding_box()["width"] >= 0.8 * row.bounding_box()["width"] - 30, label.inner_text()
        line = float(count.evaluate("e => parseFloat(getComputedStyle(e).lineHeight)"))
        assert count.bounding_box()["height"] < 1.5 * line, count.inner_text()  # "1 × 1.0" on one line


def test_f17_mark_sits_on_the_title_first_line(page: Page, base_url: str):
    narrow(page, big_text=True)
    load(page, base_url, SAMPLE)
    open_step(page, "features")
    for row in page.locator("#rows .srow").all():
        gap = row.evaluate("""b => { const m = b.querySelector('.mk').getBoundingClientRect();
          const r = document.createRange(); r.selectNodeContents(b.querySelector('.t'));
          const first = r.getClientRects()[0]; return Math.abs((m.top + m.bottom) / 2 - (first.top + first.bottom) / 2); }""")
        line = float(row.evaluate("b => parseFloat(getComputedStyle(b.querySelector('.t')).lineHeight)"))
        assert gap < line / 4, (row.get_attribute("data-testid"), gap, line)


def test_f18_show_ok_sits_under_the_chips_below_900px(page: Page, base_url: str):
    load(page, base_url, SAMPLE)
    open_step(page, "features")
    assert page.evaluate("document.querySelector('.viewer').contains(document.getElementById('show-ok'))")
    page.set_viewport_size({"width": 412, "height": 915})
    page.wait_for_function("""() => { const s = document.getElementById('show-ok'), c = document.getElementById('row-chips');
      return document.getElementById('page-features').contains(s) && c.nextElementSibling === s; }""")  # on the resize event
    expect(page.get_by_test_id("show-ok")).to_be_visible()
    page.set_viewport_size({"width": 1440, "height": 900})  # and back beside the model when wide again
    page.wait_for_function("document.querySelector('.viewer').contains(document.getElementById('show-ok'))")


def test_f20_steps_stay_in_one_row_at_200_percent_text(page: Page, base_url: str):
    narrow(page, big_text=True)
    load(page, base_url, SAMPLE)
    tops = page.locator(".steps .step").evaluate_all("els => els.map((e) => Math.round(e.getBoundingClientRect().top))")
    assert len(set(tops)) == 1, tops
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


def test_f21_fix_first_follows_the_cards_with_no_gap(page: Page, base_url: str):
    page.set_viewport_size({"width": 1440, "height": 900})
    load(page, base_url, SAMPLE)
    gap = page.evaluate("""() => { const cards = document.getElementById('overview-cards');
      return document.getElementById('fix-first').getBoundingClientRect().top - cards.getBoundingClientRect().bottom; }""")
    assert abs(gap) < 2, gap


def test_f16_small_targets_are_44px_below_900px(page: Page, base_url: str):
    narrow(page)
    load(page, base_url, SAMPLE)
    open_corner_row(page)
    for sel in ('[data-testid="row-prev"]', '[data-testid="row-next"]', ".chip"):
        for h in page.locator(sel).evaluate_all("els => els.filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().height)"):
            assert h >= 44, (sel, h)
    page.get_by_test_id("chip-passed").click()
    page.locator("#rows .srow").first.click()
    for h in page.locator(".pfeat").evaluate_all("els => els.map((e) => e.getBoundingClientRect().height)"):
        assert h >= 44, h


def test_f14_passed_feature_states_its_measurement_once(page: Page, base_url: str):
    load(page, base_url, SAMPLE)
    open_step(page, "features")
    page.get_by_test_id("chip-passed").click()
    page.get_by_test_id("row-pass-wall-thin_wall").click()
    text = page.get_by_test_id("passed-wall-1").inner_text()
    assert text.count("4.000 in thick") == 1, text
    assert "4.0000" not in text, text  # the math in the same decimals as its line


# --- ARIA and keyboard ---

def test_f15_rows_announce_one_state_and_point_at_their_detail(page: Page, base_url: str):
    load(page, base_url, SAMPLE)
    open_step(page, "features")
    row = page.get_by_test_id("row-F4")
    assert row.get_attribute("aria-pressed") is None
    expect(row).to_have_attribute("aria-expanded", "false")
    row.click()
    expect(row).to_have_attribute("aria-expanded", "true")
    target = row.get_attribute("aria-controls")
    assert target and page.locator(f"#{target}").get_attribute("data-testid") == "row-detail"


def test_f19_disabled_steps_say_why_and_take_focus(page: Page, base_url: str):
    page.goto(base_url)
    tab = page.get_by_test_id("step-features")
    expect(tab).to_have_attribute("aria-disabled", "true")
    assert tab.get_attribute("disabled") is None  # reachable by Tab, so its reason can be read
    expect(tab).to_have_accessible_description(re.compile("Read a STEP file to open steps 2 to 5"))
    tab.focus()  # Tab reaches it; a click (Playwright won't click an aria-disabled element) does nothing
    tab.dispatch_event("click")
    expect(page.get_by_test_id("page-part")).to_be_visible()
    expect(page.get_by_test_id("page-features")).to_be_hidden()
    load(page, base_url, SAMPLE)
    assert tab.get_attribute("aria-disabled") in (None, "false")


def test_f24_card_heading_is_the_link(page: Page, base_url: str):
    load(page, base_url, SAMPLE)
    expect(page.get_by_test_id("overview")).not_to_contain_text("Open ›")
    link = page.get_by_test_id("overview-machining").locator("h3 button")
    expect(link).to_have_attribute("data-testid", "open-machining")
    expect(link).to_have_accessible_name(re.compile("3 · Machining"))
    link.click()
    expect(page.get_by_test_id("page-machining")).to_be_visible()


def test_f28_canvas_is_labelled_and_the_hint_names_the_keyboard(page: Page, base_url: str):
    page.goto(base_url)
    expect(page.get_by_test_id("viewer-canvas")).to_have_attribute("aria-label", re.compile("3D model"))
    expect(page.locator(".viewfoot .hint")).to_contain_text("keyboard")


# --- Machining and the pins ---

def test_f26_every_pin_carries_its_mark(page: Page, base_url: str):
    load(page, base_url, SAMPLE)
    open_step(page, "features")
    page.wait_for_function("window.__dfma.flagBoxes().length >= 1", timeout=30_000)
    for pin in page.locator(".viewer .flag:not([hidden])").all():
        sev = pin.get_attribute("data-sev")
        mark = pin.locator(".mk")
        expect(mark).to_be_visible()
        expect(mark).to_have_text("▲" if sev == "high" else "◆")


def test_f27_pins_clear_each_others_stems_and_issues_open_their_row(page: Page, base_url: str):
    page.set_viewport_size({"width": 1440, "height": 900})
    load(page, base_url, SAMPLE)
    open_step(page, "machining")
    page.wait_for_function("window.__dfma.flagBoxes().length >= 1", timeout=30_000)
    # the camera settles after a step change: wait until the pins stop moving, then read both in one frame
    page.wait_for_function("""() => { const now = JSON.stringify(window.__dfma.flagBoxes());
      const same = now === window.__lastPins; window.__lastPins = now; return same; }""", polling=250, timeout=10_000)
    feet, boxes = page.evaluate("[window.__dfma.pinFootprints(), window.__dfma.flagBoxes()]")  # pins with stems and dots
    hit = [(f["id"], b["id"]) for f in feet for b in boxes if f["id"] != b["id"]
           and f["x"] < b["x"] + b["w"] and b["x"] < f["x"] + f["w"] and f["y"] < b["y"] + b["h"] and b["y"] < f["y"] + f["h"]]
    assert hit == [], (feet, boxes)
    line = page.get_by_test_id("issues-setup-2").get_by_role("button", name=re.compile("Sharp corner"))
    line.click()
    expect(page.get_by_test_id("page-features")).to_be_visible()
    expect(page.get_by_test_id("row-F4")).to_have_attribute("aria-expanded", "true")


def test_f29_f31_f32_machining_lines_at_200_percent_text(page: Page, base_url: str):
    narrow(page, big_text=True)
    load(page, base_url, SAMPLE)
    open_step(page, "machining")
    expect(page.get_by_test_id("plan-stock")).to_have_text("2.500 × 4.000 × 2.000 in block (part size, no allowance)")
    why = page.get_by_test_id("plan-why")
    expect(why.locator("b")).to_have_text("Why 2 setups:")
    assert why.evaluate("w => w.querySelector('b').getBoundingClientRect().bottom <= w.querySelector('.wtext').getBoundingClientRect().top + 1")
    issues = page.get_by_test_id("issues-setup-2")
    tops = issues.locator(".placed").evaluate_all("els => els.map((e) => Math.round(e.getBoundingClientRect().top))")
    assert len(set(tops)) == len(tops), tops  # each issue on its own line
    rng = issues.locator(".placed .num", has_text="F4–F7")
    assert rng.evaluate("e => e.getClientRects().length") == 1
    line = float(rng.evaluate("e => parseFloat(getComputedStyle(e).lineHeight)"))
    assert rng.bounding_box()["height"] < 1.5 * line  # "F4–F7" never breaks after its dash


def test_f30_operation_names_get_the_line(page: Page, base_url: str):
    narrow(page, big_text=True)
    load(page, base_url, SAMPLE)
    open_step(page, "machining")
    for op in page.locator(".plan .op").all():  # a name that wraps has the whole line, not a column beside the ids
        name = op.locator("span").first
        line = float(name.evaluate("e => parseFloat(getComputedStyle(e).lineHeight)"))
        one_line = name.bounding_box()["height"] < 1.5 * line
        assert one_line or name.bounding_box()["width"] >= 0.95 * op.bounding_box()["width"], name.inner_text()


def test_f33_setup_chips_sit_above_the_model_below_900px(page: Page, base_url: str):
    narrow(page)
    load(page, base_url, SAMPLE)
    open_step(page, "machining")
    chips, canvas = page.get_by_test_id("setup-chips").bounding_box(), page.get_by_test_id("viewer-canvas").bounding_box()
    assert chips["y"] + chips["height"] <= canvas["y"] + 1, (chips, canvas)
