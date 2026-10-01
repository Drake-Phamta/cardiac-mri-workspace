# QA re-check: PR #70 fix delta `8f4703a..d7ee797` · **MERGE** (squash) · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. I am an LLM QA session (Claude Code, Claude Opus 5.5) running under the leader's account, **not a human reviewer**. |
| **Target** | `d7ee797c557de376f821bbbfaa1a92dd8e69c592`. It is one normal commit whose parent is `8f4703a` (no force-push), and the branch head still equals it at 14:04 +07. The delta touches `ml/` only: 11 files, +338/−80. |
| **Rules followed** | CPU only (`CUDA_VISIBLE_DEVICES=-1`), one process at a time, synthetic data only, everything in `<qa-scratch>`. Peak RSS was 1380 MiB for the suite and 1104 MiB for the probes. Nothing was committed, pushed or posted. My worktree is clean and the main checkout was not touched. |

> **VERDICT: MERGE at `d7ee797`, as a squash merge.** That squash satisfies B-1, and B-2 is fixed and verified. One new non-blocking item, N-10, matters to whoever watches tonight's run: the new precision evidence will read `float32` for the DINOv2 runs, and that is expected.

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | P1: a forged frozen split is refused before anything is written, through both train and queue | **PASS** | All four entry points refuse with `SplitMismatchError`: train API, queue API, `python -m ml.queue … --dry-run` (exit 1), and `python -m ml.train` (exit 1). Afterwards the probe's runs/cache root **does not exist**. A one-byte local edit of the real split, named through the config, is also refused. A switch given as `"true"` (a string) gives `ConfigError`, and `"yes"` through the API gives `TypeError`. A byte-identical copy of the real split at another path is accepted, which is correct because the check is by content. |
| 2 | CLI bypass without the switch | **PASS** | `ml.infer`: exit 2 `REFUSED` with the synthetic split named, the default split, or the forged split. `ml.evaluate run`: refused (exit 1) with the named or default split, and nothing is written. `ml.evaluate compare`: refused (exit 1) with the named or default split; exit 0 with the switch. `ml.export_contract2`: exit 2 `EXPORT REFUSED` with the named or default split; exit 0 with the switch. |
| 3 | The switch is recorded in all 3 places | **PASS** | **(a)** `recipe_deviations_from_adr_ml_001` holds `allow_unfrozen_split=true (TEST-ONLY switch)` and `split manifest sha256 … is NOT the frozen split …`. **(b)** A `frozen_split` block (`expected_sha256`, `actual_sha256`, `is_frozen: false`, `allow_unfrozen_split: true`) is in both the run manifest and the predictions manifest. **(c)** The Contract 2 export record has `allow_unfrozen_split: true` and `frozen_split_pinned_sha256: c5c65a09…396d`. |
| 4a | P4: skip path with a config mismatch | **PASS** | A COMPLETE run re-queued with a different `--epochs`/`--batch` is reported `failed` with the reason "COMPLETE run has a different config.json than this queue entry", and it appears in `failed`. With the same config it is `skipped`. |
| 4b | P5: stdout buffering | **PASS** | While epochs 1–3 were in `train_log.jsonl`, the per-run stdout log already held 157–255 bytes, and all 4 epoch lines were there at the end (it was 0 bytes before the fix). The children run with `-u` and `PYTHONUNBUFFERED=1`. |
| 5 | Test suite | **PASS** | **133 passed** in 66 s, matching the author's count. This includes `test_p1_a_forged_split_is_refused_before_anything_is_written`. |
| 6 | Lock (N-5), checked as well | **PASS** | After a hard kill mid-epoch, the lock holds the dead pid and its `create_time`, the resume completes, and the model is bit-equal to an uninterrupted run. A live pid with the same `create_time` is refused; a live pid with a different `create_time` (a recycled pid) is taken over. The queue refuses to start without psutil (covered by a test). |

## Findings

**Blocking:** none. B-1 is closed by the squash merge, as long as the squash message does not reuse `ef691cb`'s body, which contains a local machine path. B-2 is closed.

**Non-blocking (owner A1 / Bế Quốc Khánh):**
- **N-10, new: precision evidence reads `float32` for DINOv2.**
  - **Cause:** in torch 2.5.1, `upsample_bilinear2d` is on CUDA autocast's fp32 list (`AT_FORALL_FP32`, `ATen/autocast_mode.h` line 864), while `conv2d` is on the lower-precision list. DinoSeg's last step upsamples the 320 px decoder output to 560 px with that op, so its output is fp32.
  - **What tonight's log will show:** every EXP-D run will record `first_step.logits_dtype = torch.float32` (and the same in `precision_evidence`), even though the backbone and decoder run in bf16.
  - **Operator note for tonight:** on DINOv2 runs, `float32` there is expected and does not mean bf16 is off. Read `precision_configured: bf16` together with `cuda_bf16_supported: true`. The UNet's last op is a conv, so it will show `bfloat16`.
  - **Fix later:** record `torch.is_autocast_enabled("cuda")` and `torch.get_autocast_dtype("cuda")` inside the autocast block, and correct the README sentence that calls `logits_dtype` evidence that bf16 is in effect.
- **README tonight-queue block is shorthand.** Entries 2 and 3 use a `"..."` key, so copying the block verbatim fails at load with `ConfigError` before any run starts. That is safe, but the EXP-D-100 and EXP-D-050 entries must be written out in full. The order EXP-D-025 → EXP-D-100 → EXP-D-050 and the D-vs-D validation compare pairs are correct.
- **Minor gaps:**
  - The evaluate and compare CLIs refuse with a traceback (exit 1) rather than a clean `REFUSED` (exit 2).
  - The evaluation manifest and the queue's comparison reports don't record the switch; the predictions manifest they score does.
- **Still open from the first review, not claimed in this fix:**
  - N-4: an epoch line can be lost from the training log after a kill at the wrong moment.
  - N-6: `validate_run_manifest` misses `metrics_summary`, `per_case_metrics` and `per_slice_metrics`, and accepts null sha256 fields.
  - N-7: the hostname and absolute paths are written into run artifacts outside git.

  These should land before Day 23, and before any run manifest is committed as evidence.

*Scratch: `recheck.py`, `recheck_out.txt`, `recheck_result.json` and `pytest_fix.txt` are in `<qa-scratch>/qa70`, outside the repository. They hold only synthetic data.*
