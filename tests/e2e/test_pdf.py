"""J6 in the browser: Export PDF on report_sample downloads a PDF whose first page holds the summary, the machine
plan and the cost drivers, with one embedded image per finding (read back with pypdf)."""

from __future__ import annotations

import re

import pytest
from playwright.sync_api import Page, expect
from pypdf import PdfReader

from helpers import PARTS
from steps import open_step, shown, show_finding

from dfma.analyze import analyze

pytestmark = pytest.mark.e2e


def test_export_pdf(page: Page, base_url: str, tmp_path):
    result = analyze(PARTS / "report_sample.step", "report_sample.step")
    assert len({f["rule"] for f in result["findings"]}) >= 3  # J6: at least 3 rules have a finding

    page.goto(base_url)
    button = page.get_by_test_id("export-pdf")
    expect(button).to_be_disabled()  # nothing to export before a part is loaded
    expect(button).to_be_hidden()  # in the top bar once a part is read (review-steps)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "report_sample.step")
    shown(page, "report_sample.step", "cost")
    expect(page.get_by_test_id("driver-distinct_tools")).to_be_visible()
    expect(page.get_by_test_id("driver-distinct_tools")).to_contain_text("4 × 1.0")
    expect(page.get_by_test_id("driver-distinct_tools")).to_contain_text("4.0")
    expect(button).to_be_enabled()
    open_step(page, "features")

    show_finding(page, result, "F2")  # the reader's own selection (row F1 F2, at F2) must survive the export
    camera = page.evaluate("window.__dfma.cameraTarget()")
    with page.expect_download() as download:
        button.click()
    path = tmp_path / "report.pdf"
    download.value.save_as(path)
    assert download.value.suggested_filename == "report_sample-dfma-review.pdf"
    row = next(r for r in result["rows"] if "F2" in r["findings"])
    assert page.evaluate("window.__dfma.highlightedFaces()") == sorted(
        {i for f in result["findings"] if f["id"] in row["findings"] for i in f["faces"]})
    assert page.evaluate("window.__dfma.cameraTarget()") == camera
    expect(page.get_by_test_id("row-F1")).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_test_id("row-detail")).to_contain_text("F2 · hole-2 · 2 of 2")

    pdf = PdfReader(path)
    first = pdf.pages[0].extract_text()
    stock = " × ".join(f"{v:.3f}" for v in result["stock"]["size_in"])  # the part's own axes, as the screen shows it
    for text in ("DFMA Review report", "report_sample.step", f"{len(result['findings'])} findings: 4 Fix, 4 Review.",
                 "Machine: 3-axis mill", f"Stock: {stock} in block", "Setup 1 · from +X", "Setup 2 · from -X",
                 "1. 1/4 in end mill (em-0.250)  hole-1", "2. 0.250 in (1/4) drill (dr-0.2500)  hole-2",
                 "3. 3/4 in end mill (em-0.750)  pocket-1", "4. 1/32 in end mill (smallest; nothing fits) (em-0.031)  pocket-1", "Tool loads: 4 (the first in each setup counts)", "Tools (4)",
                 "Cost drivers", "Distinct tools: 4 × 1.0 = 4.0", "Sharp or small inside corners: 4 × 1.0 = 4.0",
                 "Undersized or sub-1/8 in tools: 1 × 1.0 = 1.0", "Deep pockets: 1 × 1.0 = 1.0", "estimate",
                 "Checks run: Hole depth check, Hole size check, Corner radius check"):  # check names (review-steps S1)
        assert text in first.replace("\n", " "), f"{text!r} is not on page 1"

    def pictures_drawn(n: int) -> int:  # jsPDF lists every image in one shared resource table, so count what a page draws
        return len(re.findall(rb"\bDo\b", pdf.pages[n].get_contents().get_data()))

    assert pictures_drawn(0) == 0  # the pictures are on the finding pages
    # One section per finding, each with its own picture, after page 1 (and an assumptions page last).
    assert len(pdf.pages) == 1 + len(result["findings"]) + 1
    for n, finding in enumerate(result["findings"], 1):
        section = pdf.pages[n]
        assert section.extract_text().startswith(f"{finding['id']} "), section.extract_text()[:40]
        word = {"high": "FIX", "medium": "REVIEW"}[finding["severity"]]  # D-042: words, not high / medium
        assert section.extract_text().startswith(f"{finding['id']} · {word} · "), section.extract_text()[:40]
        assert "D-0" not in section.extract_text()  # limits in words, no decision ids (review-steps S1)
        assert finding["title"].replace("×", "×") in section.extract_text().replace("\n", " ")
        assert pictures_drawn(n) == 1
    assert "Assumptions" in pdf.pages[-1].extract_text() and pictures_drawn(len(pdf.pages) - 1) == 0
    images = [x.get_object()._data for x in pdf.pages[1]["/Resources"]["/XObject"].values()]  # the shared table: one picture per set of faces
    # Two findings on the same faces (hole-1's size and depth) get the same picture, which jsPDF stores once.
    assert len(images) == len({tuple(sorted(f["faces"])) for f in result["findings"]}) and len(set(images)) == len(images)


