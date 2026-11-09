"""Build a UI-direction round page: embed the screenshots as JPEG data URIs and append the zoom viewer (D-024).

    python mockups/ui-direction/build_round.py <round.src.html> <shots dir> <out.html>

`{{img:<name>}}` becomes one picture's data URI; `{{imgs}}` becomes a JS object of every picture in the shots dir.
The zoom viewer goes after the page's own script, so it also binds the pictures that script draws.
"""

from __future__ import annotations

import base64
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ZOOM = (ROOT / "scripts" / "zoom_viewer.html").read_text(encoding="utf-8")


def data_uri(png: Path) -> str:
    im = Image.open(png).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def main() -> int:
    src, shots, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    imgs = {p.stem: data_uri(p) for p in sorted(shots.glob("*.png"))}
    html = src.read_text(encoding="utf-8")
    html = re.sub(r"\{\{img:([\w-]+)\}\}", lambda m: imgs[m.group(1)], html)
    html = html.replace("{{imgs}}", json.dumps(imgs))
    html += "\n" + ZOOM
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB, {len(imgs)} pictures)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
