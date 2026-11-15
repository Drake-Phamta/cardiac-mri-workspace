import numpy as np
import pytest
import torch

import train_ml
from heads_ml import FUSIONS
from models import n_params

B = 2


def features():
    torch.manual_seed(0)
    return torch.randn(B, 768, 32, 32), torch.randn(B, 768, 32, 32)


@pytest.mark.parametrize("width", [32, 128])
@pytest.mark.parametrize("name, g_shape", [("token", (1, 32, 32)), ("scalar", (1, 1, 1)), ("channel", None)])
def test_output_and_gate_shapes(name, g_shape, width):
    head = FUSIONS[name](width).eval()
    logits, g = head(*features())
    assert logits.shape == (B, 1, 256, 256)
    assert g.shape == (B, *(g_shape or (width, 1, 1)))


@pytest.mark.parametrize("name", list(FUSIONS))
def test_gate_starts_at_one_half_and_stays_in_0_1(name):
    head = FUSIONS[name](32).eval()
    _, g = head(*features())
    assert torch.all(g == 0.5)
    with torch.no_grad():
        for p in head.gate.parameters():
            p.normal_(0, 10)                                  # large weights push g to the ends
    _, g = head(*features())
    assert g.min() >= 0 and g.max() <= 1
    assert (g - 0.5).abs().max() > 0.45


@pytest.mark.parametrize("name", list(FUSIONS))
def test_g_one_takes_dinov3_and_g_zero_takes_mricore(name):
    head = FUSIONS[name](32).eval()
    f_g, f_m = features()
    with torch.no_grad():
        pg, pm = head.proj_g(f_g), head.proj_m(f_m)
        head.gate.bias.fill_(100.0)                           # weights are still zero: g = 1
        fused, _ = head.fuse(f_g, f_m)
        assert torch.allclose(fused, pg)
        head.gate.bias.fill_(-100.0)                          # g = 0
        fused, _ = head.fuse(f_g, f_m)
        assert torch.allclose(fused, pm)


@pytest.mark.parametrize("width", [32, 64, 128, 256])
def test_parameter_counts(width):
    token, scalar, channel = (n_params(FUSIONS[n](width)) for n in ("token", "scalar", "channel"))
    token_gate = 2 * width * 3 * 3 + 1                        # 3x3 conv, 2 * width -> 1
    assert token - scalar == token_gate - (2 * width + 1)      # linear, 2 * width -> 1
    assert channel - token == (2 * width * width + width) - token_gate
    if width == 128:
        assert token == 297594                                # the IP GateFuse head


def test_fusion_needs_the_gate_model():
    with pytest.raises(SystemExit):
        train_ml.parse(["--model", "concat", "--fusion", "scalar", "--out", "x"])


@pytest.mark.parametrize("name, gate_shape", [("scalar", (1, 1)), ("channel", (32,))])
def test_new_gates_train_end_to_end(train_on_tiny_work, tmp_path, name, gate_shape):
    out = train_on_tiny_work("train_ml.py", ["--model", "gate", "--labels", "few", "--fusion", name,
                                             "--width", "32"], tmp_path / name)
    gates = np.load(out / "gate_test.npz")
    assert all(gates[v].shape[1:] == gate_shape for v in gates.files)
