"""Training losses by name, for train_ml.py --loss.

Every loss takes the logits and the 0/1 target, both (B, 1, H, W), and returns
a scalar. Like the IP loss, the overlap terms are computed per slice with a
smoothing constant eps = 1 and then averaged over the batch.

  bce_dice       0.5 * BCE + 0.5 * (1 - soft Dice): the IP loss
  soft_dice      1 - soft Dice alone, without the BCE term
  focal_tversky  focal Tversky loss (Abraham and Khan, ISBI 2019): weighs missed
                 atrium (FN) more than false alarms (FP) and focuses on slices
                 that are still segmented badly
"""
import torch

from models import bce_dice_loss

SUM = (1, 2, 3)


def soft_dice_loss(logits, target, eps=1.0):
    p = torch.sigmoid(logits)
    inter = (p * target).sum(dim=SUM)
    dice = (2 * inter + eps) / (p.sum(dim=SUM) + target.sum(dim=SUM) + eps)
    return (1 - dice).mean()


def focal_tversky_loss(logits, target, alpha=0.7, beta=0.3, gamma=0.75, eps=1.0):
    """Tversky index TI = TP / (TP + alpha * FN + beta * FP); loss = mean of (1 - TI) ** gamma.

    alpha = 0.7, beta = 0.3 and gamma = 0.75 (= 1 / (4/3)) are the values of the paper.
    With alpha = beta = 0.5 and gamma = 1, TI is the Dice coefficient.
    """
    p = torch.sigmoid(logits)
    tp = (p * target).sum(dim=SUM)
    fn = ((1 - p) * target).sum(dim=SUM)
    fp = (p * (1 - target)).sum(dim=SUM)
    ti = (tp + eps) / (tp + alpha * fn + beta * fp + eps)
    # x ** 0.75 has an infinite slope at x = 0, reached on a perfectly predicted empty slice
    return (1 - ti).clamp(min=1e-6).pow(gamma).mean()


LOSSES = {"bce_dice": bce_dice_loss, "soft_dice": soft_dice_loss, "focal_tversky": focal_tversky_loss}
