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
| `ml/export_contract2.py` | Builds a Contract 2 DRAFT v0 experiment-artifact manifest from a run directory and runs `contracts/ingestion/contract2_experiment_artifact/validate_contract2.py` on it. Gate states are explicit CLI inputs with no default. Exports runs with failed cases (no analysis run for them, DR-018) and the PROCESSED EXP-D-PP run. |
| `ml/postprocess.py` | The GATE-IMG-01 candidates PP-0 .. PP-5 as pure, deterministic functions on a binary `[z, y, x]` mask (scipy.ndimage), the `CONFIGS` table, the frozen config format `ml-postprocess-config/1` with its sha256, and `derive` (CLI `python -m ml.postprocess derive`), which derives the EXP-D-PP run from EXP-D-100's RAW predictions. |
| `ml/gate_img_01.py` | The GATE-IMG-01 selection on EXP-D-100's RAW validation predictions: scores PP-0 .. PP-5 with `ml/evaluate.py`'s own case scoring, applies the pre-declared rule (highest mean 3D Dice, ties within 0.001 to the lower ID, winner frozen whether or not it beats PP-0), writes `SELECTION.md` and the frozen config. Validation only: any other population is refused. |
| `ml/manifests.py` | The shared run-directory layout (`RUN_LAYOUT`), population and training-subset manifests copied from the split manifest, `code_version()` (git commit + dirty flag), JSON writers that refuse to overwrite. |
| `ml/train.py` | One experiment from a JSON config: the ADR-ML-001 recipe on the subset's effective cases via the cache, validation 3D Dice (native resolution) every epoch, `last.pt` / `best.pt` with SHA-256, `train_log.jsonl`, resume from `last.pt`, then validation predictions + evaluation and `run_manifest.json` (`08` §10). |
| `ml/queue.py` | Runs a list of configs one after another, each in its own process: skips COMPLETE runs, resumes partial ones, logs every transition, keeps going after a failure. |
| `ml/infer.py` | Raw prediction masks for a population with a run's checkpoint; validation by default, final holdout only with `--population holdout --confirm-frozen-morphology <sha256>` (GATE-IMG-01); NRRD in the source geometry, `predictions_manifest.json` with per-file SHA-256, resumable, never overwrites. |
| `ml/configs/queues/unet_adr_ml_001.json` | The committed UNet queue (EXP-U-025 → 050 → 100, `SET_E` / `SET_BATCH` placeholders, U-vs-U validation compares). See "UNet family: from training to the app". |
| `tools/ml/` | The kit that takes a trained family to the app: `make_holdout_authorization.py` (build the authorization record), `holdout_pipeline.py` (ONE command: holdout inference, evaluation, comparisons, Contract 2 export, aggregate), `results_aggregate.py` (the aggregate JSON builder). It calls the module CLIs above and implements none of them. |
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
                                                  (EXP-D-PP, a DERIVED run: processed <case>.nrrd, raw_source/<case>.nrrd =
                                                   byte copies of the RAW masks, no progress.jsonl, no checkpoints/;
                                                   postprocessing/postprocess_config.frozen.json = the frozen config)
evaluation/<partition>/per_case_metrics.json, per_slice_metrics.json, metrics_summary.json,
                       metric_sets/<case>.json, evaluation_manifest.json   (never overwritten)
