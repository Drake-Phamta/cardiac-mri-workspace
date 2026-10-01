# ml/ — training and evaluation pipeline

Product code for the left-atrium segmentation experiments (`07`, `08`, ADR-ML-001).
Block owner: **Bế Quốc Khánh** (ML training/evaluation). The first version was written
under the Day 22 recovery override as recovery support; the owner reviews and adopts it.

Nothing in `ml/` imports from `spikes/`. Code reused from the Spike C0 harness is copied
with a provenance header (source path + commit `896c11a`).

## Modules

| Module | What it does |
|---|---|
| `ml/data.py` | Manifests, fail-closed case allowlists, NRRD loading in `[z, y, x]`, DR-011 normalization, the resized slice cache (`build_cache`), the memory-mapped `SliceDataset`, `resize_logits_back` / `logits_to_mask`, and `write_mask_nrrd` (prediction back on the source voxel grid, never overwritten). |
| `ml/models.py` | `UNet2D`, `DinoSeg`, pinned DINOv2 checkpoints from the local Hugging Face cache (`fetch_checkpoint`), `build_model(variant, img)`, `model_card(model)`, `autocast_for`, `PeakTracker`. |
| `ml/evaluate.py` | Metrics (`evaluation_metric_version` `ml-eval-1.0.0`): case-level 3D Dice/IoU at native resolution, per-slice Dice with the `07` §6 empty-slice rule, FP/FN voxels, relative volume error in voxels, the failed-case protocol (intended/successful N, reasons), cohort summary with bootstrap 95% CIs (DR-014), the comparable-run gate and paired differences, the holdout slots `primary_all_holdout` / `sensitivity_without_suspected_linkage`, and the DR-010 worst-slice (DR-010a option (b) shape) and outlier selections. CLI `python -m ml.evaluate run|compare`. |
| `ml/export_contract2.py` | Builds a Contract 2 DRAFT v0 experiment-artifact manifest from a run directory and runs `contracts/ingestion/contract2_experiment_artifact/validate_contract2.py` on it. Gate states are explicit CLI inputs with no default. |
| `ml/manifests.py` | The shared run-directory layout (`RUN_LAYOUT`), population and training-subset manifests copied from the split manifest, `code_version()` (git commit + dirty flag), JSON writers that refuse to overwrite. |
| `ml/tests/` | pytest suite on a synthetic NRRD package (`ml/tests/synth.py`) and a synthetic run directory (`ml/tests/runfixture.py`); CPU only, no real data. |

## Rules the code enforces

- **Axis convention.** pynrrd gives NRRD order `(x, y, z)`; `ml/` works in `[z, y, x]`
  (`to_zyx`). `to_nrrd_order` is the exact inverse, so a prediction written with
  `write_mask_nrrd(path, mask_zyx, source_header)` overlays the source volume voxel for
  voxel. Spacing is an identity placeholder in this release: every size is in voxels.
- **Fail-closed access.** Every loader goes through a `CaseAllowlist` built against the
  split manifest. Ids outside it raise `CaseNotAllowedError`; `final_holdout` ids raise
  `HoldoutAccessError` unless the allowlist was built with `allow_holdout=True` (training
  code never sets it); training-excluded ids (`CASE_0117`, `CASE_0133`) raise unless
  `allow_training_excluded=True`. `SliceDataset` refuses a plain list.
- **DR-011.** Per-volume clip to the volume's own [0.5, 99.5] percentiles, scale to
  [0, 1]. No cohort statistic anywhere. The DINOv2 ImageNet mean/std are applied inside
  `DinoSeg.forward` only (pretrained-model constants).
- **Resize.** Image bilinear (`align_corners=False`, antialias), mask nearest-exact
  (labels stay {0, 1}). Predictions: logits are resized back to native resolution with
  `resize_logits_back`, then thresholded at 0.5 with `logits_to_mask`.
