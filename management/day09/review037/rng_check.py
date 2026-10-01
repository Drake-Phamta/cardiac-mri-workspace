# PR #37 review diagnostic: does loading the frozen DINOv2 backbone consume the
# global torch RNG before the trainable decoder is initialised?
import json, sys
import torch, transformers
from transformers import Dinov2Model

REV = "ed25f3a31f01632728cabb09d1542f84ab7b0056"
out = {"torch": torch.__version__, "transformers": transformers.__version__}

torch.manual_seed(2024)
control = torch.rand(8)
torch.manual_seed(2024)
control_again = torch.rand(8)
out["control_same_seed_same_draw"] = bool(torch.equal(control, control_again))

torch.manual_seed(2024)
m = Dinov2Model.from_pretrained("facebook/dinov2-small", revision=REV,
                                local_files_only=True, attn_implementation="sdpa")
after_load = torch.rand(8)
out["rng_consumed_by_from_pretrained"] = not bool(torch.equal(control, after_load))
out["attn_implementation"] = getattr(m.config, "_attn_implementation", "unknown")

# Frozen-feature fingerprint at the bring-up resolution (560 px -> 40x40 grid),
# on a deterministic input, so two environments can compare backbone outputs
# independently of any decoder initialisation.
g = torch.Generator().manual_seed(7)
x = torch.rand(1, 3, 560, 560, generator=g)
m.eval()
with torch.no_grad():
    h = m(pixel_values=x).last_hidden_state.double()
out["feature_shape"] = list(h.shape)
out["feature_mean"] = round(float(h.mean()), 8)
out["feature_std"] = round(float(h.std()), 8)
out["feature_abs_sum"] = round(float(h.abs().sum()), 4)
print(json.dumps(out, indent=2))
