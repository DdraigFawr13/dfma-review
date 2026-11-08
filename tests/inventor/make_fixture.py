"""Write the two NIST thread fixtures the browser tests answer /api/analyze with (spec I1 "Test files"):
tests/inventor/fixtures/ctc_04.json and stc_10.json, each the full Milling / Aluminum 6061 response for the pair
lined up by the test harness (nist_pair.py). test_inventor_threads.py::test_fixtures_current checks they're current.

    python tests/inventor/make_fixture.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from nist_files import ap242_files  # noqa: E402
from nist_pair import analyze_registered  # noqa: E402

FIXTURES = HERE / "fixtures"
# fixture name -> (NIST STEP file name, .ipt file name); spec I1 "Problem" names the pairs
PAIRS = {"ctc_04": ("nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt"),
         "stc_10": ("nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt")}


def build(name: str) -> dict:
    step_name, ipt_name = PAIRS[name]
    step = next(p for p in ap242_files() if p.name == step_name)
    return analyze_registered(step, HERE / "files" / ipt_name)


def main() -> None:
    FIXTURES.mkdir(exist_ok=True)
    for name in PAIRS:
        (FIXTURES / f"{name}.json").write_text(json.dumps(build(name), separators=(",", ":")), "utf-8")
        print(f"wrote {name}.json")


if __name__ == "__main__":
    main()
