"""Score our hole and pocket recognition against labelled parts (grading spike, before S5).

Two answer keys, both downloaded to the git-ignored tests/grading/.cache/ (never committed):

  MFCAD++ (CC BY): each face's class is the name of its ADVANCED_FACE, e.g. ADVANCED_FACE('24',...).
      python tests/grading/grade.py mfcadpp <folder of .step> [--limit 500] [--out result.json]
  Analysis Situs (BSD-3) tests/feature-recognition: a datafile and the expected face ids (refFids,
  1-based MapShapes order over the whole shape).
      python tests/grading/grade.py situs <AnalysisSitus checkout> [--out result.json]

Each file is analysed by child.py in its own process (some files crash OpenCascade, LESSONS
"read"), so a crash is a result, not a dead run. The functions above `main` are pure and tested
in tests/service/test_grading.py.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHILD = HERE / "child.py"
TIME_LIMIT_S = 180.0
MARK = "@@grade-result@@"  # the result line child.py prints (it must match there)

# MFCAD++ classes (feature_labels.txt in the published archive) mapped to our kinds.
HOLE_CLASSES = {1: "through", 12: "blind"}
POCKET_CLASSES = {13: "triangular", 14: "rectangular", 15: "6-sided", 16: "circular end"}
EXCLUDED = {11, *range(17, 25)}  # O-ring, blind slots and steps, round, stock: not scored
CLASS_NAMES = {
    0: "Chamfer", 1: "Through hole", 2: "Triangular passage", 3: "Rectangular passage",
    4: "6-sided passage", 5: "Triangular through slot", 6: "Rectangular through slot",
    7: "Circular through slot", 8: "Rectangular through step", 9: "2-sided through step",
    10: "Slanted through step", 11: "O-ring", 12: "Blind hole", 13: "Triangular pocket",
    14: "Rectangular pocket", 15: "6-sided pocket", 16: "Circular end pocket",
    17: "Rectangular blind slot", 18: "Vertical circular end blind slot",
    19: "Horizontal circular end blind slot", 20: "Triangular blind step",
    21: "Circular blind step", 22: "Rectangular blind step", 23: "Round", 24: "Stock",
}

_LABEL = re.compile(rb"ADVANCED_FACE\s*\(\s*'(\d+)'")


def file_labels(step_bytes: bytes) -> list[int]:
    """The MFCAD++ label of every ADVANCED_FACE, in file order."""
    return [int(v) for v in _LABEL.findall(step_bytes)]


def face_labels(result: dict, in_file: list[int]) -> tuple[list[int | None], dict]:
    """Our faces' labels, joined through each face's STEP entity, with the order checks.

    checks: same_count (our faces == ADVANCED_FACEs), file_order (our face i is the file's
    face i), names_agree (entity name == the label at its file position), kinds_agree (the
    second reader saw the same face kinds, so the join by index is sound).
    """
    faces = result["faces"]
    labels: list[int | None] = []
    for f in faces:
        name = f.get("name")
        labels.append(int(name) if name is not None and name.isdigit() else None)
    pos = [f.get("file_pos") for f in faces]
    checks = {
        "same_count": len(faces) == len(in_file),
        "file_order": pos == list(range(len(faces))),
        "names_agree": all(p is not None and p < len(in_file) and in_file[p] == lab
                           for p, lab in zip(pos, labels)),
        "kinds_agree": all(f.get("kind2") in (None, f["kind"]) for f in faces),
    }
    return labels, checks


def predicted(result: dict) -> list[str | None]:
    """Our label for each face: "through" or "blind" (a hole with 2+ or 1 open end), "hole" (a hole
    whose engine gives no type, open_ends None), "pocket", or None.
    A face in both a hole and a pocket counts as the hole's."""
    out: list[str | None] = [None] * len(result["faces"])
    for f in result["features"]:
        if f["kind"] == "pocket":
            for i in f["faces"]:
                out[i] = out[i] or "pocket"
    for f in result["features"]:
        if f["kind"] == "hole":
            for i in f["faces"]:
                out[i] = "hole" if f["open_ends"] is None else "through" if f["open_ends"] >= 2 else "blind"
    return out


def tally(labels: list[int | None], preds: list[str | None]) -> Counter:
    """Counts for one part, keyed (label, prediction); excluded labels are dropped, and so are faces
    whose label could not be read. Excluded faces we claimed are counted under ("excluded", pred)."""
    c: Counter = Counter()
    for lab, p in zip(labels, preds):
        if lab is None:
            c[("unlabelled", p)] += 1
        elif lab in EXCLUDED:
            if p:
                c[("excluded", p)] += 1
        else:
            c[(lab, p)] += 1
    return c


def _ratio(n: int, d: int) -> dict:
    return {"n": n, "of": d, "pct": round(100 * n / d, 1) if d else None}


