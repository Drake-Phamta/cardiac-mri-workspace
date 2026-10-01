# PR #37 review counterfactual: run the UNMODIFIED bring-up, but load the frozen
# DINOv2 backbone inside torch.random.fork_rng(), so the global RNG state the
# decoder is initialised from no longer depends on transformers' loading internals.
# Usage: python forkrng_driver.py <spike_c_ml dir> <pipeline_bringup args...>
import runpy, sys
from pathlib import Path
import torch
from transformers import Dinov2Model

root = Path(sys.argv[1]).resolve()
_orig = Dinov2Model.from_pretrained.__func__


def _patched(cls, *args, **kwargs):
    with torch.random.fork_rng(devices=[]):
        return _orig(cls, *args, **kwargs)


Dinov2Model.from_pretrained = classmethod(_patched)
sys.path.insert(0, str(root / "harness"))
sys.argv = [str(root / "harness" / "pipeline_bringup.py")] + sys.argv[2:]
runpy.run_path(sys.argv[0], run_name="__main__")
