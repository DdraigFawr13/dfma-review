"""J2 in the browser: the findings list shows the hole finding; clicking it highlights and frames its faces."""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS

from dfma.analyze import analyze

pytestmark = pytest.mark.e2e


def bbox_centre(result: dict, face_ids: list[int]) -> list[float]:
    pts = [f["positions"][i:i + 3] for f in result["faces"] if f["id"] in face_ids
           for i in range(0, len(f["positions"]), 3)]
    return [(min(p[k] for p in pts) + max(p[k] for p in pts)) / 2 for k in range(3)]


def test_click_highlights_face(page: Page, base_url: str):
    result = analyze(PARTS / "deep_hole.step", "deep_hole.step")
    [finding] = result["findings"]

    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "deep_hole.step")
    row = page.get_by_test_id("finding-F1")
    expect(row).to_contain_text("Hole depth 8.0× diameter (limit 6.0×)", timeout=30_000)
    expect(row).to_contain_text("medium")
    expect(page.get_by_test_id("verdict")).to_contain_text("1 hole checked")
    assert page.evaluate("window.__dfma.highlightedFaces()") == []

    row.click()
    assert sorted(page.evaluate("window.__dfma.highlightedFaces()")) == sorted(finding["faces"])
    target = page.evaluate("window.__dfma.cameraTarget()")
    centre = bbox_centre(result, finding["faces"])
    assert sum((a - b) ** 2 for a, b in zip(target, centre)) ** 0.5 <= 1.0
    expect(row).to_have_attribute("aria-pressed", "true")

    row.click()  # clicking the selected finding again clears it
    assert page.evaluate("window.__dfma.highlightedFaces()") == []


def test_clean_part_shows_clean_verdict(page: Page, base_url: str):
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "clean_holes.step")
    expect(page.get_by_test_id("verdict")).to_contain_text("2 holes checked", timeout=30_000)
    expect(page.get_by_test_id("verdict")).to_contain_text("clean", ignore_case=True)
