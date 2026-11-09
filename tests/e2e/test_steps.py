"""Review-steps S1 in the browser (spec docs/specs/review-steps.md J1, J2, J5, J7; frames r3-start, r3-loading,
r3-error, r3-overview, r3-cost, r3-report): the five steps, the Part step's start form and overview, Cost with its
total, the Report step, and the empty states."""

from __future__ import annotations

import copy
import json

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS
from steps import STEPS, load, open_step

from dfma.analyze import analyze

pytestmark = pytest.mark.e2e
SAMPLE = PARTS / "report_sample.step"


@pytest.fixture(scope="module")
def sample() -> dict:
    return analyze(SAMPLE, "report_sample.step")


def _focused_heading(page: Page) -> str | None:
    """The data-testid of the section holding the focused element, if the focus is on an h2."""
    return page.evaluate("""() => { const a = document.activeElement;
      return a && a.tagName === 'H2' ? a.closest('section[data-testid^="page-"]')?.dataset.testid ?? null : null; }""")


def test_part_step(page: Page, base_url: str, sample: dict):
    """J1: the start form, "Analysing …" over the model, then the overview with its four cards and Fix first."""
    page.goto(base_url)
    form = page.get_by_test_id("start-form")
    expect(form).to_contain_text("Start a review")
    expect(page.get_by_test_id("viewer-note")).to_have_text("The part shows here once it's read.")
    expect(page.get_by_test_id("overview")).to_be_hidden()
    expect(page.get_by_test_id("export-pdf")).to_be_hidden()
    for name in STEPS[1:]:  # only Part is enabled before a part is read
        expect(page.get_by_test_id(f"step-{name}")).to_be_disabled()
    expect(page.get_by_test_id("step-part")).to_have_attribute("aria-current", "step")

    held = []
    page.route("**/api/analyze", lambda r: held.append(r))
    page.get_by_test_id("upload-file").set_input_files(SAMPLE)
    expect(page.get_by_test_id("viewer-note")).to_have_text("Analysing report_sample.step…")
    page.wait_for_timeout(100)  # let the held request register
    assert held, "the analysis request was not sent"
    held[0].fulfill(status=200, content_type="application/json", body=json.dumps(sample))

    overview = page.get_by_test_id("overview")
    expect(overview).to_be_visible(timeout=30_000)
    expect(form).to_be_hidden()
    expect(page.get_by_test_id("viewer-note")).to_be_hidden()
    expect(overview).to_contain_text("report_sample.step")
    expect(page.get_by_test_id("part-size")).to_have_text("4.000 × 2.500 × 2.000 in")
    expect(page.get_by_test_id("face-count")).to_have_text("14 faces")
    expect(page.get_by_test_id("part-units")).to_have_text("inch")
    expect(page.get_by_test_id("upload-process")).to_have_value("mill")
    expect(page.get_by_test_id("upload-material")).to_have_value("al6061")
    expect(page.get_by_test_id("change-file")).to_be_visible()
    expect(page.get_by_test_id("top-file")).to_have_text("report_sample.step")
    expect(page.get_by_test_id("export-pdf")).to_be_enabled()

    feats = page.get_by_test_id("overview-features")
    for text in ("2 · Features", "Fix 4", "Review 4", "OK 9", "2 holes, 1 pocket, 4 corners and 9 walls checked"):
        expect(feats).to_contain_text(text)
    mach = page.get_by_test_id("overview-machining")
    for text in ("3 · Machining", "3-axis mill", "2 setups", "4 tool loads"):
        expect(mach).to_contain_text(text)
    cost = page.get_by_test_id("overview-cost")
    expect(cost).to_contain_text("7 drivers")
    expect(cost).to_contain_text("Biggest: distinct tools 4.0, sharp or small inside corners 4.0 (weights are estimates)")
    expect(page.get_by_test_id("overview-report")).to_contain_text("PDF of all of the above")
    for name in STEPS[1:]:
        expect(page.get_by_test_id(f"open-{name}")).to_have_text("Open ›")

    f4 = next(f for f in sample["findings"] if f["id"] == "F4")
    first = page.get_by_test_id("fix-first")
    expect(first).to_contain_text("Fix first")
    expect(first).to_contain_text(f"Fix F4 {f4['title']}")

    page.get_by_test_id("open-cost").click()
    expect(page.get_by_test_id("page-cost")).to_be_visible()
    assert page.url.endswith("#cost")


