"""Stream names, raw and inflated hashes of every .ipt, from the app's own reader (olefile)."""
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "service"))
from dfma.inventor.ole import Ipt  # noqa: E402
out = {}
for p in sorted(Path(sys.argv[1]).glob("*.ipt")):
    f = Ipt(p)
    out[p.name] = {n: [hashlib.sha256(f.read(n)).hexdigest(),
                       (lambda d: d and hashlib.sha256(d).hexdigest())(f.inflate(n)) if n.startswith("RSeStorage/B") else None]
                   for n in f.names}
    f.close()
Path(sys.argv[2]).write_text(json.dumps(out, sort_keys=True))
