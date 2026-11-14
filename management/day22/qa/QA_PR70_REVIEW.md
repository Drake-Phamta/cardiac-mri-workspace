# QA: PR #70, training queue and inference (`feat/ml-train-queue-infer`) · **MERGE AFTER FIXES** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. I am an LLM QA session (Claude Code, Claude Opus 5.5) running under the team leader's account, **not a second human reviewer**. This is the independent QA pass named in `RECOVERY_OVERRIDE_DAY22.md` §2 item 2. |
| **Target** | PR #70. I reviewed the delta `5cdd92a..6852231` (commits d1385cf, 160352d, 6852231). The verdict is given at the rebased head **`8f4703ad193a858eaeac2c78d398677b0fcc3e5c`**. |
| **Rebase identity (verified)** | `git range-diff 5cdd92a..6852231 origin/main..8f4703a` shows all three commits as `=` (d1385cf→ef691cb, 160352d→b96bbef, 6852231→8f4703a). The full trees are byte-identical: `6852231^{tree}` = `8f4703a^{tree}` = `d442aa7…`, and `5cdd92a^{tree}` = `440dab1^{tree}` = `bd697fb…`. The `ml/` subtree is `bf5938b…` in both 5cdd92a and 440dab1. Both of the author's claims hold, so the review of 6852231 applies to 8f4703a byte for byte. |
| **Base** | `origin/main` = `440dab1` (#64, squash-merged). The PR is MERGEABLE, and CI is 8/8 green on 8f4703a. |
| **Run** | 12:27–12:43 +07, inside the 55-minute timebox. |
| **Environment** | Python 3.12.6, torch 2.5.1+cu121, numpy 2.2.6, transformers 4.51.3, psutil 7.2.2. `CUDA_VISIBLE_DEVICES=-1`, one process, no `-n`, `num_workers` 0. `CARDIAC_DATA_ROOT`, `CARDIAC_PACKAGE_ROOT`, `CARDIAC_CACHE_ROOT` and `CARDIAC_RUNS_ROOT` pointed at non-existent paths in `<qa-scratch>`. A watchdog killed any run above 1.9 GB. Peak process-tree RSS was 1384 MiB for the suite and 1195 MiB for the probes. |
| **Method** | Read-only. I made no commit, push, approval or GitHub comment, and the main checkout's branch was not touched (it is still `main`). My own worktree was detached at 6852231 and then at 8f4703a; it is clean. Probes ran on `ml/tests/synth.py` packages in `<qa-scratch>`. |
| **Data handling** | I read no real image or mask bytes, and nothing from the validation or holdout partitions. The only real file read was the split manifest's ID lists (a repository file), for check 3a. |

> **VERDICT: MERGE AFTER FIXES.** There are two blocking items:
> - **B-1:** squash-merge only, because the first commit carries a machine path in history.
> - **B-2:** pin the frozen split's sha256 in `ml.train`. Today a training config can name any split file, and probe P1 trained on a holdout case without any warning.
>
> The recipe is implemented line for line. A hard kill mid-epoch resumes bit-identically. Forged run copies of the split are refused at every entry point. The training-time validation Dice is identical to the post-training evaluation.

---

## 1 · Commands and probes run

| # | What | Purpose |
|---|---|---|
| R1 | `git fetch`, `checkout --detach`, `range-diff`, `rev-parse <ref>^{tree}`, `diff --stat`/`--name-status 5cdd92a 6852231`, `git show` per commit | Rebase identity; scope of the delta; history hygiene |
| R2 | `python -m pytest ml/tests -q -p no:cacheprovider --basetemp=<qa-scratch>` | Test suite |
| R3 | `probes.py` (P1–P7), with a child trainer that injects faults via `os._exit(137)` (a hard kill: no `finally`, no flush) | Resume, lock, forged splits, queue drift, buffering, geometry |
| R4 | `checks2.py` | Run-manifest validator coverage against `08` §10; training-time Dice vs evaluation Dice; real split subset membership (IDs only) |
| R5 | `gh pr view 70 --json …` (read-only) | Head SHA, mergeability, CI |

## 2 · Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Test suite | **PASS** | **126 passed** in 71 s, matching the author's count; nothing skipped (the DINOv2 checkpoint is in the local HF cache). Note: none of the 8 CI jobs runs `ml/tests` (N-9c). |
| 2a | Models | **PASS** | Template variants are `unet_base32_depth4` and `dinov2_s14_full_progressive`. The revision is pinned to `ed25f3a3…` and loaded with `local_files_only`. `ml/models.py` is not touched by the delta. |
| 2b | 560 px, every slice, DR-011, no augmentation | **PASS** | Template uses `img` 560. `SliceDataset` serves every slice of every allowlisted case with no augmentation. DR-011 comes from `ml/data.py`. The delta adds one pure helper to `data.py` (`model_input_stack`: resize → float16 → float32). It does no data access, and the test shows it is bit-equal to the cache. |
| 2c | Loss reduction | **PASS** | `recipe_loss`: `0.5·BCEWithLogits(mean) + 0.5·soft_dice_loss`, cast to fp32 outside autocast. BCE is the mean over all pixels, which equals the per-sample mean averaged over the batch because every sample has the same pixel count. Dice is per sample (`flatten(1)`, smoothing 1.0), and `1 − mean(dice_i)` is the batch mean. Covered by the unit test `test_soft_dice_is_per_sample_and_averaged_over_the_batch`. |
| 2d | Optimiser | **PASS** | `AdamW(trainable params, lr=cfg["lr"])`, torch defaults, no scheduler. |
| 2e | bf16 actually used on CUDA | **PASS (code path)** · NOT MEASURED on a GPU | `autocast_for` normalises the device with `torch.device(d).type` and returns `torch.autocast("cuda", bfloat16)`. `test_every_cuda_spelling_takes_the_cuda_path` (test_models.py) records exactly that call for `"cuda"`, `"cuda:0"`, `torch.device("cuda")` and `torch.device("cuda", 0)`. `ml.train` refuses any device other than exactly `cuda` or `cpu`, and refuses bf16 off CUDA. `infer.resolve_runtime` gives bf16 for every CUDA spelling (6 parametrised cases). The same autocast path runs in training, in per-epoch validation and in inference. Nothing at runtime records the dtype (N-8). |
| 2f | Seed placement | **PASS** | `torch.manual_seed(seed)` is called right before `build_model`. DinoSeg forks the RNG while loading, so the decoder initialisation is deterministic. |
| 2g | One shuffle generator, reused; state saved and restored | **PASS** | One `torch.Generator().manual_seed(seed)` is passed to the DataLoader for every epoch. Its state, plus the torch and CUDA RNG states, are stored in `last.pt` and restored on resume. P3 below confirms this. |
| 2h | Validation Dice every epoch, native resolution, validation allowlist only | **PASS** | `validate()` iterates `val_ds` built from `CaseAllowlist.for_validation`. Logits are resized back to the native H×W and then thresholded at 0.5 (`resize_logits_back` → `logits_to_mask`). Native reference masks come from the cache. In R4, **training-time per-case Dice is identical to the post-training `ml.evaluate` Dice** (exact float equality). |
| 2i | Best-checkpoint selection | **PASS** | Strictly greater replaces; ties keep the earlier epoch. `last.pt` carries the best weights, so `best.pt` can be re-derived after an interruption (covered by a test). |
| 2j | `--batch`/`--epochs` reach every run and its `config.json` | **PASS** | `apply_overrides` in both `ml.train` and `ml.queue`. Recorded in `config.json`, in the run manifest `epochs`, and in `recipe_values.batch` (covered by a test). Caveat: when a COMPLETE run is skipped, its config is not compared (N-3). |
| 3a | Training reads only `effective_case_ids` | **PASS** | Real split sha256 `c5c65a09…`, partitions 80/20/54. Subsets are 20/38/78, with **CASE_0117 and CASE_0133 absent** and no overlap with holdout or validation. Training builds its cache and dataset from `for_training(split, subset)` only. |
| 3b | Validation reads only the validation partition | **PASS** | `for_validation` is used for the cache, the dataset, prediction and evaluation. |
| 3c | Infer and evaluate in the training path never touch final_holdout | **PASS** | `"validation"` is hard-coded. The source test bans holdout access in train.py and queue.py, and the `trained` fixture booby-traps `allow_holdout`. The queue test asserts that no `predictions/final_holdout` directory exists. |
| 3d | Run's split copy written from the **frozen** split, with its sha asserted | **FAIL → B-2** | The copy is asserted equal only to whatever file `paths.split_manifest` names. Nothing compares it with the GATE-SPLIT-01 sha256 `c5c65a09…`. |
| 3e | Forged **run copy** through every entry point | **PASS** | P2: resuming training refuses with `ConfigMismatch`; `predict_population` refuses with `SplitMismatchError`; `compare_runs` refuses with `SplitMismatchError`. `evaluate` is covered by the #64 H9 regression test. |
| 3f | Forged **frozen** split / holdout IDs through the CLI entry points | **FAIL → B-2** | P1: a config with `paths.split_manifest` naming a split that swaps holdout `SYN_0007` into the train partition and the 25 % subset → **COMPLETED**. The cache sidecar marks `SYN_0007` as partition `train`, the run logged `train_cases: 2`, and `recipe_deviations` says nothing. The only trace is `run_manifest.split_manifest.sha256` ≠ the frozen sha. `ml.infer`, `ml.evaluate` and `compare` accept any `--split-manifest` the same way (this is #64's open R-1). |
| 4a | A kill mid-epoch resumes bit-identically on CPU | **PASS (reproduced)** | The existing test interrupts at an epoch boundary with a catchable `KeyboardInterrupt`. P3 is harder: a hard exit at **epoch 2, step 2**. Results: exit 137, status PARTIAL, lock left `held`. Resume gives COMPLETED with events `start, epoch 1, resume@2, epoch 2`. Against an uninterrupted run, all of these are **identical**: last and best model states, optimizer state, generator state, best epoch, per-epoch loss and validation Dice, the prediction NRRD sha256s, and the per-case metrics. |
| 4b | Checkpoint sha256 in the run manifest | **PASS** | `checkpoint.sha256` = `best.pt`, `last_checkpoint.sha256` = `last.pt`, both also in `run_state.json` (P3). The manifest writer refuses if `best.pt` changed after it was recorded. Inference re-checks `best.pt` against `run_state` and the manifest. |
| 4c | Nothing overwritten | **PASS** | `config.json`, the split copy, the subset manifest and the population manifest are write-once (bytes are compared on rewrite). Predictions are created exclusively (hard link from a temporary file). Evaluation commits with an atomic directory rename. `run_manifest` and comparisons use `write_json_new`. `last.pt`/`best.pt` are replaced atomically during training by design, then frozen and hashed at COMPLETE. |
| 4d | Queue skips COMPLETE runs, records failures and continues | **PASS** | `test_queue_runs_trains_evaluates_compares_and_survives_a_failure`: outcomes `skipped, failed, completed`; the queue exit code is non-zero; failures are listed in `queue_end`. |
| 4e | A crash leaves a resumable state | **PASS with psutil / FAIL without** | P3 with psutil: the dead PID's lock is taken over and the run resumes. P3b with psutil hidden: `RuntimeError: … is being trained by pid <dead pid>`, exit 1, until `.lock.json` is edited by hand (N-5). psutil is installed on this PC. |
| 4f | Training log complete after a kill | **FAIL (minor) → N-4** | P6: a kill just before the epoch-1 log line, then a resume. Events are `start, resume@2, epoch 2`. The manifest reports `epochs: 2`, `train_log.epoch_lines: 1`, and best epoch = **1**, the epoch whose line is missing. |
| 5a | Non-finite logits recorded as FAILED with a reason | **PASS** | `NonFiniteLogitsError` is raised before thresholding. The case is FAILED with the reason `NonFiniteLogitsError…`, and the manifest is withheld unless `--accept-failures` (covered by a test). During training validation the same error is fatal. |
| 5b | RAW, checksummed, immutable | **PASS** | `RAW_PREDICTION`, postprocessing `none`. Per-file sha256 in `progress.jsonl` and in the manifest. Unrecorded files are refused. |
| 5c | Threshold 0.5 after the native resize | **PASS** | `resize_logits_back` (bilinear on logits) is applied before `sigmoid ≥ 0.5`. |
| 5d | Geometry header copied from the source | **PASS** | P7: the prediction header equals the source MRI for `space`, `space directions`, `space origin`, `kinds` and `sizes`; type uint8. |
| 6a | Order train → infer (validation) → evaluate (validation) → compare | **PASS** | Inference and evaluation are the post-training step of `ml.train`; comparisons run after all runs (covered by a test). |
| 6b | Compare output labelled "not a result" | **PASS** | `note: "VALIDATION population: … not a result …"`; files are named `*.validation.json`. |
| 6c | Holdout never touched by the queue (tested) | **PASS** | See 3c. |
| 6d | Three U-vs-D pairs declared in the template | **PASS** | `[U-025,D-025], [U-050,D-050], [U-100,D-100]` (covered by a test). |
| 7 | Manifest validators cover `08` §10; a missing key refuses cleanly | **PARTIAL → N-6** | A missing key gives `ManifestError`, shown as `REFUSED` / `EXPORT REFUSED` and never a `KeyError` (covered by a test). However, `validate_run_manifest` does not require `metrics_summary`, `per_case_metrics` or `per_slice_metrics` (3 of the 19 keys in §10). The checks are presence-only, so `checkpoint.sha256: null` and `evaluation_code_version: null` are accepted (R4). The writer does emit all of these (P3). |
| 8 | Publication hygiene | **Tree PASS · history FAIL → B-1** | No machine path, host, IP or username in the final delta. The runs root comes from `CARDIAC_RUNS_ROOT`, else `cardiac-runs` next to the main checkout, and a run directory inside git is refused (covered by a test). The first commit `ef691cb` (was d1385cf) has an absolute local Windows path to the runs directory, both in `ml/train.py` and in its **commit message**. Runtime artifacts record the hostname (N-7). |
| 9 | Operator readiness for tonight | **PARTIAL → N-1, N-2** | The README command is generic. The template is the six-run matrix, UNet first, with U-vs-D pairs. Per-run stdout is **block-buffered**: P5 saw 0 bytes in `EXP-….stdout.log` while three epochs were already in `train_log.jsonl`, and child `line_buffering=False`. `train_log.jsonl` (one line per epoch) and `queue_log.jsonl` (one line per transition) are written as they happen, so the run *can* be monitored. A crash leaves a resumable state (4e). |

## 3 · Findings

### BLOCKING

**B-1 · Merge method: a machine path is in the PR history.** `ef691cb` adds an absolute local Windows path to the runs directory in the `ml/train.py` module docstring and the `DEFAULT_RUNS_ROOT` default, and repeats it in the commit message body. `b96bbef` removes it from the tree. A merge commit or a rebase-merge would publish it in `main`'s history in a public repository. This is the same reason #64 was squash-merged.
- **Fix:** squash-merge #70. The squash message must not copy `ef691cb`'s body.
- **Owner:** the leader, as merger. No code change is needed.

**B-2 · The frozen split is not pinned, so a config can redefine the holdout.** `_run_locked` treats `paths.split_manifest` (or the repository default) as "the frozen split". It asserts only that the run copy matches that file. P1 trained on a final-holdout case: the run COMPLETED with nothing flagged, and the only trace is the recorded sha256. A second route: `require_clean_code` checks only `ml/`, so a locally modified `data/manifests/split_manifest_path_a_seed2024.json` would also be used silently. Tonight's runs become the scientific results and run unattended, so this guard must not depend on the operator.
- **Fix:**
  - Add `FROZEN_SPLIT_SHA256 = "c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d"` (the GATE-SPLIT-01 blob, QA-005) in `ml/`.
  - `ml.train` refuses, **before writing anything**, any split whose sha256 differs, unless an explicit test-only switch is set. That switch must be recorded in `recipe_deviations_from_adr_ml_001` and the run manifest. The tests set it for their synthetic splits.
  - Add the P1 regression test: a config naming a forged split is refused. The queue inherits the check.
  - Apply the same default check to `--split-manifest` in `ml.infer`, `ml.evaluate` and `compare`. This closes #64's R-1, and may follow later, because tonight's chain passes the split that training has already verified.
- **Owner:** A1 / Bế Quốc Khánh.
- **If the leader launches before this lands:**
  - the queue file has no `paths` key;
  - `git status -- ml data/manifests` is clean;
  - after EXP-D-025's first epoch, `manifests/split_manifest.json` has sha256 `c5c65a09…`.

### NON-BLOCKING (owner A1 / Bế Quốc Khánh unless stated)

- **N-1 · Per-run stdout is block-buffered (P5).**
  - **Effect:** the operator watching `<runs_root>/EXP-….stdout.log` sees nothing for long periods, and a hard kill loses the buffered tail. Tracebacks (stderr) still appear.
  - **Fix:** launch `[python, "-u", "-m", "ml.train", …]` or set `PYTHONUNBUFFERED=1` in the queue's environment, and add to the README: "monitor `train_log.jsonl` and `_queue/<id>/queue_log.jsonl`".
  - This is a one-line change; recommended in the B-2 commit.
- **N-2 · Tonight's command is not spelled out.**
  - **Problem:** the template is the six runs, UNet first, with U-vs-D pairs. A DINOv2-only queue that keeps those pairs fails fast with `ValueError`. One that keeps the U entries would train the UNet family on the leader's PC, against DR-016.
  - **Fix:** add a ready queue file or README block with `EXP-D-025`, `EXP-D-100`, `EXP-D-050` in that order and no `compare` pairs, plus the exact command: `--epochs E --batch B --dry-run`, then without `--dry-run`.
  - **Also state:** the U-vs-D validation comparisons need both run directories under one runs root (`python -m ml.evaluate compare … --population validation` after copying).
  - **Owner:** A1; the leader supplies E and B.
- **N-3 · The queue's skip path does not check the config (P4).** Re-launching with `--epochs 5 --batch 8` reported a COMPLETE run recorded at `epochs 2 / batch 4` as `skipped`, with `failed=[]`. `ml.train` called directly correctly refuses (`ConfigMismatch`).
  - **Fix:** for COMPLETE runs, compare the bytes of `config.json` with the queue's config, and log a mismatch as failed.
- **N-4 · An epoch line can be lost from the training log (P6).**
  - **Effect:** a kill between the `last.pt` commit and the log write loses that epoch's line, including its per-case validation Dice. The manifest reports it without any flag.
  - **Fix:** store the epoch record in `last.pt` and write it again on resume if it is missing. Alternatively, record `train_log_complete: false`.
- **N-5 · Lock recovery after a hard kill needs psutil (P3b).** Without psutil the run cannot resume until the lock file is edited by hand. PID reuse could also make a dead lock look alive.
  - **Fix:** the queue refuses to start without psutil, which the UNet host tomorrow needs as well. Also store the process `create_time` in the lock and compare it.
- **N-6 · Validator coverage of `08` §10 (check 7).**
  - **Fix:** add `metrics_summary`, `per_case_metrics` and `per_slice_metrics` to `RUN_MANIFEST_REQUIRED`, allowing null only when `post_train_validation` is false. Type-check the sha256 fields as 64 lowercase hex characters.
- **N-7 · Machine identifiers in run artifacts.** These files live outside git, and the Contract 2 export carries none of them:
  - `environment.host` (`socket.gethostname()`) in `run_manifest.json` and in the training-log `start` event;
  - `host` in `.lock.json`;
  - absolute run, config and stdout paths in `queue_log.jsonl`.
  - **Fix:** before any manifest or log is committed as `08` §11.1 evidence, record a host alias (e.g. the GPU name, as DR-016 does) and relative paths.
- **N-8 · No runtime evidence that bf16 was in effect.** The run manifest records the configured precision only.
  - **Fix:** record the first step's `logits.dtype` and `torch.cuda.is_bf16_supported()` in the `start` event. The RTX 3050 Ti is Ampere, so bf16 is native.
- **N-9 · Informational.**
  - (a) If DR-007 moves both families to 448, `recipe_deviations` will list `img 448` as a deviation; cite DR-007 in `notes`.
  - (b) On CUDA a resume replays the same batches but is not bit-identical (cuDNN nondeterminism). The README's "bit for bit" claim is correctly limited to CPU.
  - (c) The 126 tests are local evidence only, because CI does not run `ml/tests`. Owner: CI owner, or A1.
  - (d) A hard kill in the instant between an NRRD write and its progress line leaves an unrecorded file, which blocks inference resume until it is moved aside. This fails closed, so it is acceptable.

## 4 · Verdict

**MERGE AFTER FIXES**, at `8f4703a`, with the patches identical to the reviewed `6852231`.

1. **B-2:** pin the frozen split sha256 in `ml.train` (the queue inherits it) and add the P1 regression test. I recommend the same commit also carries **N-1** (`-u`) and **N-2** (tonight's DINOv2 queue file and command).
2. **B-1:** squash-merge, with a clean message.

**Re-check scope after the fix:**
- the tree diff against `8f4703a` must be limited to the fix;
- `python -m pytest ml/tests -q` must pass;
- probe P1 must now be refused before anything is written.

N-3 to N-9 can land before Day 23. N-6 and N-7 should land before any run manifest is committed as evidence.

What holds:
- The recipe matches ADR-ML-001 item by item.
- The resume after a hard mid-epoch kill is bit-identical on CPU.
- Tampering with the split copy inside the run directory is refused at every entry point.
- Validation Dice at native resolution is identical between training and evaluation.
- The holdout is unreachable on the queue path.
- Failures are recorded rather than dropped.
- Commits are atomic and recorded artifacts are never overwritten.

*Scratch: scripts and outputs are in `<qa-scratch>/qa70` (guard.py, probes.py, child_train.py, checks2.py, and their output files), outside the repository. They contain only synthetic data; nothing outside that folder was created or deleted.*