def test_refused_in_form(page: Page, base_url: str):
    """J1: a refused file says why inside the start form, with "Error:" before it; the overview stays hidden."""
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "not_step.step")
    error = page.get_by_test_id("start-form").get_by_test_id("error-message")
    expect(error).to_have_text("This is not a STEP file this tool can read", timeout=30_000)
    assert error.evaluate("e => getComputedStyle(e, '::before').content") == '"Error: "'
    expect(page.get_by_test_id("start-form")).to_contain_text("Choose another file, or try again.")
    expect(page.get_by_test_id("viewer-note")).to_have_text("No part loaded.")
    expect(page.get_by_test_id("overview")).to_be_hidden()
    expect(page.get_by_test_id("step-features")).to_be_disabled()


@pytest.mark.parametrize("width", [1280, 900])
def test_walk(page: Page, base_url: str, sample: dict, width: int):
    """J2: tabs, Open ›, Next and Back, and the browser's Back and Forward walk the steps; the address names the
    step; focus goes to the step's heading; at 200% text the tabs wrap and stay on the screen."""
    page.set_viewport_size({"width": width, "height": 900})
    page.goto(base_url + "#cost")  # a hash for another step shows Part before a part is read
    expect(page.get_by_test_id("page-part")).to_be_visible()
    expect(page.get_by_test_id("page-cost")).to_be_hidden()
    page.route("**/api/analyze", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(sample)))
    page.get_by_test_id("upload-file").set_input_files(SAMPLE)
    expect(page.get_by_test_id("overview")).to_be_visible(timeout=30_000)

    tab = page.get_by_test_id("step-features")
    expect(tab).to_contain_text("2Features")
    expect(tab).to_contain_text("▲ 4")
    expect(tab).to_contain_text("◆ 4")
    expect(page.get_by_test_id("step-back")).to_be_hidden()
    expect(page.get_by_test_id("step-next")).to_have_text("Features ›")

    def at(name: str) -> None:
        expect(page.get_by_test_id(f"page-{name}")).to_be_visible()
        for other in STEPS:
            if other != name:
                expect(page.get_by_test_id(f"page-{other}")).to_be_hidden()
                expect(page.get_by_test_id(f"step-{other}")).not_to_have_attribute("aria-current", "step")
        expect(page.get_by_test_id(f"step-{name}")).to_have_attribute("aria-current", "step")
        assert page.url.endswith(f"#{name}")
        assert _focused_heading(page) == f"page-{name}"

    page.get_by_test_id("step-next").click()
    at("features")
    expect(page.get_by_test_id("step-back")).to_have_text("‹ Part")
    page.get_by_test_id("step-next").click()
    at("machining")
    page.get_by_test_id("step-back").click()
    at("features")
    page.get_by_test_id("step-report").click()
    at("report")
    expect(page.get_by_test_id("step-next")).to_be_hidden()
    expect(page.get_by_test_id("step-back")).to_have_text("‹ Cost")
    page.go_back()
    at("features")
    page.go_forward()
    at("report")
    page.get_by_test_id("step-part").click()
    at("part")
    page.get_by_test_id("open-machining").click()
    at("machining")

    # 200% text: the five tabs wrap onto at most two lines and nothing runs off the screen
    page.evaluate("document.documentElement.style.fontSize = '200%'")
    boxes = [page.get_by_test_id(f"step-{n}").bounding_box() for n in STEPS]
    assert len({round(b["y"]) for b in boxes}) <= 2, boxes
    assert all(b["x"] >= 0 and b["x"] + b["width"] <= width for b in boxes), boxes
    assert page.evaluate("document.documentElement.scrollWidth") <= width


def test_cost_total(page: Page, base_url: str):
    """J5: each driver's count × weight = score, its findings or "from the machine plan", and the total."""
    load(page, base_url, SAMPLE)
    open_step(page, "cost")
    corners = page.get_by_test_id("driver-small_corners")
    for text in ("Sharp or small inside corners", "4 × 1.0", "4.0", "F4–F7"):
        expect(corners).to_contain_text(text)
    expect(page.get_by_test_id("driver-deep_holes")).to_contain_text("F1 F2")
    expect(page.get_by_test_id("driver-odd_holes")).to_contain_text("F3")
    expect(page.get_by_test_id("driver-distinct_tools")).to_contain_text("from the machine plan")
    expect(page.get_by_test_id("driver-extra_setups")).to_contain_text("from the machine plan")
    total = page.get_by_test_id("cost-total")
    expect(total).to_contain_text("Total score")
    expect(total).to_contain_text("14.0 points")
    expect(page.get_by_test_id("page-cost")).to_contain_text(
        "Score is count × weight. Every weight is an estimate. No time or dollars yet.")
    assert page.get_by_test_id("page-cost").locator("[data-testid^='driver-']").count() == 7


