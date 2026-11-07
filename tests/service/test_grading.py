"""The grading scorer (tests/grading/grade.py): label join, counts and Analysis Situs parsing.

The pure functions are checked on hand-made inputs with known answers; one test runs the child
process on our own test parts, end to end. The outside answer keys are not needed here.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from collections import Counter

from helpers import PARTS, ROOT

sys.path.insert(0, str(ROOT / "tests" / "grading"))
import grade  # noqa: E402


def _faces(names, kinds=None):
    kinds = kinds or ["plane"] * len(names)
    return [{"kind": k, "kind2": k, "name": n, "file_pos": i, "shape_id": i + 1} for i, (n, k) in enumerate(zip(names, kinds))]


def test_file_labels_read_the_face_names_in_order():
    step = b"#1=ADVANCED_FACE('24',(#2),#3,.T.);\n#4 = ADVANCED_FACE ( '1' ,(#5),#6,.F.);\n#7=FACE_BOUND('',#8,.T.);"
    assert grade.file_labels(step) == [24, 1]


def test_face_labels_join_through_the_entity_and_check_order():
    labels, checks = grade.face_labels({"faces": _faces(["24", "1", "12"])}, [24, 1, 12])
    assert labels == [24, 1, 12]
    assert checks == {"same_count": True, "file_order": True, "names_agree": True, "kinds_agree": True}


def test_face_labels_flag_a_reordered_join():
    faces = _faces(["1", "24"])
    faces[0]["file_pos"], faces[1]["file_pos"] = 1, 0  # our face 0 is the file's face 1
    faces[1]["kind2"] = "cylinder"
    labels, checks = grade.face_labels({"faces": faces}, [24, 1])
    assert labels == [1, 24]
    assert checks["file_order"] is False and checks["names_agree"] is True and checks["kinds_agree"] is False


def test_predicted_splits_through_and_blind_and_holes_win_over_pockets():
    result = {"faces": _faces(["0"] * 6), "features": [
        {"kind": "pocket", "faces": [3, 4, 5], "open_ends": 1},
        {"kind": "hole", "faces": [0, 1], "open_ends": 2},
        {"kind": "hole", "faces": [2, 3], "open_ends": 1},
    ]}
    assert grade.predicted(result) == ["through", "through", "blind", "blind", "pocket", "pocket"]


def test_scores_count_recall_precision_and_drop_excluded_labels():
    labels = [1, 1, 12, 12, 14, 14, 3, 24, 11, None]
    preds = ["through", None, "through", "blind", "pocket", None, "pocket", None, "through", "pocket"]
    total = grade.tally(labels, preds)
    s = grade.scores(total)
    assert s["recall"][1] == {"n": 1, "of": 2, "pct": 50.0}
    assert s["recall"][12] == {"n": 2, "of": 2, "pct": 100.0}  # found as a hole, either type
    assert s["type_recall"][12] == {"n": 1, "of": 2, "pct": 50.0}
    assert s["recall"][14] == {"n": 1, "of": 2, "pct": 50.0}
    assert s["recall"][13] == {"n": 0, "of": 0, "pct": None}
    assert s["precision"]["through"] == {"n": 1, "of": 2, "pct": 50.0}  # face 2 is blind; face 8 (O-ring) dropped
    assert s["precision"]["hole"] == {"n": 3, "of": 3, "pct": 100.0}
    assert s["precision"]["pocket"] == {"n": 1, "of": 2, "pct": 50.0}  # face 6 is a passage (class 3)
    assert s["false_by_label"]["pocket"] == {3: 1}
    assert s["claimed_on_excluded"] == {"through": 1}
    assert total[("unlabelled", "pocket")] == 1


def test_misses_list_the_faces_per_class():
    out = grade.misses("p.step", [1, 1, 14, 0], ["through", None, "blind", None])
    assert out == [{"part": "p.step", "class": 1, "faces": [1], "called": [None]},
                   {"part": "p.step", "class": 14, "faces": [2], "called": ["blind"]}]


def test_parse_situs_case():
    text = ("# Set working variables.\nset datafile public/cad/holes/obstructed-hole.step\n"
            "set radius 1e10\nset refFids { 5 7 }\n\n__recognize-holes\n")
    assert grade.parse_situs_case(text) == {"datafile": "public/cad/holes/obstructed-hole.step",
                                            "refFids": [5, 7], "radius": 1e10}
    assert grade.parse_situs_case("set datafile  a.brep\nset maxSize   0\nset refFids { }\n")["refFids"] == []


def test_situs_ids_are_one_based_and_compare_is_exact():
    result = {"faces": _faces(["", "", ""], ["plane", "cylinder", "plane"]),
              "features": [{"kind": "hole", "faces": [1, 2], "open_ends": 1}]}
    assert grade.situs_predicted(result, {"hole"}) == [2, 3]
    assert grade.situs_predicted(result, {"hole"}, {"cylinder"}) == [2]
    c = grade.compare([2, 3], [2, 4])
    assert c["exact"] is False and c["tp"] == 1 and c["fp"] == [3] and c["fn"] == [4]
    assert grade.compare([], [])["exact"] is True


def test_child_runs_our_part_end_to_end():
    """One process per file, as for outside files; a box with one through hole (expected.toml)."""
    r = grade.analyse(PARTS / "box_through_hole.step")
    assert r["status"] == "ok", r
    assert len(r["faces"]) == 7
    assert [f["shape_id"] for f in r["faces"]] == list(range(1, 8))
    assert [f["file_pos"] for f in r["faces"]] == list(range(7))
    assert all(f["kind"] == f["kind2"] for f in r["faces"])
    assert Counter(f["kind"] for f in r["features"]) == {"hole": 1}
    assert r["features"][0]["open_ends"] == 2
    assert grade.predicted(r).count("through") == 1


def test_child_reports_a_read_error_as_a_result():
    assert grade.analyse(PARTS / "not_step.step")["status"] == "read_error"


def test_analyse_reads_any_engine_and_can_swap_face_sets(tmp_path, monkeypatch):
    """Other engines (Quiddity, Analysis Situs) print the same result line; noise before it is ignored,
    and --faces picks another face list (Quiddity's "constituent" faces) for scoring."""
    fake = tmp_path / "fake_child.py"
    fake.write_text(
        "import json, sys\n"
        "print('kernel banner on stdout')\n"
        f"print({grade.MARK!r} + json.dumps({{'faces': [{{'kind': 'plane'}}] * 3, 'ignored_solids': 0, 'error': None,"
        " 'features': [{'kind': 'pocket', 'faces': [0], 'constituent': [0, 2], 'open_ends': 1}]}))\n",
        encoding="utf-8")
    r = grade.analyse(PARTS / "box_through_hole.step", [sys.executable, str(fake)])
    assert r["status"] == "ok" and r["features"][0]["faces"] == [0]
    monkeypatch.setitem(grade.ENGINE, "faces", "constituent")
    r = grade.analyse(PARTS / "box_through_hole.step", [sys.executable, str(fake)])
    assert r["features"][0]["faces"] == [0, 2]


def test_analyse_reports_a_crash(tmp_path):
    fake = tmp_path / "crash.py"
    fake.write_text("import os\nos._exit(139)\n", encoding="utf-8")
    assert grade.analyse(PARTS / "box_through_hole.step", [sys.executable, str(fake)])["status"] == "crash"


def test_untyped_holes_count_for_recall_but_not_type_precision():
    """Analysis Situs gives holes no through/blind type: they count as holes, not as either type."""
    result = {"faces": _faces(["1", "12", "0"]), "features": [{"kind": "hole", "faces": [0, 1, 2], "open_ends": None}]}
    preds = grade.predicted(result)
    assert preds == ["hole", "hole", "hole"]
    s = grade.scores(grade.tally([1, 12, 0], preds))
    assert s["recall"][1]["n"] == 1 and s["recall"][12]["n"] == 1
    assert s["precision"]["hole"] == {"n": 2, "of": 3, "pct": 66.7}
    assert s["precision"]["through"]["of"] == 0 and s["type_recall"][1]["n"] == 0


def test_select_takes_ids_in_lexical_order_with_skip_and_limit():
    from pathlib import Path
    paths = [Path(f"{n}.step") for n in ("2", "10", "1000", "100", "3")]
    assert [p.stem for p in grade.select(paths)] == ["10", "100", "1000", "2", "3"]
    assert [p.stem for p in grade.select(paths, skip=2, limit=2)] == ["1000", "2"]


def test_a_part_that_fails_still_counts_its_labelled_faces_as_misses():
    """Adversarial review 2026-11-07: a timed-out or unreadable part left the denominators, so a tool
    that failed on hard parts scored higher. Its labelled faces now count as misses."""
    in_file = [1, 1, 14, 11, 0]
    for status in ("timeout", "read_error", "crash"):
        rec, counts, missed = grade.score_part("p.step", {"status": status}, in_file)
        assert rec["status"] == status
        s = grade.scores(counts)
        assert s["recall"][1] == {"n": 0, "of": 2, "pct": 0.0}
        assert s["recall"][14] == {"n": 0, "of": 1, "pct": 0.0}
        assert [m["class"] for m in missed] == [1, 14]


def test_a_failed_join_counts_as_misses_too():
    r = {"status": "ok", "ignored_solids": 0, "features": [{"kind": "hole", "faces": [0], "open_ends": 2}],
         "faces": [{"kind": "plane", "kind2": "cylinder", "name": "1", "file_pos": 0}]}
    rec, counts, _ = grade.score_part("p.step", r, [1])
    assert rec["status"] == "join_failed"
    assert grade.scores(counts)["recall"][1] == {"n": 0, "of": 1, "pct": 0.0}


def test_a_part_whose_face_names_cannot_be_read_is_a_failed_join():
    """Adversarial review 2026-11-07: with no names every label was None and the part scored 0/0."""
    r = {"status": "ok", "ignored_solids": 0, "features": [],
         "faces": [{"kind": "cylinder", "kind2": None, "name": None, "file_pos": None}]}
    rec, counts, _ = grade.score_part("p.step", r, [1])
    assert rec["status"] == "join_failed"
    assert grade.scores(counts)["recall"][1] == {"n": 0, "of": 1, "pct": 0.0}


def test_summary_counts_o_ring_faces_called_pockets():
    """Parent session 2026-11-07: O-ring faces called pockets were in no number."""
    sys.path.insert(0, str(Path(grade.__file__).parent))
    import summary
    part = {"labels": [11, 11, 18, 24, 14], "features": [
        {"kind": "pocket", "faces": [0, 2, 3, 4]}, {"kind": "hole", "faces": [1]}]}
    assert summary.excluded_calls([part]) == {"o-ring-as-hole": 1, "o-ring-as-pocket": 1,
                                              "slot-step-as-pocket": 1, "slot-shaped-as-pocket": 0,
                                              "other-excluded": 1}


def test_summary_puts_a_slot_shaped_like_a_pocket_beside_a_step_on_its_own_line():
    """D-019: one short wall over a blind step's floor (20) is a pocket by shape (MFCAD++ 10649)."""
    sys.path.insert(0, str(Path(grade.__file__).parent))
    import summary
    labels = [17, 17, 17, 17, 20, 18, 18, 18]
    shaped = {"kind": "pocket", "faces": [0, 1, 2, 3], "short_walls": [[1, [4]]]}
    two_short = {"kind": "pocket", "faces": [5, 6, 7], "short_walls": [[6, [4]], [7, [4]]]}
    got = summary.excluded_calls([{"labels": labels, "features": [shaped, two_short]}])
    assert got["slot-shaped-as-pocket"] == 4 and got["slot-step-as-pocket"] == 3


def test_another_engine_without_file_positions_still_joins():
    """qchild.py and schild.py give names but no file positions; a first version of the join gate
    (names_agree) failed every part of theirs."""
    r = {"status": "ok", "ignored_solids": 0, "features": [{"kind": "hole", "faces": [0], "open_ends": None}],
         "faces": [{"kind": "cylinder", "kind2": "cylinder", "name": "1", "file_pos": None}]}
    rec, counts, _ = grade.score_part("p.step", r, [1])
    assert rec["status"] == "ok"
    assert grade.scores(counts)["recall"][1] == {"n": 1, "of": 1, "pct": 100.0}


def test_instance_score_joins_a_stepped_holes_chain_and_finds_splits_and_merges():
    """Hole-joins set (HANDOFF 3a): a counterbore and its bore share a chain and are one hole; two
    holes read as one group are merged; one hole in two groups is split."""
    ours = [{"kind": "hole", "faces": [0, 1], "chain": 1}, {"kind": "hole", "faces": [2], "chain": 1},
            {"kind": "hole", "faces": [3], "chain": 2}, {"kind": "hole", "faces": [4], "chain": 3},
            {"kind": "pocket", "faces": [5]}]
    assert grade.instance_score(ours, [[0, 1, 2], [3, 4]]) == {"whole": 1, "of": 2, "split": 1, "merged": 0}
    # Quiddity: features with no chain, each its own hole
    quid = [{"kind": "hole", "faces": [0, 1, 2], "open_ends": 2}, {"kind": "hole", "faces": [3, 4], "open_ends": 1}]
    assert grade.instance_score(quid, [[0, 1, 2], [3, 4]])["whole"] == 2
    # Analysis Situs: every hole face in one feature, so two holes are merged
    situs = [{"kind": "hole", "faces": [0, 1, 2, 3, 4], "open_ends": None}]
    assert grade.instance_score(situs, [[0, 1, 2], [3, 4]]) == {"whole": 0, "of": 2, "split": 0, "merged": 2}
    assert grade.instance_score([], [[0]]) == {"whole": 0, "of": 1, "split": 0, "merged": 0}


def test_a_set_with_instances_scores_whole_holes(tmp_path, monkeypatch):
    (tmp_path / "a.step").write_bytes(b"ADVANCED_FACE('1',x) ADVANCED_FACE('1',x)")
    (tmp_path / "INSTANCES.json").write_text('{"a": [[0, 1]]}')
    faces = [{"kind": "cylinder", "kind2": "cylinder", "name": "1", "file_pos": i} for i in range(2)]
    monkeypatch.setattr(grade, "run_all", lambda paths, jobs: {p: {"status": "ok", "ignored_solids": 0, "faces": faces,
                        "features": [{"kind": "hole", "faces": [0], "open_ends": 2, "chain": 1},
                                     {"kind": "hole", "faces": [1], "open_ends": 2, "chain": 2}]} for p in paths})
    out = grade.mfcadpp(tmp_path, None, 1)
    assert out["holes_whole"] == {"whole": 0, "of": 1, "split": 1, "merged": 0}
    sys.path.insert(0, str(Path(grade.__file__).parent))
    import summary
    (tmp_path / "r.json").write_text(json.dumps(out))
    assert "whole holes 0/1 (split 1, merged 0)" in summary.line(str(tmp_path / "r.json"))