def scores(total: Counter) -> dict:
    """Face recall per MFCAD++ class, precision per hole type and per kind.

    recall(class)         faces of that class we put in the matching kind (hole for 1 and 12,
                          pocket for 13-16) / faces of that class
    type recall(1, 12)    ... also given the right type (through / blind)
    precision(through)    faces we called a through hole that are class 1 / faces we called a
                          through hole (excluded-label faces left out); the same for blind
    precision(hole)       faces we put in any hole that are class 1 or 12 / faces in any hole
    precision(pocket)     faces we put in a pocket that are class 13-16 / faces in a pocket
    """
    out: dict = {"recall": {}, "type_recall": {}, "precision": {}}
    for cls, typ in HOLE_CLASSES.items():
        of = sum(v for (lab, _), v in total.items() if lab == cls)
        out["recall"][cls] = _ratio(sum(v for (lab, p), v in total.items() if lab == cls and p in ("through", "blind", "hole")), of)
        out["type_recall"][cls] = _ratio(total[(cls, typ)], of)
    for cls in POCKET_CLASSES:
        of = sum(v for (lab, _), v in total.items() if lab == cls)
        out["recall"][cls] = _ratio(total[(cls, "pocket")], of)
    scored = [(lab, p, v) for (lab, p), v in total.items() if isinstance(lab, int)]
    for name, cls_set, preds in (("through", {1}, {"through"}), ("blind", {12}, {"blind"}),
                                 ("hole", set(HOLE_CLASSES), {"through", "blind", "hole"}),
                                 ("pocket", set(POCKET_CLASSES), {"pocket"})):
        claimed = sum(v for lab, p, v in scored if p in preds)
        out["precision"][name] = _ratio(sum(v for lab, p, v in scored if p in preds and lab in cls_set), claimed)
    out["false_by_label"] = {kind: dict(Counter({lab: v for lab, p, v in scored if p in preds and lab not in cls_set}).most_common())
                             for kind, cls_set, preds in (("hole", set(HOLE_CLASSES), {"through", "blind", "hole"}),
                                                          ("pocket", set(POCKET_CLASSES), {"pocket"}))}
    out["claimed_on_excluded"] = {p: v for (lab, p), v in total.items() if lab == "excluded"}
    return out


def misses(name: str, labels: list[int | None], preds: list[str | None]) -> list[dict]:
    """One record per part and class with the faces we missed (0-based ids) and what we called them."""
    out = []
    for cls in (*HOLE_CLASSES, *POCKET_CLASSES):
        want = {"pocket"} if cls in POCKET_CLASSES else {"through", "blind", "hole"}
        missed = [i for i, (lab, p) in enumerate(zip(labels, preds)) if lab == cls and p not in want]
        if missed:
            out.append({"part": name, "class": cls, "faces": missed, "called": [preds[i] for i in missed]})
    return out


def parse_situs_case(text: str) -> dict:
    """datafile, refFids (1-based ids), and the limit variables of one Analysis Situs test case."""
    case: dict = {}
    if m := re.search(r"^\s*set\s+datafile\s+(\S+)", text, re.M):
        case["datafile"] = m.group(1)
    if m := re.search(r"^\s*set\s+refFids\s*\{([^}]*)\}", text, re.M):
        case["refFids"] = [int(v) for v in m.group(1).split()]
    for var in ("radius", "maxSize", "maxVolume"):
        if m := re.search(rf"^\s*set\s+{var}\s+(\S+)", text, re.M):
            case[var] = float(m.group(1))
    return case


def situs_predicted(result: dict, kinds: set[str], face_kinds: set[str] | None = None) -> list[int]:
    """Our faces in features of the given kinds, as 1-based whole-shape ids (sorted); with
    face_kinds, only faces of those surface kinds (Analysis Situs holes list cylinders only)."""
    ids = {result["faces"][i]["shape_id"] for f in result["features"] if f["kind"] in kinds for i in f["faces"]
           if face_kinds is None or result["faces"][i]["kind"] in face_kinds}
    return sorted(i for i in ids if i is not None)


def compare(pred: list[int], ref: list[int]) -> dict:
    p, r = set(pred), set(ref)
    return {"exact": p == r, "tp": len(p & r), "fp": sorted(p - r), "fn": sorted(r - p),
            "precision": _ratio(len(p & r), len(p)), "recall": _ratio(len(p & r), len(r))}


# --- running (needs the dfma environment; not unit tested) ---

ENGINE = {"cmd": [sys.executable, str(CHILD)], "faces": "faces"}  # set by main() for --engine


def analyse(path: Path, cmd: list[str] | None = None) -> dict:
    """Run one file through an engine's child process (ours by default) and read its result line."""
    try:
        proc = subprocess.run([*(cmd or ENGINE["cmd"]), str(path)], capture_output=True, text=True, timeout=TIME_LIMIT_S)
    except subprocess.TimeoutExpired:
        return {"status": "timeout"}
    lines = [ln for ln in proc.stdout.splitlines() if ln.startswith(MARK)]
    if proc.returncode != 0 or not lines:
        return {"status": "crash", "returncode": proc.returncode, "stderr": proc.stderr[-400:]}
    out = json.loads(lines[-1][len(MARK):])
    out["status"] = "read_error" if out.get("error") else "ok"
    if ENGINE["faces"] != "faces":  # e.g. Quiddity's wider "constituent" face sets
        for f in out.get("features", []):
            f["faces"] = f.get(ENGINE["faces"], f["faces"])
    return out


