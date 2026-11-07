"""Print one line per result file: hole and pocket surfaces found, wrong calls, and the calls on
labels the scores leave out (O-ring as hole or pocket, blind slots and steps as pocket, rounds and
stock as either; slots shaped like a pocket beside a step on their own line, D-019), plus parts that did not score. python tests/grading/summary.py <result.json>..."""

from __future__ import annotations

import json
import sys

HOLE, POCKET = ("1", "12"), ("13", "14", "15", "16")


def pocket_shaped_slot(feature: dict, labels: list) -> bool:
    """D-019: a pocket on a blind slot (17-19) whose end is closed by one wall shorter than the rest,
    past which lies a blind step's floor (20-22): the same shape as a real pocket beside a step, so it
    counts as a right pocket call, on its own line. child.py gives each pocket its short walls."""
    short = feature.get("short_walls") or []
    return (feature["kind"] == "pocket" and any(labels[i] in range(17, 20) for i in feature["faces"])
            and len(short) == 1 and any(labels[k] in range(20, 23) for k in short[0][1]))


def excluded_calls(per_part: list[dict]) -> dict[str, int]:
    """Faces with a label the scores leave out that we put in a hole or a pocket (a face in both is
    the hole's, as in grade.predicted)."""
    out = {"o-ring-as-hole": 0, "o-ring-as-pocket": 0, "slot-step-as-pocket": 0, "slot-shaped-as-pocket": 0,
           "other-excluded": 0}
    for part in per_part:
        labels, kind = part.get("labels"), {}
        if labels is None:
            continue
        shaped: set[int] = set()
        for f in part["features"]:
            for i in f["faces"]:
                if f["kind"] == "hole" or kind.get(i) != "hole":
                    kind[i] = f["kind"]
            if pocket_shaped_slot(f, labels):
                shaped.update(f["faces"])
        for i, k in kind.items():
            lab = labels[i]
            if lab == 11:
                out[f"o-ring-as-{k}"] += 1
            elif lab in range(17, 20) and k == "pocket" and i in shaped:
                out["slot-shaped-as-pocket"] += 1
            elif lab in range(17, 23) and k == "pocket":
                out["slot-step-as-pocket"] += 1
            elif lab in (23, 24) or (lab in range(17, 23) and k == "hole"):
                out["other-excluded"] += 1
    return out


def line(path: str) -> str:
    d = json.load(open(path, encoding="utf-8"))
    s = d["scores"]
    hn, ho = (sum(s["recall"][k][x] for k in HOLE) for x in ("n", "of"))
    pn, po = (sum(s["recall"][k][x] for k in POCKET) for x in ("n", "of"))
    ph, pp = s["precision"]["hole"], s["precision"]["pocket"]
    ex = " ".join(f"{k} {v}" for k, v in excluded_calls(d["per_part"]).items())
    return (f"{path.split('/')[-1]}: {d['status']} holes {hn}/{ho} (miss {ho - hn}, wrong {ph['of'] - ph['n']}) "
            f"pockets {pn}/{po} (miss {po - pn}, wrong {pp['of'] - pp['n']}) {ex}")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(line(p))
