import json
import sys
from argparse import Namespace

import pytest

import make_folds
import train_ml

IP = dict(train=[f"tr{i:02d}" for i in range(72)], val=[f"va{i}" for i in range(8)],
          test=[f"te{i:02d}" for i in range(20)])
NON_TEST = IP["train"] + IP["val"]


@pytest.fixture
def folds():
    return make_folds.make_folds(IP)


def full_folds(folds):
    return [folds[f"fold{k}_full"] for k in range(5)]


def test_two_files_per_fold(folds):
    assert sorted(folds) == sorted(f"fold{k}_{kind}" for k in range(5) for kind in ("full", "few"))


def test_test_sets_partition_the_80_volumes(folds):
    tests = [v for f in full_folds(folds) for v in f["test"]]
    assert len(tests) == 80 and sorted(tests) == sorted(NON_TEST)


def test_each_fold_uses_all_80_without_overlap(folds):
    for f in full_folds(folds):
        train, val, test = set(f["train"]), set(f["val"]), set(f["test"])
        assert (len(f["train"]), len(f["val"]), len(f["test"])) == (56, 8, 16)
        assert not (train & val or train & test or val & test)
        assert train | val | test == set(NON_TEST)


def test_no_volume_validates_twice(folds):
    vals = [v for f in full_folds(folds) for v in f["val"]]
    assert len(vals) == len(set(vals)) == 40


def test_few_label_runs_share_val_and_test_with_their_fold(folds):
    for k in range(5):
        full, few = folds[f"fold{k}_full"], folds[f"fold{k}_few"]
        assert len(few["train"]) == 8 and set(few["train"]) <= set(full["train"])
        assert (few["val"], few["test"]) == (full["val"], full["test"])


def test_the_ip_test_set_is_never_used(folds):
    for f in folds.values():
        assert not set(f["train"] + f["val"] + f["test"]) & set(IP["test"])


def test_folds_are_seeded(folds):
    assert make_folds.make_folds(IP) == folds
    assert make_folds.make_folds(IP, seed=1) != folds


def test_written_files_are_read_by_train_ml(tmp_path, monkeypatch):
    monkeypatch.setattr(make_folds, "load_splits", lambda: IP)
    monkeypatch.setattr(sys, "argv", ["make_folds.py", "--out-dir", str(tmp_path)])
    make_folds.main()
    assert len(list(tmp_path.glob("fold*.json"))) == 10
    path = tmp_path / "fold3_few.json"
    assert json.loads(path.read_text()) == make_folds.make_folds(IP)["fold3_few"]
    train, val, test = train_ml.read_splits(Namespace(split_file=str(path), labels="few"))
    assert (len(train), len(val), len(test)) == (8, 8, 16)
