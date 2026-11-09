"""J2 in the browser: the findings list shows the hole finding; clicking it highlights and frames its faces."""

from __future__ import annotations

import re

import pytest
from playwright.sync_api import Page, expect

from helpers import PARTS
from steps import open_step, shown as part_shown

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
    part_shown(page, "deep_hole.step", step=None)
    expect(page.get_by_test_id("overview-features")).to_contain_text("1 hole and 4 walls checked")
    open_step(page, "features")
    row = page.get_by_test_id("finding-F1")
    expect(row).to_contain_text("Hole depth 8.0× diameter (limit 6.0×)")
    expect(row).to_contain_text("Review")
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
    expect(page.locator(".viewer .flag")).to_have_text("F1Review")

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
    open_step(page, "part")  # process and material sit in the overview once a part is read
    with page.expect_response(lambda r: r.url.endswith("/api/analyze"), timeout=30_000):
        page.get_by_test_id("upload-material").select_option("plastic")
    expect(page.locator("#status")).to_have_text("Showing deep_hole.step.", timeout=30_000)
    open_step(page, "features")
    page.wait_for_timeout(300)
    assert page.evaluate("window.__dfma.cameraTarget()") == target
    assert sorted(page.evaluate("window.__dfma.highlightedFaces()")) == sorted(finding["faces"])

    row.click()  # clicking the selected finding again clears it
    assert page.evaluate("window.__dfma.highlightedFaces()") == []


def test_clean_part_shows_clean_verdict(page: Page, base_url: str):
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "clean_holes.step")
    part_shown(page, "clean_holes.step", step=None)
    expect(page.get_by_test_id("overview-features")).to_contain_text("2 holes and 3 walls checked")
    expect(page.get_by_test_id("overview-features")).to_contain_text("No findings. Every feature checked passed its rules.")
    open_step(page, "features")

    # The legend's "Holes checked, no finding" box (on by default) tints the holes that passed.
    result = analyze(PARTS / "clean_holes.step", "clean_holes.step")
    hole_faces = sorted(i for h in result["features"] if h["kind"] == "hole" for i in h["faces"])
    expect(page.get_by_test_id("legend")).to_contain_text("Fix")
    assert page.evaluate("window.__dfma.checkedFaces()") == hole_faces
    page.get_by_test_id("show-checked").uncheck()
    assert page.evaluate("window.__dfma.checkedFaces()") == []
    page.get_by_test_id("show-checked").check()
    assert page.evaluate("window.__dfma.checkedFaces()") == hole_faces


def test_checked_holes_exclude_holes_with_findings(page: Page, base_url: str):
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "stepped_hole.step")
    part_shown(page, "stepped_hole.step", step=None)
    expect(page.get_by_test_id("overview-features")).to_contain_text("2 holes and 4 walls checked")
    result = analyze(PARTS / "stepped_hole.step", "stepped_hole.step")
    assert page.evaluate("window.__dfma.checkedFaces()") == sorted(i for h in result["features"] if h["kind"] == "hole" for i in h["faces"])
    page.get_by_test_id("upload-file").set_input_files(PARTS / "deep_hole.step")
    part_shown(page, "deep_hole.step")
    expect(page.get_by_test_id("finding-F1")).to_be_visible()
    assert page.evaluate("window.__dfma.checkedFaces()") == []  # its only hole has a finding


def test_pocket_and_corner_switches(page: Page, base_url: str):
    # S3 (D-015): pockets and corners checked with no finding have their own colour and switch;
    # a corner fillet is also a pocket wall and shows the corner colour.
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "clean_pocket.step")
    part_shown(page, "clean_pocket.step", step=None)
    expect(page.get_by_test_id("overview-features")).to_contain_text("1 pocket, 4 corners and 8 walls checked")
    open_step(page, "features")
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


