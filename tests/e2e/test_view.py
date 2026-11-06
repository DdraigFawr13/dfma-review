"""S1 in the browser: upload a part, see it, rotate it (J1); a bad file shows its message (J7)."""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS, expected

pytestmark = pytest.mark.e2e

# Mean and variance of the canvas pixels, plus a small fingerprint to compare frames.
CANVAS_STATS = """() => {
  const src = document.querySelector('[data-testid="viewer-canvas"]');
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  const lum = [];
  for (let i = 0; i < d.length; i += 4) lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  const variance = lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length;
  return { variance, pixels: lum.map(v => Math.round(v)) };
}"""


def canvas(page: Page) -> dict:
    return page.evaluate(CANVAS_STATS)


def changed(a: dict, b: dict) -> int:
    return sum(1 for x, y in zip(a["pixels"], b["pixels"]) if abs(x - y) > 8)


def test_upload_shows_part(page: Page, base_url: str):
    page.goto(base_url)
    expect(page.get_by_test_id("viewer-canvas")).to_be_visible()
    before = canvas(page)

    page.get_by_test_id("upload-file").set_input_files(PARTS / "box_through_hole.step")
    expect(page.get_by_test_id("part-size")).to_have_text("2.000 × 1.000 × 0.500 in", timeout=30_000)
    count = expected("box_through_hole")["face_count"]
    expect(page.get_by_test_id("face-count")).to_have_text(f"{count} faces")
    page.wait_for_timeout(300)

    shown = canvas(page)
    assert shown["variance"] > 0
    assert changed(before, shown) > 50, "the canvas did not change after the upload"

    box = page.get_by_test_id("viewer-canvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + 120, cy + 40, steps=8)
    page.mouse.up()
    page.wait_for_timeout(300)
    assert changed(shown, canvas(page)) > 50, "dragging did not rotate the part"


def test_bad_upload_message(page: Page, base_url: str):
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "not_step.step")
    expect(page.get_by_test_id("error-message")).to_have_text("This is not a STEP file this tool can read",
                                                              timeout=30_000)
    # The app keeps working: a good file still loads.
    page.get_by_test_id("upload-file").set_input_files(PARTS / "box_inch.step")
    expect(page.get_by_test_id("part-size")).to_have_text("2.000 × 1.000 × 0.500 in", timeout=30_000)
    expect(page.get_by_test_id("error-message")).to_be_hidden()
