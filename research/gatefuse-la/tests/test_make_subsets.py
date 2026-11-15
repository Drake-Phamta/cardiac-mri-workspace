import json
import sys
from argparse import Namespace

import pytest

import make_subsets
import train_ml

IP = dict(train=[f"tr{i:02d}" for i in range(72)], val=[f"va{i}" for i in range(8)],
          test=[f"te{i:02d}" for i in range(20)])


@pytest.fixture
def subsets():
    return make_subsets.make_subsets(IP)


def test_one_file_per_training_set(subsets):
    assert sorted(subsets) == sorted(["n4", "n8", "n16", "n36", "n72", "n8_draw1", "n8_draw2"])


def test_nested_sets_follow_the_train_list(subsets):
    sizes = make_subsets.NESTED
    for n in sizes:
        assert subsets[f"n{n}"]["train"] == IP["train"][:n]
    for small, big in zip(sizes, sizes[1:]):
        assert set(subsets[f"n{small}"]["train"]) < set(subsets[f"n{big}"]["train"])
    assert subsets["n72"]["train"] == IP["train"]
    assert subsets["n8"]["train"] == IP["train"][:8]          # the IP "few" set


def test_val_and_test_are_the_ip_lists_and_never_trained_on(subsets):
    for split in subsets.values():
        assert split["val"] == IP["val"] and split["test"] == IP["test"]
        assert not set(split["train"]) & set(split["val"] + split["test"])
        assert len(set(split["train"])) == len(split["train"])


def test_random_draws_are_seeded_and_differ(subsets):
    again = make_subsets.make_subsets(IP)
    d1, d2 = subsets["n8_draw1"]["train"], subsets["n8_draw2"]["train"]
    assert d1 == again["n8_draw1"]["train"] and d2 == again["n8_draw2"]["train"]
    assert len(set(d1)) == len(set(d2)) == 8
    assert set(d1) <= set(IP["train"]) and set(d2) <= set(IP["train"])
    assert set(d1) != set(d2) and set(d1) != set(IP["train"][:8])


def test_too_short_train_list_is_refused():
    with pytest.raises(ValueError):
        make_subsets.make_subsets(dict(IP, train=IP["train"][:40]))


def test_written_files_are_read_by_train_ml(tmp_path, monkeypatch):
    monkeypatch.setattr(make_subsets, "load_splits", lambda: IP)
    monkeypatch.setattr(sys, "argv", ["make_subsets.py", "--out-dir", str(tmp_path)])
    make_subsets.main()
    assert len(list(tmp_path.glob("*.json"))) == 7
    for n in make_subsets.NESTED:
        path = tmp_path / f"n{n}.json"
        assert json.loads(path.read_text()) == make_subsets.make_subsets(IP)[f"n{n}"]
        train, val, test = train_ml.read_splits(Namespace(split_file=str(path), labels="full"))
        assert (len(train), val, test) == (n, IP["val"], IP["test"])
