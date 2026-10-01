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
| `ml/train.py` | One experiment from a JSON config: the ADR-ML-001 recipe on the subset's effective cases via the cache, validation 3D Dice (native resolution) every epoch, `last.pt` / `best.pt` with SHA-256, `train_log.jsonl`, resume from `last.pt`, then validation predictions + evaluation and `run_manifest.json` (`08` §10). |
| `ml/queue.py` | Runs a list of configs one after another, each in its own process: skips COMPLETE runs, resumes partial ones, logs every transition, keeps going after a failure. |
| `ml/infer.py` | Raw prediction masks for a population with a run's checkpoint; validation by default, final holdout only with `--population holdout --confirm-frozen-morphology <sha256>` (GATE-IMG-01); NRRD in the source geometry, `predictions_manifest.json` with per-file SHA-256, resumable, never overwrites. |
| `ml/configs/matrix_queue.template.json` | The six core runs (`EXP-U/D-025/050/100`) with the ADR-ML-001 values; `epochs` and `batch` are placeholders the validator refuses until set. |
| `ml/tests/` | pytest suite on a synthetic NRRD package (`ml/tests/synth.py`) and a synthetic run directory (`ml/tests/runfixture.py`); CPU only (`conftest.py` hides the GPU), no real data. |

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

A run directory (`<CARDIAC_RUNS_ROOT>\<experiment_id>\`, outside git; `CARDIAC_RUNS_ROOT`
is the environment variable, else `cardiac-runs` next to the main checkout) is also the
Contract 2 artifact root: every path a manifest records is relative to it, with forward
slashes.

```
config.json  run_manifest.json (written last = COMPLETE)  run_state.json  train_log.jsonl
checkpoints/last.pt (resume state + best weights)  checkpoints/best.pt (selected weights)
manifests/split_manifest.json                     byte copy of the split manifest
manifests/training_subset_<subset>.json           effective training cases
manifests/population_<partition>.json             validation or final_holdout case list
predictions/<partition>/<case>.nrrd + progress.jsonl + predictions_manifest.json (never overwritten)
evaluation/<partition>/per_case_metrics.json, per_slice_metrics.json, metrics_summary.json,
                       metric_sets/<case>.json, evaluation_manifest.json   (never overwritten)
contract2/<manifest_id>.json + <manifest_id>.export.json (export record)
```

```
python -m ml.train --config <experiment.json> [--epochs E] [--batch B]   # trains, resumes, or skips if COMPLETE
python -m ml.queue --queue <queue.json> --epochs E --batch B --dry-run  # then without --dry-run
python -m ml.infer --run-dir <run>                         # validation population, best.pt
python -m ml.infer --run-dir <run> --population holdout --confirm-frozen-morphology <sha256>
python -m ml.evaluate run --run-dir <run> --population validation
python -m ml.evaluate run --run-dir <run> --population final_holdout --allow-holdout
python -m ml.evaluate compare --run-a <run> --run-b <run> --population final_holdout --out <new.json>
python -m ml.export_contract2 --run-dir <run> --gate-split-01 <STATE> --gate-ml-01 <STATE> --validate
```

**The split is checked against the frozen file, not against the run directory.** Evaluation,
comparison and export accept a run only when its split copy is byte-identical to the frozen
split manifest: the repository's `data/manifests/split_manifest_path_a_seed2024.json`, or
another file named explicitly with `--split-manifest`. A run directory cannot vouch for itself.
A split copy that moves a holdout case into validation, even with every in-run sha256
updated, is refused (`SplitMismatchError`, regression test H9).

Always run the modules with `python -m ml.<module>` from the repository root: running a
file under `ml/` directly puts `ml/` on `sys.path`, where `ml/queue.py` would shadow the
standard-library `queue` module.

### Training: the ADR-ML-001 recipe

| Item | Implementation in `ml/train.py` |
|---|---|
| Loss | 0.5·BCEWithLogits (mean over pixels) + 0.5·soft Dice on sigmoid probabilities, per sample with smoothing 1.0, mean over the batch; fp32 |
| Optimizer | AdamW, constant lr (1e-4), torch default betas / eps / weight decay |
| Precision | bf16 autocast on CUDA; the device is exactly `cuda` or `cpu` (`cuda:0` is refused, never reinterpreted) |
| Seed / shuffle | `torch.manual_seed(seed)` before the model is built; **one** `torch.Generator` seeded with `seed`, reused across epochs, its state saved in `last.pt` |
| Augmentation | none |
| Validation | mean 3D Dice over the 20 validation cases **every epoch**, at **native resolution** (logits resized back, thresholded at 0.5) |
| Checkpoint | `best.pt` = best mean validation Dice (ties keep the earlier epoch); `last.pt` every epoch |
| Epochs / batch | required config values; `--epochs` / `--batch` on `ml.train` or `ml.queue` replace them and are recorded in `config.json` |

Other training rules. Unknown config keys are refused, and `batch` must be 8, 4 or 2.
Departures from the ADR-ML-001 values (img 560, lr 1e-4, seed 2024, bf16, CUDA, the two
declared families) are recorded in the run manifest as `recipe_deviations_from_adr_ml_001`,
not refused. `last.pt` is the commit point of an epoch and also stores the best weights, so
`best.pt` can always be re-derived after an interruption. A resumed run trains the same
batches as an uninterrupted one; this is tested bit for bit on CPU. Training code builds
only training and validation allowlists, and a test fails if `ml/train.py` or `ml/queue.py`
ever names holdout access. The run's split copy is written from the frozen split and must
stay byte-identical.

Each queued experiment runs train → infer (validation) → evaluate (validation). The
queue's `compare` pairs then produce paired **validation** comparisons in
`<runs_root>\_queue\<queue_id>\comparisons\`. Those comparisons are a pipeline and
model-selection check, not a result. The queue never touches the holdout.

Inference refuses non-finite logits: `NonFiniteLogitsError` records the case as FAILED.
Without the check, `sigmoid(NaN) >= 0.5` is False and the NaN would silently become a
background voxel. Run, predictions and evaluation manifests are checked against required-key
lists (`ml.manifests.validate_*`), so a missing key is a clear refusal (`EXPORT REFUSED`),
never a `KeyError`.

Scoring the final holdout needs `--allow-holdout` **and** a `holdout_authorization`
record in the predictions manifest (written by inference only under GATE-IMG-01). A
comparison between runs that fail the `08` §7 comparable-run gate is labelled
`NON_COMPARABLE` and carries no delta. Contract 2 DRAFT v0 cannot represent a failed
case (every analysis run needs a raw mask), so the exporter refuses a run with failures
rather than drop them. The exporter also refuses code versions that are not clean
commits (`+dirty`, `MIXED:`, `UNKNOWN`) unless `--allow-dirty-code` is given; that choice
is written to `<manifest_id>.export.json`, because the Contract 2 schema admits no extra
fields. Failure reasons name files relative to the run directory or the package root,
never by absolute path. The worst-slice block is exactly the API contract's
`{rule_id, selection_version: "dr010-worst-slice/v1", slices}`; the rule text and eligible
count are stored next to it as `worst_slice_selection_meta`.

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
skipped only on a branch that does not contain the manifest. `ml/tests/conftest.py` hides
every GPU (`CUDA_VISIBLE_DEVICES=-1`), so the suite never touches a GPU a training job is
using; the end-to-end tests train a UNet for one or two epochs at img=112 on synthetic cases
on CPU.