def test_wall_switch(page: Page, base_url: str):
    # S4 (D-014, D-016): walls checked with no finding have their own colour and switch, off by default.
    # Walls are painted first, so a face that is also in a hole or pocket keeps that kind's colour,
    # and a wall with a finding is not "checked".
    page.goto(base_url)
    page.get_by_test_id("upload-material").select_option("plastic")
    page.get_by_test_id("upload-file").set_input_files(PARTS / "thin_rib.step")
    part_shown(page, "thin_rib.step", step=None)
    expect(page.get_by_test_id("overview-features")).to_contain_text("6 walls checked")
    open_step(page, "features")
    expect(page.get_by_test_id("finding-F1")).to_contain_text("Wall 0.040 in thick (limit 0.060 in)")
    expect(page.get_by_test_id("finding-F1")).to_contain_text("0.040 in thick · limit is an estimate")
    result = analyze(PARTS / "thin_rib.step", "thin_rib.step", "mill", "plastic")
    flagged = {f["feature"] for f in result["findings"]}
    walls = [f for f in result["features"] if f["kind"] == "wall"]
    passed = sorted({i for w in walls if w["id"] not in flagged for i in w["faces"]}
                    - {i for f in result["findings"] for i in f["faces"]})
    assert not page.get_by_test_id("show-checked-walls").is_checked()
    assert page.evaluate("window.__dfma.checkedFaces('wall')") == []
    page.get_by_test_id("show-checked-walls").check()
    assert page.evaluate("window.__dfma.checkedFaces('wall')") == passed
    page.get_by_test_id("show-checked-walls").uncheck()
    assert page.evaluate("window.__dfma.checkedFaces('wall')") == []

    page.get_by_test_id("upload-file").set_input_files(PARTS / "clean_holes.step")
    part_shown(page, "clean_holes.step", step=None)
    expect(page.get_by_test_id("overview-features")).to_contain_text("2 holes and 3 walls checked")
    open_step(page, "features")
    page.get_by_test_id("show-checked-walls").check()
    result = analyze(PARTS / "clean_holes.step", "clean_holes.step")
    hole_faces = {i for f in result["features"] if f["kind"] == "hole" for i in f["faces"]}
    wall_faces = {i for f in result["features"] if f["kind"] == "wall" for i in f["faces"]}
    assert page.evaluate("window.__dfma.checkedFaces('wall')") == sorted(wall_faces - hole_faces)
    assert page.evaluate("window.__dfma.checkedFaces('hole')") == sorted(hole_faces)


def test_sharp_corner_is_drawn_on_its_edge(page: Page, base_url: str):
    # A sharp corner has no face: selecting it paints no face accent, its walls stay solid (D-015).
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "pocket_sharp.step")
    part_shown(page, "pocket_sharp.step")
    page.get_by_test_id("finding-F1").click()
    result = analyze(PARTS / "pocket_sharp.step", "pocket_sharp.step")
    walls = result["findings"][0]["faces"]
    assert page.evaluate("window.__dfma.paintedFaces()") == []
    opacities = page.evaluate("window.__dfma.opacities()")
    assert all(opacities[str(w)] == 1 for w in walls)
    assert sorted(page.evaluate("window.__dfma.highlightedFaces()")) == sorted(walls)


