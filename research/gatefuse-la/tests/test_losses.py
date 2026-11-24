import math

import pytest
import torch

import models
from losses import LOSSES, focal_tversky_loss, soft_dice_loss

# one 2 x 2 slice whose target is all atrium, predicted with p = 0.5 everywhere
HALF = torch.zeros(1, 1, 2, 2)
ALL = torch.ones(1, 1, 2, 2)


def test_registry():
    assert LOSSES["bce_dice"] is models.bce_dice_loss
    assert LOSSES["soft_dice"] is soft_dice_loss
    assert LOSSES["focal_tversky"] is focal_tversky_loss


def test_soft_dice_by_hand():
    # TP = 2, sum p = 2, sum t = 4: Dice = (2 * 2 + 1) / (2 + 4 + 1) = 5 / 7
    assert soft_dice_loss(HALF, ALL).item() == pytest.approx(2 / 7)


def test_focal_tversky_by_hand():
    # TP = 2, FN = 2, FP = 0: TI = (2 + 1) / (2 + 0.7 * 2 + 1) = 3 / 4.4
    assert focal_tversky_loss(HALF, ALL).item() == pytest.approx((1 - 3 / 4.4) ** 0.75)


def test_bce_dice_is_half_bce_plus_half_soft_dice():
    logits, target = torch.randn(3, 1, 8, 8), (torch.rand(3, 1, 8, 8) > 0.5).float()
    bce = torch.nn.functional.binary_cross_entropy_with_logits(logits, target)
    expected = 0.5 * bce + 0.5 * soft_dice_loss(logits, target)
    assert models.bce_dice_loss(logits, target).item() == pytest.approx(expected.item())


def test_tversky_with_equal_weights_is_dice():
    # alpha = beta = 0.5 doubles numerator and denominator of Dice, so eps is halved
    logits, target = torch.randn(3, 1, 8, 8), (torch.rand(3, 1, 8, 8) > 0.5).float()
    ft = focal_tversky_loss(logits, target, alpha=0.5, beta=0.5, gamma=1.0, eps=0.5)
    assert ft.item() == pytest.approx(soft_dice_loss(logits, target, eps=1.0).item())


def first_pixels(k):
    m = torch.zeros(16)
    m[:k] = 1
    return m.view(1, 1, 4, 4)


def test_a_miss_costs_more_than_a_false_alarm():
    # A misses 2 pixels of an 8-pixel atrium; B adds 2 pixels to a 6-pixel atrium.
    # Both have TP = 6 and the same Dice, so only the kind of error differs.
    logits_a, target_a = (first_pixels(6) * 2 - 1) * 50, first_pixels(8)
    logits_b, target_b = (first_pixels(8) * 2 - 1) * 50, first_pixels(6)
    assert soft_dice_loss(logits_a, target_a).item() == pytest.approx(soft_dice_loss(logits_b, target_b).item())
    assert focal_tversky_loss(logits_a, target_a) > focal_tversky_loss(logits_b, target_b)


@pytest.mark.parametrize("name", ["soft_dice", "focal_tversky"])
def test_perfect_prediction_has_small_loss_and_finite_gradient(name):
    target = torch.zeros(2, 1, 8, 8)
    target[0, 0, 2:6, 2:6] = 1                               # slice 1 has no atrium at all
    logits = ((target * 2 - 1) * 200).requires_grad_()        # sigmoid saturates to exactly 0 and 1
    loss = LOSSES[name](logits, target)
    loss.backward()
    assert loss.item() < 0.01
    assert torch.isfinite(logits.grad).all()


@pytest.mark.parametrize("name", list(LOSSES))
def test_loss_falls_when_the_prediction_improves(name):
    target = torch.zeros(1, 1, 8, 8)
    target[..., 2:6, 2:6] = 1
    worse, better = (target * 2 - 1) * 0.5, (target * 2 - 1) * 3.0
    assert LOSSES[name](better, target) < LOSSES[name](worse, target)
    assert math.isfinite(LOSSES[name](worse, target).item())
