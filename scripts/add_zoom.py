"""Add the screenshot viewer (scripts/zoom_viewer.html, D-024) to a page: screenshots fit the screen, and a tap
opens one full screen to pinch, double-tap, drag or use the buttons to zoom.

    python scripts/add_zoom.py <page.html> [...]      (in place; running it twice adds nothing)
"""

from __future__ import annotations

import sys
from pathlib import Path

SNIPPET = (Path(__file__).resolve().parent / "zoom_viewer.html").read_text(encoding="utf-8")
MARK = 'id="zv"'


def main() -> int:
    for name in sys.argv[1:]:
        page = Path(name)
        html = page.read_text(encoding="utf-8")
        if MARK in html:
            start = html.index("<!-- Screenshot viewer (D-024)")
            end = html.index("</script>", html.index(MARK)) + len("</script>")
            html = html[:start] + html[end:].lstrip("\n")  # replace an older copy
        at = html.rfind("</main>")
        at = at + len("</main>") if at != -1 else len(html)
        html = html[:at] + "\n" + SNIPPET + html[at:]
        page.write_text(html, encoding="utf-8")
        print(f"zoom viewer added to {page}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
