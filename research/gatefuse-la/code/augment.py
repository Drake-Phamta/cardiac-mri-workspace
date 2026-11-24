"""Training-time augmentation by name, for train_ml.py --aug.

Every entry takes one training batch (the dict of CPU tensors that
train_ml.Batches yields: "x" image, "y" mask, and/or encoder features) and a
torch.Generator on the training device, and returns the batch to train on.

  none  no augmentation (the IP setting)
  on    for each slice, on the training device: a horizontal and a vertical flip
        (each with probability 0.5), a rotation by up to MAX_DEGREES and a
        change of contrast (x SCALE) and brightness (+ SHIFT). The image and its
        mask get the same flips and rotation; the mask is resampled with the
        nearest neighbour so it stays 0/1.

Only the U-Net can be augmented: the fusion heads read encoder features that
were computed once from the original slices (train_ml.py refuses the mix).
"""
import math

import torch
import torch.nn.functional as F

MAX_DEGREES = 10.0
SCALE = (0.9, 1.1)
SHIFT = (-0.1, 0.1)       # fraction of the grey-level range 0..255


def no_augment(batch, gen):
    return batch


def flip_rotate_intensity(batch, gen):
    dev = gen.device
    x = batch["x"].to(dev).float().unsqueeze(1)           # (B, 1, H, W), grey levels 0..255
    y = batch["y"].to(dev).float().unsqueeze(1)
    n = len(x)

    def uniform(lo, hi):
        return lo + (hi - lo) * torch.rand(n, device=dev, generator=gen)

    angle = uniform(-1, 1) * math.radians(MAX_DEGREES)
    flip_x = torch.where(uniform(0, 1) < 0.5, -1.0, 1.0)
    flip_y = torch.where(uniform(0, 1) < 0.5, -1.0, 1.0)
    cos, sin, zero = torch.cos(angle), torch.sin(angle), torch.zeros(n, device=dev)
    # affine_grid maps every output pixel to the input pixel it reads: rotation times flips
    theta = torch.stack([torch.stack([cos * flip_x, -sin * flip_y, zero], 1),
                         torch.stack([sin * flip_x, cos * flip_y, zero], 1)], 1)
    grid = F.affine_grid(theta, list(x.shape), align_corners=False)
    x = F.grid_sample(x, grid, mode="bilinear", align_corners=False)
    y = F.grid_sample(y, grid, mode="nearest", align_corners=False)

    scale = uniform(*SCALE).view(n, 1, 1, 1)
    shift = uniform(*SHIFT).view(n, 1, 1, 1) * 255
    x = (x * scale + shift).clamp(0, 255)
    return dict(batch, x=x[:, 0], y=y[:, 0])


AUGMENTS = {"none": no_augment, "on": flip_rotate_intensity}