def test_report_step(page: Page, base_url: str, sample: dict, tmp_path):
    """J5: what the PDF holds, the checks run by name, the assumptions folded, and Export PDF."""
    load(page, base_url, SAMPLE)
    open_step(page, "report")
    report = page.get_by_test_id("page-report")
    expect(report).to_contain_text("The PDF holds")
    expect(page.get_by_test_id("report-rules")).to_have_text(
        "Hole depth check, Hole size check, Corner radius check, Pocket depth check, Undercut check, Thin wall check, "
        "Access check, Process check.")
    folded = page.get_by_test_id("report-assumptions")
    expect(folded.locator("summary")).to_have_text(f"Assumptions ({len(sample['assumptions'])})")
    expect(folded).not_to_have_attribute("open", "")
    folded.locator("summary").click()
    expect(folded).to_contain_text(sample["assumptions"][0])
    with page.expect_download() as download:
        page.get_by_test_id("report-export-pdf").click()
    assert download.value.suggested_filename == "report_sample-dfma-review.pdf"


def _routed(page: Page, base_url: str, result: dict) -> None:
    page.route("**/api/analyze", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(result)))
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(SAMPLE)
    expect(page.get_by_test_id("overview")).to_be_visible(timeout=30_000)


def test_empty_states(page: Page, base_url: str, sample: dict):
    """J7: no findings, no Fix findings, no cost drivers and no machine plan, each answered through page.route."""
    clean = copy.deepcopy(sample)
    clean["findings"] = []
    _routed(page, base_url, clean)
    expect(page.get_by_test_id("fix-first")).to_be_hidden()
    expect(page.get_by_test_id("overview-features")).to_contain_text("No findings. Every feature checked passed its rules.")
    page.unroute("**/api/analyze")

    review = copy.deepcopy(sample)
    review["findings"] = [f for f in sample["findings"] if f["severity"] == "medium"]
    first = min(review["findings"], key=lambda f: int(f["id"][1:]))
    _routed(page, base_url, review)
    expect(page.get_by_test_id("fix-first")).to_contain_text("Review first")
    expect(page.get_by_test_id("fix-first")).to_contain_text(f"Review {first['id']} {first['title']}")
    page.unroute("**/api/analyze")

    bare = copy.deepcopy(sample)
    bare["cost_drivers"], bare["cost_total"] = [], None
    bare["machine"], bare["setups"], bare["operations"], bare["tools"], bare["tool_changes"] = None, [], [], [], 0
    _routed(page, base_url, bare)
    expect(page.get_by_test_id("overview-machining")).to_contain_text("No machine plan for this part.")
    expect(page.get_by_test_id("overview-cost")).to_contain_text("None: one setup and no tools to load.")
    open_step(page, "cost")
    expect(page.get_by_test_id("page-cost")).to_contain_text("None: one setup and no tools to load.")
    expect(page.get_by_test_id("cost-total")).to_be_hidden()


def test_turning_overview(page: Page, base_url: str):
    """J7: a turned part's Machining card names the plan's machine, its one setup and its tool loads."""
    r = analyze(PARTS / "slender_shaft.step", "slender_shaft.step", "turn", "steel1018")
    page.goto(base_url)
    page.get_by_test_id("upload-process").select_option("turn")
    page.get_by_test_id("upload-material").select_option("steel1018")
    page.get_by_test_id("upload-file").set_input_files(PARTS / "slender_shaft.step")
    mach = page.get_by_test_id("overview-machining")
    expect(mach).to_contain_text("Lathe with live tooling", timeout=60_000)
    expect(mach).to_contain_text("1 setup")
    expect(mach).to_contain_text(f"{r['tool_changes']} tool loads")
    # Process and material sit in the overview's head once a part is read, keeping the values chosen
    expect(page.get_by_test_id("overview").get_by_test_id("upload-process")).to_have_value("turn")
    expect(page.get_by_test_id("overview").get_by_test_id("upload-material")).to_have_value("steel1018")
