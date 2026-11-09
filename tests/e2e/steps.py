"""Helpers for the step screen (review-steps spec, D-045): open a step by its tab."""

from __future__ import annotations

from playwright.sync_api import Page, expect

STEPS = ("part", "features", "machining", "cost", "report")


def open_step(page: Page, name: str) -> None:
    """Tap the step's tab and wait until its section shows."""
    page.get_by_test_id(f"step-{name}").click()
    expect(page.get_by_test_id(f"page-{name}")).to_be_visible()


def load(page: Page, base_url: str, path, timeout: int = 60_000) -> None:
    """Open the app, pick a STEP file and wait for the overview."""
    page.goto(base_url)
    page.get_by_test_id("upload-file").set_input_files(path)
    expect(page.get_by_test_id("overview")).to_be_visible(timeout=timeout)


def shown(page: Page, name: str, step: str | None = "features", timeout: int = 60_000) -> None:
    """Wait until the part named `name` is read (a new part opens on its overview), then open `step`."""
    expect(page.locator("#status")).to_contain_text(f"Showing {name}", timeout=timeout)
    expect(page.get_by_test_id("overview")).to_be_visible()
    if step:
        open_step(page, step)


def show_finding(page: Page, result: dict, fid: str) -> None:
    """Open the Features row holding finding `fid` and step (›) to it; its detail then shows it."""
    row = next(r for r in result["rows"] if fid in r["findings"])
    page.get_by_test_id(f"row-{row['id'].removeprefix('row:')}").click()
    for _ in range(row["findings"].index(fid)):
        page.get_by_test_id("row-next").click()
    expect(page.get_by_test_id("row-detail")).to_contain_text(f"{fid} · ")
