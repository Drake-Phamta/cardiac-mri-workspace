"""Training losses by name, for train_ml.py --loss.

Every loss takes the logits and the 0/1 target, both (B, 1, H, W), and returns
a scalar.

  bce_dice  0.5 * BCE + 0.5 * (1 - soft Dice per slice): the IP loss
"""
from models import bce_dice_loss

LOSSES = {"bce_dice": bce_dice_loss}
