"""train_ml.py with its default options must train exactly what the IP train.py trains.

Both scripts run a few iterations on a tiny synthetic LA_WORK (random slices and
features, nothing from the real data), on the CPU, with the same arguments and
seed. The losses, the validation Dice after every iteration, the best weights
and the predictions must be bit-identical.
"""
import json
from argparse import Namespace
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import torch

import models
import train_ml


def assert_same_run(a: Path, b: Path):
    ha, hb = pd.read_csv(a / "history.csv"), pd.read_csv(b / "history.csv")
    assert ha["loss"].nunique() > 1                     # it did train
    assert ha["loss"].tolist() == hb["loss"].tolist()
    assert ha["val_dice"].tolist() == hb["val_dice"].tolist()
    wa = torch.load(a / "best.pt", weights_only=True)
    wb = torch.load(b / "best.pt", weights_only=True)
    assert list(wa) == list(wb)
    assert all(torch.equal(wa[k], wb[k]) for k in wa)
    files = sorted(p.name for p in a.glob("*.npz"))
    assert files == sorted(p.name for p in b.glob("*.npz"))
    for name in files:
        pa, pb = np.load(a / name), np.load(b / name)
        assert pa.files == pb.files
        assert all(np.array_equal(pa[v], pb[v]) for v in pa.files)
    sa, sb = (json.loads((d / "summary.json").read_text()) for d in (a, b))
    assert (sa["best_iter"], sa["best_val_dice"], sa["n_params"]) == (sb["best_iter"], sb["best_val_dice"], sb["n_params"])


@pytest.fixture(scope="module")
def ip_runs(train_on_tiny_work, tmp_path_factory):
    root = tmp_path_factory.mktemp("ip")
    return {m: train_on_tiny_work("train.py", ["--model", m, "--labels", "full", "--seed", "1"], root / m)
            for m in ("gate", "unet")}


@pytest.mark.parametrize("model", ["gate", "unet"])
def test_defaults_train_exactly_what_train_py_trains(train_on_tiny_work, ip_runs, tmp_path, model):
    ml = train_on_tiny_work("train_ml.py", ["--model", model, "--labels", "full", "--seed", "1"], tmp_path / "ml")
    assert_same_run(ip_runs[model], ml)
    if model == "gate":
        assert (ml / "gate_test.npz").exists()


def test_the_comparison_notices_another_seed(train_on_tiny_work, ip_runs, tmp_path):
    other = train_on_tiny_work("train_ml.py", ["--model", "gate", "--labels", "full", "--seed", "2"], tmp_path / "s2")
    with pytest.raises(AssertionError):
        assert_same_run(ip_runs["gate"], other)


def test_split_file_with_the_ip_lists_changes_nothing(tiny_work, train_on_tiny_work, tmp_path):
    ip = json.loads((tiny_work / "prep" / "splits.json").read_text())
    split_file = tmp_path / "ip_few.json"
    # the IP "few" volumes in another order: the slice order comes from meta.csv, not from the list
    split_file.write_text(json.dumps(dict(train=ip["few"][::-1], val=ip["val"], test=ip["test"])))
    args = ["--model", "gate", "--labels", "few", "--seed", "0"]
    default = train_on_tiny_work("train_ml.py", args, tmp_path / "default")
    from_file = train_on_tiny_work("train_ml.py", args + ["--split-file", str(split_file)], tmp_path / "file")
    assert_same_run(default, from_file)


def test_split_file_with_unknown_volumes_is_refused(train_on_tiny_work, tmp_path):
    split_file = tmp_path / "typo.json"
    split_file.write_text(json.dumps(dict(train=["T1", "T9"], val=["V1"], test=["S1"])))
    with pytest.raises(AssertionError, match=r"not in prep/meta.csv: \['T9'\]"):
        train_on_tiny_work("train_ml.py", ["--model", "gate", "--split-file", str(split_file)], tmp_path / "run")


def test_split_file_overlapping_test_is_refused(tmp_path):
    split_file = tmp_path / "leak.json"
    split_file.write_text(json.dumps(dict(train=["A", "B"], val=["C"], test=["B"])))
    with pytest.raises(SystemExit, match="overlap"):
        train_ml.read_splits(Namespace(split_file=str(split_file), labels="full"))


def test_default_options_are_the_ip_ones():
    a = train_ml.parse(["--model", "gate", "--out", "x"])
    assert (a.split_file, a.loss, a.aug, a.fusion, a.width) == (None, "bce_dice", "none", "token", 128)
    assert train_ml.LOSSES["bce_dice"] is models.bce_dice_loss
    batch = {"x": torch.zeros(2, 4, 4)}
    assert train_ml.AUGMENTS["none"](batch, torch.Generator()) is batch
    torch.manual_seed(0)
    head = train_ml.FUSIONS["token"](128)
    torch.manual_seed(0)
    ip = models.FusionDecoder("gate", width=128)
    assert all(torch.equal(p, q) for p, q in zip(head.state_dict().values(), ip.state_dict().values()))


def test_out_is_required():
    with pytest.raises(SystemExit):
        train_ml.parse(["--model", "gate"])
