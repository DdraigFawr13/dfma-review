"""The 2026-11-09 UX audit's service wording (docs/audit/2026-11-09-ux.md, D-053): messages a user reads carry no
decision ids or file names (F1), say what to do (F3, F11), spell American (F12) and gloss their jargon (F13)."""

from __future__ import annotations

import re

import pytest

from helpers import PARTS

from dfma import settings
from dfma.analyze import analyze

INTERNAL = re.compile(r"D-0\d\d|config/|\(spec\b")
BRITISH = re.compile(r"analys(?:e|ed|es|ing)\b|neighbour|millimetre|colour|centre", re.I)
MESSAGES = [v for k, v in vars(settings).items() if k.startswith("MSG_") and isinstance(v, str)]
SHOWN = ("title", "suggestion", "limit_text", "check")  # a finding's fields the screen and the PDF print


@pytest.fixture(scope="module")
def results() -> list[dict]:
    return [analyze(PARTS / "report_sample.step", "report_sample.step"),
            analyze(PARTS / "shaft_with_groove_and_bore.step", "shaft.step", "turn")]


def _shown(r: dict) -> list[str]:
    out = list(r["assumptions"]) + list(r["checks_run"])
    out += [f[k] for f in r["findings"] for k in SHOWN]
    out += [row[k] for row in r["rows"] + r["passed_rows"] for k in ("short", "sentence", "check", "limit")]
    out += [p[k] for p in r["passed"] for k in ("title", "math", "limit_text")]
    return out


def test_f1_no_ids_or_file_names(results):
    texts = MESSAGES + settings.ASSUMPTIONS + settings.TURN_ASSUMPTIONS + [t for r in results for t in _shown(r)]
    assert [t for t in texts if INTERNAL.search(t)] == []


def test_f12_american_spelling(results):
    texts = MESSAGES + settings.ASSUMPTIONS + settings.TURN_ASSUMPTIONS + [t for r in results for t in _shown(r)]
    assert [t for t in texts if BRITISH.search(t)] == []


def test_f3_errors_say_how_to_fix_them():
    assert settings.MSG_NOT_STEP.endswith("Export it again as .step or .stp from your CAD.")
    assert settings.MSG_NO_SOLID.endswith("Export the part as a solid body, not surfaces or a drawing.")
    assert settings.MSG_TOO_LARGE.endswith("Export a single body or a smaller part.")
    assert settings.MSG_TOO_LONG.endswith("Try again; if it stops again, export a single body or a smaller part.")
    for m in (settings.MSG_IPT_TOO_BIG, settings.MSG_IPT_NO_MODEL, settings.MSG_IPT_FORMAT):
        assert m.endswith("Upload the STEP on its own, without the .ipt."), m


def test_f11_warnings_end_with_an_action():
    assert settings.MSG_OPEN_SHELL.endswith("Check the file for gaps and export it again.")
    assert settings.MSG_NO_UNIT.endswith("Set the unit in your CAD export, then upload again.")


def test_f13_jargon_glossed(results):
    assert "ACIS" not in settings.MSG_IPT_FORMAT
    sentences = {row["rule"]: row["sentence"] for row in results[0]["rows"]}
    assert "EDM (spark erosion)" in sentences["corner_radius"]
    assert "peck drilling (drilling in short steps to clear chips)" in sentences["hole_depth"]


def test_f14_wall_math_in_its_title_decimals(results):
    wall = next(p for p in results[0]["passed"] if p["feature"] == "wall-1")
    assert wall["math"] == "4.000 in ≥ 0.030 in"


def test_f3_only_a_timeout_offers_to_try_again(monkeypatch):
    """The page shows "try again" only when the service says trying again can help (a timeout), not for a refused file."""
    from fastapi.testclient import TestClient

    from dfma import app as app_module
    from dfma.read import ReadError
    from dfma.worker import AnalysisTimeout

    def post(exc):
        def boom(*a, **k):
            raise exc
        monkeypatch.setattr(app_module, "run_analysis", boom)
        with TestClient(app_module.create_app(dist_dir=None)) as c:
            with open(PARTS / "box_through_hole.step", "rb") as f:
                return c.post("/api/analyze", files={"file": ("p.step", f)}, data={"process": "mill", "material": "al6061"})

    timeout = post(AnalysisTimeout())
    assert (timeout.status_code, timeout.json()) == (422, {"error": settings.MSG_TOO_LONG, "retry": True})
    refused = post(ReadError(settings.MSG_NOT_STEP))
    assert (refused.status_code, refused.json()) == (422, {"error": settings.MSG_NOT_STEP})