def _overlapping(boxes):
    return [(a["id"], b["id"]) for i, a in enumerate(boxes) for b in boxes[i + 1:]
            if a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"] and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]]


def test_finding_labels_never_cover_each_other(page: Page, base_url: str):
    # Morgan: "the flags for the failing portions are covering each other" (S3). Every visible
    # label sits clear of the others, before and after a finding is selected.
    page.goto(base_url)
    for name in ("pocket_sharp", "pocket_long_thin_tool", "daratech"):
        path = PARTS / f"{name}.step" if name != "daratech" else next(
            (PARTS.parent / "edmr" / "models" / "STEP" / "STI").rglob("daratech.stp"))  # 25 findings on a real part
        page.get_by_test_id("upload-file").set_input_files(path)
        part_shown(page, path.name)
        expect(page.get_by_test_id("finding-F5")).to_be_visible()
        # Labels are placed on the next drawn frame; a large part takes longer to draw.
        page.wait_for_function("window.__dfma.flagBoxes().length >= 4", timeout=30_000)
        boxes = page.evaluate("window.__dfma.flagBoxes()")
        assert _overlapping(boxes) == [], name
        page.get_by_test_id("finding-F1").click()
        page.wait_for_timeout(300)
        assert _overlapping(page.evaluate("window.__dfma.flagBoxes()")) == [], name
        page.get_by_test_id("finding-F1").click()


def test_pins_sit_on_their_findings(page: Page, base_url: str):
    # D-017: every finding has a pin on a visible spot of its faces, folded into the pin it would cover
    # ("F4 +2"), or hidden while its spot is behind the part. The selected pin is solid in its severity
    # colour, on a stem to a dot on its spot.
    page.goto(base_url)
    path = next((PARTS.parent / "edmr" / "models" / "STEP" / "STI").rglob("daratech.stp"))
    page.get_by_test_id("upload-file").set_input_files(path)
    part_shown(page, path.name)
    expect(page.get_by_test_id("finding-F5")).to_be_visible()
    page.wait_for_function("window.__dfma.flagBoxes().length >= 1", timeout=30_000)
    state = page.evaluate("window.__dfma.flagState()")
    shown = {s["id"] for s in state if s["shown"]}
    count = page.locator("#findings .finding").count()
    assert len(state) == count
    assert all(s["shown"] or s["mergedInto"] in shown or s["mergedInto"] == "" for s in state)
    assert len(shown) < count  # 23 findings on this part: some pins fold together
    for s in state:  # a folded pin's "+n" counts the pins inside it
        if s["shown"]:
            inside = sum(1 for o in state if o["mergedInto"] == s["id"])
            more = page.locator(f'.viewer .flag[data-id="{s["id"]}"]').get_attribute("data-more")
            assert more == (f"+{inside}" if inside else ""), s["id"]

    page.get_by_test_id("finding-F1").click()
    pin = page.locator('.viewer .flag[data-id="F1"]')
    expect(pin).to_have_class(re.compile(r"\bchosen\b"))
    severity = page.get_by_test_id("finding-F1").locator(".sev").get_attribute("class").split()[1]  # "sev high"
    colour = page.evaluate(f"getComputedStyle(document.documentElement).getPropertyValue('--{severity}').trim()")
    assert pin.evaluate("e => getComputedStyle(e).backgroundColor") == page.evaluate(
        f"(() => {{ const d = document.createElement('i'); d.style.color = '{colour}'; document.body.append(d);"
        " const c = getComputedStyle(d).color; d.remove(); return c; })()")
    # D-029: every pin shown stands on a stem to a dot on its spot (before, only the selected one did)
    shown_now = sum(1 for s in page.evaluate("window.__dfma.flagState()") if s["shown"])
    assert page.locator(".viewer svg.leaders line").count() == shown_now
    assert page.locator(".viewer svg.leaders circle").count() == shown_now
    assert _overlapping(page.evaluate("window.__dfma.flagBoxes()")) == []


def test_pins_behind_the_part_are_hidden(page: Page, base_url: str):
    # pocket_sharp's findings are all in its pocket on top: seen from underneath, no pin shows.
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(PARTS / "pocket_sharp.step")
    part_shown(page, "pocket_sharp.step")
    expect(page.get_by_test_id("finding-F5")).to_be_visible()
    page.wait_for_function("window.__dfma.flagBoxes().length >= 1", timeout=30_000)
    box = page.get_by_test_id("viewer-canvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx, cy - box["height"] * 0.9, steps=12)  # orbit to look up at the bottom face
    page.mouse.up()
    page.wait_for_timeout(300)
    assert page.evaluate("window.__dfma.flagBoxes()") == []
