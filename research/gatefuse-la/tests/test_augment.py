import pandas as pd
import pytest
import torch

import train_ml
from augment import AUGMENTS, flip_rotate_intensity


def l_shapes(n=16, size=96):
    """Image and mask of an L shape, which looks different after every flip."""
    y = torch.zeros(n, size, size, dtype=torch.uint8)
    y[:, 20:70, 25:40] = 1
    y[:, 55:70, 25:75] = 1
    x = (30 + 180 * y).to(torch.uint8)                      # background 30, atrium 210
    return {"x": x, "y": y}


def augmented(seed):
    return flip_rotate_intensity(l_shapes(), torch.Generator().manual_seed(seed))


def test_registry():
    assert AUGMENTS["on"] is flip_rotate_intensity


def test_image_and_mask_stay_aligned():
    out = augmented(0)
    bright = out["x"] > 120                                  # midway between the two grey levels
    mask = out["y"] > 0.5
    iou = (bright & mask).sum((1, 2)) / (bright | mask).sum((1, 2))
    assert iou.min() > 0.95


def test_slices_are_transformed_differently():
    before, after = l_shapes()["y"].float(), augmented(0)["y"]
    changed = (after != before).flatten(1).any(1)
    assert changed.sum() >= 12                               # flips and rotations move nearly every slice
    assert len({tuple(m.flatten().tolist()) for m in after}) > 4


def test_mask_stays_binary_and_image_stays_in_range():
    out = augmented(1)
    assert set(out["y"].unique().tolist()) <= {0.0, 1.0}
    assert out["x"].min() >= 0 and out["x"].max() <= 255
    assert out["x"].shape == out["y"].shape == (16, 96, 96)


def test_same_seed_same_augmentation():
    a, b, c = augmented(3), augmented(3), augmented(4)
    assert torch.equal(a["x"], b["x"]) and torch.equal(a["y"], b["y"])
    assert not torch.equal(a["x"], c["x"])


@pytest.mark.parametrize("model", ["gate", "concat", "dinov3", "mricore", "gatedge"])
def test_feature_models_cannot_be_augmented(model):
    with pytest.raises(SystemExit):
        train_ml.parse(["--model", model, "--aug", "on", "--out", "x"])


def test_unet_recipe_trains_end_to_end(train_on_tiny_work, tmp_path):
    out = train_on_tiny_work("train_ml.py", ["--model", "unet", "--labels", "few", "--aug", "on",
                                             "--loss", "focal_tversky"], tmp_path / "run")
    hist = pd.read_csv(out / "history.csv")
    assert len(hist) == 5 and hist["loss"].notna().all()
    assert (out / "pred_test.npz").exists()
