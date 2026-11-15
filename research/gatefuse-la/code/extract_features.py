"""Step 2 - run each frozen encoder once over every slice and cache the
(768, 32, 32) patch-token maps as float16 .npy memmaps.

Because both encoders are frozen and no augmentation is used, caching makes
every later experiment train only the light fusion/decoder head.
"""
import argparse
import sys
import time
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from encoders import load_encoder, patch_features, to_encoder_input  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--encoder", choices=C.ENCODERS, required=True)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else
                    ("cuda" if torch.cuda.is_available() else "cpu"))
    args = ap.parse_args()

    C.ensure_dirs()
    images = np.load(C.PREP_DIR / "images.npy", mmap_mode="r")
    n = len(images)
    out_path = C.FEAT_DIR / f"{args.encoder}.npy"
    tmp_path = out_path.with_suffix(".partial.npy")
    feats = np.lib.format.open_memmap(tmp_path, mode="w+", dtype=np.float16,
                                      shape=(n, C.FEAT_DIM, C.GRID, C.GRID))
    dev = torch.device(args.device)
    model = load_encoder(args.encoder).to(dev)
    t0 = time.time()
    for s in range(0, n, args.batch):
        x = torch.from_numpy(np.ascontiguousarray(images[s:s + args.batch])).to(dev)
        f = patch_features(model, to_encoder_input(x))
        feats[s:s + len(x)] = f.to(torch.float16).cpu().numpy()
        if (s // args.batch) % 50 == 0:
            done = s + len(x)
            print(f"{args.encoder}: {done}/{n} slices  {time.time() - t0:.0f}s", flush=True)
    feats.flush()
    del feats
    tmp_path.rename(out_path)
    print(f"saved {out_path}  ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
