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
    # What is drawn: the finding's faces in the accent colour, every other face faded to 0.35.
    assert page.evaluate("window.__dfma.paintedFaces()") == sorted(finding["faces"])
    opacity = page.evaluate("window.__dfma.opacities()")
    assert all(opacity[str(i)] == (1 if i in finding["faces"] else 0.35) for i in range(len(result["faces"])))
    # A flag on the view names the finding and its severity, so colour is not the only sign.
    expect(page.locator(".viewer .flag")).to_have_text("F1medium")

    # Changing the material re-analyses the same part and keeps the view and the selection,
    # including a view the user has moved: pan first (right-drag), which moves the camera target.
    box = page.get_by_test_id("viewer-canvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down(button="right")
    page.mouse.move(cx + 80, cy + 30, steps=6)
    page.mouse.up(button="right")
    page.wait_for_timeout(200)
    moved = page.evaluate("window.__dfma.cameraTarget()")
    assert moved != target
    target = moved
    with page.expect_response(lambda r: r.url.endswith("/api/analyze"), timeout=30_000):
        page.get_by_test_id("upload-material").select_option("plastic")
    expect(page.locator("#status")).to_have_text("Showing deep_hole.step.", timeout=30_000)
    page.wait_for_timeout(300)
    assert page.evaluate("window.__dfma.cameraTarget()") == target
    assert sorted(page.evaluate("window.__dfma.highlightedFaces()")) == sorted(finding["faces"])

    row.click()  # clicking the selected finding again clears it
    assert page.evaluate("window.__dfma.highlightedFaces()") == []


def test_clean_part_shows_clean_verdict(page: Page, base_url: str):
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "clean_holes.step")
    expect(page.get_by_test_id("verdict")).to_contain_text("2 holes checked", timeout=30_000)
    expect(page.get_by_test_id("verdict")).to_contain_text("clean", ignore_case=True)

    # The legend's "Holes checked, no finding" box (on by default) tints the holes that passed.
    result = analyze(PARTS / "clean_holes.step", "clean_holes.step")
    hole_faces = sorted(i for h in result["features"] for i in h["faces"])
    expect(page.get_by_test_id("legend")).to_contain_text("High")
    assert page.evaluate("window.__dfma.checkedFaces()") == hole_faces
    page.get_by_test_id("show-checked").uncheck()
    assert page.evaluate("window.__dfma.checkedFaces()") == []
    page.get_by_test_id("show-checked").check()
    assert page.evaluate("window.__dfma.checkedFaces()") == hole_faces


def test_checked_holes_exclude_holes_with_findings(page: Page, base_url: str):
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "stepped_hole.step")
    expect(page.get_by_test_id("verdict")).to_contain_text("2 holes checked", timeout=30_000)
    result = analyze(PARTS / "stepped_hole.step", "stepped_hole.step")
    assert page.evaluate("window.__dfma.checkedFaces()") == sorted(i for h in result["features"] for i in h["faces"])
    page.get_by_test_id("upload-file").set_input_files(PARTS / "deep_hole.step")
    expect(page.get_by_test_id("finding-F1")).to_be_visible(timeout=30_000)
    assert page.evaluate("window.__dfma.checkedFaces()") == []  # its only hole has a finding


def test_pocket_and_corner_switches(page: Page, base_url: str):
    # S3 (D-015): pockets and corners checked with no finding have their own colour and switch;
    # a corner fillet is also a pocket wall and shows the corner colour.
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "clean_pocket.step")
    expect(page.get_by_test_id("verdict")).to_contain_text("1 pocket and 4 corners checked", timeout=30_000)
    result = analyze(PARTS / "clean_pocket.step", "clean_pocket.step")
    [pocket] = [f for f in result["features"] if f["kind"] == "pocket"]
    corner_faces = sorted(i for f in result["features"] if f["kind"] == "corner" for i in f["faces"])
    pocket_only = sorted(set(pocket["faces"]) - set(corner_faces))
    assert page.evaluate("window.__dfma.checkedFaces('pocket')") == pocket_only
    assert page.evaluate("window.__dfma.checkedFaces('corner')") == corner_faces
    page.get_by_test_id("show-checked-corners").uncheck()
    assert page.evaluate("window.__dfma.checkedFaces('corner')") == []
    page.get_by_test_id("show-checked-pockets").uncheck()
    assert page.evaluate("window.__dfma.checkedFaces('pocket')") == []


def test_sharp_corner_is_drawn_on_its_edge(page: Page, base_url: str):
    # A sharp corner has no face: selecting it paints no face accent, its walls stay solid (D-015).
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "pocket_sharp.step")
    page.get_by_test_id("finding-F1").click(timeout=30_000)
    result = analyze(PARTS / "pocket_sharp.step", "pocket_sharp.step")
    walls = result["findings"][0]["faces"]
    assert page.evaluate("window.__dfma.paintedFaces()") == []
    opacities = page.evaluate("window.__dfma.opacities()")
    assert all(opacities[str(w)] == 1 for w in walls)
    assert sorted(page.evaluate("window.__dfma.highlightedFaces()")) == sorted(walls)