- **Derived data stays outside git.** `build_cache` refuses a cache directory inside a
  git work tree. Default: `<CARDIAC_DATA_ROOT>\cache\<split_id>\img<img>\`.

## Data locations

No machine-specific path is written in the code:

| Location | Resolved as |
|---|---|
| `<CARDIAC_DATA_ROOT>` | environment variable `CARDIAC_DATA_ROOT`; otherwise the directory `cardiac-data` next to the **main** checkout of this repository (from a linked worktree, `ml.data.main_checkout_root()` follows the worktree's `gitdir:` back to the main checkout, so every worktree resolves the same data) |
| package root | `CARDIAC_PACKAGE_ROOT`, else `<CARDIAC_DATA_ROOT>\lasc2018\extracted` |
| cache root | `CARDIAC_CACHE_ROOT`, else `<CARDIAC_DATA_ROOT>\cache` |

## Cache format (`ml-slice-cache/1`, `preprocessing_version` `ml-preproc-1.0.0`)

Per case, in the cache directory:

| File | Content |
|---|---|
| `<case>_image.npy` | float16 `[Z, img, img]`, DR-011 output resized bilinear |
| `<case>_mask.npy` | uint8 `[Z, img, img]`, {0, 1}, resized nearest-exact |
| `<case>_mask_native.npy` | uint8 `[Z, H, W]` native reference (only with `native_mask=True`) |
| `<case>.json` | sidecar: source NRRD sha256 (of the bytes parsed), preprocessing, split id, partition, file hashes |

A case whose sidecar is current (same preprocessing version, img, split id and source
hashes) is reused, not rebuilt.

## Model variants

| Variant | Network |
|---|---|
| `unet_base32_depth4` | `UNet2D(base=32, depth=4)` — ADR-ML-001 UNet family |
| `unet_base16_depth4` | `UNet2D(base=16, depth=4)` |
| `dinov2_s14_full_progressive` | `DinoSeg(dinov2-small, progressive, full)` — ADR-ML-001 DINOv2 family |
| `dinov2_s14_frozen_progressive` | `DinoSeg(dinov2-small, progressive, frozen)` |
| `dinov2_b14_full_progressive` | `DinoSeg(dinov2-base, progressive, full)` |

Pinned checkpoints: `facebook/dinov2-small @ ed25f3a31f01632728cabb09d1542f84ab7b0056`,
`facebook/dinov2-base @ f9e44c814b77203eaa57a6bdbbd535f21ede1415`, resolved with
`local_files_only=True` (nothing is downloaded). `img` must be a multiple of 16 (UNet) and
14 (DINOv2); 560 satisfies both.

## Usage

```python
import torch
from ml import data as D, models as M

split = D.load_split_manifest()            # data/manifests/split_manifest_path_a_seed2024.json
dataset = D.load_dataset_manifest()
train = D.CaseAllowlist.for_training(split, "25_percent")   # effective_case_ids
val = D.CaseAllowlist.for_validation(split)
for allow, native in ((train, False), (val, True)):
    paths = D.case_paths(dataset, D.DEFAULT_PACKAGE_ROOT, allowlist=allow)
    D.build_cache(allow, paths, 560, native_mask=native)
cache = D.default_cache_dir(split["split_id"], 560)
slices = D.SliceDataset(train, cache)      # (x [1,560,560], y [1,560,560]) float32

torch.manual_seed(2024)
model = M.build_model("unet_base32_depth4", 560)
```

## Run directory and evaluation

A run directory (default root `D:\02_Research\cardiac-runs\<experiment_id>\`, outside
git) is also the Contract 2 artifact root: every path a manifest records is relative to
it, with forward slashes.

```
config.json  run_manifest.json  train_log.jsonl  checkpoints/{last,best}.pt
manifests/split_manifest.json                     byte copy of the split manifest
manifests/training_subset_<subset>.json           effective training cases
manifests/population_<partition>.json             validation or final_holdout case list
predictions/<partition>/<case>.nrrd + predictions_manifest.json      (never overwritten)
evaluation/<partition>/per_case_metrics.json, per_slice_metrics.json, metrics_summary.json,
                       metric_sets/<case>.json, evaluation_manifest.json   (never overwritten)
contract2/<manifest_id>.json
```

```
python -m ml.evaluate run --run-dir <run> --population validation
python -m ml.evaluate run --run-dir <run> --population final_holdout --allow-holdout
python -m ml.evaluate compare --run-a <run> --run-b <run> --population final_holdout --out <new.json>
python -m ml.export_contract2 --run-dir <run> --gate-split-01 <STATE> --gate-ml-01 <STATE> --validate
```

Scoring the final holdout needs `--allow-holdout` **and** a `holdout_authorization`
record in the predictions manifest (written by inference only under GATE-IMG-01). A
comparison between runs that fail the `08` §7 comparable-run gate is labelled
`NON_COMPARABLE` and carries no delta. Contract 2 DRAFT v0 cannot represent a failed
case (every analysis run needs a raw mask), so the exporter refuses a run with failures
rather than drop them.

## Running the tests

From the repository root (Python 3.12, torch 2.5.1, numpy, pynrrd, transformers 4.51.3,
huggingface_hub, psutil, pytest):

```
python -m pytest ml/tests -q
```

The DINOv2 tests are skipped, not failed, on a machine without the pinned checkpoints in
the local Hugging Face cache. `test_real_split_manifest_when_present` checks the real split
manifest (its sha256, 54 holdout cases, subsets 20/38/78, `CASE_0117`/`CASE_0133` refused)
and `test_real_split_suspected_linkage_is_case_0027` its suspected holdout linkage; both are
skipped only on a branch that does not contain the manifest.