contract2/<manifest_id>.json + <manifest_id>.export.json (export record)
```

```
python -m ml.train --config <experiment.json> [--epochs E] [--batch B]   # trains, resumes, or skips if COMPLETE
python -m ml.queue --queue <queue.json> --epochs E --batch B --dry-run  # then without --dry-run
python -m ml.infer --run-dir <run>                         # validation population, best.pt
python -m ml.infer --run-dir <run> --population holdout --holdout-authorization <record.json>
python -m ml.gate_img_01 --source-run <EXP-D-100 run> --population validation   # GATE-IMG-01 selection, validation only
python -m ml.postprocess derive --source-run <EXP-D-100 run> --population validation --config <frozen.json> --out-run <new EXP-D-PP run>
python -m ml.postprocess derive --source-run <EXP-D-100 run> --population holdout --config <frozen.json> --out-run <EXP-D-PP run> --holdout-authorization <record.json>
python -m ml.evaluate run --run-dir <run> --population validation
python -m ml.evaluate run --run-dir <run> --population final_holdout --allow-holdout --holdout-authorization <record.json>
python -m ml.evaluate compare --run-a <run> --run-b <run> --population final_holdout --out <new.json>
python -m ml.export_contract2 --run-dir <run> --gate-split-01 <STATE> --gate-ml-01 <STATE> --validate
python -m ml.export_contract2 --run-dir <EXP-D-PP run> --source-run <EXP-D-100 run> --gate-split-01 <STATE> --gate-ml-01 <STATE> --validate
```

**The split is pinned.** `ml.data.FROZEN_SPLIT_SHA256` is the sha256 of the frozen Path A
split, `c5c65a09…396d`. Training, inference, evaluation, comparison and export refuse any
split with another sha256. That covers a config path, a `--split-manifest` argument and a
local edit of `data/manifests/split_manifest_path_a_seed2024.json` alike. The refusal
happens before anything is written (regression test P1).

**No CLI can override the pin (#64 R-1).** `ml.infer`, `ml.evaluate` and
`ml.export_contract2` have no `--allow-unfrozen-split` flag, so `--split-manifest` can only
name a byte-identical copy of the frozen split. A file inside the run directory is refused
outright, because a run cannot vouch for its own split (QA probes H9b and C6).

The **test-only** switch survives in two places only, and both are recorded:
- `allow_unfrozen_split` in a training config, which `ml/train.py` reads;
- the `allow_unfrozen_split=` parameter of the Python API, used by the synthetic tests.

It applies to **validation only**: `final_holdout` prediction, evaluation, comparison and
export refuse it (`HoldoutSplitError`). Tests that exercise the holdout path pin the
synthetic split as the frozen one with a monkeypatch (`ml/tests/runfixture.pin_frozen_split`);
no production switch exists for that.

Where the switch is recorded:
- in `recipe_deviations_from_adr_ml_001`;
- as `frozen_split` in the run, predictions and evaluation manifests;
- in the Contract 2 export record.

A run's split copy must also be byte-identical to that split. A run directory cannot vouch
for itself: a split copy that moves a holdout case into validation is refused even with
every in-run sha256 updated (`SplitMismatchError`, regression test H9).

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

More queue behaviour:
- It refuses to start without psutil; the run lock stores pid and `create_time`.
- A COMPLETE run whose `config.json` differs from its queue entry is reported as failed,
  not skipped.
- Training processes run unbuffered, so the per-run stdout log is live.
- **To monitor a run, watch `<run>\train_log.jsonl` and `<runs_root>\_queue\<queue_id>\queue_log.jsonl`.**
- The `first_step` event in `train_log.jsonl` records the logits dtype actually produced,
  plus whether the GPU supports bf16. This is runtime evidence that bf16 autocast is in
  effect.

### Day 22 night queue (DINOv2, this PC)

The queue file stays outside git, at `<CARDIAC_RUNS_ROOT>\_queue_configs\d22-dinov2.json`.
Its content:

```json
{"queue_id": "d22-dinov2",
 "experiments": [
  {"experiment_id": "EXP-D-025", "variant": "dinov2_s14_full_progressive", "subset": "25_percent",
   "epochs": "SET_E", "batch": "SET_BATCH", "lr": 0.0001, "img": 560, "seed": 2024,
   "precision": "bf16", "device": "cuda", "num_workers": 0, "require_clean_code": true},
  {"experiment_id": "EXP-D-100", "...": "same, subset 100_percent"},
  {"experiment_id": "EXP-D-050", "...": "same, subset 50_percent"}],
 "compare": [["EXP-D-025", "EXP-D-100"], ["EXP-D-050", "EXP-D-100"], ["EXP-D-025", "EXP-D-050"]]}
