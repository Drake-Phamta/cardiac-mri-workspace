"""Ways to fuse the two projected feature maps in the GateFuse head, by name,
for train_ml.py --fusion (used with --model gate).

Every entry takes the projection width and returns a head with the interface of
models.FusionDecoder: head(f_dinov3, f_mricore) -> (logits, g). All of them
share the projections and the decoder of FusionDecoder; only the gate differs.

  token  the IP gate (config D): g = sigmoid(conv3x3([P_dinov3, P_mricore])), one
         value per token of the 32 x 32 grid; F = g * P_dinov3 + (1 - g) * P_mricore
"""
from models import FusionDecoder


def token_gate(width):
    return FusionDecoder("gate", width=width)


FUSIONS = {"token": token_gate}
