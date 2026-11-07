"""Print one line per result file: hole and pocket surfaces found, wrong calls, and the
O-ring and slot calls the scores leave out. python tests/grading/summary.py <result.json>..."""

from __future__ import annotations

import json
import sys

HOLE, POCKET = ("1", "12"), ("13", "14", "15", "16")


def line(path: str) -> str:
    d = json.load(open(path, encoding="utf-8"))
    s = d["scores"]
    hn, ho = (sum(s["recall"][k][x] for k in HOLE) for x in ("n", "of"))
    pn, po = (sum(s["recall"][k][x] for k in POCKET) for x in ("n", "of"))
    ph, pp = s["precision"]["hole"], s["precision"]["pocket"]
    oring = slots = 0
    for part in d["per_part"]:
        labels, kind = part.get("labels"), {}
        if labels is None:
            continue
        for f in part["features"]:
            for i in f["faces"]:
                if f["kind"] == "hole" or kind.get(i) != "hole":
                    kind[i] = f["kind"]
        oring += sum(1 for i, k in kind.items() if labels[i] == 11 and k == "hole")
        slots += sum(1 for i, k in kind.items() if labels[i] in range(17, 23) and k == "pocket")
    return (f"{path.split('/')[-1]}: {d['status']} holes {hn}/{ho} (miss {ho - hn}, wrong {ph['of'] - ph['n']}) "
            f"pockets {pn}/{po} (miss {po - pn}, wrong {pp['of'] - pp['n']}) o-ring-as-hole {oring} slot-step-as-pocket {slots}")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(line(p))
