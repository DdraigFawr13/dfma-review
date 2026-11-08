"""J6 in the browser: Export PDF on report_sample downloads a PDF whose first page holds the summary, the machine
plan and the cost drivers, with one embedded image per finding (read back with pypdf)."""

from __future__ import annotations

import re

import pytest
from playwright.sync_api import Page, expect
from pypdf import PdfReader

from helpers import PARTS

from dfma.analyze import analyze

pytestmark = pytest.mark.e2e


def test_export_pdf(page: Page, base_url: str, tmp_path):
    result = analyze(PARTS / "report_sample.step", "report_sample.step")
    assert len({f["rule"] for f in result["findings"]}) >= 3  # J6: at least 3 rules have a finding

    page.goto(base_url)
    button = page.get_by_test_id("export-pdf")
    expect(button).to_be_disabled()  # nothing to export before a part is loaded
    page.get_by_test_id("upload-file").set_input_files(PARTS / "report_sample.step")
    expect(page.get_by_test_id("finding-F1")).to_be_visible(timeout=30_000)
    expect(page.get_by_test_id("drivers")).not_to_have_attribute("open", "")  # collapsed until opened, like Passed
    page.get_by_test_id("drivers").locator("summary").click()
    expect(page.get_by_test_id("driver-distinct_tools")).to_be_visible()
    expect(page.get_by_test_id("driver-distinct_tools")).to_contain_text("4 × 1.0 = 4.0")
    expect(button).to_be_enabled()

    page.get_by_test_id("finding-F2").click()  # the reader's own selection must survive the export
    camera = page.evaluate("window.__dfma.cameraTarget()")
    with page.expect_download() as download:
        button.click()
    path = tmp_path / "report.pdf"
    download.value.save_as(path)
    assert download.value.suggested_filename == "report_sample-dfma-review.pdf"
    assert page.evaluate("window.__dfma.highlightedFaces()") == sorted(result["findings"][1]["faces"])
    assert page.evaluate("window.__dfma.cameraTarget()") == camera
    expect(page.get_by_test_id("finding-F2")).to_have_attribute("aria-pressed", "true")

    pdf = PdfReader(path)
    first = pdf.pages[0].extract_text()
    stock = " × ".join(f"{v:.3f}" for v in result["stock"]["size_in"])  # the part's own axes, as the screen shows it
    for text in ("DFMA Review report", "report_sample.step", f"{len(result['findings'])} findings: 4 high, 4 medium.",
                 "Machine: 3-axis mill", f"Stock: {stock} in block", "Setup 1 · from +X", "Setup 2 · from -X",
                 "1. 1/4 in end mill (em-0.250)  hole-1", "2. 0.250 in (1/4) drill (dr-0.2500)  hole-2",
                 "3. 3/4 in end mill (em-0.750)  pocket-1", "4. 1/32 in end mill (smallest; nothing fits) (em-0.031)  pocket-1", "Tool changes (tool loads): 4", "Tools (4)",
                 "Cost drivers", "Distinct tools: 4 × 1.0 = 4.0", "Sharp or small inside corners: 4 × 1.0 = 4.0",
                 "Undersized tools: 1 × 1.0 = 1.0", "estimate"):
        assert text in first.replace("\n", " "), f"{text!r} is not on page 1"

    def pictures_drawn(n: int) -> int:  # jsPDF lists every image in one shared resource table, so count what a page draws
        return len(re.findall(rb"\bDo\b", pdf.pages[n].get_contents().get_data()))

    assert pictures_drawn(0) == 0  # the pictures are on the finding pages
    # One section per finding, each with its own picture, after page 1 (and an assumptions page last).
    assert len(pdf.pages) == 1 + len(result["findings"]) + 1
    for n, finding in enumerate(result["findings"], 1):
        section = pdf.pages[n]
        assert section.extract_text().startswith(f"{finding['id']} "), section.extract_text()[:40]
        assert finding["title"].replace("×", "×") in section.extract_text().replace("\n", " ")
        assert pictures_drawn(n) == 1
    assert "Assumptions" in pdf.pages[-1].extract_text() and pictures_drawn(len(pdf.pages) - 1) == 0
    images = [x.get_object()._data for x in pdf.pages[1]["/Resources"]["/XObject"].values()]  # the shared table: one picture per set of faces
    # Two findings on the same faces (hole-1's size and depth) get the same picture, which jsPDF stores once.
    assert len(images) == len({tuple(sorted(f["faces"])) for f in result["findings"]}) and len(set(images)) == len(images)