def test_pdf_threads(page: Page, base_url: str, tmp_path):
    """J5: the summary page's Threads section, one line per thread; F26 (the disagreeing thread) has its page."""
    import json
    result = json.loads((PARTS.parent / "inventor" / "fixtures" / "stc_10.json").read_text("utf-8"))
    page.route("**/api/analyze", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(result)))
    page.goto(base_url)
    step, ipt = tmp_path / "nist_stc_10_asme1_ap242-e2.stp", tmp_path / "INV_nist_ftc_10_asme1_2024.ipt"
    step.write_text("placeholder")
    ipt.write_bytes(b"placeholder")
    page.get_by_test_id("upload-ipt").set_input_files(ipt)
    page.get_by_test_id("upload-file").set_input_files(step)
    shown(page, step.name)
    expect(page.get_by_test_id("threads-panel")).to_be_visible()
    with page.expect_download() as download:
        page.get_by_test_id("export-pdf").click()
    path = tmp_path / "report.pdf"
    download.value.save_as(path)
    pdf = PdfReader(path)
    text = " ".join(p.extract_text() for p in pdf.pages).replace("\n", " ")
    text = re.sub(r" +", " ", text)
    for line in ("Threads (from INV_nist_ftc_10_asme1_2024.ipt)", "5 matched, 1 disagrees, 0 not mapped.",
                 "hole-38 M3x0.5 - 6H 0.236 in [6 mm] deep tap drill 0.098 in [2.5 mm] disagrees: 0.004 in [0.10 mm] "
                 "off the hole's axis; see F26",
                 "hole-36 M3x0.5 - 6H 0.236 in [6 mm] deep tap drill 0.098 in [2.5 mm] matched"):
        assert line in text, f"{line!r} is not in the PDF"
    pages = [p.extract_text().replace("\n", " ") for p in pdf.pages]
    assert any("F26 · REVIEW" in p for p in pages)  # its finding page, headed with the word (D-042)


def test_pdf_hole_features(page: Page, base_url: str, tmp_path):
    """I2 S1 J6: the summary page's Hole features section after Threads (D-040), one line per feature; a
    disagreeing hole (F39) has its finding page."""
    import json
    result = json.loads((PARTS.parent / "inventor" / "fixtures" / "ctc_04.json").read_text("utf-8"))
    page.route("**/api/analyze", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(result)))
    page.goto(base_url)
    step, ipt = tmp_path / "nist_ctc_04_asme1_ap242-e1.stp", tmp_path / "INV_nist_ctc_04_asme1_2021.ipt"
    step.write_text("placeholder")
    ipt.write_bytes(b"placeholder")
    page.get_by_test_id("upload-ipt").set_input_files(ipt)
    page.get_by_test_id("upload-file").set_input_files(step)
    shown(page, step.name)
    expect(page.get_by_test_id("hole-features-panel")).to_be_visible()
    with page.expect_download() as download:
        page.get_by_test_id("export-pdf").click()
    path = tmp_path / "report.pdf"
    download.value.save_as(path)
    pdf = PdfReader(path)
    text = re.sub(r" +", " ", " ".join(p.extract_text() for p in pdf.pages).replace("\n", " "))
    for line in ("Hole features (from INV_nist_ctc_04_asme1_2021.ipt)",
                 "9 Hole features, 54 holes: 40 matched, 13 disagree, 1 not mapped. Sizes as designed in the .ipt.",
                 "hf-7 Countersink · 30 holes · Hole20: Ø0.551 in [14 mm] through, countersink Ø0.787 in [20 mm] × 90°. "
                 "26 matched, 4 disagree, 0 not mapped (findings F35, F36, F37, F38).",
                 "hf-8 Countersink · 1 hole · Hole21: Ø0.551 in [14 mm] through, countersink Ø0.787 in [20 mm] × 90°. "
                 "0 matched, 0 disagree, 1 not mapped; not mapped: no hole on this axis (our limit, not a finding).",
                 "(finding F39)",
                 "hole-37 M12x1.75 - 6H Hole8 0.984 in [25 mm] deep",  # I2 S2: the thread's feature name
                 "F35 · REVIEW · Hole feature vs hole · .ipt check Hole20 hole on hole-12"):  # I2 S2: the name in its title
        assert line in text, f"{line!r} is not in the PDF"
    assert text.index("Threads (from") < text.index("Hole features (from")
    pages = [p.extract_text().replace("\n", " ") for p in pdf.pages]
    assert any("F39 · REVIEW" in p for p in pages)  # its finding page


def test_pdf_blends(page: Page, base_url: str, tmp_path):
    """I3 S3 (D-043): the summary page's Fillets and chamfers section after Hole features, one line per blend."""
    import json
    result = json.loads((PARTS.parent / "inventor" / "fixtures" / "ctc_04.json").read_text("utf-8"))
    page.route("**/api/analyze", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(result)))
    page.goto(base_url)
    step, ipt = tmp_path / "nist_ctc_04_asme1_ap242-e1.stp", tmp_path / "INV_nist_ctc_04_asme1_2021.ipt"
    step.write_text("placeholder")
    ipt.write_bytes(b"placeholder")
    page.get_by_test_id("upload-ipt").set_input_files(ipt)
    page.get_by_test_id("upload-file").set_input_files(step)
    shown(page, step.name)
    expect(page.get_by_test_id("blends-panel")).to_be_visible()
    with page.expect_download() as download:
        page.get_by_test_id("export-pdf").click()
    path = tmp_path / "report.pdf"
    download.value.save_as(path)
    text = re.sub(r" +", " ", " ".join(p.extract_text() for p in PdfReader(path).pages).replace("\n", " "))
    for line in ("Fillets and chamfers (from INV_nist_ctc_04_asme1_2021.ipt)",
                 "7 fillets, 1 chamfer: 8 matched, 0 disagree, 0 not mapped. Sizes as designed in the .ipt.",
                 "bl-2 Chamfer · 0.197 in [5 mm] × 0.197 in [5 mm], 90°: matched; 12 of 24 faces found in the STEP.",
                 "bl-8 Fillet · R0.197 in [5 mm]: matched; 32 of 36 faces found in the STEP; copied by 1 pattern or "
                 "mirror feature."):
        assert line in text, f"{line!r} is not in the PDF"
    assert text.index("Hole features (from") < text.index("Fillets and chamfers (from")

