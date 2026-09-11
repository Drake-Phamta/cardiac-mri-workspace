#!/usr/bin/env python3
"""
Spike C0 compute probe — peak memory, throughput, batch ceiling, output stride.

THROWAWAY SPIKE CODE under spikes/spike_c_ml/. Not production.

`SPIKE_C_ML/TASK.md` permits Claude to write this and keeps the readings with
the owner:

    "Claude may: build the harness, write the extrapolation script, propose
     candidate variants and decoders, structure the result template, and
     analyse measurements the owner supplies."
    "All hardware and timing measurements are executed by Be Quoc Khanh on the
     real compute."

So --operator is required and is written into every output. A number produced
on somebody else's machine answers a question about somebody else's machine.
C0-1 asks what compute EXISTS for this project; only its owner can answer that.

WHAT IT MEASURES                                              CRITERION
    available compute, read from the machine it runs on       C0-1
    peak memory for a UNet family and a ViT/DINOv2 family     C0-2
    largest fitting batch size when the intended one does not C0-3
    forward and forward+backward throughput                   C0-4
    effective output stride of each decoder                   C0-5
    per-variant measured cost                                 C0-6

WHAT IT DOES NOT DO
    It does not run DINOv2 itself. Downloading pretrained weights is not needed
    to answer a memory-and-throughput question: peak memory and step time are
    determined by tensor shapes, layer counts and dtypes, not by the values in
    the weights. The ViT here is a SHAPE- AND COMPUTE-EQUIVALENT STAND-IN for
    DINOv2 ViT-S/14, and every output says so. Substituting the real checkpoint
    changes C0 numbers only marginally; it changes C1 numbers completely, which
    is why convergence lives in C1.

    It does not close GATE-ML-01. DR-007 forbids that on C0 evidence alone, and
    C0-10 requires the statement to be explicit.

    It does not touch real data. C0 must not wait for Spike D.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EVIDENCE = os.path.join(ROOT, "EVIDENCE_RAW")

try:
    import torch
    import torch.nn as nn
except ImportError:                                            # pragma: no cover
    raise SystemExit("This probe needs PyTorch.\n"
                     "    pip install -r spikes/spike_c_ml/requirements.txt")


# --- candidate architectures -------------------------------------------------

class UNet2D(nn.Module):
    """Plain 2D UNet. Output stride 1: skip connections restore full resolution."""

    def __init__(self, in_ch: int = 1, base: int = 32, depth: int = 4):
        super().__init__()
        self.depth = depth
        self.downs = nn.ModuleList()
        self.ups = nn.ModuleList()
        ch = in_ch
        chans = []
        for d in range(depth):
            out = base * (2 ** d)
            self.downs.append(nn.Sequential(
                nn.Conv2d(ch, out, 3, padding=1), nn.BatchNorm2d(out), nn.ReLU(inplace=True),
                nn.Conv2d(out, out, 3, padding=1), nn.BatchNorm2d(out), nn.ReLU(inplace=True)))
            chans.append(out)
            ch = out
        self.bottleneck = nn.Sequential(
            nn.Conv2d(ch, ch * 2, 3, padding=1), nn.BatchNorm2d(ch * 2), nn.ReLU(inplace=True))
        ch = ch * 2
        for d in reversed(range(depth)):
            skip = chans[d]
            self.ups.append(nn.ModuleList([
                nn.ConvTranspose2d(ch, skip, 2, stride=2),
                nn.Sequential(
                    nn.Conv2d(skip * 2, skip, 3, padding=1), nn.BatchNorm2d(skip),
                    nn.ReLU(inplace=True))]))
            ch = skip
        self.head = nn.Conv2d(ch, 1, 1)
        self.pool = nn.MaxPool2d(2)

    def forward(self, x):
        skips = []
        for block in self.downs:
            x = block(x)
            skips.append(x)
            x = self.pool(x)
        x = self.bottleneck(x)
        for (up, conv), skip in zip(self.ups, reversed(skips)):
            x = up(x)
            x = conv(torch.cat([x, skip], dim=1))
        return self.head(x)

    @staticmethod
    def output_stride() -> float:
        return 1.0


class ViTSegStandIn(nn.Module):
    """Shape- and compute-equivalent stand-in for DINOv2 ViT-S/14 + a decoder.

    NOT DINOv2. Same patch size, embedding width, depth and head count, so the
    activation shapes and therefore the memory and step time are representative.
    The weights are random, which is irrelevant to C0 and fatal to C1 - hence
    the split.

    Two decoders are offered because C0-5 asks for the EFFECTIVE output stride,
    and the choice of decoder is precisely what sets it:
        'linear'       one projection per patch, then bilinear upsample -> stride 14
        'progressive'  three learned doublings (x8), remainder interpolated
                       -> effective stride 14/8 = 1.75, NOT 1. No power-of-two
                       stack lands on 14 = 2*7, so the last step interpolates
                       and carries no learned detail.
    """

    def __init__(self, img: int = 518, patch: int = 14, dim: int = 384,
                 depth: int = 12, heads: int = 6, decoder: str = "linear"):
        super().__init__()
        assert img % patch == 0, "image size must be divisible by the patch size"
        self.img = img
        self.patch, self.grid, self.decoder_kind = patch, img // patch, decoder
        self.embed = nn.Conv2d(1, dim, kernel_size=patch, stride=patch)
        self.pos = nn.Parameter(torch.zeros(1, self.grid * self.grid, dim))
        layer = nn.TransformerEncoderLayer(
            d_model=dim, nhead=heads, dim_feedforward=dim * 4,
            batch_first=True, norm_first=True, activation="gelu")
        self.blocks = nn.TransformerEncoder(layer, num_layers=depth)
        if decoder == "linear":
            self.head = nn.Linear(dim, 1)
        else:
            chans = [dim, 128, 64, 32]
            ups = []
            for i in range(3):
                ups += [nn.ConvTranspose2d(chans[i], chans[i + 1], 2, stride=2),
                        nn.BatchNorm2d(chans[i + 1]), nn.ReLU(inplace=True)]
            self.up = nn.Sequential(*ups)
            self.head = nn.Conv2d(32, 1, 1)

    def forward(self, x):
        b = x.shape[0]
        t = self.embed(x).flatten(2).transpose(1, 2) + self.pos
        t = self.blocks(t)
        if self.decoder_kind == "linear":
            logits = self.head(t).transpose(1, 2).reshape(b, 1, self.grid, self.grid)
            return nn.functional.interpolate(
                logits, scale_factor=self.patch, mode="bilinear", align_corners=False)
        f = t.transpose(1, 2).reshape(b, -1, self.grid, self.grid)
        out = self.head(self.up(f))
        # Three learned doublings give x8. The patch size is 14 = 2 * 7, so no
        # power-of-two stack lands on the input size exactly; the remainder is
        # interpolated. That last step carries no learned detail, which is why
        # the effective stride below is 14/8 and not 1.
        if out.shape[-2:] != (self.img, self.img):
            out = nn.functional.interpolate(
                out, size=(self.img, self.img), mode="bilinear", align_corners=False)
        return out

    def output_stride(self) -> float:
        # 'linear' predicts one logit per 14x14 patch; upsampling afterwards adds
        # no information, so the EFFECTIVE stride stays 14.
        return float(self.patch) if self.decoder_kind == "linear" else self.patch / 8.0


# --- measurement -------------------------------------------------------------

def describe_compute() -> dict:
    """C0-1. Read from the machine this runs on. Nothing here is inferred."""
    info = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "processor": platform.processor() or "NOT MEASURED - platform reports nothing",
        "torch": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "mps_available": bool(getattr(torch.backends, "mps", None)
                              and torch.backends.mps.is_available()),
    }
    if torch.cuda.is_available():
        idx = torch.cuda.current_device()
        props = torch.cuda.get_device_properties(idx)
        info.update({
            "device_kind": "cuda",
            "gpu_name": props.name,
            "vram_total_bytes": props.total_memory,
            "vram_total_gb": round(props.total_memory / 1024 ** 3, 2),
            "cuda_version": torch.version.cuda,
            "capability": f"{props.major}.{props.minor}",
        })
    elif info["mps_available"]:
        info.update({"device_kind": "mps", "gpu_name": "Apple Silicon (MPS)",
                     "vram_total_bytes": None,
                     "vram_total_gb": "NOT MEASURED - MPS reports no total"})
    else:
        info.update({
            "device_kind": "cpu",
            "gpu_name": "NONE - CPU only",
            "vram_total_gb": None,
            "c0_1_note": ("This machine exposes no GPU to PyTorch. That is a valid and "
                          "important C0-1 answer, not a failure: TASK.md asks for the GPU "
                          "model and VRAM 'or an explicit statement that only CPU/Colab-class "
                          "resources exist'."),
        })
    return info


def _rss() -> int | None:
    try:
        import psutil
        return psutil.Process(os.getpid()).memory_info().rss
    except ImportError:
        return None


class PeakTracker:
    """Peak memory for the measured section only.

    On CUDA this is torch.cuda.max_memory_allocated, which is a true peak.

    On CPU the first version returned the process's CURRENT RSS - interpreter,
    torch libraries, allocator caches and all - and never reset it, so the
    figure only ever grew. The reviewer measured a 4.62 M-parameter UNet at
    588.8 MB and a 1.16 M-parameter UNet, a quarter the size, at 601.5 MB
    immediately afterwards. The column was meaningless on the exact path a
    GPU-less owner would use.

    It is now a DELTA above a baseline taken at the start of the section, and
    it is sampled during the run rather than read once at the end. It is still
    not a true peak - the allocator does not hand memory back promptly - so it
    is labelled rss_delta and never called "peak" on the CPU path.
    """

    def __init__(self, device: str):
        self.device = device
        self.baseline = None
        self.max_rss = 0

    def start(self):
        if self.device == "cuda":
            torch.cuda.reset_peak_memory_stats()
            torch.cuda.empty_cache()
        else:
            self.baseline = _rss()
            self.max_rss = self.baseline or 0

    def sample(self):
        if self.device != "cuda":
            r = _rss()
            if r and r > self.max_rss:
                self.max_rss = r

    def result(self) -> dict:
        if self.device == "cuda":
            return {"metric": "torch.cuda.max_memory_allocated",
                    "bytes": int(torch.cuda.max_memory_allocated()),
                    "is_true_peak": True}
        if self.baseline is None:
            return {"metric": "unavailable", "bytes": None, "is_true_peak": False,
                    "note": "psutil not installed; install it or read this as NOT MEASURED"}
        return {"metric": "process RSS delta above a baseline, sampled during the run",
                "bytes": int(self.max_rss - self.baseline),
                "baseline_bytes": int(self.baseline),
                "is_true_peak": False,
                "note": "NOT a true peak. The allocator does not return memory promptly, so "
                        "this is a lower bound on what the section needed and an upper bound "
                        "on nothing. Do not compare it across processes."}


def reset_peak(device: str) -> None:
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.empty_cache()


def sync(device: str) -> None:
    if device == "cuda":
        torch.cuda.synchronize()


def time_steps(model, x, y, device: str, steps: int, train: bool) -> dict:
    loss_fn = nn.BCEWithLogitsLoss()
    opt = torch.optim.AdamW(model.parameters(), lr=1e-4) if train else None
    model.train(train)

    # Warm up. The first step pays for kernel selection and allocator growth and
    # is not representative of steady state.
    for _ in range(2):
        if train:
            opt.zero_grad(set_to_none=True)
            loss_fn(model(x), y).backward()
            opt.step()
        else:
            with torch.no_grad():
                model(x)
    sync(device)
    tracker = PeakTracker(device)
    tracker.start()

    times = []
    for _ in range(steps):
        t0 = time.perf_counter()
        if train:
            opt.zero_grad(set_to_none=True)
            loss_fn(model(x), y).backward()
            opt.step()
        else:
            with torch.no_grad():
                model(x)
        sync(device)
        times.append((time.perf_counter() - t0) * 1000.0)
        tracker.sample()

    times.sort()
    # #40: the old ms_median was times[len//2], the UPPER median - times[5] of
    # 10 - and biased high. It is also the single measured input to the whole
    # C0-7/C0-8 calendar. Nearest-rank p50 is used instead, the same definition
    # the Spike E aggregator uses, so the two harnesses are comparable as that
    # file claims.
    k = max(1, -(-50 * len(times) // 100))
    return {
        "steps": steps,
        "ms_min": round(times[0], 2),
        "ms_median": round(times[k - 1], 2),
        "median_definition": "nearest-rank p50, no interpolation",
        "ms_max": round(times[-1], 2),
        "memory": tracker.result(),
    }


def largest_fitting_batch(build, x_shape, device: str, start: int,
                          cap: int = 64, vram_bytes: int | None = None) -> dict:
    """C0-3, the largest batch that actually fits for TRAINING.

    Two things the first version got wrong, both of which inflated the answer.

    1. It treated "no RuntimeError" as "fits". On Windows the NVIDIA driver
       silently spills past VRAM into system memory instead of raising OOM, so
       every variant reported batch 64 on a 4 GB card while the harness's OWN
       recorded peak reached 8135 MB - 1.9x the card - and it then printed
       "the true ceiling may be higher". The VRAM figure was sitting in the
       same record and was never consulted. It is now the deciding test.

    2. It ran forward and backward but never built an optimizer or stepped it,
       so AdamW's exp_avg and exp_avg_sq - two more fp32 copies of every
       parameter - and the step's temporaries were absent, while the timing
       path did use AdamW. C0-3 asks what fits TRAINING.
    """
    ok, tried, stop = 0, [], None
    b = max(1, start)
    while b <= cap:
        try:
            reset_peak(device)
            model = build().to(device)
            opt = torch.optim.AdamW(model.parameters(), lr=1e-4)
            x = torch.randn(b, *x_shape, device=device)
            y = (torch.rand(b, 1, x_shape[1], x_shape[2], device=device) > 0.8).float()
            opt.zero_grad(set_to_none=True)
            nn.BCEWithLogitsLoss()(model(x), y).backward()
            opt.step()                     # optimizer state is part of the footprint
            sync(device)
            peak = torch.cuda.max_memory_allocated() if device == "cuda" else None

            overflowed = bool(vram_bytes and peak and peak > vram_bytes)
            tried.append({"batch": b, "ran_without_error": True,
                          "peak_memory_bytes": peak,
                          "exceeded_vram": overflowed,
                          "fitted": not overflowed})
            del model, opt, x, y
            reset_peak(device)
            if overflowed:
                # It ran, but only because the driver spilled to system memory.
                # That is not a fit; it is a fit-shaped performance cliff.
                stop = (f"batch {b} allocated {peak / 1024 ** 3:.2f} GB against "
                        f"{vram_bytes / 1024 ** 3:.2f} GB of VRAM - the driver spilled to "
                        f"system memory. Counted as NOT fitting.")
                break
            ok = b
        except (RuntimeError, MemoryError) as exc:
            # MemoryError, not just RuntimeError: CPU and MPS raise that, and it
            # used to escape the handler and abort the whole probe mid-search.
            tried.append({"batch": b, "ran_without_error": False, "fitted": False,
                          "error": f"{type(exc).__name__}: {str(exc)[:160]}"})
            stop = f"batch {b} raised {type(exc).__name__}"
            break
        b *= 2
    notes = []
    if ok >= cap:
        notes.append(f"Search capped at {cap}; the true ceiling may be higher.")
    if start > 1 and (ok & (ok - 1)) and ok:
        notes.append(f"Doubling started at {start}, so only {start}, {start*2}, ... were tried. "
                     f"The true ceiling lies between {ok} and {ok * 2} and was not bisected.")
    if vram_bytes is None and device == "cuda":
        notes.append("VRAM total unknown, so a silent spill could not be detected.")
    if device != "cuda":
        notes.append("Not a CUDA device: there is no VRAM limit to test against, so a batch is "
                     "counted as fitting whenever it does not raise. Treat with suspicion.")
    return {"largest_fitting_batch": ok, "attempts": tried, "cap_reached": ok >= cap,
            "stopped_because": stop, "vram_total_bytes": vram_bytes,
            "note": " ".join(notes) or None}


def _make_input(args, device):
    """Probe input: random by default, real synthetic slices on request.

    Memory and step time are set by tensor shapes and layer counts, not by the
    values in the tensor, so torch.randn answers C0's question. synthetic/
    generate.py existed but nothing read it - a dead artifact whose docstring
    claimed it fed this probe. --input-from makes that claim true and lets the
    owner check the equivalence instead of believing it.
    """
    if not args.input_from:
        return torch.randn(args.batch, 1, args.img, args.img, device=device)
    import glob
    import numpy as np
    files = sorted(glob.glob(os.path.join(args.input_from, "*_volume_int16.npy")))
    if not files:
        raise SystemExit(f"No *_volume_int16.npy under {args.input_from}.\n"
                         f"Run: python spikes/spike_c_ml/synthetic/generate.py")
    vol = np.load(files[0], mmap_mode="r")
    nx, ny, nz = vol.shape
    if nx < args.img or ny < args.img:
        raise SystemExit(f"Volume is {nx}x{ny} in-plane but --img is {args.img}. Generate at "
                         f"least that size, or lower --img.")
    sl = np.stack([np.asarray(vol[:args.img, :args.img, k % nz], dtype=np.float32).T
                   for k in range(args.batch)])
    t = torch.from_numpy(sl).unsqueeze(1).to(device)
    return (t - t.mean()) / (t.std() + 1e-6)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--operator", required=True,
                    help="who is running this, on their own compute (C0-1)")
    # 518 was the old default and it CANNOT RUN: 518 % 14 == 0 but 518 % 16 == 6,
    # and the pre-flight check requires both. The probe rejected its own
    # defaults. 560 satisfies both (560 = 16*35 = 14*40) and is the closest
    # usable size to the 576x576 the real package actually contains.
    ap.add_argument("--img", type=int, default=560,
                    help="square input size; must be divisible by BOTH 16 (UNet pools 4x) "
                         "and 14 (ViT patch). 112, 224, 336, 448, 560, 672 all work")
    ap.add_argument("--batch", type=int, default=2, help="intended batch size")
    ap.add_argument("--steps", type=int, default=10)
    ap.add_argument("--device", default=None, help="cuda | mps | cpu (default: best available)")
    ap.add_argument("--find-batch", action="store_true", help="also run the C0-3 batch search")
    ap.add_argument("--input-from", default=None,
                    help="directory from synthetic/generate.py. Slices are taken from those "
                         "volumes instead of torch.randn. Shapes drive memory and throughput, "
                         "so randn answers C0 correctly - this exists so the owner can confirm "
                         "that on real-shaped data rather than take it on trust")
    ap.add_argument("--note", default="")
    args = ap.parse_args()

    compute = describe_compute()
    device = args.device or compute["device_kind"]
    # #45: with --device cpu on a CUDA machine the record still named the GPU,
    # so a CPU-measured calendar verdict was filed against hardware it never
    # touched. Say what was actually used.
    if device != compute.get("device_kind"):
        compute = dict(compute)
        compute["device_actually_used"] = device
        compute["compute_used_for_this_run"] = (
            f"{device} - NOT the {compute.get('gpu_name')} reported above. Every timing and "
            f"memory figure in this record was produced on {device}.")
    torch.manual_seed(2024)

    # The two families constrain the input size differently: the UNet pools four
    # times (needs a multiple of 16) and the ViT tiles into 14x14 patches (needs
    # a multiple of 14). Checked here so a bad size is a clear message rather
    # than four opaque failures.
    unet_div, vit_div = 2 ** 4, 14
    if args.img % unet_div or args.img % vit_div:
        lcm = unet_div * vit_div // 2          # 112
        lower = (args.img // lcm) * lcm
        upper = lower + lcm
        print()
        print(f"  --img {args.img} does not work for both families.")
        print(f"    UNet needs a multiple of {unet_div} (it pools 4 times): "
              f"{'ok' if args.img % unet_div == 0 else 'NO'}")
        print(f"    ViT  needs a multiple of {vit_div} (patch size):        "
              f"{'ok' if args.img % vit_div == 0 else 'NO'}")
        print(f"    Nearest sizes that satisfy both: {lower if lower else upper} or {upper}")
        print("    Common usable sizes: 112, 224, 336, 448, 560, 672")
        print()
        return 2

    # Strides come from the models themselves rather than being retyped here.
    # The two definitions could previously drift with nothing to notice: the
    # class docstring said 1, output_stride() said 1.75, and this table said
    # 14/8 - three values for the number C0-5 asks about.
    builders = [
        ("unet_base32_depth4", lambda: UNet2D(base=32, depth=4)),
        ("unet_base16_depth4", lambda: UNet2D(base=16, depth=4)),
        ("vit_s14_linear_decoder", lambda: ViTSegStandIn(img=args.img, decoder="linear")),
        ("vit_s14_progressive_decoder",
         lambda: ViTSegStandIn(img=args.img, decoder="progressive")),
    ]
    variants = []
    for name, build in builders:
        probe_model = build()
        stride = probe_model.output_stride()
        del probe_model
        variants.append((name, build, float(stride)))

    print()
    print(f"  operator   {args.operator}")
    print(f"  device     {device}   {compute.get('gpu_name')}")
    if compute.get("vram_total_gb"):
        print(f"  vram       {compute['vram_total_gb']} GB")
    print(f"  input      {args.batch} x 1 x {args.img} x {args.img}"
          + (f"   from {args.input_from}" if args.input_from else "   (torch.randn)"))
    print()
    head = (f"  {'variant':<30} {'stride':>6} {'params M':>9} "
            f"{'fwd ms':>8} {'train ms':>9} {'peak MB':>9}")
    print(head)
    print("  " + "-" * (len(head) - 2))

    results = []
    for name, build, stride in variants:
        try:
            model = build().to(device)
            params = sum(p.numel() for p in model.parameters())
            x = _make_input(args, device)
            y = (torch.rand(args.batch, 1, args.img, args.img, device=device) > 0.8).float()

            fwd = time_steps(model, x, y, device, args.steps, train=False)
            trn = time_steps(model, x, y, device, args.steps, train=True)
            peak = trn["memory"]["bytes"]

            entry = {
                "variant": name,
                "effective_output_stride": stride,
                "stride_source": "model.output_stride(), not a hardcoded table",
                "parameters": params,
                "forward": fwd,
                "train_step": trn,
                "train_memory": trn["memory"],
                "peak_memory_bytes_train": peak,
            }
            if args.find_batch:
                entry["batch_search"] = largest_fitting_batch(
                    build, (1, args.img, args.img), device, start=max(1, args.batch),
                    vram_bytes=compute.get("vram_total_bytes"))
            results.append(entry)

            print(f"  {name:<30} {stride:>6.2f} {params / 1e6:>9.2f} "
                  f"{fwd['ms_median']:>8.1f} {trn['ms_median']:>9.1f} "
                  f"{(peak / 1024 ** 2 if peak else float('nan')):>9.1f}")
            del model, x, y
            reset_peak(device)
        except (RuntimeError, ValueError) as exc:
            reason = str(exc).strip().splitlines()[0][:90]
            results.append({"variant": name, "error": str(exc)[:400],
                            "note": "did not fit or failed to run at this configuration"})
            print(f"  {name:<30} {'—':>6} {'—':>9} {'—':>8} {'—':>9} {'—':>9}   FAILED")
            print(f"  {'':<30} reason: {reason}")

    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%dT%H%M%S%z")
    os.makedirs(EVIDENCE, exist_ok=True)
    out = os.path.join(EVIDENCE, f"c0_probe_{stamp}.json")
    record = {
        "criterion_coverage": ["C0-1", "C0-2", "C0-3" if args.find_batch else "C0-3 (not run)",
                               "C0-4", "C0-5", "C0-6"],
        "captured_at": stamp,
        "operator": args.operator,
        "conditions_note": args.note,
        "compute": compute,
        "device_used": device,
        "input_shape": [args.batch, 1, args.img, args.img],
        "input_is_synthetic": True,
        "input_source": args.input_from or "torch.randn - shapes drive memory and step time, "
                                           "not values; use --input-from to confirm",
        "vit_is_stand_in": ("Shape- and compute-equivalent stand-in for DINOv2 ViT-S/14, "
                            "not the real checkpoint. Peak memory and step time depend on "
                            "tensor shapes and layer counts, not weight values."),
        "c0_10_statement": ("C0 evidence does NOT close GATE-ML-01. DR-007 forbids closing it "
                            "on C0 alone. Convergence, achievable quality, and the interaction "
                            "between output stride and the real LA boundary thickness are C1."),
        "shape_is_placeholder": ("Input size is a placeholder until Spike D criterion A6 "
                                 "reports the real cohort shape. Memory scales roughly with "
                                 "the square of the in-plane size."),
        "results": results,
    }
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(record, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print()
    if device != "cuda":
        print("  NOTE on the memory column: this is not a CUDA device, so the figure is a")
        print("  process RSS delta, not a true peak, and it is not comparable across runs.")
        print()
    print("  C0-5 — effective output stride is set by the DECODER, not the encoder:")
    print("     UNet                      stride 1   full resolution via skip connections")
    print("     ViT-S/14 linear decoder   stride 14  one logit per patch; upsampling adds")
    print("                                          no information")
    print("     ViT-S/14 progressive      stride 1.75  three learned doublings (x8);")
    print("                                          14 = 2*7 so no power-of-two stack lands")
    print("                                          on the input exactly, and the remainder")
    print("                                          is interpolated, carrying no detail")
    print()
    print("  Whether stride 14 is acceptable depends on the LA cavity boundary thickness in")
    print("  voxels, which is criterion C1-5 and needs REAL anatomy. C0 cannot answer it.")
    print()
    print(f"  wrote  {os.path.relpath(out, ROOT)}")
    print("  Extrapolate a calendar with:  python harness/extrapolate.py " +
          os.path.relpath(out, ROOT))
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