```

The three runs go in the order EXP-D-025 → EXP-D-100 → EXP-D-050. The comparisons are
D-vs-D on the **validation** population and are **not results**. E and the batch come from
the C1 calendar.

Run the dry run first, from the repository root of a clean checkout:

```
python -m ml.queue --queue <CARDIAC_RUNS_ROOT>\_queue_configs\d22-dinov2.json --epochs <E> --batch <B> --dry-run
python -m ml.queue --queue <CARDIAC_RUNS_ROOT>\_queue_configs\d22-dinov2.json --epochs <E> --batch <B>
```

To resume after an interruption, run the same command again with the same E and B.

Inference refuses non-finite logits: `NonFiniteLogitsError` records the case as FAILED.
Without the check, `sigmoid(NaN) >= 0.5` is False and the NaN would silently become a
background voxel. Run, predictions and evaluation manifests are checked against required-key
lists (`ml.manifests.validate_*`), so a missing key is a clear refusal (`EXPORT REFUSED`),
never a `KeyError`.

### The holdout lock: the GATE-IMG-01 authorization record (#64 N-1)

Predicting or scoring the final holdout needs a **structured authorization record**, a
JSON file committed with the GATE-IMG-01 decision. Presence alone is not enough. The tools
verify its content before any holdout case is read or anything is written:
- `ml.infer --population holdout --holdout-authorization <record.json>`
- `ml.evaluate run --population final_holdout --allow-holdout --holdout-authorization <record.json>`

The checking code is `ml/holdout.py`. Format `ml-holdout-authorization/1`:

```json
{
  "format": "ml-holdout-authorization/1",
  "gate": "GATE-IMG-01",
  "gate_status": "CLOSED",
  "closed_at": "2026-10-03T09:00:00+07:00",
  "decision_ref": "management/<day>/<GATE-IMG-01 decision record>.md",
  "split_sha256": "c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d",
  "postprocessing_config_sha256": null,
  "authorized_runs": [
    {"experiment_id": "EXP-D-100", "checkpoint_sha256": "<sha256 of that run's checkpoints/best.pt>"}
  ],
  "authorized_by": "<a person's name>",
  "authorized_at": "2026-10-03T09:30:00+07:00"
}
```

| Field | Rule |
|---|---|
| `format` | exactly `ml-holdout-authorization/1` |
| `gate` / `gate_status` | exactly `GATE-IMG-01` / `CLOSED` |
| `closed_at`, `authorized_at` | ISO 8601 with a UTC offset; `authorized_at` is not before `closed_at` |
| `decision_ref` | repository-relative path (forward slashes, no `..`); the file must exist in the checkout the tool runs from |
| `split_sha256` | must equal `ml.data.FROZEN_SPLIT_SHA256`; the run's split copy must equal it too |
| `postprocessing_config_sha256` | the frozen morphology config's sha256, or `null` for a RAW-only authorization. A `PROCESSED_PREDICTION` run needs it non-null and equal to its predictions manifest's value. `ml.infer --morphology-config <file>` checks the file against it |
| `authorized_runs` | non-empty list of exactly `{experiment_id, checkpoint_sha256}`; no experiment listed twice |
| `authorized_by` | a person's name (non-empty string) |
| `notes` | optional string; **no other key is accepted** |

**What is refused** (`HoldoutAuthorizationError`, CLI exit 2 with `REFUSED: ...`):
- a record that is not valid JSON: a bare `yes`, an empty or truncated file, UTF-16, a
  duplicate key or `NaN` (a UTF-8 BOM is tolerated);
- a record that is not an object, or has a missing field, an unknown field or a wrong type;
- a gate that is not `CLOSED`;
- a `split_sha256` that is not the frozen split;
- a run whose `experiment_id`, paired with the sha256 of its **`checkpoints/best.pt`**, is
  not in `authorized_runs`. A replaced `best.pt` fails this check too, and holdout
  inference uses `best.pt` only;
- a `decision_ref` that is not in the checkout.

**How the record travels.** Inference embeds the verified record and its file sha256 in the
predictions manifest, as `holdout_authorization: {record_sha256, record, verified_at}`.
Evaluation re-verifies the record file and then requires the predictions to have been made
under the **same** record (same sha256, same content). A presence-only value such as `"yes"`
or the old `{"confirm_frozen_morphology_sha256": ...}` is refused. The evaluation manifest
records `holdout_authorization` and `frozen_split`.

The exporter has no record file. It re-verifies the embedded record against the run:
frozen split, experiment, `best.pt` sha256 and `decision_ref`. It also requires the
evaluation manifest to name the same `record_sha256`, and writes that sha256 to
`<manifest_id>.export.json`.

**Derived runs (EXP-D-PP).** `ml.postprocess derive` for the holdout verifies the record before it
reads a prediction: the record must list **EXP-D-PP** and the **source run** with the sha256 of the
source's `checkpoints/best.pt`, its `postprocessing_config_sha256` must equal the sha256 of the
config file, and the source's RAW holdout predictions must have been made under that very record.
The derived predictions manifest carries `prediction_variant: PROCESSED_PREDICTION`,
`postprocessing_version`, `postprocessing_config_sha256`, `derived_from {experiment_id, partition,
predictions_manifest_sha256, checkpoint_sha256, checkpoint_id}` and the embedded record, exactly as
`ml.infer` embeds it. A derived run has no checkpoint file: evaluation and export resolve the
checkpoint through `derived_from` (`ml.manifests.derived_from`), and the record's
`authorized_runs` must pair EXP-D-PP with that sha256. Only EXP-D-PP, a PROCESSED_PREDICTION run
derived from EXP-D-100, may carry `derived_from`; no other run can use it to skip the checkpoint-file
check. Every existing refusal for normal runs is unchanged.

Population roles are checked against the partition (N-2):
- the predictions manifest's `population.role` must be `VALIDATION` / `FINAL_HOLDOUT`;
- the population manifest's `role` must match as well;
- the exporter also checks the evaluation manifest's role.

### Comparisons, failures and the export

A comparison between runs that fail the `08` §7 comparable-run gate is labelled
`NON_COMPARABLE` and carries no delta.

**Failed cases (DR-018 rules 1 and 3).** The exporter exports an experiment that has failed
cases. A case that failed in inference or in evaluation gets **no analysis run** and no
artifact; it stays listed, with its reason, in the PER_CASE_METRICS artifact's `failures`
list that `ml.evaluate` writes, so nothing is dropped (`08` §8.1). Every intended case must
be exactly one of a scored case (a run) or a listed failure; otherwise the export is refused.
`experiment.num_test_cases` is the intended population (54), runs plus failures equal it, and
`<manifest_id>.export.json` names the failed case ids and the run count.

**PROCESSED runs (DR-018 rule 3).** EXP-D-PP is exported with mask kind
`PROCESSED_PREDICTION_MASK`: per case one `RAW_PREDICTION_MASK` (the byte copy of the raw mask it
derives from, kept in the derived run), one `PROCESSED_PREDICTION_MASK` citing it
(`source_artifact_id`) and a `METRIC_SET` whose prediction is the processed mask.
`postprocessing_config_sha256`, `derived_from` and the post-processing code version are recorded
in `<manifest_id>.export.json` (the Contract 2 schema admits no extra field and is unchanged).
Contract 2 needs the checkpoint file under the artifact root and a derived run holds none, so the
exporter takes `--source-run <EXP-D-100 run>`, verifies its `checkpoints/best.pt` against
`derived_from.checkpoint_sha256` and places it (hard link, else copy) at the derived run's
`checkpoints/best.pt`.

The exporter also refuses code versions that are not clean
commits (`+dirty`, `MIXED:`, `UNKNOWN`) unless `--allow-dirty-code` is given; that choice
is written to `<manifest_id>.export.json`, because the Contract 2 schema admits no extra
fields. Failure reasons name files relative to the run directory or the package root,
never by absolute path. The worst-slice block is exactly the API contract's
`{rule_id, selection_version: "dr010-worst-slice/v1", slices}`; the rule text and eligible
count are stored next to it as `worst_slice_selection_meta`.

## GATE-IMG-01: post-processing candidates and the EXP-D-PP run

The candidates are the closed list pre-declared in `management/day39/RECOVERY_OVERRIDE_DAY39.md` §4
(`ml/postprocess.py`, table `CONFIGS`); all take the raw `[z, y, x]` mask (z = slice axis = array
axis 0) and return a mask of the same dtype:

| ID | Operations, in order |
|---|---|
| PP-0 | identity (reference only, not eligible) |
| PP-1 | largest 3D connected component, 26-connectivity (`generate_binary_structure(3, 3)`) |
| PP-2 | per-slice 2D hole filling (`binary_fill_holes` on every `[y, x]` slice, 4-connected background), then PP-1 |
| PP-3 | 3D closing, 3×3×3 cube, 1 iteration, then PP-1 |
| PP-4 | 3D opening, 3×3×3 cube, 1 iteration, then PP-1 |
| PP-5 | 3D closing (as PP-3), then per-slice hole filling, then PP-1 |

Edge behaviour (all calls use `border_value=0`). **Closing** zero-pads the volume by one voxel and crops
afterwards: scipy's bare closing erodes foreground that touches the volume border, the padded closing is
extensive (never removes a voxel) and does not shrink at the border. **Opening** treats the outside of the
volume as background and does not pad: a 3×3×3 cube must lie inside the volume, so a structure at least 3
voxels thick keeps its voxels on the border slice and only thinner structure is removed. An exact size tie in
the largest-component step keeps the component whose first voxel comes first in C order. An empty mask stays
empty under every candidate.

`python -m ml.gate_img_01` scores PP-0 .. PP-5 on EXP-D-100's RAW validation predictions in memory (no file
is written per candidate) with `ml.evaluate`'s case scoring, applies the rule (highest mean 3D Dice among
PP-1 .. PP-5, a tie within 0.001 goes to the lower ID, the winner is frozen whether or not it beats PP-0, the
change against PP-0 is worded `improves` / `worsens` / `unchanged` with a ±0.001 tolerance) and writes
`management/day39/gate_img_01/SELECTION.md` (aggregate means only) and the frozen config
`postprocess_config.frozen.json` (`ml-postprocess-config/1`: `format`, `config_id`, `operations`,
`code_version` = the last commit of `ml/postprocess.py`, `source_rule`). The sha256 of that file's bytes is the
`postprocessing_config_sha256` of the authorization record. Per-case detail goes to
`<CARDIAC_RUNS_ROOT>\_gate_img_01\`, outside git. The CLI refuses every population but `validation` and a
tree with uncommitted changes under `ml/`.

`python -m ml.postprocess derive` creates the EXP-D-PP run from the RAW predictions of EXP-D-100 (`07` §5,
`08` §2): processed masks with the raw header geometry, the raw masks they derive from, and a predictions
manifest as described under the holdout lock. `ml.evaluate run` and `ml.export_contract2` accept it.

## UNet family: from training to the app

The UNet family (EXP-U-025, EXP-U-050, EXP-U-100; ADR-ML-001) is trained by Bế Quốc Khánh on the RTX 4050. Everything
after training is scripted in `tools/ml/`, so the leader's part is one signature and one command. The holdout rules do
not change: each run is predicted and scored **once**, from `checkpoints/best.pt`, under a signed
`ml-holdout-authorization/1` record, and no holdout number changes a configuration, a threshold or a checkpoint.
Paths below are placeholders: `<runs>` is `CARDIAC_RUNS_ROOT` (outside git), `<root>` is the backend data directory.

### 1. Khánh: train and report

From a clean checkout of `main`, with `CARDIAC_DATA_ROOT` set and `pip install psutil` done:

```
git diff --stat c7a37e0 HEAD -- ml/train.py ml/data.py ml/models.py     # must print nothing (DR-016a item 4)
python -m ml.queue --queue ml/configs/queues/unet_adr_ml_001.json --epochs 50 --batch 8 --dry-run
python -m ml.queue --queue ml/configs/queues/unet_adr_ml_001.json --epochs 50 --batch 8
```

- E = 50 and batch 8 are fixed by DR-016a. The file holds `SET_E` / `SET_BATCH` on purpose, like the Day 22 DINOv2
  queue: without `--epochs` and `--batch` `ml.train` refuses to start, so no run can use a wrong E. Both values are
  recorded in every run's `config.json`.
- Order EXP-U-025 → EXP-U-050 → EXP-U-100. Each run trains, predicts the **validation** population with `best.pt` and
  evaluates it. The three U-vs-U comparisons go to `<runs>\_queue\unet-adr-ml-001\comparisons\` and are a pipeline
  check, not results. If the queue is interrupted, run the identical command again.
- Tripwire (DR-016a), on epoch 1 of EXP-U-025: mean training step ≤ 1.13 s, peak reserved memory below the free VRAM
  noted before the start, "Shared GPU memory" near 0, and `first_step` in `train_log.jsonl` shows
  `logits_dtype: torch.bfloat16`. If a check fails the queue keeps running; tell the leader at once. E and batch never change.
- Report: the tripwire numbers, then, when the queue ends, that all three runs are COMPLETE (`run_state.json`
  `status`) and each run's best validation Dice (selection only, not a result).
- Hand the three run directories over to the leader's `<runs>`: copy, never move. Copy each directory whole;
  `checkpoints/last.pt` may stay behind (nothing after training reads it).

### 2. Leader: authorize (one signature)

On the PC that holds the runs, from a clean checkout of `main`:

```
python tools/ml/make_holdout_authorization.py --runs-root <runs> --experiments EXP-U-025 EXP-U-050 EXP-U-100 \
    --authorized-by "<your name>" --authorized-at <ISO 8601 time with offset, or now> \
    --out management/<day>/gate_img_01/holdout_authorization_unet.json
