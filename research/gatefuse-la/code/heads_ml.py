"""Ways to fuse the two projected feature maps in the GateFuse head, by name,
for train_ml.py --fusion (used with --model gate).

Every entry takes the projection width and returns a head with the interface of
models.FusionDecoder: head(f_dinov3, f_mricore) -> (logits, g). All of them
share the projections and the decoder of FusionDecoder and mix the same way,
F = g * P_dinov3 + (1 - g) * P_mricore; only the shape of the gate g differs.

  token    the IP gate (config D): g = sigmoid(conv3x3([P_dinov3, P_mricore])),
           one value per token of the 32 x 32 grid, g: (B, 1, 32, 32)
  scalar   one value per image, from the image average of [P_dinov3, P_mricore]
           through a linear layer, g: (B, 1, 1, 1)
  channel  the same, with one value per feature channel, g: (B, width, 1, 1)

All gates start at g = 0.5 (zero weights and bias), as in the IP model.
"""
import torch
import torch.nn as nn

from models import FusionDecoder


def token_gate(width):
    return FusionDecoder("gate", width=width)


class PooledGate(FusionDecoder):
    """A gate computed from the average of the projected maps over the image,
    so it cannot change from one place of the image to another."""

    def __init__(self, width=128, per_channel=False):
        super().__init__("gate", width=width)
        self.gate = nn.Linear(2 * width, width if per_channel else 1)    # replaces the 3x3 conv gate
        nn.init.zeros_(self.gate.weight)
        nn.init.zeros_(self.gate.bias)

    def fuse(self, f_g, f_m):
        pg, pm = self.proj_g(f_g), self.proj_m(f_m)
        pooled = torch.cat([pg, pm], 1).mean(dim=(2, 3))                  # (B, 2 * width)
        g = torch.sigmoid(self.gate(pooled))[:, :, None, None]
        return g * pg + (1 - g) * pm, g


def scalar_gate(width):
    return PooledGate(width)


def channel_gate(width):
    return PooledGate(width, per_channel=True)


FUSIONS = {"token": token_gate, "scalar": scalar_gate, "channel": channel_gate}