def run_all(paths: list[Path], jobs: int) -> dict[Path, dict]:
    with ThreadPoolExecutor(jobs) as pool:
        return dict(zip(paths, pool.map(analyse, paths)))


def mfcadpp(folder: Path, limit: int | None, jobs: int) -> dict:
    paths = sorted(folder.glob("*.step"), key=lambda p: p.stem)  # lexical order of ids, as Quiddity
    paths = paths[:limit] if limit else paths
    results = run_all(paths, jobs)
    total: Counter = Counter()
    parts, all_misses = [], []
    for path, r in results.items():
        rec = {"part": path.name, "status": r["status"]}
        if r["status"] == "ok":
            labels, checks = face_labels(r, file_labels(path.read_bytes()))
            preds = predicted(r)
            rec.update(checks=checks, faces=len(labels), ignored_solids=r["ignored_solids"])
            if checks["kinds_agree"]:
                total += tally(labels, preds)
                all_misses += misses(path.name, labels, preds)
                rec["features"] = r["features"]
                rec["labels"] = labels
            else:
                rec["status"] = "join_failed"
        parts.append(rec)
    status = Counter(p["status"] for p in parts)
    checks = {k: sum(1 for p in parts if p.get("checks", {}).get(k)) for k in ("same_count", "file_order", "names_agree", "kinds_agree")}
    return {"set": str(folder), "parts": len(parts), "status": dict(status), "checks_true": checks,
            "scores": scores(total), "misses": all_misses, "per_part": parts}


def situs(root: Path, jobs: int) -> dict:
    cases = []
    for grid, kinds in (("recognize-holes", {"hole"}), ("recognize-cavities", {"pocket"})):
        for f in sorted((root / "tests" / "feature-recognition" / grid).glob("[A-Z][0-9][0-9]")):
            case = parse_situs_case(f.read_text(encoding="utf-8"))
            cases.append({"grid": grid, "case": f.name, "kinds": sorted(kinds), **case})
    files = sorted({root / "data" / c["datafile"] for c in cases})
    results = run_all(files, jobs)
    for c in cases:
        r = results[root / "data" / c["datafile"]]
        c["status"] = r["status"]
        if r["status"] == "ok":
            c["faces"] = len(r["faces"])
            c["ignored_solids"] = r["ignored_solids"]
            c["result"] = compare(situs_predicted(r, set(c["kinds"])), c["refFids"])
            if c["grid"] == "recognize-holes":  # their hole sets hold the cylinders only (case A03)
                c["result_cylinders"] = compare(situs_predicted(r, {"hole"}, {"cylinder"}), c["refFids"])
            if c["grid"] == "recognize-cavities":  # cavities can include holes: also score holes + pockets
                c["result_with_holes"] = compare(situs_predicted(r, {"hole", "pocket"}), c["refFids"])
        else:
            c["error"] = r.get("error") or r.get("stderr") or r["status"]
    return {"root": str(root), "cases": cases}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("set", choices=("mfcadpp", "situs"))
    ap.add_argument("path", type=Path)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--engine", choices=("ours", "quiddity", "situs"), default="ours",
                    help="ours: child.py in this interpreter; quiddity: qchild.py in --python; situs: schild.py with --situs-bin")
    ap.add_argument("--python", help="interpreter for the quiddity engine (one with Quiddity 0.3.x installed)")
    ap.add_argument("--faces", default="faces", help="quiddity only: 'faces' (defining) or 'constituent'")
    ap.add_argument("--situs-bin", help="situs only: the built as_recognize program")
    a = ap.parse_args()
    if a.engine == "quiddity":
        ENGINE.update(cmd=[a.python, str(HERE / "qchild.py")], faces=a.faces)
    elif a.engine == "situs":
        ENGINE.update(cmd=[sys.executable, str(HERE / "schild.py"), a.situs_bin])  # faces: holes, cavities
    out = mfcadpp(a.path, a.limit, a.jobs) if a.set == "mfcadpp" else situs(a.path, a.jobs)
    text = json.dumps(out, indent=1, default=str)
    if a.out:
        a.out.write_text(text, encoding="utf-8")
    summary = {k: v for k, v in out.items() if k not in ("misses", "per_part", "cases")}
    if a.set == "situs":
        for grid in ("recognize-holes", "recognize-cavities"):
            cs = [c for c in out["cases"] if c["grid"] == grid]
            summary[grid] = {k: sum(1 for c in cs if c.get(k, {}).get("exact")) for k in
                             ("result", "result_cylinders", "result_with_holes")} | {"cases": len(cs),
                             "status": dict(Counter(c["status"] for c in cs))}
    print(json.dumps(summary, indent=1, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