```

The script reads, it does not decide. `--authorized-by` and `--authorized-at` are required and are never invented.
Per run it needs `run_state.json` and `run_manifest.json` COMPLETE and a `checkpoints/best.pt` whose sha256 is the one
the run recorded. `closed_at`, `decision_ref`, `split_sha256` and `postprocessing_config_sha256` are copied from the
Day 39 gate record (`management/day39/gate_img_01/holdout_authorization.json`, option `--gate-record`); the
post-processing sha256 is also checked against the frozen PP-4 config file. It refuses, listing every reason and writing
nothing: an incomplete or altered run; a run that already has `evaluation/final_holdout`, holdout predictions or
partial holdout predictions (a run is scored once); a checkpoint already authorized in the gate record or in a record
named with `--also-check-record`; an existing output file. The record is written UTF-8 with LF line ends, read back
with `ml.holdout.load_record`, and its sha256 is printed. **Commit it to `main`** before the next step: `decision_ref`
and the record are resolved from the committed checkout. The record lists EXP-U-* only. UNet post-processing, if any,
is declared separately (`08` §2); EXP-D-PP stays under the Day 39 record.

### 3. Leader: the one command

```
python tools/ml/holdout_pipeline.py --record management/<day>/gate_img_01/holdout_authorization_unet.json \
    --runs-root <runs> --experiments EXP-U-025 EXP-U-050 EXP-U-100 --compare-family-pairs \
    --aggregate-out <path>\results_aggregate_unet.json --dry-run
