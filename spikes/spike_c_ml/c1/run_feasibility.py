#!/usr/bin/env python3
"""
Spike C1 — real-data feasibility run on the frozen split (C1_MEASUREMENT_PLAN.md).

Produces machine evidence for:
  C1-1 peak memory, both families, at the practical input and declared batch
  C1-2 warm-up-excluded wall-clock per train step and per validation step, real data loading included
  C1-3 the practical input resolution (predeclared grid 560 / 448, batch 8 / 4 / 2)
  C1-4 decoder behaviour on real anatomy (fixed slice panel on the internal fold; aggregates only in git)
  C1-6 equal-budget convergence sanity for both families
  C1-7 DR-011 conformance at runtime (per-volume statistics only; recorded per case)
  C1-8 subset provenance (preflight JSON, split hash, selected ids and their JSON pointer)
  C1-9 the calendar verdict from C1 timings (not from C0)
  C1-10 ADR-ML-001 field coverage, each field pointing at an artifact
C1-5 (boundary thickness) is measured by measure_boundary.py on the masks this script exports.

Hard boundaries (fail closed):
  - refuses to run unless the preflight JSON is C1 evidence (runnable, 0 validation and 0 holdout
    paths resolved, gates declared CLOSED), names the same data root, and its split hash equals the
    split manifest's hash;
  - reads image bytes only from that hardlink root (preflight.py make-root --layout hardlink), through
    ml.data's fail-closed CaseAllowlist: the dataset manifest is viewed with each selected case's
    paths rewritten to <root>/<CASE_ID>/<file name>, and nothing outside the selection is resolvable;
  - uses ONLY training_subsets["25_percent"].effective_case_ids, split 16/4 into an internal
    fold with seed 2024 — the validation partition and the final holdout are never loaded;
  - nothing is written into the repository except what the caller copies; all outputs go to
    --out (outside git). No dataset bytes, masks or checkpoints are ever committed, and the
    measurement JSON records no hostname and no absolute path.

The training recipe is the one pre-declared in management/day22/RECOVERY_OVERRIDE_DAY22.md §4:
0.5*BCE + 0.5*soft Dice, AdamW lr 1e-4, bf16, seed 2024, threshold 0.5, no augmentation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from ml import data as mldata  # noqa: E402
from ml import models as mlmodels  # noqa: E402

FAMILIES = ["unet_base32_depth4", "dinov2_s14_full_progressive"]
SEED = 2024
SUBSET_POINTER = "$.training_subsets.25_percent.effective_case_ids"


# --------------------------------------------------------------------------- helpers

def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git_commit() -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
                              text=True, check=True).stdout.strip()
    except Exception:
        return None


def environment(host_label: str) -> dict:
    import transformers
    import huggingface_hub
    env = {
        "host_label": host_label,          # declared, not platform.node(): the repo is public
        "os": platform.platform(),
        "python": platform.python_version(),
        "torch": torch.__version__,
        "cuda": torch.version.cuda,
        "cudnn": torch.backends.cudnn.version(),
        "transformers": transformers.__version__,
        "huggingface_hub": huggingface_hub.__version__,
        "numpy": np.__version__,
        "cuda_available": torch.cuda.is_available(),
    }
    if torch.cuda.is_available():
        free, total = torch.cuda.mem_get_info()
        env.update({"gpu": torch.cuda.get_device_name(0), "vram_total_mib": round(total / 2**20),
                    "vram_free_mib_at_start": round(free / 2**20),
                    "bf16_supported": torch.cuda.is_bf16_supported()})
    return env


def soft_dice_loss(logits: torch.Tensor, target: torch.Tensor, eps: float = 1.0) -> torch.Tensor:
    p = torch.sigmoid(logits)
    num = 2.0 * (p * target).sum(dim=(1, 2, 3)) + eps
    den = p.sum(dim=(1, 2, 3)) + target.sum(dim=(1, 2, 3)) + eps
    return (1.0 - num / den).mean()


def loss_fn(logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    return 0.5 * F.binary_cross_entropy_with_logits(logits, target) + 0.5 * soft_dice_loss(logits, target)


def dice3d(pred: np.ndarray, gt: np.ndarray) -> float:
    p, g = pred.astype(bool), gt.astype(bool)
    denom = p.sum() + g.sum()
    return float("nan") if denom == 0 else float(2.0 * (p & g).sum() / denom)


def seeded_generator() -> torch.Generator:
    g = torch.Generator()
    g.manual_seed(SEED)
    return g


def loader(ds, batch: int, shuffle: bool, g: torch.Generator):
    """One generator per trial, reused across epochs, so each epoch draws a new order."""
    return torch.utils.data.DataLoader(ds, batch_size=batch, shuffle=shuffle, num_workers=0,
                                       drop_last=shuffle, generator=g)


def selection_view(dataset: dict, case_ids: list[str]) -> dict:
    """The dataset manifest restricted to case_ids, with paths rewritten to the hardlink layout.

    preflight.py make-root --layout hardlink puts <root>/<CASE_ID>/<basename of path_relative>;
    every other case is absent from the view, so ml.data.case_paths cannot resolve it.
    """
    wanted = set(case_ids)
    cases = []
    for c in dataset["cases"]:
        if c["case_id"] not in wanted:
            continue
        v = json.loads(json.dumps(c))
        for key in ("mri", "mask"):
            v[key]["path_relative"] = f'{c["case_id"]}/{Path(c[key]["path_relative"]).name}'
        cases.append(v)
    if {c["case_id"] for c in cases} != wanted:
        raise SystemExit(f"REFUSED: dataset manifest lacks {sorted(wanted - {c['case_id'] for c in cases})}")
    return {**{k: v for k, v in dataset.items() if k != "cases"}, "cases": cases}


def build(variant: str, img: int, device: str):
    torch.manual_seed(SEED)
    model = mlmodels.build_model(variant, img).to(device)
    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=1e-4)
    return model, opt


def cleanup():
    if torch.cuda.is_available():
        torch.cuda.synchronize()
        torch.cuda.empty_cache()


# --------------------------------------------------------------------------- measurements

def timing(variant: str, img: int, batch: int, ds, device: str, warm: int = 5, timed: int = 20) -> dict:
    """C1-1 / C1-2 / C1-3: real batches from the cache, data loading included in the step time."""
    out = {"variant": variant, "img": img, "batch": batch}
    model = opt = None
    try:
        model, opt = build(variant, img, device)
        model.train()
        torch.cuda.reset_peak_memory_stats()
        g = seeded_generator()
        it = iter(loader(ds, batch, True, g))
        times = []
        for i in range(warm + timed):
            t0 = time.perf_counter()
            try:
                x, y = next(it)
            except StopIteration:
                it = iter(loader(ds, batch, True, g))
                x, y = next(it)
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            opt.zero_grad(set_to_none=True)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                logits = model(x)
            loss = loss_fn(logits.float(), y)
            if not torch.isfinite(loss):
                raise FloatingPointError(f"non-finite loss {float(loss)}")
            loss.backward()
            opt.step()
            torch.cuda.synchronize()
            if i >= warm:
                times.append((time.perf_counter() - t0) * 1000.0)
        out["train_step_ms_median"] = round(float(np.median(times)), 2)
        out["train_step_ms_p95"] = round(float(np.percentile(times, 95)), 2)
        out["peak_allocated_mib"] = round(torch.cuda.max_memory_allocated() / 2**20, 1)
        out["peak_reserved_mib"] = round(torch.cuda.max_memory_reserved() / 2**20, 1)
        # validation step: forward only, same batch
        model.eval()
        vt = []
        with torch.no_grad():
            for i in range(warm + 10):
                t0 = time.perf_counter()
                with torch.autocast("cuda", dtype=torch.bfloat16):
                    model(x)
                torch.cuda.synchronize()
                if i >= warm:
                    vt.append((time.perf_counter() - t0) * 1000.0)
        out["val_step_ms_median"] = round(float(np.median(vt)), 2)
        out["fits"] = True
    except torch.cuda.OutOfMemoryError as e:
        out.update({"fits": False, "oom": True, "error": str(e).splitlines()[0]})
    except Exception as e:  # recorded, never hidden
        out.update({"fits": False, "error": f"{type(e).__name__}: {e}"})
    finally:
        del model, opt
        cleanup()
    return out


def predict_volume(model, vol_img: np.ndarray, batch: int, device: str) -> np.ndarray:
    """vol_img float [Z, img, img] -> binary prediction [Z, img, img] (threshold 0.5)."""
    model.eval()
    preds = []
    with torch.no_grad():
        for s in range(0, vol_img.shape[0], batch):
            x = torch.from_numpy(np.ascontiguousarray(vol_img[s:s + batch], dtype=np.float32))[:, None].to(device)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                logits = model(x)
            preds.append((torch.sigmoid(logits.float()) >= 0.5).squeeze(1).cpu().numpy())
    return np.concatenate(preds).astype(np.uint8)


def convergence(variant: str, img: int, batch: int, train_ds, fold_val: dict, steps: int,
                eval_every: int, device: str, out_dir: Path) -> dict:
    """C1-6: equal-budget trial. Same step count, batch, seed and recipe for both families."""
    model, opt = build(variant, img, device)
    card = mlmodels.model_card(model)
    log_path = out_dir / f"c1_loss_{variant}.jsonl"
    losses, curve = [], []
    g = seeded_generator()
    it = iter(loader(train_ds, batch, True, g))
    t_start = time.perf_counter()
    finite = True
    with open(log_path, "w", encoding="utf-8") as log:
        for step in range(1, steps + 1):
            model.train()
            try:
                x, y = next(it)
            except StopIteration:
                it = iter(loader(train_ds, batch, True, g))
                x, y = next(it)
            x, y = x.to(device), y.to(device)
            opt.zero_grad(set_to_none=True)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                logits = model(x)
            loss = loss_fn(logits.float(), y)
            lv = float(loss.detach())
            if not np.isfinite(lv):
                finite = False
                log.write(json.dumps({"step": step, "loss": None, "non_finite": True}) + "\n")
                break
            loss.backward()
            opt.step()
            losses.append(lv)
            rec = {"step": step, "loss": round(lv, 6)}
            if step % eval_every == 0 or step == steps:
                dices = {cid: dice3d(predict_volume(model, v["img"], batch, device), v["mask_img"])
                         for cid, v in fold_val.items()}
                finite_d = [d for d in dices.values() if not np.isnan(d)]
                rec["fold_val_dice_mean"] = round(float(np.mean(finite_d)), 5) if finite_d else None
                curve.append({"step": step, "fold_val_dice_mean": rec["fold_val_dice_mean"],
                              "per_case": {k: round(d, 5) for k, d in dices.items()}})
            log.write(json.dumps(rec) + "\n")
    elapsed = time.perf_counter() - t_start
    n = len(losses)
    k = max(1, n // 10)
    result = {
        "variant": variant, "model_card": card, "img": img, "batch": batch,
        "steps_requested": steps, "steps_done": n,
        "epochs_done": round(n * batch / len(train_ds), 2),
        "dice_note": ("3D Dice on the 4 internal-fold cases at the model input resolution, threshold 0.5; "
                      "a convergence sanity signal, not an evaluation metric (ml/evaluate.py scores at "
                      "native resolution)"),
        "finite": finite, "elapsed_seconds": round(elapsed, 1),
        "loss_mean_first_10pct": round(float(np.mean(losses[:k])), 5) if n else None,
        "loss_mean_last_10pct": round(float(np.mean(losses[-k:])), 5) if n else None,
        "fold_val_curve": curve, "loss_log": log_path.name,
    }
    result["decreasing"] = bool(n and finite and result["loss_mean_last_10pct"] < result["loss_mean_first_10pct"])
    result["verdict"] = "CONVERGING" if result["decreasing"] else "NEGATIVE_RESULT"

    # checkpoint save / reload equivalence (fp32 eval on a fixed batch)
    ck = out_dir / f"c1_{variant}.pt"
    torch.save(model.state_dict(), ck)
    fixed = torch.from_numpy(np.ascontiguousarray(next(iter(fold_val.values()))["img"][40:42],
                                                  dtype=np.float32))[:, None].to(device)
    model.eval()
    with torch.no_grad():
        ref = model(fixed).float().cpu()
    restored = mlmodels.build_model(variant, img).to(device)
    restored.load_state_dict(torch.load(ck, map_location=device, weights_only=True))
    restored.eval()
    with torch.no_grad():
        again = restored(fixed).float().cpu()
    result["checkpoint"] = {"file_outside_git": ck.name, "bytes": ck.stat().st_size,
                            "sha256": sha256_file(ck),
                            "reload_max_abs_diff": float((ref - again).abs().max())}
    result["reload_verified"] = result["checkpoint"]["reload_max_abs_diff"] <= 1e-5

    # C1-4 decoder panel: per case, the slices with the largest, median and smallest non-empty GT area
    panel = []
    for cid, v in fold_val.items():
        pred = predict_volume(model, v["img"], batch, device)
        areas = v["mask_img"].reshape(v["mask_img"].shape[0], -1).sum(1)
        nz = np.flatnonzero(areas)
        if nz.size == 0:
            continue
        order = nz[np.argsort(areas[nz])]
        for tag, z in (("largest", order[-1]), ("median", order[len(order) // 2]), ("smallest", order[0])):
            p, g = pred[z].astype(bool), v["mask_img"][z].astype(bool)
            panel.append({"case_id": cid, "slice": int(z), "panel": tag, "gt_area_px": int(g.sum()),
                          "pred_area_px": int(p.sum()), "dice": round(dice3d(p, g), 4)})
        empty = np.flatnonzero(areas == 0)
        fp_on_empty = int(sum(pred[z].sum() > 0 for z in empty))
        panel.append({"case_id": cid, "panel": "empty_gt_slices", "count": int(empty.size),
                      "slices_with_false_positive": fp_on_empty})
    result["decoder_panel"] = panel
    del model, opt, restored
    cleanup()
    return result


# --------------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Spike C1 real-data feasibility run")
    ap.add_argument("--split-manifest", type=Path, default=ROOT / "data/manifests/split_manifest_path_a_seed2024.json")
    ap.add_argument("--dataset-manifest", type=Path, default=ROOT / "data/manifests/dataset_manifest.json")
    ap.add_argument("--data-root", type=Path, required=True,
                    help="training-only hardlink root built by preflight.py make-root --layout hardlink")
    ap.add_argument("--preflight-json", type=Path, required=True)
    ap.add_argument("--cache-dir", type=Path, required=True, help="outside git")
    ap.add_argument("--out", type=Path, required=True, help="run directory outside git")
    ap.add_argument("--host-label", default="leader PC, RTX 3050 Ti Laptop 4 GiB (DR-016)")
    ap.add_argument("--steps", type=int, default=1500)
    ap.add_argument("--eval-every", type=int, default=250)
    ap.add_argument("--grid-img", default="560,448")
    ap.add_argument("--grid-batch", default="8,4,2")
    ap.add_argument("--skip-convergence", action="store_true", help="grid only (C1-1, C1-2, C1-3)")
    args = ap.parse_args()
    device = "cuda"
    if not torch.cuda.is_available():
        raise SystemExit("C1 needs the CUDA host declared in DR-016")
    args.out.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%dT%H%M%S")

    # C1-8 — provenance, fail closed
    pre = json.loads(args.preflight_json.read_text(encoding="utf-8-sig"))
    split_sha = sha256_file(args.split_manifest)
    problems = []
    if pre.get("runnable") is not True or pre.get("is_spike_c1_evidence") is not True:
        problems.append("preflight is not runnable C1 evidence")
    for key in ("validation_paths_resolved", "holdout_paths_resolved"):
        if pre.get(key) != 0:
            problems.append(f"preflight {key} = {pre.get(key)!r}, expected 0")
    pre_sha = (pre.get("split_manifest") or {}).get("sha256")
    if pre_sha != split_sha:
        problems.append(f"split hash mismatch preflight={pre_sha} file={split_sha}")
    if Path(pre.get("data_root") or "").resolve() != args.data_root.resolve():
        problems.append("the preflight checked a different data root")
    if problems:
        raise SystemExit("REFUSED: " + "; ".join(problems))

    split = mldata.load_split_manifest(args.split_manifest)
    dataset = mldata.load_dataset_manifest(args.dataset_manifest)
    allow_sel = mldata.CaseAllowlist.for_training(split, "25_percent")
    selected = sorted(allow_sel.case_ids)
    if selected != sorted(split["training_subsets"]["25_percent"]["effective_case_ids"]):
        raise SystemExit("REFUSED: the allowlist differs from the 25% effective subset")
    forbidden = _partition_ids(split, "validation") | _partition_ids(split, "final_holdout")
    if set(selected) & forbidden or not set(selected) <= _partition_ids(split, "train"):
        raise SystemExit("REFUSED: selected ids are not training-only")
    shapes = {c["case_id"]: tuple(c["mri"]["shape"]) for c in dataset["cases"]}
    strata = sorted({shapes[c][:2] for c in selected})
    if len(strata) < 2:
        raise SystemExit(f"ESCALATE: only one source-shape stratum in the C1 subset: {strata}")
    rng = np.random.default_rng(SEED)
    perm = list(rng.permutation(selected))
    fold_train, fold_val_ids = sorted(perm[:16]), sorted(perm[16:])
    allow_ftrain = mldata.CaseAllowlist(fold_train, split, purpose="c1:internal_fold_train")
    allow_fval = mldata.CaseAllowlist(fold_val_ids, split, purpose="c1:internal_fold_val")

    view = selection_view(dataset, selected)
    paths = mldata.case_paths(view, args.data_root, allowlist=allow_sel)
    env = environment(args.host_label)
    print("environment:", json.dumps(env))

    # one case verified end to end (C1 plan §5 step 2)
    first = fold_train[0]
    t0 = time.perf_counter()
    img0, mask0 = mldata.load_case(first, paths)
    one_case = {"case_id": first, "load_seconds": round(time.perf_counter() - t0, 2),
                "image_dtype": str(img0.dtype), "image_shape_zyx": list(img0.shape),
                "image_min": float(img0.min()), "image_max": float(img0.max()),
                "mask_values": sorted(int(v) for v in np.unique(mask0)),
                "mask_voxels": int(mask0.sum())}
    if not (0.0 <= one_case["image_min"] and one_case["image_max"] <= 1.0) or one_case["mask_values"] not in ([0, 1], [1], [0]):
        raise SystemExit(f"STOP: one-case verification failed {one_case}")
    del img0, mask0

    # caches (outside git); the first grid size also keeps native masks for measure_boundary.py
    grid_img = [int(v) for v in args.grid_img.split(",")]
    grid_batch = [int(v) for v in args.grid_batch.split(",")]
    cache_dirs, cache_status = {}, {}
    for img in grid_img:
        cd = args.cache_dir / f"img{img}"
        summary = mldata.build_cache(selected, paths, img, cd, native_mask=(img == grid_img[0]))
        cache_dirs[img] = cd
        cache_status[img] = sorted({v["status"] for v in summary["cases"].values()})
    dr011 = {}
    for cid in selected:
        side = mldata.read_cache_sidecar(cache_dirs[grid_img[0]], cid)
        dr011[cid] = {**side["dr011"], "mri_sha256": side["source"]["mri"]["sha256"],
                      "native_shape_zyx": side["native_shape_zyx"]}

    measurements = {
        "spike": "SPIKE_C1", "stamp": stamp, "operator": "Day 22 recovery override (leader account)",
        "owner": "Bế Quốc Khánh (adopts on Day 23)", "code_commit": git_commit(),
        "compute_host_decision": "DR-016", "environment": env,
        "provenance_C1_8": {"preflight_json": args.preflight_json.name,
                            "preflight_label": pre.get("label"),
                            "split_manifest_sha256": split_sha,
                            "dataset_manifest_sha256": sha256_file(args.dataset_manifest),
                            "selected_pointer": SUBSET_POINTER, "selected_case_ids": selected,
                            "internal_fold": {"seed": SEED, "train": fold_train, "val": fold_val_ids},
                            "data_access": ("ml.data CaseAllowlist.for_training(split, '25_percent') over a "
                                            "hardlink root; dataset manifest viewed with the 20 selected "
                                            "cases only, paths rewritten to <CASE_ID>/<file name>"),
                            "validation_partition_loaded": False, "holdout_loaded": False,
                            "source_shape_strata": [list(s) for s in strata]},
        "one_case_verification": one_case,
        "preprocessing": {"version": mldata.PREPROCESSING_VERSION, "spec": mldata.PREPROCESSING,
                          "cache_status": {str(k): v for k, v in cache_status.items()}},
        "dr011_runtime_C1_7": {"policy_file": "spikes/spike_c_ml/dr011_normalization.json",
                               "per_case_records": dr011, "cohort_statistics_used": False},
        "recipe": {"loss": "0.5*BCEWithLogits + 0.5*softDice", "optimizer": "AdamW lr 1e-4 constant",
                   "precision": "bf16 autocast", "seed": SEED, "threshold": 0.5, "augmentation": "none",
                   "source": "management/day22/RECOVERY_OVERRIDE_DAY22.md §4"},
    }
    out_json = args.out / f"c1_measurements_{stamp}.json"

    def save() -> None:
        out_json.write_text(json.dumps(measurements, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {out_json}")

    # C1-1 / C1-2 / C1-3 grid
    grid = []
    for img in grid_img:
        ds = mldata.SliceDataset(allow_ftrain, cache_dirs[img])
        for fam in FAMILIES:
            for b in grid_batch:
                r = timing(fam, img, b, ds, device)
                grid.append(r)
                print("grid:", json.dumps(r))

    def fits(fam, img, b):
        return any(g["variant"] == fam and g["img"] == img and g["batch"] == b and g.get("fits") for g in grid)
    practical = None
    for img in grid_img:  # predeclared order: 560 first
        for b in grid_batch:  # largest batch first
            if all(fits(f, img, b) for f in FAMILIES):
                practical = {"img": img, "batch": b}
                break
        if practical:
            break
    measurements["grid_C1_1_C1_2_C1_3"] = grid
    measurements["practical_point"] = practical
    save()
    if not practical:
        raise SystemExit("NO_FIT: no grid point fits both families — recorded; escalate")
    if args.skip_convergence:
        return 0

    # C1-6 equal-budget convergence trial at the practical point
    img, batch = practical["img"], practical["batch"]
    train_ds = mldata.SliceDataset(allow_ftrain, cache_dirs[img])
    val_ds = mldata.SliceDataset(allow_fval, cache_dirs[img])
    fold_val = {}
    for cid in fold_val_ids:
        im, mk = val_ds.case_arrays(cid)
        fold_val[cid] = {"img": im, "mask_img": np.asarray(mk)}
    trials = {}
    for fam in FAMILIES:
        trials[fam] = convergence(fam, img, batch, train_ds, fold_val, args.steps, args.eval_every,
                                  device, args.out)
        measurements["convergence_C1_6"] = trials
        save()
    return 0


def _deep_get(obj, key):
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for v in obj.values():
            r = _deep_get(v, key)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _deep_get(v, key)
            if r is not None:
                return r
    return None


def _partition_ids(split: dict, name: str) -> set:
    p = split["partitions"][name]
    return set(p if isinstance(p, list) else p.get("case_ids", []))


if __name__ == "__main__":
    raise SystemExit(main())