```

Run it with `--dry-run` first: it prints the pre-flight verdict and the exact commands, and runs nothing. Then run it
again without `--dry-run`. The steps, each the existing module CLI in its own process:

| Step | Command |
|---|---|
| per experiment, in order | `ml.infer --population holdout`, then `ml.evaluate run --population final_holdout --allow-holdout`, both with `--holdout-authorization <record>` |
| comparisons into `<runs>\_holdout_<tag>\comparisons\` (`<tag>` is the first 8 hex of the record's sha256, or `--tag`) | within the family: 025→100, 050→100, 025→050; with `--compare-family-pairs`, the RQ-A core at equal fraction: EXP-U-025→EXP-D-025, EXP-U-050→EXP-D-050, EXP-U-100→EXP-D-100 (`ml.evaluate compare`, run b minus run a, so these deltas are DINOv2 minus UNet) |
| Contract 2 | `ml.export_contract2 --validate` for each new run (gate states `ACCEPTED` / `ACCEPTED` by default; `--gate-split-01` / `--gate-ml-01` change them) |
| aggregate | `tools/ml/results_aggregate.py` over the new runs, the DINOv2 runs they were compared with and the new comparisons, extending `management/day39/results_aggregate.json` (`--aggregate-base`), written to `--aggregate-out` |

- **Pre-flight, before any holdout case is read:** the record is strict JSON with the gate CLOSED and the frozen
  split, and is a committed, unmodified file of this checkout; every run is COMPLETE with a `best.pt` the record authorizes; `ml/` is a clean commit (the exporter refuses
  dirty code); every EXP-D-* counterpart of a comparison already has its `evaluation/final_holdout`. One problem
  refuses the whole command (exit 2) and nothing runs. On a machine without the EXP-U-* run directories the dry run
  says exactly that, run by run.
- **Scored once.** A run whose holdout predictions or evaluation were made under another record, or under none, is
  refused. Under *this* record the identical command is safe to repeat: finished steps are skipped, a crashed
  inference is resumed by `ml.infer`, and a crashed evaluation is run again (it is written atomically).
- **Logs and failure.** Every step writes `<runs>\_holdout_<tag>\<name>.log`; `pipeline_log.jsonl` there has one line
  per step. The pipeline stops at the first failure (exit 1), names the log and shows its last lines, and runs nothing
  after it. Fix the cause and run the identical command. A final table lists every step; on success it also prints the
  aggregate numbers (Dice 3D mean with CI per run, every paired delta).
- Day 39 took about 14 minutes for four runs, so the family should take the same order of time.
- `--derive-pp-from EXP-D-100` additionally derives EXP-D-PP between inference and evaluation. It needs a record that
  lists EXP-D-PP, so it is not used for the UNet record. `--device` and `--infer-batch` are passed to `ml.infer`.

### 4. Redeploy: from the new runs to the app

1. Copy each new run directory into the backend data directory, as for the Day 39 runs (`tools/e2e/README.md`,
   "Build the backend data directory"); the manifest is `<run>\contract2\<manifest>.json` and the run directory is its
   artifact root:
   ```
   foreach ($e in 'EXP-U-025','EXP-U-050','EXP-U-100') {
     robocopy "<runs>\$e" "<root>\experiments\$e" /E /XD "<runs>\$e\predictions\validation" "<runs>\$e\evaluation\validation" /XF last.pt
   }   # robocopy exit codes 0-7 are success
   python -m backend.mesh.build_cache --data <root>
   ```
   The data cache needs no rebuild: it is per case and was built under the Day 39 record. `/health` must then show
   7 experiments and an empty `rejected_experiment_packages`.
2. `backend/scripts/deploy_macmini.ps1` ships the code and `data_cache` only, not `experiments/` or `derived_meshes/`.
   Put those on the host under `~/cardiac-backend-data/` (or build the meshes there), then run the script again
   (`-SkipData` when the cache did not change); see `backend/README.md`, "Deploy to the Mac mini".
3. Check it with `python tools/e2e/hero_flow_api.py --base-url <host url> --no-writes --experiments EXP-D-025 EXP-D-050
   EXP-D-100 EXP-D-PP EXP-U-025 EXP-U-050 EXP-U-100`; H10 "UNet vs DINOv2" is the step that stops being a SKIP.
4. When the results page is updated, commit a copy of the aggregate under `management/<day>/` (aggregates only: no per-case value, no path).
   `tools/board/build_results.py` labels and charts the four DINOv2 runs only today; it needs labels for EXP-U-*
   before it can render an aggregate that contains them.

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
`ml/tests/test_unet_kit.py` covers the UNet kit (`tools/ml/`) on synthetic runs only.

CI runs the suite as the job `ml tests (CPU)` in `.github/workflows/guardrails.yml`: Python 3.12, CPU torch 2.5.1
from the official PyTorch CPU wheel index, numpy 2.2.6, scipy 1.17.1, pynrrd 1.1.3, psutil 7.2.2, jsonschema 4.26.0,
pytest 8.3.4, `CUDA_VISIBLE_DEVICES=-1 HF_HUB_OFFLINE=1`, 25 minutes. transformers is not installed there; the
DINOv2 tests skip.
